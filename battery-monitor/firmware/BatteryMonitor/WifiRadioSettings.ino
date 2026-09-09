// Persistent Wi-Fi radio policy for Battery Monitor.
//
// These settings intentionally live outside the ordinary user configuration UI.
// They are advanced/service controls stored in the encrypted `batmon` NVS
// namespace so changing them later does not require another firmware build.
// Defaults match the preferred reliability policy: modem sleep disabled,
// maximum TX power requested at 20 dBm (80 quarter-dBm units), and station
// association scans all channels then prefers the strongest matching AP.

#include <WiFi.h>
#include <Preferences.h>

static const char* BATMON_WIFI_SLEEP_KEY = "wsleep";
static const char* BATMON_WIFI_TXQ_KEY = "wtxq";
static const int8_t BATMON_WIFI_TX_DEFAULT_QDBM = 80; // 20 dBm

static bool wifiRadioSleepEnabled = false;
static int8_t wifiRadioTxPowerQuarterDbm = BATMON_WIFI_TX_DEFAULT_QDBM;
static bool wifiRadioSettingsLoaded = false;
static wifi_mode_t wifiRadioLastAppliedMode = WIFI_MODE_NULL;

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
  // safe to call around mode transitions. setTxPower() requires an active STA
  // or AP interface and is therefore deferred when Wi-Fi is fully stopped.
  bool sleepOk = WiFi.setSleep(wifiRadioSleepEnabled);
  wifi_mode_t mode = WiFi.getMode();
  if (mode == WIFI_MODE_NULL) {
    wifiRadioLastAppliedMode = WIFI_MODE_NULL;
    return sleepOk;
  }

  bool txOk = WiFi.setTxPower((wifi_power_t)wifiRadioTxPowerQuarterDbm);
  if (sleepOk && txOk) wifiRadioLastAppliedMode = mode;
  return sleepOk && txOk;
}

void serviceWifiRadioSettings() {
  if (!wifiRadioSettingsLoaded) loadWifiRadioSettings();
  wifi_mode_t mode = WiFi.getMode();
  if (mode != wifiRadioLastAppliedMode) {
    if (!applyWifiRadioSettings())
      Serial.println("WARNING: Could not fully apply configured Wi-Fi radio policy after mode change.");
  }
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

  return String("RADIO ") + (wifiRadioSleepEnabled ? "1" : "0") + " " +
         String((int)wifiRadioTxPowerQuarterDbm) + " " + String(actualQuarterDbm);
}
