// Trusted-USB-only HTTP diagnostics command router.
//
// The existing SerialProvisioning parser remains authoritative for all normal
// commands and firmware-update raw mode. This wrapper intercepts only HTTPTRACE
// diagnostics, then delegates every other complete command line unchanged.
// Diagnostics are intentionally unavailable over LAN.

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
        if (!processHttpDiagnosticsSerialCommand(completed))
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
