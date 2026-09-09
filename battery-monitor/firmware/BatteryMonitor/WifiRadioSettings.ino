// Persistent Wi-Fi radio policy for Battery Monitor.
//
// These settings intentionally live outside the ordinary user configuration UI.
// They are advanced/service controls stored in the encrypted `batmon` NVS
// namespace so changing them later does not require another firmware build.
// Defaults match the preferred reliability policy: modem sleep disabled,
// maximum TX power requested at 20 dBm (80 quarter-dBm units), station
// association scans all channels then prefers the strongest matching AP, and
// the station PHY allows 802.11b/g (not 802.11n). The roaming service may
// temporarily narrow the station PHY to 802.11b only when signal is weak.

#include <WiFi.h>
#include <Preferences.h>
#include <esp_wifi.h>

static const char* BATMON_WIFI_SLEEP_KEY = "wsleep";
static const char* BATMON_WIFI_TXQ_KEY = "wtxq";
static const int8_t BATMON_WIFI_TX_DEFAULT_QDBM = 80; // 20 dBm
static const uint8_t BATMON_WIFI_PROTOCOL_BG = WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G;
static const uint8_t BATMON_WIFI_PROTOCOL_B_ONLY = WIFI_PROTOCOL_11B;

static bool wifiRadioSleepEnabled = false;
static int8_t wifiRadioTxPowerQuarterDbm = BATMON_WIFI_TX_DEFAULT_QDBM;
static bool wifiRadioSettingsLoaded = false;
static wifi_mode_t wifiRadioLastAppliedMode = WIFI_MODE_NULL;
static uint8_t wifiRadioStaProtocolMask = BATMON_WIFI_PROTOCOL_BG;

static bool isSupportedWifiTxQuarterDbm(int value) {
  switch (value) {
    case -4: // -1 dBm
    case 8:  // 2 dBm
    case 20: // 5 dBm
    case 28: // 7 dBm
    case 34: // 8.5 dBm
    case 44: // 11 dBm
    case 52: // 13 dBm
    case 60: // 15 dBm
    case 68: // 17 dBm
    case 74: // 18.5 dBm
    case 76: // 19 dBm
    case 78: // 19.5 dBm
    case 80: // 20 dBm
    case 82: // 20.5 dBm
    case 84: // 21 dBm
      return true;
    default:
      return false;
  }
}

static bool wifiRadioModeHasSta(wifi_mode_t mode) {
  return mode == WIFI_MODE_STA || mode == WIFI_MODE_APSTA;
}

void loadWifiRadioSettings() {
  Preferences radioPrefs;
  if (radioPrefs.begin("batmon", true)) {
    wifiRadioSleepEnabled = radioPrefs.getBool(BATMON_WIFI_SLEEP_KEY, false);
    int storedTx = radioPrefs.getInt(BATMON_WIFI_TXQ_KEY, BATMON_WIFI_TX_DEFAULT_QDBM);
    wifiRadioTxPowerQuarterDbm = isSupportedWifiTxQuarterDbm(storedTx)
      ? (int8_t)storedTx
      : BATMON_WIFI_TX_DEFAULT_QDBM;
    radioPrefs.end();
  } else {
    wifiRadioSleepEnabled = false;
    wifiRadioTxPowerQuarterDbm = BATMON_WIFI_TX_DEFAULT_QDBM;
  }

  // PHY preference is intentionally session state rather than persisted user
  // configuration. Every boot starts in B/G mode; the RSSI roaming profile may
  // narrow it to B-only while a weak link needs the extra legacy-rate margin.
  wifiRadioStaProtocolMask = BATMON_WIFI_PROTOCOL_BG;
  wifiRadioSettingsLoaded = true;
  wifiRadioLastAppliedMode = WIFI_MODE_NULL;
}

bool applyWifiRadioSettings() {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();

  // These two station-selection settings are cached by Arduino-ESP32 and are
  // copied into wifi_config_t by the next WiFi.begin(). WIFI_ALL_CHANNEL_SCAN
  // is important on multi-AP networks sharing one SSID: fast scan otherwise
  // stops at the first acceptable BSSID it encounters.
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);

  // setSleep() also caches the requested policy before STA startup, so it is
  // safe to call around mode transitions. TX power and protocol masks require
  // an active interface and are therefore deferred while Wi-Fi is fully stopped.
  bool sleepOk = WiFi.setSleep(wifiRadioSleepEnabled);
  wifi_mode_t mode = WiFi.getMode();
  if (mode == WIFI_MODE_NULL) {
    wifiRadioLastAppliedMode = WIFI_MODE_NULL;
    return sleepOk;
  }

  bool txOk = WiFi.setTxPower((wifi_power_t)wifiRadioTxPowerQuarterDbm);
  bool protocolOk = true;
  if (wifiRadioModeHasSta(mode)) {
    esp_err_t protocolErr = esp_wifi_set_protocol(WIFI_IF_STA, wifiRadioStaProtocolMask);
    protocolOk = protocolErr == ESP_OK;
    if (!protocolOk) {
      Serial.printf("WARNING: Could not apply station Wi-Fi protocol mask 0x%02X (%s).\n",
                    wifiRadioStaProtocolMask,
                    esp_err_to_name(protocolErr));
    }
  }

  if (sleepOk && txOk && protocolOk) wifiRadioLastAppliedMode = mode;
  return sleepOk && txOk && protocolOk;
}

void serviceWifiRadioSettings() {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();
  wifi_mode_t mode = WiFi.getMode();
  if (mode != wifiRadioLastAppliedMode) {
    if (!applyWifiRadioSettings())
      Serial.println("WARNING: Could not fully apply configured Wi-Fi radio policy after mode change.");
  }
}

bool setWifiRadioStaBOnly(bool enabled) {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();

  uint8_t requestedMask = enabled ? BATMON_WIFI_PROTOCOL_B_ONLY : BATMON_WIFI_PROTOCOL_BG;
  if (wifiRadioStaProtocolMask == requestedMask) return true;

  uint8_t oldMask = wifiRadioStaProtocolMask;
  wifiRadioStaProtocolMask = requestedMask;

  wifi_mode_t mode = WiFi.getMode();
  if (!wifiRadioModeHasSta(mode)) return true;

  esp_err_t err = esp_wifi_set_protocol(WIFI_IF_STA, requestedMask);
  if (err == ESP_OK) return true;

  wifiRadioStaProtocolMask = oldMask;
  Serial.printf("WARNING: Could not switch station Wi-Fi protocol mask to 0x%02X (%s).\n",
                requestedMask,
                esp_err_to_name(err));
  return false;
}

bool wifiRadioStaBOnlyEnabled() {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();
  return wifiRadioStaProtocolMask == BATMON_WIFI_PROTOCOL_B_ONLY;
}

bool setWifiRadioSettings(bool sleepEnabled, int txPowerQuarterDbm, String& errorOut) {
  if (!isSupportedWifiTxQuarterDbm(txPowerQuarterDbm)) {
    errorOut = "RADIO_INVALID_TX_POWER";
    return false;
  }

  bool oldSleep = wifiRadioSleepEnabled;
  int8_t oldTx = wifiRadioTxPowerQuarterDbm;
  wifiRadioSleepEnabled = sleepEnabled;
  wifiRadioTxPowerQuarterDbm = (int8_t)txPowerQuarterDbm;
  wifiRadioSettingsLoaded = true;

  if (!applyWifiRadioSettings()) {
    wifiRadioSleepEnabled = oldSleep;
    wifiRadioTxPowerQuarterDbm = oldTx;
    applyWifiRadioSettings();
    errorOut = "RADIO_APPLY_FAILED";
    return false;
  }

  Preferences radioPrefs;
  if (!radioPrefs.begin("batmon", false)) {
    wifiRadioSleepEnabled = oldSleep;
    wifiRadioTxPowerQuarterDbm = oldTx;
    applyWifiRadioSettings();
    errorOut = "RADIO_NVS_OPEN_FAILED";
    return false;
  }

  size_t sleepWritten = radioPrefs.putBool(BATMON_WIFI_SLEEP_KEY, wifiRadioSleepEnabled);
  size_t txWritten = radioPrefs.putInt(BATMON_WIFI_TXQ_KEY, (int32_t)wifiRadioTxPowerQuarterDbm);
  radioPrefs.end();
  if (sleepWritten != 1 || txWritten != sizeof(int32_t)) {
    wifiRadioSleepEnabled = oldSleep;
    wifiRadioTxPowerQuarterDbm = oldTx;
    applyWifiRadioSettings();
    errorOut = "RADIO_NVS_WRITE_FAILED";
    return false;
  }

  errorOut = "";
  return true;
}

String wifiRadioSettingsSummary() {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();
  int actualQuarterDbm = -999;
  if (WiFi.getMode() != WIFI_MODE_NULL)
    actualQuarterDbm = (int8_t)WiFi.getTxPower();

  // Keep the existing three-field USB contract stable. Dynamic B/BG PHY state
  // is internal roaming state and is intentionally not appended here.
  return String("RADIO ") + (wifiRadioSleepEnabled ? "1" : "0") + " " +
         String((int)wifiRadioTxPowerQuarterDbm) + " " + String(actualQuarterDbm);
}
