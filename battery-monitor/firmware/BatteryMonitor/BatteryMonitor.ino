// Battery Monitor production runtime.
//
// ESP-IDF is the sole production build architecture. Shared application state
// comes from BatteryMonitorCore.ino; HTTP is owned exclusively by native
// esp_http_server; measurements are published as coherent cached snapshots.

#include <esp_ota_ops.h>

bool loadOrCreateMonitoringIdentity();
void serviceAuthenticatedDiscovery();
bool hasProvisioningIdentity();

bool initializeBatterySnapshotState();
void sampleBatterySnapshot();
void refreshBatterySnapshotConfiguration();
String batterySnapshotStatusJson();

bool startNativeHttpServer();
void stopNativeHttpServer();
void serviceNativeHttpControl();

static const unsigned long OTA_ROLLBACK_PROBATION_MS = 60UL * 1000UL;
static const unsigned long OTA_ROLLBACK_CONFIRM_RETRY_MS = 10UL * 1000UL;
static const uint32_t OTA_ROLLBACK_MIN_LOOP_PASSES = 250;
static const unsigned long PROTECTED_FALLBACK_RETRY_INTERVAL_MS = 60UL * 1000UL;
static const unsigned long PROTECTED_FALLBACK_CLIENT_RETRY_DEFERRAL_MS = 60UL * 1000UL;

static bool otaRollbackPendingValidation = false;
static bool otaRollbackHealthPrerequisitesReady = false;
static unsigned long otaRollbackProbationStartedMs = 0;
static unsigned long otaRollbackNextConfirmAttemptMs = 0;
static uint32_t otaRollbackLoopPasses = 0;
static unsigned long protectedFallbackHomeRetryAtMs = 0;
static bool protectedFallbackHomeRetryPending = false;

static void initializeOtaRollbackHealth(bool monitoringReady,
                                        bool releasePolicyReady) {
  const esp_partition_t* running = esp_ota_get_running_partition();
  if (running == nullptr) {
    Serial.println("WARNING: Could not resolve running OTA partition for rollback health state.");
    return;
  }

  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  esp_err_t stateErr = esp_ota_get_state_partition(running, &state);
  if (stateErr != ESP_OK || state != ESP_OTA_IMG_PENDING_VERIFY) return;

  otaRollbackPendingValidation = true;
  otaRollbackHealthPrerequisitesReady = monitoringReady && releasePolicyReady;
  otaRollbackProbationStartedMs = millis();
  otaRollbackNextConfirmAttemptMs = otaRollbackProbationStartedMs + OTA_ROLLBACK_PROBATION_MS;
  otaRollbackLoopPasses = 0;
  Serial.println("OTA candidate is pending validation; starting 60-second local health probation.");

  if (!otaRollbackHealthPrerequisitesReady) {
    Serial.println("ERROR: OTA candidate cannot initialize required security state; requesting rollback.");
    delay(50);
    esp_err_t rollbackErr = esp_ota_mark_app_invalid_rollback_and_reboot();
    Serial.printf("ERROR: OTA rollback request failed: %s\n", esp_err_to_name(rollbackErr));
  }
}

static void serviceOtaRollbackHealth() {
  if (!otaRollbackPendingValidation || !otaRollbackHealthPrerequisitesReady) return;
  if (otaRollbackLoopPasses < UINT32_MAX) otaRollbackLoopPasses++;

  unsigned long now = millis();
  if ((unsigned long)(now - otaRollbackProbationStartedMs) < OTA_ROLLBACK_PROBATION_MS) return;
  if (otaRollbackLoopPasses < OTA_ROLLBACK_MIN_LOOP_PASSES) return;
  if ((int32_t)(now - otaRollbackNextConfirmAttemptMs) < 0) return;

  esp_err_t err = esp_ota_mark_app_valid_cancel_rollback();
  if (err == ESP_OK) {
    String floorError;
    bool floorCommitted = commitRunningFirmwareReleaseFloor(floorError);
    otaRollbackPendingValidation = false;
    if (floorCommitted) {
      Serial.println("OTA candidate health probation passed; image marked valid and release floor advanced.");
    } else {
      Serial.printf("WARNING: OTA candidate marked valid but release-floor persistence needs repair (%s).\n",
                    floorError.c_str());
    }
    return;
  }

  otaRollbackNextConfirmAttemptMs = now + OTA_ROLLBACK_CONFIRM_RETRY_MS;
  Serial.printf("WARNING: Could not mark OTA candidate valid (%s); keeping rollback armed.\n",
                esp_err_to_name(err));
}

static void startNativeNetworkServices() {
  if (!httpServerActive && !startNativeHttpServer()) {
    Serial.println("WARNING: Native HTTP server unavailable; monitoring LAN API is offline.");
  }
  startDiscovery();
  startMdns();
}

static void stopNativeNetworkServices() {
  stopMdns();
  stopDiscovery();
  stopNativeHttpServer();
}

// Single authoritative entry into protected provisioning. Keeping this in the
// production runtime means no legacy Arduino WebServer helper is required.
void startFallbackAp() {
  if (fallbackApActive) return;
  stopNativeNetworkServices();
  if (!startSecureProvisioning()) {
    fallbackApActive = false;
    Serial.println("Secure setup could not start. Connect by trusted USB to initialize or repair the Device Password.");
  }
}

static bool startSavedWifiConnection(bool waitForResult) {
  // Copy credentials once and release the config mutex before touching the Wi-Fi
  // stack or waiting. Network operations never hold configuration state locked.
  String configuredSsid;
  String configuredPassword;
  if (!copyConfiguredWifi(configuredSsid, configuredPassword) || configuredSsid.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  applyWifiRadioSettings();
  WiFi.disconnect(false, false);
  delay(25);
  applyWifiRadioSettings();
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(configuredSsid.c_str(), configuredPassword.c_str());
  configuredPassword = "";

  if (!waitForResult) return WiFi.status() == WL_CONNECTED;
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED &&
         (unsigned long)(millis() - started) < CONNECT_ATTEMPT_MS) {
    delay(200);
  }
  return WiFi.status() == WL_CONNECTED;
}

static void startProtectedFallbackWithRetry(unsigned long now) {
  protectedFallbackHomeRetryPending = false;
  startFallbackAp();
  if (fallbackApActive && hasConfiguredWifi()) {
    protectedFallbackHomeRetryAtMs = now + PROTECTED_FALLBACK_RETRY_INTERVAL_MS;
    Serial.printf("Protected setup AP will retry saved home Wi-Fi in %lu seconds.\n",
                  PROTECTED_FALLBACK_RETRY_INTERVAL_MS / 1000UL);
  }
}

static void requestProtectedFallbackHomeRetry(unsigned long now) {
  if (WiFi.softAPgetStationNum() > 0) {
    protectedFallbackHomeRetryAtMs = now + PROTECTED_FALLBACK_CLIENT_RETRY_DEFERRAL_MS;
    Serial.println("Protected setup client is active; deferring saved-Wi-Fi retry for 60 seconds.");
    return;
  }

  protectedFallbackHomeRetryAtMs = 0;
  protectedFallbackHomeRetryPending = true;
  Serial.println("Protected setup AP stopping for scheduled saved-Wi-Fi retry.");
  requestStopSecureProvisioning();
}

static void beginHomeWifiRetryAfterProvisioningStops(unsigned long now) {
  protectedFallbackHomeRetryPending = false;
  protectedFallbackHomeRetryAtMs = 0;
  startSavedWifiConnection(false);
  wifiDisconnectedSinceMs = now;
  nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  Serial.println("Protected setup AP stopped cleanly; retrying saved home Wi-Fi.");
}

static void serviceWifiStateWithProtectedFallback() {
  unsigned long now = millis();

  if (fallbackApActive) {
    // A nonzero retry deadline is created only when saved credentials exist, so
    // this hot path does not need to touch String configuration state.
    if (protectedFallbackHomeRetryAtMs != 0 &&
        (int32_t)(now - protectedFallbackHomeRetryAtMs) >= 0) {
      requestProtectedFallbackHomeRetry(now);
    }
    return;
  }

  if (protectedFallbackHomeRetryPending) {
    beginHomeWifiRetryAfterProvisioningStops(now);
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiDisconnectedSinceMs = 0;
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    protectedFallbackHomeRetryAtMs = 0;
    startNativeNetworkServices();
    return;
  }

  stopMdns();

  if (!hasConfiguredWifi()) {
    if (hasProvisioningIdentity() || loadDeviceCredentialIdentity()) {
      startProtectedFallbackWithRetry(now);
      protectedFallbackHomeRetryAtMs = 0;
    }
    return;
  }

  if (wifiDisconnectedSinceMs == 0) {
    wifiDisconnectedSinceMs = now;
    startSavedWifiConnection(false);
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    return;
  }

  if ((unsigned long)(now - wifiDisconnectedSinceMs) >= CONNECT_ATTEMPT_MS) {
    Serial.println("Home Wi-Fi unavailable after 30-second retry window; entering protected fallback setup AP.");
    startProtectedFallbackWithRetry(now);
  }
}

static void serviceResetButtonNative() {
  bool pressed = digitalRead(RESET_WIFI_PIN) == LOW;
  unsigned long now = millis();
  if (!pressed) {
    bootButtonPressedSinceMs = 0;
    return;
  }

  if (bootButtonPressedSinceMs == 0) bootButtonPressedSinceMs = now;
  if ((unsigned long)(now - bootButtonPressedSinceMs) < WIFI_RESET_HOLD_MS) return;

  Serial.println("BOOT held 5 seconds: entering secure Wi-Fi provisioning; Device Password and settings are preserved");
  while (digitalRead(RESET_WIFI_PIN) == LOW) delay(50);
  bootButtonPressedSinceMs = 0;
  startProtectedFallbackWithRetry(millis());
}

void setup() {
  Serial.begin(115200);
  delay(200);

  uint64_t mac = ESP.getEfuseMac();
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "%06llX", (unsigned long long)(mac & 0xFFFFFFULL));
  deviceId = String("BM-") + suffix;
  String suffixLower = String(suffix);
  suffixLower.toLowerCase();
  hostName = String("battery-") + suffixLower;
  apSsid = String("BatteryMonitor-") + suffix;

  loadSettings();
  if (!initializeDeviceConfigSynchronization())
    Serial.println("ERROR: Configuration synchronization unavailable; network configuration access will fail closed.");
  loadWifiRadioSettings();
  applyWifiRadioSettings();

  String releasePolicyError;
  bool releasePolicyReady = initializeFirmwareReleasePolicy(releasePolicyError);
  if (!releasePolicyReady)
    Serial.printf("ERROR: Firmware release policy unavailable: %s\n", releasePolicyError.c_str());

  bool provisioningReady = loadDeviceCredentialIdentity();
  bool monitoringReady = loadOrCreateMonitoringIdentity();
  if (!monitoringReady)
    Serial.println("WARNING: Monitoring Identity Key unavailable; authenticated discovery/status will fail closed.");

  pinMode(RESET_WIFI_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_ADC_PIN, ADC_11db);
  if (!initializeBatterySnapshotState())
    Serial.println("WARNING: coherent battery snapshot unavailable; legacy scalar mirrors remain as fallback.");
  sampleBatterySnapshot();

  bool connected = startSavedWifiConnection(true);
  applyWifiRadioSettings();
  bool savedWifiConfigured = hasConfiguredWifi();
  if (connected) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    startNativeNetworkServices();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  } else if (!savedWifiConfigured && provisioningReady) {
    startProtectedFallbackWithRetry(millis());
  } else if (savedWifiConfigured && provisioningReady) {
    Serial.println("Saved Wi-Fi is unavailable; starting protected fallback setup AP.");
    startProtectedFallbackWithRetry(millis());
  } else {
    Serial.println("No Wi-Fi and no Device Password credential. Secure provisioning is disabled until trusted USB initialization.");
  }

  serviceWifiRadioSettings();
  DeviceConfigState config = {};
  if (copyDeviceConfigState(config)) {
    Serial.printf("Device %s (%s), hostname %s.local\n", deviceId.c_str(), config.deviceName.c_str(), hostName.c_str());
  } else {
    Serial.printf("Device %s, hostname %s.local\n", deviceId.c_str(), hostName.c_str());
  }
  initializeOtaRollbackHealth(monitoringReady, releasePolicyReady);
}

void loop() {
  serviceSerialProvisioning();
  serviceFirmwareUpdateTimeout();
  serviceWifiRadioSettings();
  serviceNativeHttpControl();

  if (firmwareUpdateInProgress()) {
    delay(1);
    return;
  }

  if (!fallbackApActive) serviceAuthenticatedDiscovery();
  serviceWifiStateWithProtectedFallback();
  if (fallbackApActive) serviceSecureProvisioning();
  serviceResetButtonNative();

  unsigned long intervalMs = synchronizedSampleIntervalSec() * 1000UL;
  if ((unsigned long)(millis() - lastSampleMs) >= intervalMs) sampleBatterySnapshot();

  serviceOtaRollbackHealth();
  delay(2);
}