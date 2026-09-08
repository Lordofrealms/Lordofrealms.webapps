// Battery Monitor primary sketch wrapper.
//
// The original v0.1.0 main sketch is retained verbatim in
// BatteryMonitorLegacy.inc. Only setup/loop are overridden here so P0-3 can
// add authenticated monitoring identity without duplicating the large embedded
// browser UI, and so configured devices require physical presence before
// entering Wi-Fi recovery provisioning after a network outage.

#define setup batteryMonitorLegacySetup
#define loop batteryMonitorLegacyLoop
#include "BatteryMonitorLegacy.inc"
#undef setup
#undef loop

bool loadOrCreateMonitoringIdentity();
void registerMonitoringIdentityRoutes();
void serviceAuthenticatedDiscovery();

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
}

void loop() {
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
  delay(2);
}
