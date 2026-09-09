// Conservative client-side Wi-Fi roaming for Battery Monitor.
//
// The monitor is stationary, so roaming should be sticky rather than aggressive.
// A background scan is considered only after the current AP has remained weak
// for 15 seconds. A normal roam requires a 10 dB improvement; if the serving AP
// is critically weak (<= -82 dBm), a 5 dB improvement is sufficient. Roaming
// scans are never initiated during firmware OTA, and any in-flight roaming scan
// is cancelled as soon as OTA becomes active.
//
// This is intentionally client-side RSSI policy only. Battery Monitor does not
// enable or depend on 802.11k/v/r network-assisted roaming.

#include <WiFi.h>
#include <esp_wifi.h>

static const int BATMON_ROAM_WEAK_RSSI_DBM = -72;
static const int BATMON_ROAM_EMERGENCY_RSSI_DBM = -82;
static const int BATMON_ROAM_NORMAL_GAIN_DB = 10;
static const int BATMON_ROAM_EMERGENCY_GAIN_DB = 5;
static const unsigned long BATMON_ROAM_WEAK_HOLD_MS = 15UL * 1000UL;
static const unsigned long BATMON_ROAM_RESCAN_MS = 60UL * 1000UL;
static const unsigned long BATMON_ROAM_COOLDOWN_MS = 60UL * 1000UL;
static const unsigned long BATMON_ROAM_FOREIGN_SCAN_STALE_MS = 120UL * 1000UL;
static const unsigned long BATMON_ROAM_RSSI_CHECK_MS = 1000UL;
static const uint32_t BATMON_ROAM_SCAN_MAX_MS_PER_CHANNEL = 120;

static bool batteryMonitorRoamScanActive = false;
static unsigned long batteryMonitorRoamWeakSinceMs = 0;
static unsigned long batteryMonitorRoamNextScanAtMs = 0;
static unsigned long batteryMonitorRoamCooldownUntilMs = 0;
static unsigned long batteryMonitorForeignScanSeenMs = 0;
static unsigned long batteryMonitorRoamNextRssiCheckMs = 0;

static bool batteryMonitorBssidEqual(const uint8_t a[6], const uint8_t b[6]) {
  return memcmp(a, b, 6) == 0;
}

static String batteryMonitorFormatBssid(const uint8_t bssid[6]) {
  char text[18] = {};
  snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X",
           bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]);
  return String(text);
}

void cancelBatteryMonitorRoamingScan() {
  if (!batteryMonitorRoamScanActive) return;
  esp_wifi_scan_stop();
  WiFi.scanDelete();
  batteryMonitorRoamScanActive = false;
  batteryMonitorForeignScanSeenMs = 0;
  batteryMonitorRoamNextScanAtMs = millis() + BATMON_ROAM_RESCAN_MS;
}

static bool batteryMonitorReconnectSavedWifiForRoam() {
  String configuredSsid;
  String configuredPassword;
  if (!copyConfiguredWifi(configuredSsid, configuredPassword) || configuredSsid.length() == 0)
    return false;

  // The actual reassociation is intentionally not pinned to the BSSID observed
  // by the background scan. WiFi.begin() performs a fresh all-channel scan and
  // chooses the strongest matching BSSID, so later reconnects remain free to
  // choose any AP advertising the configured SSID.
  stopMdns();
  stopDiscovery();
  stopNativeHttpServer();

  WiFi.mode(WIFI_STA);
  applyWifiRadioSettings();
  WiFi.disconnect(false, false);
  delay(25);
  applyWifiRadioSettings();
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(configuredSsid.c_str(), configuredPassword.c_str());
  configuredPassword = "";

  unsigned long now = millis();
  wifiDisconnectedSinceMs = now;
  nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  return true;
}

static void batteryMonitorFinishRoamScan() {
  int16_t result = WiFi.scanComplete();
  if (result == WIFI_SCAN_RUNNING) return;

  batteryMonitorRoamScanActive = false;
  batteryMonitorForeignScanSeenMs = 0;

  if (result < 0 || WiFi.status() != WL_CONNECTED) {
    WiFi.scanDelete();
    batteryMonitorRoamNextScanAtMs = millis() + BATMON_ROAM_RESCAN_MS;
    return;
  }

  String configuredSsid;
  String ignoredPassword;
  if (!copyConfiguredWifi(configuredSsid, ignoredPassword) || configuredSsid.length() == 0) {
    ignoredPassword = "";
    WiFi.scanDelete();
    return;
  }
  ignoredPassword = "";

  // A direct RSSI read here occurs only once per completed roam scan. Normal
  // weak-signal monitoring below uses the existing one-second cached snapshot.
  int currentRssi = WiFi.RSSI();
  uint8_t currentBssid[6] = {};
  WiFi.BSSID(currentBssid);

  int bestAlternateRssi = -127;
  int bestAlternateChannel = 0;
  uint8_t bestAlternateBssid[6] = {};
  bool foundAlternate = false;

  for (int i = 0; i < result; ++i) {
    if (WiFi.SSID(i) != configuredSsid) continue;
    uint8_t candidateBssid[6] = {};
    WiFi.BSSID((uint8_t)i, candidateBssid);
    if (batteryMonitorBssidEqual(candidateBssid, currentBssid)) continue;

    int candidateRssi = WiFi.RSSI(i);
    if (!foundAlternate || candidateRssi > bestAlternateRssi) {
      foundAlternate = true;
      bestAlternateRssi = candidateRssi;
      bestAlternateChannel = WiFi.channel(i);
      memcpy(bestAlternateBssid, candidateBssid, sizeof(bestAlternateBssid));
    }
  }

  WiFi.scanDelete();

  unsigned long now = millis();
  batteryMonitorRoamNextScanAtMs = now + BATMON_ROAM_RESCAN_MS;
  if (!foundAlternate) {
    Serial.printf("Wi-Fi roam scan: serving AP %d dBm; no alternate BSSID for configured SSID.\n",
                  currentRssi);
    return;
  }

  int requiredGain = currentRssi <= BATMON_ROAM_EMERGENCY_RSSI_DBM
    ? BATMON_ROAM_EMERGENCY_GAIN_DB
    : BATMON_ROAM_NORMAL_GAIN_DB;
  int gain = bestAlternateRssi - currentRssi;

  Serial.printf("Wi-Fi roam scan: current %d dBm, best alternate %d dBm (%s ch %d), gain %d dB.\n",
                currentRssi,
                bestAlternateRssi,
                batteryMonitorFormatBssid(bestAlternateBssid).c_str(),
                bestAlternateChannel,
                gain);

  if (gain < requiredGain) return;

  Serial.printf("Wi-Fi roaming: signal improvement meets %d dB threshold; reconnecting to strongest AP for SSID.\n",
                requiredGain);
  batteryMonitorRoamWeakSinceMs = 0;
  batteryMonitorRoamCooldownUntilMs = now + BATMON_ROAM_COOLDOWN_MS;
  batteryMonitorRoamNextScanAtMs = batteryMonitorRoamCooldownUntilMs;
  if (!batteryMonitorReconnectSavedWifiForRoam())
    Serial.println("WARNING: Wi-Fi roam reconnect could not load saved credentials.");
}

void serviceBatteryMonitorWifiRoaming() {
  if (firmwareUpdateInProgress()) {
    cancelBatteryMonitorRoamingScan();
    return;
  }

  if (batteryMonitorRoamScanActive) {
    batteryMonitorFinishRoamScan();
    return;
  }

  unsigned long now = millis();
  if (batteryMonitorRoamNextRssiCheckMs != 0 &&
      (int32_t)(now - batteryMonitorRoamNextRssiCheckMs) < 0) return;
  batteryMonitorRoamNextRssiCheckMs = now + BATMON_ROAM_RSSI_CHECK_MS;

  NetworkSnapshot network = {};
  if (!copyNetworkSnapshot(network) || fallbackApActive || !network.wifiConnected) {
    batteryMonitorRoamWeakSinceMs = 0;
    batteryMonitorForeignScanSeenMs = 0;
    return;
  }

  int currentRssi = network.rssi;
  if (currentRssi >= BATMON_ROAM_WEAK_RSSI_DBM) {
    batteryMonitorRoamWeakSinceMs = 0;
    batteryMonitorForeignScanSeenMs = 0;
    return;
  }

  if (batteryMonitorRoamWeakSinceMs == 0) {
    batteryMonitorRoamWeakSinceMs = now;
    return;
  }
  if ((unsigned long)(now - batteryMonitorRoamWeakSinceMs) < BATMON_ROAM_WEAK_HOLD_MS) return;
  if ((int32_t)(now - batteryMonitorRoamCooldownUntilMs) < 0) return;
  if ((int32_t)(now - batteryMonitorRoamNextScanAtMs) < 0) return;

  // /api/wifi/scan uses the same Arduino scan engine. Never overwrite a scan
  // that is running or whose results are still waiting for the WebUI to consume.
  // If abandoned results remain for two minutes, discard them as stale so they
  // cannot permanently suppress roaming.
  int16_t existingScan = WiFi.scanComplete();
  if (existingScan == WIFI_SCAN_RUNNING) {
    if (batteryMonitorForeignScanSeenMs == 0) batteryMonitorForeignScanSeenMs = now;
    return;
  }
  if (existingScan >= 0) {
    if (batteryMonitorForeignScanSeenMs == 0) batteryMonitorForeignScanSeenMs = now;
    if ((unsigned long)(now - batteryMonitorForeignScanSeenMs) < BATMON_ROAM_FOREIGN_SCAN_STALE_MS) return;
    WiFi.scanDelete();
  }
  batteryMonitorForeignScanSeenMs = 0;

  int16_t started = WiFi.scanNetworks(true, false, false, BATMON_ROAM_SCAN_MAX_MS_PER_CHANNEL);
  if (started == WIFI_SCAN_RUNNING) {
    batteryMonitorRoamScanActive = true;
    Serial.printf("Wi-Fi signal %d dBm for >=15 s; background roam scan started.\n", currentRssi);
  } else {
    batteryMonitorRoamNextScanAtMs = now + BATMON_ROAM_RESCAN_MS;
  }
}
