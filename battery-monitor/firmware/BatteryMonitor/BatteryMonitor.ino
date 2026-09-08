// Battery Monitor primary sketch wrapper.
//
// The original v0.1.0 main sketch is retained verbatim in
// BatteryMonitorLegacy.inc. Only setup/loop are overridden here so P0-3 can
// add authenticated monitoring identity without duplicating the large embedded
// browser UI, protected Wi-Fi fallback can recover a monitor when infrastructure
// Wi-Fi is unavailable, signed USB/LAN OTA can run through the application after
// Flash Encryption is active, a newly selected signed OTA image must survive a
// local health probation before the ESP-IDF bootloader permanently accepts it,
// and the highest accepted signed release sequence is retained in encrypted NVS
// to block signed-image downgrades.

#include <esp_ota_ops.h>

#define setup batteryMonitorLegacySetup
#define loop batteryMonitorLegacyLoop
#include "BatteryMonitorLegacy.inc"
#undef setup
#undef loop

bool loadOrCreateMonitoringIdentity();
void registerMonitoringIdentityRoutes();
void serviceAuthenticatedDiscovery();
bool hasProvisioningIdentity();
bool initializeDedicatedWebServerTask();
bool lockBatteryMonitorWebDomain();
void unlockBatteryMonitorWebDomain();
void registerWifiFirmwareUpdateRoutes();
void serviceWifiFirmwareUpdate();
bool firmwareUpdateIsLanTransport();

static const unsigned long OTA_ROLLBACK_PROBATION_MS = 60UL * 1000UL;
static const unsigned long OTA_ROLLBACK_CONFIRM_RETRY_MS = 10UL * 1000UL;
static const uint32_t OTA_ROLLBACK_MIN_LOOP_PASSES = 250;
static const unsigned long PROTECTED_FALLBACK_CLIENT_RETRY_DEFERRAL_MS = 60UL * 1000UL;
static bool otaRollbackPendingValidation = false;
static bool otaRollbackHealthPrerequisitesReady = false;
static unsigned long otaRollbackProbationStartedMs = 0;
static unsigned long otaRollbackNextConfirmAttemptMs = 0;
static uint32_t otaRollbackLoopPasses = 0;
static bool dedicatedWebServerTaskReady = false;
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
  Serial.printf("WARNING: Could not mark OTA candidate valid (%s); keeping rollback armed.\n", esp_err_to_name(err));
}

static void beginHomeWifiRetryAfterProvisioningStops(unsigned long now) {
  protectedFallbackHomeRetryPending = false;
  protectedFallbackHomeRetryAtMs = 0;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  wifiDisconnectedSinceMs = now;
  nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  Serial.println("Protected setup AP stopped cleanly; retrying saved home Wi-Fi.");
}

static void requestProtectedFallbackHomeRetry(unsigned long now) {
  if (WiFi.softAPgetStationNum() > 0) {
    protectedFallbackHomeRetryAtMs = now + PROTECTED_FALLBACK_CLIENT_RETRY_DEFERRAL_MS;
    Serial.println("Protected setup client is active; deferring scheduled home Wi-Fi retry for 60 seconds.");
    return;
  }

  protectedFallbackHomeRetryAtMs = 0;
  protectedFallbackHomeRetryPending = true;
  Serial.println("Protected setup AP stopping for scheduled home Wi-Fi retry.");
  requestStopSecureProvisioning();
}

static void startProtectedFallbackWithRetry(unsigned long now) {
  protectedFallbackHomeRetryPending = false;
  startFallbackAp();
  if (fallbackApActive && wifiSsid.length() > 0) {
    protectedFallbackHomeRetryAtMs = now + RETRY_INTERVAL_MS;
    Serial.printf("Protected setup AP will retry saved home Wi-Fi in %lu seconds.\n", RETRY_INTERVAL_MS / 1000UL);
  }
}

static void serviceWifiStateWithProtectedFallback() {
  unsigned long now = millis();

  if (fallbackApActive) {
    if (wifiSsid.length() > 0 && protectedFallbackHomeRetryAtMs != 0 &&
        (int32_t)(now - protectedFallbackHomeRetryAtMs) >= 0) {
      requestProtectedFallbackHomeRetry(now);
    }
    return;
  }

  if (protectedFallbackHomeRetryPending) {
    beginHomeWifiRetryAfterProvisioningStops(now);
    return;
  }

  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected) {
    wifiDisconnectedSinceMs = 0;
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    protectedFallbackHomeRetryAtMs = 0;
    startNormalNetworkServices();
    return;
  }

  stopMdns();

  if (wifiSsid.length() == 0) {
    if (hasProvisioningIdentity() || loadDeviceCredentialIdentity()) {
      startFallbackAp();
      protectedFallbackHomeRetryAtMs = 0;
      protectedFallbackHomeRetryPending = false;
    }
    return;
  }

  if (wifiDisconnectedSinceMs == 0) {
    wifiDisconnectedSinceMs = now;
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(hostName.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    return;
  }

  if ((unsigned long)(now - wifiDisconnectedSinceMs) >= CONNECT_ATTEMPT_MS) {
    Serial.println("Home Wi-Fi unavailable after retry window; entering protected fallback setup AP.");
    startProtectedFallbackWithRetry(now);
  }
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

  String releasePolicyError;
  bool releasePolicyReady = initializeFirmwareReleasePolicy(releasePolicyError);
  if (!releasePolicyReady) {
    Serial.printf("ERROR: Firmware release policy unavailable: %s\n", releasePolicyError.c_str());
  }

  bool provisioningReady = loadDeviceCredentialIdentity();
  bool monitoringReady = loadOrCreateMonitoringIdentity();
  if (!monitoringReady) {
    Serial.println("WARNING: Monitoring Identity Key unavailable; authenticated discovery/status will fail closed.");
  }

  pinMode(RESET_WIFI_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_ADC_PIN, ADC_11db);
  sampleBattery();

  registerMonitoringIdentityRoutes();
  registerWifiFirmwareUpdateRoutes();

  bool connected = blockingInitialConnect();
  if (connected) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    startNormalNetworkServices();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  } else if (wifiSsid.length() == 0 && provisioningReady) {
    startFallbackAp();
  } else if (wifiSsid.length() > 0 && provisioningReady) {
    Serial.println("Saved Wi-Fi is unavailable; starting protected fallback setup AP.");
    startProtectedFallbackWithRetry(millis());
  } else {
    Serial.println("No Wi-Fi and no Device Password credential. Secure provisioning is disabled until trusted USB initialization.");
  }

  dedicatedWebServerTaskReady = initializeDedicatedWebServerTask();

  Serial.printf("Device %s (%s), hostname %s.local\n", deviceId.c_str(), deviceName.c_str(), hostName.c_str());
  initializeOtaRollbackHealth(monitoringReady, releasePolicyReady);
}

void loop() {
  // During LAN OTA, leave the HTTP task uncontended so authenticated chunk
  // requests can continue. Otherwise retain the shared WebServer-domain lock.
  bool domainLocked = true;
  if (dedicatedWebServerTaskReady) {
    domainLocked = firmwareUpdateIsLanTransport() ? false : lockBatteryMonitorWebDomain();
  }

  serviceSerialProvisioning();
  serviceFirmwareUpdateTimeout();
  serviceWifiFirmwareUpdate();

  if (firmwareUpdateInProgress()) {
    // If the dedicated HTTP task could not be created, service LAN OTA through
    // the synchronous server here instead of deadlocking after FW begin.
    if (firmwareUpdateIsLanTransport() && !dedicatedWebServerTaskReady && httpServerActive)
      server.handleClient();
    if (dedicatedWebServerTaskReady && domainLocked) unlockBatteryMonitorWebDomain();
    delay(1);
    return;
  }

  if (!fallbackApActive) {
    if (!dedicatedWebServerTaskReady && httpServerActive) server.handleClient();
    serviceAuthenticatedDiscovery();
    serviceWifiStateWithProtectedFallback();
  } else {
    serviceWifiStateWithProtectedFallback();
    if (fallbackApActive) serviceSecureProvisioning();
  }
  serviceResetButton();
  serviceManagementAuth();

  unsigned long intervalMs = sampleIntervalSec * 1000UL;
  if (millis() - lastSampleMs >= intervalMs) sampleBattery();

  serviceOtaRollbackHealth();

  if (dedicatedWebServerTaskReady && domainLocked) unlockBatteryMonitorWebDomain();
  delay(2);
}
