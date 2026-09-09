// Trusted-USB-only HTTP diagnostics and transport-settings command router.
//
// The existing SerialProvisioning parser remains authoritative for all normal
// commands and firmware-update raw mode. This wrapper intercepts only HTTPTRACE
// diagnostics plus HTTPSTATUS / SET HTTP engineering settings, then delegates
// every other complete command line unchanged. These controls are intentionally
// unavailable over LAN.

static bool parseHttpUnsigned(const String& token, uint32_t& valueOut) {
  if (token.length() == 0) return false;
  char* end = nullptr;
  unsigned long value = strtoul(token.c_str(), &end, 10);
  if (!end || *end != '\0') return false;
  valueOut = (uint32_t)value;
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
  String rootToken = nextToken(remaining);
  String smallToken = nextToken(remaining);
  String scanToken = nextToken(remaining);
  remaining.trim();

  uint32_t clients = 0, rootSendBuffer = 0, smallSendBuffer = 0, scanSendBuffer = 0;
  if (remaining.length() != 0 ||
      !parseHttpUnsigned(clientsToken, clients) ||
      !parseHttpUnsigned(rootToken, rootSendBuffer) ||
      !parseHttpUnsigned(smallToken, smallSendBuffer) ||
      !parseHttpUnsigned(scanToken, scanSendBuffer)) {
    serialErr("HTTP_INVALID_ARGUMENTS");
    return true;
  }

  String error;
  if (!setHttpRuntimeSettings(clients, rootSendBuffer, smallSendBuffer, scanSendBuffer, error)) {
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
        if (!processHttpRuntimeSettingsSerialCommand(completed) &&
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
