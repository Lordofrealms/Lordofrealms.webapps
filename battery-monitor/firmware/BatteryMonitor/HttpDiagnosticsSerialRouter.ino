// Trusted-USB-only HTTP diagnostics, transport settings, and hardware identity.
//
// The existing SerialProvisioning parser remains authoritative for all normal
// commands and firmware-update raw mode. This wrapper intercepts only HTTPTRACE,
// HTTPSTATUS / SET HTTP, and HWINFO engineering commands, then delegates every
// other complete command line unchanged. These controls are unavailable over LAN.

#include <esp_chip_info.h>

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

static bool processHardwareIdentitySerialCommand(String line) {
  line.trim();
  if (line != "BATMON1 HWINFO") return false;
  serialOk(hardwareIdentitySummary());
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
