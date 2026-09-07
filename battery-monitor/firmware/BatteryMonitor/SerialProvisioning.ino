// USB serial provisioning protocol for Battery Monitor.
//
// Commands are one ASCII line at 115200 baud. Strings use URL/percent encoding.
// Every machine-readable response begins with BATMON1 so host software can
// ignore normal Serial debug output.
//
// PROVCRED is retained as the wire-protocol name for compatibility; it now
// represents the user's normal Device Password. Custom passwords are allowed
// (including weak ones by user choice); only protocol-safe length/control-char
// validation is enforced by setDevicePasswordFlexible().
//
// BATMON1 PING
// BATMON1 STATUS
// BATMON1 PROVSTATUS
// BATMON1 VERIFYPROVCRED <encoded-device-password>
// BATMON1 SET NAME <encoded-name>
// BATMON1 SET BATTERY <lead_acid|lifepo4_4s> <lowV> <criticalV>
// BATMON1 SET SAMPLE <seconds>
// BATMON1 SET CAL <factor> <offsetV>
// BATMON1 SET WIFI <encoded-ssid> <encoded-password>
// BATMON1 SET PROVCRED <encoded-username> <encoded-device-password>
// BATMON1 CLEARWIFI
// BATMON1 CLEARPROVCRED
// BATMON1 REBOOT

static String serialProvisioningLine;
static uint8_t provisioningVerifyFailures = 0;
static unsigned long provisioningVerifyBlockedUntilMs = 0;

static int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static String percentDecode(const String& value) {
  String out;
  out.reserve(value.length());
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '%' && i + 2 < value.length()) {
      int hi = hexNibble(value[i + 1]);
      int lo = hexNibble(value[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out += (char)((hi << 4) | lo);
        i += 2;
        continue;
      }
    }
    out += c;
  }
  return out;
}

static String percentEncode(const String& value) {
  static const char HEX_CHARS[] = "0123456789ABCDEF";
  String out;
  out.reserve(value.length() * 2);
  for (size_t i = 0; i < value.length(); i++) {
    uint8_t c = (uint8_t)value[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      out += (char)c;
    } else {
      out += '%';
      out += HEX_CHARS[(c >> 4) & 0x0F];
      out += HEX_CHARS[c & 0x0F];
    }
  }
  return out;
}

static String nextToken(String& remaining) {
  remaining.trim();
  int space = remaining.indexOf(' ');
  if (space < 0) {
    String token = remaining;
    remaining = "";
    return token;
  }
  String token = remaining.substring(0, space);
  remaining = remaining.substring(space + 1);
  return token;
}

static void serialOk(const String& message) { Serial.print("BATMON1 OK "); Serial.println(message); }
static void serialErr(const String& message) { Serial.print("BATMON1 ERR "); Serial.println(message); }

static unsigned long provisioningVerifyCooldownRemainingMs() {
  if (provisioningVerifyBlockedUntilMs == 0) return 0;
  long remaining = (long)(provisioningVerifyBlockedUntilMs - millis());
  if (remaining <= 0) { provisioningVerifyBlockedUntilMs = 0; return 0; }
  return (unsigned long)remaining;
}

static void recordProvisioningVerifyFailure() {
  if (provisioningVerifyFailures < 250) provisioningVerifyFailures++;
  if (provisioningVerifyFailures < 5) return;
  uint8_t step = provisioningVerifyFailures - 5;
  if (step > 3) step = 3;
  unsigned long cooldownSec = 30UL << step;
  provisioningVerifyBlockedUntilMs = millis() + cooldownSec * 1000UL;
}

static void processSerialProvisioningCommand(String line) {
  line.trim();
  if (!line.startsWith("BATMON1 ")) return;
  String remaining = line.substring(8);
  String command = nextToken(remaining);
  command.toUpperCase();

  if (command == "PING") { serialOk("PONG " + deviceId + " " + String(FW_VERSION)); return; }

  if (command == "STATUS") {
    String reply = "STATUS ";
    reply += deviceId + " ";
    reply += percentEncode(deviceName) + " ";
    reply += batteryType + " ";
    reply += String(lowVoltage, 3) + " ";
    reply += String(criticalVoltage, 3) + " ";
    reply += String(sampleIntervalSec) + " ";
    reply += percentEncode(wifiSsid) + " ";
    reply += String(batteryVoltage, 3) + " ";
    reply += String(calibrationFactor, 6) + " ";
    reply += String(calibrationOffset, 4);
    serialOk(reply);
    return;
  }

  if (command == "PROVSTATUS") { serialOk("PROVSTATUS " + provisioningIdentitySummary()); return; }

  if (command == "VERIFYPROVCRED") {
    unsigned long remainingMs = provisioningVerifyCooldownRemainingMs();
    if (remainingMs > 0) { serialErr("PROVCRED_VERIFY_COOLDOWN " + String((remainingMs + 999UL) / 1000UL)); return; }
    if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity()) { serialErr("PROVCRED_UNSET"); return; }
    String candidate = percentDecode(remaining);
    if (verifyDevicePasswordFlexible(candidate)) {
      provisioningVerifyFailures = 0;
      provisioningVerifyBlockedUntilMs = 0;
      serialOk("PROVCRED MATCH");
    } else {
      recordProvisioningVerifyFailure();
      serialOk("PROVCRED NO_MATCH");
    }
    return;
  }

  if (command == "CLEARWIFI") { clearWifiSettings(); WiFi.disconnect(true, true); serialOk("CLEARWIFI"); return; }
  if (command == "CLEARPROVCRED") { clearProvisioningIdentity(); provisioningVerifyFailures = 0; provisioningVerifyBlockedUntilMs = 0; serialOk("CLEARPROVCRED"); return; }
  if (command == "REBOOT") { serialOk("REBOOTING"); Serial.flush(); delay(150); ESP.restart(); return; }
  if (command != "SET") { serialErr("UNKNOWN_COMMAND"); return; }

  String setting = nextToken(remaining); setting.toUpperCase();

  if (setting == "NAME") {
    String value = percentDecode(remaining); value.trim();
    if (value.length() < 1 || value.length() > 48) { serialErr("INVALID_NAME"); return; }
    deviceName = value; saveDeviceSettings(); serialOk("NAME " + percentEncode(deviceName)); return;
  }

  if (setting == "BATTERY") {
    String type = nextToken(remaining);
    float low = nextToken(remaining).toFloat();
    float critical = nextToken(remaining).toFloat();
    if ((type != "lead_acid" && type != "lifepo4_4s") || critical < 6.0f || critical > 20.0f || low <= critical || low > 20.0f) { serialErr("INVALID_BATTERY"); return; }
    batteryType = type; lowVoltage = low; criticalVoltage = critical; saveDeviceSettings();
    serialOk("BATTERY " + batteryType + " " + String(lowVoltage, 3) + " " + String(criticalVoltage, 3)); return;
  }

  if (setting == "SAMPLE") {
    long seconds = remaining.toInt();
    if (seconds < 1 || seconds > 3600) { serialErr("INVALID_SAMPLE"); return; }
    sampleIntervalSec = (uint32_t)seconds; saveDeviceSettings(); serialOk("SAMPLE " + String(sampleIntervalSec)); return;
  }

  if (setting == "CAL") {
    float factor = nextToken(remaining).toFloat();
    float offset = nextToken(remaining).toFloat();
    if (factor < 0.5f || factor > 1.5f || offset < -5.0f || offset > 5.0f) { serialErr("INVALID_CAL"); return; }
    calibrationFactor = factor; calibrationOffset = offset; saveDeviceSettings(); sampleBattery();
    serialOk("CAL " + String(calibrationFactor, 6) + " " + String(calibrationOffset, 4)); return;
  }

  if (setting == "WIFI") {
    String ssid = percentDecode(nextToken(remaining));
    String password = percentDecode(nextToken(remaining));
    if (ssid.length() < 1 || ssid.length() > 32 || password.length() > 63) { serialErr("INVALID_WIFI"); return; }
    saveWifiSettings(ssid, password);
    if (!secureProvisioningActive) {
      WiFi.mode(WIFI_STA); WiFi.setHostname(hostName.c_str()); WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
      wifiDisconnectedSinceMs = millis(); nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
    }
    serialOk("WIFI " + percentEncode(wifiSsid)); return;
  }

  if (setting == "PROVCRED") {
    String username = percentDecode(nextToken(remaining));
    String devicePassword = percentDecode(remaining);
    String error;
    if (!setDevicePasswordFlexible(username, devicePassword, error)) { serialErr(error); return; }
    provisioningVerifyFailures = 0; provisioningVerifyBlockedUntilMs = 0;
    serialOk("PROVCRED " + percentEncode(username) + " " + apSsid); return;
  }

  serialErr("UNKNOWN_SETTING");
}

void serviceSerialProvisioning() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (serialProvisioningLine.length() > 0) { processSerialProvisioningCommand(serialProvisioningLine); serialProvisioningLine = ""; }
      continue;
    }
    if (serialProvisioningLine.length() >= 768) { serialProvisioningLine = ""; serialErr("LINE_TOO_LONG"); continue; }
    serialProvisioningLine += c;
  }
}

void serialEvent() { serviceSerialProvisioning(); }
