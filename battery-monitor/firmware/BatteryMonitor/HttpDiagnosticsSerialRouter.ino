// Trusted-USB-only HTTP diagnostics, transport settings, hardware identity,
// and Wi-Fi radio diagnostics.
//
// The existing SerialProvisioning parser remains authoritative for all normal
// commands and firmware-update raw mode. This wrapper intercepts only HTTPTRACE,
// HTTPSTATUS / SET HTTP, HWINFO, and WIFIINFO engineering commands, then delegates
// every other complete command line unchanged. These controls are unavailable
// over LAN.

#include <esp_chip_info.h>
#include <esp_wifi.h>

static bool parseHttpUnsigned(const String& token, uint32_t& valueOut) {
  if (token.length() == 0) return false;
  char* end = nullptr;
  unsigned long value = strtoul(token.c_str(), &end, 10);
  if (!end || *end != '\0') return false;
  valueOut = (uint32_t)value;
  return true;
}

static String hardwareIdentitySummary() {
  esp_chip_info_t chip = {};
  esp_chip_info(&chip);

  String result = "HWINFO ";
  result += "model=" + String(ESP.getChipModel()) + " ";
  result += "modelId=" + String((unsigned int)chip.model) + " ";
  result += "revision=" + String((unsigned int)chip.revision) + " ";
  result += "cores=" + String((unsigned int)chip.cores) + " ";
  result += "flashBytes=" + String((unsigned long)ESP.getFlashChipSize()) + " ";
  result += "psramBytes=" + String((unsigned long)ESP.getPsramSize()) + " ";
  result += "cpuMHz=" + String((unsigned long)ESP.getCpuFreqMHz()) + " ";
  result += "features=0x" + String((unsigned long)chip.features, HEX) + " ";
  result += "idf=" + String(ESP.getSdkVersion()) + " ";
  result += "arduino=" + String(ESP.getCoreVersion());
  return result;
}

static unsigned long wifiDiagDeadlineRemainingMs(unsigned long deadline, unsigned long now) {
  if (deadline == 0 || (int32_t)(now - deadline) >= 0) return 0;
  return (unsigned long)(deadline - now);
}

static String wifiDiagBssid(const uint8_t bssid[6]) {
  char text[18] = {};
  snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X",
           bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5]);
  return String(text);
}

static String wifiDiagProtocolName(uint8_t mask) {
  String name;
  if (mask & WIFI_PROTOCOL_11B) name += "B";
  if (mask & WIFI_PROTOCOL_11G) name += name.length() ? "/G" : "G";
  if (mask & WIFI_PROTOCOL_11N) name += name.length() ? "/N" : "N";
#ifdef WIFI_PROTOCOL_LR
  if (mask & WIFI_PROTOCOL_LR) name += name.length() ? "/LR" : "LR";
#endif
  if (name.length() == 0) name = "NONE";
  return name;
}

static const char* wifiDiagCountryPolicyName(int policy) {
  if (policy == WIFI_COUNTRY_POLICY_AUTO) return "AUTO";
  if (policy == WIFI_COUNTRY_POLICY_MANUAL) return "MANUAL";
  return "UNKNOWN";
}

static String wifiRadioDiagnosticsSummary() {
  unsigned long now = millis();
  String result = "WIFIINFO ";

  wifi_mode_t mode = WiFi.getMode();
  bool staActive = mode == WIFI_MODE_STA || mode == WIFI_MODE_APSTA;
  bool connected = WiFi.status() == WL_CONNECTED;
  result += "connected=" + String(connected ? 1 : 0) + " ";
  result += "mode=" + String((int)mode) + " ";

  wifi_ap_record_t ap = {};
  esp_err_t apErr = connected ? esp_wifi_sta_get_ap_info(&ap) : ESP_ERR_INVALID_STATE;
  if (apErr == ESP_OK) {
    result += "ssid=" + percentEncode(String((const char*)ap.ssid)) + " ";
    result += "bssid=" + wifiDiagBssid(ap.bssid) + " ";
    result += "channel=" + String((int)ap.primary) + " ";
    result += "rssi=" + String((int)ap.rssi) + " ";
  } else {
    result += "ssid=NA bssid=NA channel=0 rssi=0 ";
  }

  uint8_t protocolMask = wifiRadioStaProtocolMask;
  esp_err_t protocolErr = staActive ? esp_wifi_get_protocol(WIFI_IF_STA, &protocolMask) : ESP_ERR_INVALID_STATE;
  result += "protocolMask=0x" + String((unsigned int)protocolMask, HEX) + " ";
  result += "phy=" + wifiDiagProtocolName(protocolMask) + " ";
  result += "protocolRead=" + String(protocolErr == ESP_OK ? 1 : 0) + " ";
  result += "bOnly=" + String(wifiRadioStaBOnlyEnabled() ? 1 : 0) + " ";

  int8_t appliedTxQuarterDbm = -127;
  esp_err_t txErr = mode != WIFI_MODE_NULL
    ? esp_wifi_get_max_tx_power(&appliedTxQuarterDbm)
    : ESP_ERR_INVALID_STATE;
  result += "requestedTxQ=" + String((int)wifiRadioTxPowerQuarterDbm) + " ";
  result += "requestedTxDbm=" + String(((float)wifiRadioTxPowerQuarterDbm) / 4.0f, 2) + " ";
  if (txErr == ESP_OK) {
    result += "appliedTxQ=" + String((int)appliedTxQuarterDbm) + " ";
    result += "appliedTxDbm=" + String(((float)appliedTxQuarterDbm) / 4.0f, 2) + " ";
  } else {
    result += "appliedTxQ=NA appliedTxDbm=NA ";
  }

  wifi_country_t country = {};
  esp_err_t countryErr = mode != WIFI_MODE_NULL ? esp_wifi_get_country(&country) : ESP_ERR_INVALID_STATE;
  if (countryErr == ESP_OK) {
    char cc[4] = { country.cc[0], country.cc[1], country.cc[2], '\0' };
    String countryCode(cc);
    countryCode.trim();
    if (countryCode.length() == 0) countryCode = "NA";
    result += "country=" + countryCode + " ";
    result += "countryPolicy=" + String(wifiDiagCountryPolicyName((int)country.policy)) + " ";
    result += "countryPolicyId=" + String((int)country.policy) + " ";
    result += "countryMaxTxDbm=" + String((int)country.max_tx_power) + " ";
    result += "countryStartChannel=" + String((int)country.schan) + " ";
    result += "countryChannels=" + String((int)country.nchan) + " ";
  } else {
    result += "country=NA countryPolicy=NA countryPolicyId=-1 countryMaxTxDbm=NA countryStartChannel=0 countryChannels=0 ";
  }

  unsigned long weakForMs = batteryMonitorRoamWeakSinceMs == 0
    ? 0 : (unsigned long)(now - batteryMonitorRoamWeakSinceMs);
  unsigned long recoveryForMs = batteryMonitorPhyRecoverySinceMs == 0
    ? 0 : (unsigned long)(now - batteryMonitorPhyRecoverySinceMs);
  unsigned long bOnlyDisconnectedForMs = batteryMonitorBOnlyDisconnectedSinceMs == 0
    ? 0 : (unsigned long)(now - batteryMonitorBOnlyDisconnectedSinceMs);

  result += "roamScan=" + String(batteryMonitorRoamScanActive ? 1 : 0) + " ";
  result += "weakForMs=" + String(weakForMs) + " ";
  result += "phyRecoveryForMs=" + String(recoveryForMs) + " ";
  result += "bOnlyDisconnectedForMs=" + String(bOnlyDisconnectedForMs) + " ";
  result += "nextRoamMs=" + String(wifiDiagDeadlineRemainingMs(batteryMonitorRoamNextScanAtMs, now)) + " ";
  result += "roamCooldownMs=" + String(wifiDiagDeadlineRemainingMs(batteryMonitorRoamCooldownUntilMs, now)) + " ";
  result += "bOnlyRetryMs=" + String(wifiDiagDeadlineRemainingMs(batteryMonitorBOnlyRetryAfterMs, now)) + " ";
  result += "otaActive=" + String(firmwareUpdateInProgress() ? 1 : 0);
  return result;
}

static bool processHardwareIdentitySerialCommand(String line) {
  line.trim();
  if (line != "BATMON1 HWINFO") return false;
  serialOk(hardwareIdentitySummary());
  return true;
}

static bool processWifiDiagnosticsSerialCommand(String line) {
  line.trim();
  if (line != "BATMON1 WIFIINFO") return false;
  serialOk(wifiRadioDiagnosticsSummary());
  return true;
}

static bool processHttpRuntimeSettingsSerialCommand(String line) {
  line.trim();

  if (line == "BATMON1 HTTPSTATUS") {
    serialOk(httpRuntimeSettingsSummary());
    return true;
  }

  if (!line.startsWith("BATMON1 SET HTTP ")) return false;

  String remaining = line.substring(17);
  String clientsToken = nextToken(remaining);
  remaining.trim();

  uint32_t clients = 0;
  if (remaining.length() != 0 || !parseHttpUnsigned(clientsToken, clients)) {
    serialErr("HTTP_INVALID_ARGUMENTS");
    return true;
  }

  String error;
  if (!setHttpRuntimeMaxClients(clients, error)) {
    serialErr(error);
    return true;
  }

  serialOk(httpRuntimeSettingsSummary());
  return true;
}

static bool processHttpDiagnosticsSerialCommand(String line) {
  line.trim();
  if (!line.startsWith("BATMON1 HTTPTRACE")) return false;

  String remaining = line.substring(17);
  remaining.trim();
  String action = nextToken(remaining);
  action.toUpperCase();

  if (action.length() == 0 || action == "STATUS") {
    serialOk(httpTraceSummary());
    return true;
  }
  if (action == "ON") {
    setHttpTraceEnabled(true);
    serialOk(httpTraceSummary());
    return true;
  }
  if (action == "OFF") {
    setHttpTraceEnabled(false);
    serialOk(httpTraceSummary());
    return true;
  }
  if (action == "SOURCES") {
    // One deliberately uncached acquisition of every source needed by status.
    // Password bytes are never returned; only the NVS read timing and length.
    serialOk("HTTPTRACE " + runHttpSourceTimingDiagnostic());
    return true;
  }

  serialErr("HTTPTRACE_UNKNOWN_ACTION");
  return true;
}

void serviceSerialProvisioning() {
  if (firmwareUpdateRawBytesPending()) {
    serviceSignedFirmwareRawSerial();
    return;
  }

  while (Serial.available() > 0) {
    if (firmwareUpdateRawBytesPending()) {
      serviceSignedFirmwareRawSerial();
      return;
    }

    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (serialProvisioningLine.length() > 0) {
        String completed = serialProvisioningLine;
        serialProvisioningLine = "";
        if (!processHardwareIdentitySerialCommand(completed) &&
            !processWifiDiagnosticsSerialCommand(completed) &&
            !processHttpRuntimeSettingsSerialCommand(completed) &&
            !processHttpDiagnosticsSerialCommand(completed))
          processSerialProvisioningCommand(completed);
      }
      if (firmwareUpdateRawBytesPending()) return;
      continue;
    }
    if (serialProvisioningLine.length() >= 768) {
      serialProvisioningLine = "";
      serialErr("LINE_TOO_LONG");
      continue;
    }
    serialProvisioningLine += c;
  }
}

void serialEvent() { serviceSerialProvisioning(); }
