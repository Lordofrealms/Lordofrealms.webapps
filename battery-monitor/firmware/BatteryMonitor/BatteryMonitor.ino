// Battery Monitor primary sketch wrapper.
//
// The original v0.1.0 main sketch is retained verbatim in
// BatteryMonitorLegacy.inc. Only setup/loop are overridden here so P0-3 can
// add authenticated monitoring identity without duplicating the large embedded
// browser UI, protected Wi-Fi fallback can recover a monitor when infrastructure
// Wi-Fi is unavailable, signed USB OTA can run through the application after
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
bool initializeDedicatedWebServerTask();
bool lockBatteryMonitorWebDomain();
void unlockBatteryMonitorWebDomain();

static const unsigned long OTA_ROLLBACK_PROBATION_MS = 60UL * 1000UL;
static const unsigned long OTA_ROLLBACK_CONFIRM_RETRY_MS = 10UL * 1000UL;
static const uint32_t OTA_ROLLBACK_MIN_LOOP_PASSES = 250;
static bool otaRollbackPendingValidation = false;
static bool otaRollbackHealthPrerequisitesReady = false;
static unsigned long otaRollbackProbationStartedMs = 0;
static unsigned long otaRollbackNextConfirmAttemptMs = 0;
static uint32_t otaRollbackLoopPasses = 0;
static bool dedicatedWebServerTaskReady = false;
static unsigned long protectedFallbackHomeRetryAtMs = 0;

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

  // P0-3 authenticated monitoring identity and the signed-release floor are
  // required security functions. A candidate which cannot initialize either
  // must not become the permanent image.
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
    // The candidate is now the valid boot image. Advance the encrypted-NVS
    // software release floor immediately. Even if this persistence step fails,
    // the currently running sequence itself remains part of the effective
    // downgrade floor until a reboot, and setup retries floor repair next boot.
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

  // Leave the image pending rather than accepting it on an unexpected metadata
  // or flash error. A reset while it remains pending will still fall back.
  otaRollbackNextConfirmAttemptMs = now + OTA_ROLLBACK_CONFIRM_RETRY_MS;
  Serial.printf("WARNING: Could not mark OTA candidate valid (%s); keeping rollback armed.\n", esp_err_to_name(err));
}

static void beginHomeWifiRetry(unsigned long now) {
  stopFallbackAp();
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  wifiDisconnectedSinceMs = now;
  nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  protectedFallbackHomeRetryAtMs = 0;
}

static void startProtectedFallbackWithRetry(unsigned long now) {
  startFallbackAp();
  if (fallbackApActive && wifiSsid.length() > 0) {
    protectedFallbackHomeRetryAtMs = now + RETRY_INTERVAL_MS;
    Serial.printf("Protected setup AP will retry saved home Wi-Fi in %lu seconds.\n", RETRY_INTERVAL_MS / 1000UL);
  }
}

static void serviceWifiStateWithProtectedFallback() {
  unsigned long now = millis();

  if (fallbackApActive) {
    // If this is a recovery fallback for a previously configured home network,
    // periodically leave the protected AP, retry STA for one normal connection
    // window, and return to the protected AP if that retry also fails.
    if (wifiSsid.length() > 0 && protectedFallbackHomeRetryAtMs != 0 &&
        (int32_t)(now - protectedFallbackHomeRetryAtMs) >= 0) {
      Serial.println("Protected setup AP pausing for scheduled home Wi-Fi retry.");
      beginHomeWifiRetry(now);
    }
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

  // Once the Device Password exists, a unit with no configured home Wi-Fi must
  // immediately expose the WPA2 + Security-2 setup AP. This also covers the
  // important first-provisioning transition where the credential is written by
  // trusted USB after boot; no reboot is required just to make setup wireless
  // appear.
  if (wifiSsid.length() == 0) {
    if (hasProvisioningIdentity() || loadDeviceCredentialIdentity()) {
      startFallbackAp();
      protectedFallbackHomeRetryAtMs = 0;
    }
    return;
  }

  // On a normal connected->disconnected transition, immediately begin a fresh
  // STA attempt and give it CONNECT_ATTEMPT_MS before failing back.
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

  // Routes may be registered before WebServer::begin(); they remain installed
  // when normal network services are started after Wi-Fi connects.
  registerMonitoringIdentityRoutes();

  bool connected = blockingInitialConnect();
  if (connected) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    startNormalNetworkServices();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  } else if (wifiSsid.length() == 0 && provisioningReady) {
    // First setup / explicitly cleared Wi-Fi is an intentional provisioning
    // state, so the already WPA2 + Security-2 protected AP may start directly.
    startFallbackAp();
  } else if (wifiSsid.length() > 0 && provisioningReady) {
    // blockingInitialConnect() already spent the full connection window. Do not
    // make the user wait through another one before recovery becomes available.
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
  // The dedicated WebUI task and this application loop share the Arduino
  // WebServer object and configuration state. Serialize the application side so
  // provisioning/OTA cannot stop networking while Core 0 is handling a request.
  bool domainLocked = !dedicatedWebServerTaskReady || lockBatteryMonitorWebDomain();

  // Service USB explicitly instead of relying only on Arduino serialEvent().
  // While an OTA transfer is active, suspend unrelated networking/sampling so
  // the binary stream and flash writes have a small, deterministic surface.
  serviceSerialProvisioning();
  serviceFirmwareUpdateTimeout();
  if (firmwareUpdateInProgress()) {
    if (dedicatedWebServerTaskReady && domainLocked) unlockBatteryMonitorWebDomain();
    delay(1);
    return;
  }

  if (!fallbackApActive) {
    // Fail-safe fallback if the dedicated task could not be created.
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

  // Wi-Fi is intentionally not a prerequisite. The candidate is accepted only
  // after setup has completed, P0-3 identity exists, release policy is healthy,
  // and the main loop has kept executing throughout the local probation window.
  serviceOtaRollbackHealth();

  if (dedicatedWebServerTaskReady && domainLocked) unlockBatteryMonitorWebDomain();
  delay(2);
}
