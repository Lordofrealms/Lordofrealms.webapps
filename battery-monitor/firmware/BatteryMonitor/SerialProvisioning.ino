// USB serial provisioning protocol for Battery Monitor.
//
// Commands are one ASCII line at 115200 baud. Strings use URL/percent encoding.
// Every machine-readable response begins with BATMON1 so host software can
// ignore normal Serial debug output.
//
// BATMON1 PING
// BATMON1 STATUS
// BATMON1 SET NAME <encoded-name>
// BATMON1 SET BATTERY <lead_acid|lifepo4_4s> <lowV> <criticalV>
// BATMON1 SET SAMPLE <seconds>
// BATMON1 SET CAL <factor> <offsetV>
// BATMON1 SET WIFI <encoded-ssid> <encoded-password>
// BATMON1 CLEARWIFI
// BATMON1 REBOOT

static String serialProvisioningLine;

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
  static const char HEX[] = "0123456789ABCDEF";
  String out;
  out.reserve(value.length() * 2);
  for (size_t i = 0; i < value.length(); i++) {
    uint8_t c = (uint8_t)value[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      out += (char)c;
    } else {
      out += '%';
      out += HEX[(c >> 4) & 0x0F];
      out += HEX[c & 0x0F];
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

static void serialOk(const String& message) {
  Serial.print("BATMON1 OK ");
  Serial.println(message);
}

static void serialErr(const String& message) {
  Serial.print("BATMON1 ERR ");
  Serial.println(message);
}

static void processSerialProvisioningCommand(String line) {
  line.trim();
  if (!line.startsWith("BATMON1 ")) return;

  String remaining = line.substring(8);
  String command = nextToken(remaining);
  command.toUpperCase();

  if (command == "PING") {
    serialOk("PONG " + deviceId + " " + String(FW_VERSION));
    return;
  }

  if (command == "STATUS") {
    String reply = "STATUS ";
    reply += deviceId + " ";
    reply += percentEncode(deviceName) + " ";
    reply += batteryType + " ";
    reply += String(lowVoltage, 3) + " ";
    reply += String(criticalVoltage, 3) + " ";
    reply += String(sampleIntervalSec) + " ";
    reply += percentEncode(wifiSsid) + " ";
    reply += String(batteryVoltage, 3);
    serialOk(reply);
    return;
  }

  if (command == "CLEARWIFI") {
    clearWifiSettings();
    WiFi.disconnect(true, false);
    startFallbackAp();
    serialOk("CLEARWIFI");
    return;
  }

  if (command == "REBOOT") {
    serialOk("REBOOTING");
    Serial.flush();
    delay(150);
    ESP.restart();
    return;
  }

  if (command != "SET") {
    serialErr("UNKNOWN_COMMAND");
    return;
  }

  String setting = nextToken(remaining);
  setting.toUpperCase();

  if (setting == "NAME") {
    String value = percentDecode(remaining);
    value.trim();
    if (value.length() < 1 || value.length() > 48) {
      serialErr("INVALID_NAME");
      return;
    }
    deviceName = value;
    saveDeviceSettings();
    serialOk("NAME " + percentEncode(deviceName));
    return;
  }

  if (setting == "BATTERY") {
    String type = nextToken(remaining);
    String lowText = nextToken(remaining);
    String criticalText = nextToken(remaining);
    float low = lowText.toFloat();
    float critical = criticalText.toFloat();
    if ((type != "lead_acid" && type != "lifepo4_4s") ||
        critical < 6.0f || critical > 20.0f || low <= critical || low > 20.0f) {
      serialErr("INVALID_BATTERY");
      return;
    }
    batteryType = type;
    lowVoltage = low;
    criticalVoltage = critical;
    saveDeviceSettings();
    serialOk("BATTERY " + batteryType + " " + String(lowVoltage, 3) + " " + String(criticalVoltage, 3));
    return;
  }

  if (setting == "SAMPLE") {
    long seconds = remaining.toInt();
    if (seconds < 1 || seconds > 3600) {
      serialErr("INVALID_SAMPLE");
      return;
    }
    sampleIntervalSec = (uint32_t)seconds;
    saveDeviceSettings();
    serialOk("SAMPLE " + String(sampleIntervalSec));
    return;
  }

  if (setting == "CAL") {
    String factorText = nextToken(remaining);
    String offsetText = nextToken(remaining);
    float factor = factorText.toFloat();
    float offset = offsetText.toFloat();
    if (factor < 0.5f || factor > 1.5f || offset < -5.0f || offset > 5.0f) {
      serialErr("INVALID_CAL");
      return;
    }
    calibrationFactor = factor;
    calibrationOffset = offset;
    saveDeviceSettings();
    sampleBattery();
    serialOk("CAL " + String(calibrationFactor, 6) + " " + String(calibrationOffset, 4));
    return;
  }

  if (setting == "WIFI") {
    String encodedSsid = nextToken(remaining);
    String encodedPassword = nextToken(remaining);
    String ssid = percentDecode(encodedSsid);
    String password = percentDecode(encodedPassword);
    if (ssid.length() < 1 || ssid.length() > 32 || password.length() > 63) {
      serialErr("INVALID_WIFI");
      return;
    }
    saveWifiSettings(ssid, password);
    WiFi.mode(fallbackApActive ? WIFI_AP_STA : WIFI_STA);
    WiFi.setHostname(hostName.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    wifiDisconnectedSinceMs = millis();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
    serialOk("WIFI " + percentEncode(wifiSsid));
    return;
  }

  serialErr("UNKNOWN_SETTING");
}

void serviceSerialProvisioning() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (serialProvisioningLine.length() > 0) {
        processSerialProvisioningCommand(serialProvisioningLine);
        serialProvisioningLine = "";
      }
      continue;
    }

    if (serialProvisioningLine.length() >= 512) {
      serialProvisioningLine = "";
      serialErr("LINE_TOO_LONG");
      continue;
    }
    serialProvisioningLine += c;
  }
}
