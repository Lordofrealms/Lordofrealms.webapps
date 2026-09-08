// Battery Monitor primary sketch wrapper.
//
// The original v0.1.0 main sketch is retained verbatim in
// BatteryMonitorLegacy.inc. Only setup/loop are overridden here so P0-3 can
// add authenticated monitoring identity without duplicating the large embedded
// browser UI, configured devices require physical presence before entering
// Wi-Fi recovery provisioning after a network outage, signed USB OTA can run
// through the application after Flash Encryption is active, a newly selected
// signed OTA image must survive a local health probation before the ESP-IDF
// bootloader permanently accepts it, and the highest accepted signed release
// sequence is retained in encrypted NVS to block signed-image downgrades.

#include <esp_ota_ops.h>

#define setup batteryMonitorLegacySetup
#define loop batteryMonitorLegacyLoop
#include "BatteryMonitorLegacy.inc"
#undef setup
#undef loop

bool loadOrCreateMonitoringIdentity();
void registerMonitoringIdentityRoutes();
void serviceAuthenticatedDiscovery();

static const unsigned long OTA_ROLLBACK_PROBATION_MS = 60UL * 1000UL;
static const unsigned long OTA_ROLLBACK_CONFIRM_RETRY_MS = 10UL * 1000UL;
static const uint32_t OTA_ROLLBACK_MIN_LOOP_PASSES = 250;
static bool otaRollbackPendingValidation = false;
static bool otaRollbackHealthPrerequisitesReady = false;
static unsigned long otaRollbackProbationStartedMs = 0;
static unsigned long otaRollbackNextConfirmAttemptMs = 0;
static uint32_t otaRollbackLoopPasses = 0;

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

static void serviceWifiStatePhysicalRecoveryOnly() {
  if (fallbackApActive) return;

  bool connected = WiFi.status() == WL_CONNECTED;
  unsigned long now = millis();
  if (connected) {
    wifiDisconnectedSinceMs = 0;
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    startNormalNetworkServices();
    return;
  }

  stopMdns();
  if (wifiDisconnectedSinceMs == 0) wifiDisconnectedSinceMs = now;

  // A configured monitor must not expose even the protected provisioning AP
  // merely because infrastructure Wi-Fi is unavailable. Keep retrying the
  // saved network. The user can deliberately enter secure provisioning with
  // the 5-second BOOT gesture or an authenticated Change Wi-Fi command while
  // the device is still reachable.
  if (wifiSsid.length() > 0 && (int32_t)(now - nextReconnectAttemptMs) >= 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(hostName.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
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
  } else if (wifiSsid.length() > 0) {
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
    wifiDisconnectedSinceMs = millis();
    Serial.println("Saved Wi-Fi is unavailable. Secure provisioning will NOT start automatically; hold BOOT for 5 seconds to change Wi-Fi.");
  } else {
    Serial.println("No Wi-Fi and no Device Password credential. Secure provisioning is disabled until trusted USB initialization.");
  }

  Serial.printf("Device %s (%s), hostname %s.local\n", deviceId.c_str(), deviceName.c_str(), hostName.c_str());
  initializeOtaRollbackHealth(monitoringReady, releasePolicyReady);
}

void loop() {
  // Service USB explicitly instead of relying only on Arduino serialEvent().
  // While an OTA transfer is active, suspend unrelated networking/sampling so
  // the binary stream and flash writes have a small, deterministic surface.
  serviceSerialProvisioning();
  serviceFirmwareUpdateTimeout();
  if (firmwareUpdateInProgress()) {
    delay(1);
    return;
  }

  if (!fallbackApActive) {
    if (httpServerActive) server.handleClient();
    serviceAuthenticatedDiscovery();
    serviceWifiStatePhysicalRecoveryOnly();
  } else {
    serviceSecureProvisioning();
  }
  serviceResetButton();
  serviceManagementAuth();

  unsigned long intervalMs = sampleIntervalSec * 1000UL;
  if (millis() - lastSampleMs >= intervalMs) sampleBattery();

  // Wi-Fi is intentionally not a prerequisite. The candidate is accepted only
  // after setup has completed, P0-3 identity exists, release policy is healthy,
  // and the main loop has kept executing throughout the local probation window.
  serviceOtaRollbackHealth();
  delay(2);
}
