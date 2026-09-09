// USB serial provisioning and signed firmware-update protocol for Battery Monitor.
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
// Firmware updates use a line-framed control channel plus raw binary chunks.
// FWBEGIN carries the image size, SHA-256, and detached production signature.
// FWCHUNK enters raw receive mode for exactly N bytes and ACKs only after those
// bytes have been written to the inactive OTA partition. FWEND verifies the
// complete hash + RSA-PSS signature before selecting the partition for boot.
//
// BATMON1 PING
// BATMON1 STATUS
// BATMON1 PROVSTATUS
// BATMON1 RADIOSTATUS
// BATMON1 MONITORKEY                 (trusted physical USB only; secret response)
// BATMON1 VERIFYPROVCRED <encoded-device-password>
// BATMON1 FWCAPS
// BATMON1 FWBEGIN <bytes> <sha256-hex> <signature-base64>
// BATMON1 FWCHUNK <bytes>            (then exactly <bytes> raw binary bytes)
// BATMON1 FWEND
// BATMON1 FWABORT
// BATMON1 SET NAME <encoded-name>
// BATMON1 SET BATTERY <profile-id> <lowV> <criticalV>
// BATMON1 SET SAMPLE <seconds>
// BATMON1 SET CAL <factor> <offsetV>
// BATMON1 SET RADIO <sleep:0|1> <tx-quarter-dbm>
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
    DeviceConfigState config = {};
    BatterySnapshot snapshot = {};
    if (!copyDeviceConfigState(config)) { serialErr("CONFIG_SYNC_UNAVAILABLE"); return; }
    if (!copyBatterySnapshot(snapshot)) {
      snapshot.lowVoltage = config.lowVoltage;
      snapshot.criticalVoltage = config.criticalVoltage;
      snapshot.calibrationFactor = config.calibrationFactor;
      snapshot.calibrationOffset = config.calibrationOffset;
      snapshot.sampleIntervalSec = config.sampleIntervalSec;
    }

    String reply = "STATUS ";
    reply += deviceId + " ";
    reply += percentEncode(config.deviceName) + " ";
    reply += percentEncode(config.batteryType) + " ";
    reply += String(config.lowVoltage, 3) + " ";
    reply += String(config.criticalVoltage, 3) + " ";
    reply += String(config.sampleIntervalSec) + " ";
    reply += percentEncode(config.wifiSsid) + " ";
    reply += String(snapshot.voltage, 3) + " ";
    reply += String(config.calibrationFactor, 6) + " ";
    reply += String(config.calibrationOffset, 4) + " ";
    reply += String(FW_VERSION);
    serialOk(reply);
    return;
  }

  if (command == "PROVSTATUS") { serialOk("PROVSTATUS " + provisioningIdentitySummary()); return; }
  if (command == "RADIOSTATUS") { serialOk(wifiRadioSettingsSummary()); return; }

  if (command == "MONITORKEY") {
    String keyHex = trustedUsbMonitoringIdentityKeyHex();
    if (keyHex.length() != 64) { serialErr("MONITORKEY_UNAVAILABLE"); return; }
    serialOk("MONITORKEY " + keyHex);
    keyHex = "";
    return;
  }

  if (command == "VERIFYPROVCRED") {
    unsigned long remainingMs = provisioningVerifyCooldownRemainingMs();
    if (remainingMs > 0) { serialErr("PROVCRED_VERIFY_COOLDOWN " + String((remainingMs + 999UL) / 1000UL)); return; }
    String candidate = percentDecode(remaining);
    bool credentialPresent = false;
    bool matches = verifyDevicePasswordFlexibleTrustedUsb(candidate, credentialPresent);
    if (!credentialPresent) { serialErr("PROVCRED_UNSET"); return; }
    if (matches) {
      provisioningVerifyFailures = 0;
      provisioningVerifyBlockedUntilMs = 0;
      serialOk("PROVCRED MATCH");
    } else {
      recordProvisioningVerifyFailure();
      serialOk("PROVCRED NO_MATCH");
    }
    return;
  }

  if (command == "FWCAPS") {
    serialOk("FWCAPS " + firmwareUpdateCapabilitySummary());
    return;
  }

  if (command == "FWBEGIN") {
    String sizeToken = nextToken(remaining);
    String sha256Hex = nextToken(remaining);
    String signatureBase64 = remaining;
    signatureBase64.trim();
    String error;
    if (!beginSignedFirmwareUpdate(sizeToken, sha256Hex, signatureBase64, error)) {
      serialErr(error);
      return;
    }
    serialOk(String("FWBEGIN READY ") + String(BATMON_FW_MAX_CHUNK));
    return;
  }

  if (command == "FWCHUNK") {
    char* end = nullptr;
    unsigned long chunkSize = strtoul(remaining.c_str(), &end, 10);
    if (!end || *end != '\0') { serialErr("FW_INVALID_CHUNK_SIZE"); return; }
    String error;
    if (!prepareSignedFirmwareChunk((size_t)chunkSize, error)) {
      serialErr(error);
      return;
    }
    serialOk(String("FWCHUNK READY ") + String(chunkSize));
    return;
  }

  if (command == "FWEND") {
    String version;
    String error;
    if (!finishSignedFirmwareUpdate(version, error)) {
      serialErr(error);
      return;
    }
    serialOk("FWEND VERIFIED " + version);
    Serial.flush();
    delay(200);
    ESP.restart();
    return;
  }

  if (command == "FWABORT") {
    String result;
    bool hadUpdate = abortSignedFirmwareUpdate(result);
    if (hadUpdate) serialOk("FWABORT " + result);
    else serialErr("FW_NO_ACTIVE_UPDATE");
    return;
  }

  if (command == "CLEARWIFI") { clearWifiSettings(); WiFi.disconnect(true, true); serialOk("CLEARWIFI"); return; }
  if (command == "CLEARPROVCRED") {
    String error;
    if (!clearProvisioningIdentityTrustedUsb(error)) { serialErr(error); return; }
    provisioningVerifyFailures = 0;
    provisioningVerifyBlockedUntilMs = 0;
    serialOk("CLEARPROVCRED");
    return;
  }
  if (command == "REBOOT") { serialOk("REBOOTING"); Serial.flush(); delay(150); ESP.restart(); return; }
  if (command != "SET") { serialErr("UNKNOWN_COMMAND"); return; }

  String setting = nextToken(remaining); setting.toUpperCase();

  if (setting == "NAME") {
    String value = percentDecode(remaining); value.trim();
    if (value.length() < 1 || value.length() > 48) { serialErr("INVALID_NAME"); return; }
    String error;
    if (!setDeviceNameSynchronized(value, error)) { serialErr(error); return; }
    serialOk("NAME " + percentEncode(value));
    return;
  }

  if (setting == "BATTERY") {
    String type = percentDecode(nextToken(remaining));
    type.trim();
    float low = nextToken(remaining).toFloat();
    float critical = nextToken(remaining).toFloat();
    if (!isValidBatteryProfileId(type) || critical < 6.0f || critical > 20.0f || low <= critical || low > 20.0f) { serialErr("INVALID_BATTERY"); return; }
    String error;
    if (!setBatterySettingsSynchronized(type, low, critical, error)) { serialErr(error); return; }
    serialOk("BATTERY " + percentEncode(type) + " " + String(low, 3) + " " + String(critical, 3));
    return;
  }

  if (setting == "SAMPLE") {
    long seconds = remaining.toInt();
    if (seconds < 1 || seconds > 3600) { serialErr("INVALID_SAMPLE"); return; }
    String error;
    if (!setSampleIntervalSynchronized((uint32_t)seconds, error)) { serialErr(error); return; }
    serialOk("SAMPLE " + String(seconds));
    return;
  }

  if (setting == "CAL") {
    float factor = nextToken(remaining).toFloat();
    float offset = nextToken(remaining).toFloat();
    if (factor < 0.5f || factor > 1.5f || offset < -5.0f || offset > 5.0f) { serialErr("INVALID_CAL"); return; }
    String error;
    if (!setCalibrationSynchronized(factor, offset, error)) { serialErr(error); return; }
    sampleBattery();
    serialOk("CAL " + String(factor, 6) + " " + String(offset, 4));
    return;
  }

  if (setting == "RADIO") {
    String sleepToken = nextToken(remaining);
    String txToken = nextToken(remaining);
    remaining.trim();
    if ((sleepToken != "0" && sleepToken != "1") || txToken.length() == 0 || remaining.length() != 0) {
      serialErr("RADIO_INVALID_ARGUMENTS");
      return;
    }
    char* end = nullptr;
    long txQuarterDbm = strtol(txToken.c_str(), &end, 10);
    if (!end || *end != '\0') { serialErr("RADIO_INVALID_TX_POWER"); return; }
    String error;
    if (!setWifiRadioSettings(sleepToken == "1", (int)txQuarterDbm, error)) {
      serialErr(error);
      return;
    }
    serialOk(wifiRadioSettingsSummary());
    return;
  }

  if (setting == "WIFI") {
    String ssid = percentDecode(nextToken(remaining));
    String password = percentDecode(nextToken(remaining));
    if (ssid.length() < 1 || ssid.length() > 32 || password.length() > 63) { serialErr("INVALID_WIFI"); return; }
    saveWifiSettings(ssid, password);
    if (!secureProvisioningActive) {
      WiFi.mode(WIFI_STA);
      applyWifiRadioSettings();
      WiFi.setHostname(hostName.c_str());
      WiFi.begin(ssid.c_str(), password.c_str());
      wifiDisconnectedSinceMs = millis(); nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
    }
    serialOk("WIFI " + percentEncode(ssid));
    return;
  }

  if (setting == "PROVCRED") {
    String username = percentDecode(nextToken(remaining));
    String devicePassword = percentDecode(remaining);
    String error;
    if (!setDevicePasswordFlexible(username, devicePassword, error)) { serialErr(error); return; }
    provisioningVerifyFailures = 0; provisioningVerifyBlockedUntilMs = 0;

    bool startProtectedSetup = !hasConfiguredWifi() && !fallbackApActive;
    serialOk("PROVCRED " + percentEncode(username) + " " + apSsid);
    if (startProtectedSetup) {
      Serial.println("Device Password initialized with no home Wi-Fi; starting protected setup AP.");
      startFallbackAp();
    }
    return;
  }

  serialErr("UNKNOWN_SETTING");
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
        processSerialProvisioningCommand(serialProvisioningLine);
        serialProvisioningLine = "";
      }
      if (firmwareUpdateRawBytesPending()) return;
      continue;
    }
    if (serialProvisioningLine.length() >= 768) { serialProvisioningLine = ""; serialErr("LINE_TOO_LONG"); continue; }
    serialProvisioningLine += c;
  }
}

void serialEvent() { serviceSerialProvisioning(); }
