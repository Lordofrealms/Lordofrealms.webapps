#include <WiFi.h>
#include <WebServer.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <Preferences.h>

// Battery Monitor firmware v0.1.0
// Target: ESP32-WROOM-32 / classic ESP32 dev boards
// ADC input: GPIO34 (board label P34)
// Divider: battery+ -> 100k -> GPIO34 -> 22k -> GND
// No ADC capacitor is required for V1. The firmware uses repeated calibrated
// millivolt readings plus trimming/averaging to reduce noise. If bench/vehicle
// testing shows excessive jitter, a 0.1 uF capacitor from GPIO34 to GND can be
// added later without changing the firmware.

static const char* FW_VERSION = "0.1.0";
static const int API_VERSION = 1;
static const uint8_t BATTERY_ADC_PIN = 34;
static const uint8_t RESET_WIFI_PIN = 0; // BOOT button on common dev boards
static const uint16_t HTTP_PORT = 80;
static const uint16_t DISCOVERY_PORT = 4210;
static const char* DISCOVERY_REQUEST = "BATMON_DISCOVER_V1";

static const float DIVIDER_TOP_OHMS = 100000.0f;
static const float DIVIDER_BOTTOM_OHMS = 22000.0f;
static const float DIVIDER_MULTIPLIER = (DIVIDER_TOP_OHMS + DIVIDER_BOTTOM_OHMS) / DIVIDER_BOTTOM_OHMS;

static const unsigned long CONNECT_ATTEMPT_MS = 30000UL;
static const unsigned long RETRY_INTERVAL_MS = 10UL * 60UL * 1000UL;
static const unsigned long WIFI_RESET_HOLD_MS = 5000UL;

WebServer server(HTTP_PORT);
WiFiUDP discoveryUdp;
Preferences prefs;

String deviceId;
String hostName;
String apSsid;
String deviceName;
String batteryType;
String wifiSsid;
String wifiPassword;
float lowVoltage = 12.20f;
float criticalVoltage = 11.90f;
float calibrationFactor = 1.0f;
float calibrationOffset = 0.0f;
uint32_t sampleIntervalSec = 10;

float batteryVoltage = 0.0f;
uint32_t adcMilliVolts = 0;
uint16_t adcRaw = 0;
unsigned long lastSampleMs = 0;
unsigned long wifiDisconnectedSinceMs = 0;
unsigned long nextReconnectAttemptMs = 0;
unsigned long bootButtonPressedSinceMs = 0;
bool fallbackApActive = false;
bool mdnsActive = false;

String jsonEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((uint8_t)c >= 0x20) out += c;
        break;
    }
  }
  return out;
}

String htmlEscape(const String& s) {
  String out = s;
  out.replace("&", "&amp;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  out.replace("\"", "&quot;");
  out.replace("'", "&#39;");
  return out;
}

String statusTextForVoltage(float voltage) {
  if (voltage <= criticalVoltage) return "critical";
  if (voltage <= lowVoltage) return "low";
  return "good";
}

void chemistryDefaults(const String& type, float& lowOut, float& criticalOut) {
  if (type == "lifepo4_4s") {
    // Alarm-oriented defaults, not an SOC gauge. LiFePO4 voltage is flat over
    // much of its discharge curve, so users should tune these for their pack/BMS.
    lowOut = 12.80f;
    criticalOut = 12.00f;
  } else {
    // 12 V lead-acid resting-voltage oriented defaults.
    lowOut = 12.20f;
    criticalOut = 11.90f;
  }
}

String localIpString() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  if (fallbackApActive) return WiFi.softAPIP().toString();
  return "0.0.0.0";
}

void loadSettings() {
  prefs.begin("batmon", true);
  deviceName = prefs.getString("name", "");
  batteryType = prefs.getString("chem", "lead_acid");
  lowVoltage = prefs.getFloat("low", 12.20f);
  criticalVoltage = prefs.getFloat("crit", 11.90f);
  calibrationFactor = prefs.getFloat("calf", 1.0f);
  calibrationOffset = prefs.getFloat("calo", 0.0f);
  sampleIntervalSec = prefs.getUInt("sample", 10);
  wifiSsid = prefs.getString("ssid", "");
  wifiPassword = prefs.getString("pass", "");
  prefs.end();

  if (sampleIntervalSec < 1 || sampleIntervalSec > 3600) sampleIntervalSec = 10;
  if (batteryType != "lead_acid" && batteryType != "lifepo4_4s") batteryType = "lead_acid";
  if (lowVoltage <= criticalVoltage || lowVoltage < 6.0f || lowVoltage > 20.0f) {
    chemistryDefaults(batteryType, lowVoltage, criticalVoltage);
  }
  if (deviceName.length() == 0) deviceName = "Battery Monitor " + deviceId.substring(deviceId.length() - 6);
}

void saveDeviceSettings() {
  prefs.begin("batmon", false);
  prefs.putString("name", deviceName);
  prefs.putString("chem", batteryType);
  prefs.putFloat("low", lowVoltage);
  prefs.putFloat("crit", criticalVoltage);
  prefs.putFloat("calf", calibrationFactor);
  prefs.putFloat("calo", calibrationOffset);
  prefs.putUInt("sample", sampleIntervalSec);
  prefs.end();
}

void saveWifiSettings(const String& ssid, const String& pass) {
  wifiSsid = ssid;
  wifiPassword = pass;
  prefs.begin("batmon", false);
  prefs.putString("ssid", wifiSsid);
  prefs.putString("pass", wifiPassword);
  prefs.end();
}

void clearWifiSettings() {
  wifiSsid = "";
  wifiPassword = "";
  prefs.begin("batmon", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
}

void sampleBattery() {
  // Throw away a few reads to let the ADC sampling network settle through the
  // relatively high impedance 100k/22k divider.
  for (int i = 0; i < 4; i++) {
    analogReadMilliVolts(BATTERY_ADC_PIN);
    delay(2);
  }

  const int N = 20;
  uint32_t mv[N];
  uint32_t rawSum = 0;
  for (int i = 0; i < N; i++) {
    mv[i] = analogReadMilliVolts(BATTERY_ADC_PIN);
    rawSum += analogRead(BATTERY_ADC_PIN);
    delay(2);
  }

  // Small insertion sort, then trimmed mean of middle 12 readings.
  for (int i = 1; i < N; i++) {
    uint32_t key = mv[i];
    int j = i - 1;
    while (j >= 0 && mv[j] > key) {
      mv[j + 1] = mv[j];
      j--;
    }
    mv[j + 1] = key;
  }

  uint32_t sum = 0;
  for (int i = 4; i < 16; i++) sum += mv[i];
  adcMilliVolts = sum / 12;
  adcRaw = (uint16_t)(rawSum / N);

  float adcVolts = ((float)adcMilliVolts) / 1000.0f;
  batteryVoltage = (adcVolts * DIVIDER_MULTIPLIER * calibrationFactor) + calibrationOffset;
  lastSampleMs = millis();
}

String statusJson() {
  String json = "{";
  json += "\"apiVersion\":" + String(API_VERSION) + ",";
  json += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\",";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"name\":\"" + jsonEscape(deviceName) + "\",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"ip\":\"" + localIpString() + "\",";
  json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  json += "\"setupApActive\":" + String(fallbackApActive ? "true" : "false") + ",";
  json += "\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
  json += "\"batteryType\":\"" + batteryType + "\",";
  json += "\"voltage\":" + String(batteryVoltage, 3) + ",";
  json += "\"state\":\"" + statusTextForVoltage(batteryVoltage) + "\",";
  json += "\"adcRaw\":" + String(adcRaw) + ",";
  json += "\"adcMillivolts\":" + String(adcMilliVolts) + ",";
  json += "\"lowVoltage\":" + String(lowVoltage, 3) + ",";
  json += "\"criticalVoltage\":" + String(criticalVoltage, 3) + ",";
  json += "\"calibrationFactor\":" + String(calibrationFactor, 6) + ",";
  json += "\"calibrationOffset\":" + String(calibrationOffset, 4) + ",";
  json += "\"sampleIntervalSec\":" + String(sampleIntervalSec) + ",";
  json += "\"uptimeSec\":" + String(millis() / 1000UL) + ",";
  json += "\"lastSampleAgeMs\":" + String(millis() - lastSampleMs);
  json += "}";
  return json;
}

String configJson() {
  String json = "{";
  json += "\"apiVersion\":" + String(API_VERSION) + ",";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"name\":\"" + jsonEscape(deviceName) + "\",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"batteryType\":\"" + batteryType + "\",";
  json += "\"lowVoltage\":" + String(lowVoltage, 3) + ",";
  json += "\"criticalVoltage\":" + String(criticalVoltage, 3) + ",";
  json += "\"calibrationFactor\":" + String(calibrationFactor, 6) + ",";
  json += "\"calibrationOffset\":" + String(calibrationOffset, 4) + ",";
  json += "\"sampleIntervalSec\":" + String(sampleIntervalSec) + ",";
  json += "\"configuredSsid\":\"" + jsonEscape(wifiSsid) + "\"";
  json += "}";
  return json;
}

String buildIndexPage() {
  String page = R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Battery Monitor</title>
<style>
body{font-family:Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:#f5f5f5;color:#222}
.card{background:#fff;border-radius:12px;padding:18px;margin:12px 0;box-shadow:0 1px 5px #ccc}
h1{margin:0 0 8px}.voltage{font-size:3rem;font-weight:700}.good{color:#188038}.low{color:#b06000}.critical{color:#b3261e}
label{display:block;margin-top:10px;font-weight:600}input,select,button{font-size:1rem;padding:9px;margin-top:4px;box-sizing:border-box}input,select{width:100%}button{margin-right:8px;cursor:pointer}.small{color:#666;font-size:.9rem}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="card"><h1 id="nameTitle">Battery Monitor</h1><div id="voltage" class="voltage">--.-- V</div><div id="state">Loading...</div><div class="small" id="details"></div></div>
<div class="card"><h2>Device settings</h2>
<label>Device name</label><input id="name" maxlength="48">
<label>Battery type</label><select id="batteryType"><option value="lead_acid">12 V Lead Acid</option><option value="lifepo4_4s">4S LiFePO4</option></select>
<div class="grid"><div><label>Low warning (V)</label><input id="low" type="number" step="0.01"></div><div><label>Critical (V)</label><input id="crit" type="number" step="0.01"></div></div>
<div class="grid"><div><label>Sample interval (seconds)</label><input id="sample" type="number" min="1" max="3600"></div><div><label>Calibration factor</label><input id="calf" type="number" step="0.0001"></div></div>
<label>Calibration offset (V)</label><input id="calo" type="number" step="0.001">
<p><button onclick="saveConfig()">Save settings</button><button onclick="applyPreset()">Apply chemistry defaults</button></p></div>
<div class="card"><h2>Wi-Fi</h2><div id="wifiInfo" class="small"></div><p><button onclick="resetWifi()">Reset Wi-Fi / Setup mode</button></p><div class="small">If Wi-Fi cannot connect, the monitor automatically exposes <b>)HTML";
  page += htmlEscape(apSsid);
  page += R"HTML(</b> and retries the saved network every 10 minutes. Holding the BOOT button for 5 seconds also clears Wi-Fi.</div></div>
<script>
let refreshMs=10000;
async function getJson(url,opts){let r=await fetch(url,opts);if(!r.ok)throw new Error(await r.text());return await r.json()}
async function refresh(){try{let s=await getJson('/api/status');document.getElementById('nameTitle').textContent=s.name;let v=document.getElementById('voltage');v.textContent=s.voltage.toFixed(2)+' V';v.className='voltage '+s.state;document.getElementById('state').textContent=s.state.toUpperCase();document.getElementById('details').textContent='ID '+s.deviceId+' | '+s.hostname+'.local | RSSI '+s.rssi+' dBm | FW '+s.firmwareVersion;document.getElementById('wifiInfo').textContent=s.wifiConnected?'Connected at '+s.ip:'Not connected; setup AP '+(s.setupApActive?'ACTIVE':'inactive');}catch(e){document.getElementById('state').textContent='Unable to refresh: '+e.message}}
async function loadConfig(){let c=await getJson('/api/config');name.value=c.name;batteryType.value=c.batteryType;low.value=c.lowVoltage;crit.value=c.criticalVoltage;sample.value=c.sampleIntervalSec;calf.value=c.calibrationFactor;calo.value=c.calibrationOffset}
function applyPreset(){if(batteryType.value==='lifepo4_4s'){low.value='12.80';crit.value='12.00'}else{low.value='12.20';crit.value='11.90'}}
async function saveConfig(){let b=new URLSearchParams({name:name.value,batteryType:batteryType.value,lowVoltage:low.value,criticalVoltage:crit.value,sampleIntervalSec:sample.value,calibrationFactor:calf.value,calibrationOffset:calo.value});await getJson('/api/config',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b});alert('Saved');await loadConfig();await refresh()}
async function resetWifi(){if(!confirm('Clear saved Wi-Fi and enter setup mode?'))return;await fetch('/api/reset-wifi',{method:'POST'});alert('Wi-Fi cleared. The monitor will restart in setup mode.')}
loadConfig().then(refresh);setInterval(refresh,refreshMs);
</script></body></html>)HTML";
  return page;
}

void handleRoot() {
  server.send(200, "text/html; charset=utf-8", buildIndexPage());
}

void handleStatus() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", statusJson());
}

void handleConfigGet() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", configJson());
}

void handleConfigPost() {
  if (server.hasArg("name")) {
    String value = server.arg("name");
    value.trim();
    if (value.length() >= 1 && value.length() <= 48) deviceName = value;
  }
  if (server.hasArg("batteryType")) {
    String value = server.arg("batteryType");
    if (value == "lead_acid" || value == "lifepo4_4s") batteryType = value;
  }
  if (server.hasArg("lowVoltage")) lowVoltage = server.arg("lowVoltage").toFloat();
  if (server.hasArg("criticalVoltage")) criticalVoltage = server.arg("criticalVoltage").toFloat();
  if (server.hasArg("sampleIntervalSec")) sampleIntervalSec = (uint32_t)server.arg("sampleIntervalSec").toInt();
  if (server.hasArg("calibrationFactor")) calibrationFactor = server.arg("calibrationFactor").toFloat();
  if (server.hasArg("calibrationOffset")) calibrationOffset = server.arg("calibrationOffset").toFloat();

  if (sampleIntervalSec < 1) sampleIntervalSec = 1;
  if (sampleIntervalSec > 3600) sampleIntervalSec = 3600;
  if (criticalVoltage < 6.0f || criticalVoltage > 20.0f || lowVoltage <= criticalVoltage || lowVoltage > 20.0f) {
    server.send(400, "application/json", "{\"error\":\"invalid thresholds\"}");
    return;
  }
  if (calibrationFactor < 0.5f || calibrationFactor > 1.5f || calibrationOffset < -5.0f || calibrationOffset > 5.0f) {
    server.send(400, "application/json", "{\"error\":\"invalid calibration\"}");
    return;
  }

  saveDeviceSettings();
  server.send(200, "application/json", configJson());
}

void handleWifiScan() {
  int count = WiFi.scanNetworks(false, true);
  String json = "{\"networks\":[";
  bool first = true;
  for (int i = 0; i < count; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    if (!first) json += ",";
    first = false;
    json += "{\"ssid\":\"" + jsonEscape(ssid) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"secure\":" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true") + "}";
  }
  json += "]}";
  WiFi.scanDelete();
  server.send(200, "application/json", json);
}

void handleWifiPost() {
  if (!server.hasArg("ssid")) {
    server.send(400, "application/json", "{\"error\":\"ssid required\"}");
    return;
  }
  String ssid = server.arg("ssid");
  String pass = server.hasArg("password") ? server.arg("password") : "";
  ssid.trim();
  if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) {
    server.send(400, "application/json", "{\"error\":\"invalid Wi-Fi settings\"}");
    return;
  }

  saveWifiSettings(ssid, pass);
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"saved; reconnect attempt starting\"}");
  delay(250);
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
}

void handleResetWifi() {
  clearWifiSettings();
  server.send(200, "application/json", "{\"ok\":true}");
  delay(300);
  ESP.restart();
}

void configureHttpServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/config", HTTP_GET, handleConfigGet);
  server.on("/api/config", HTTP_POST, handleConfigPost);
  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
  server.on("/api/wifi", HTTP_POST, handleWifiPost);
  server.on("/api/reset-wifi", HTTP_POST, handleResetWifi);
  server.on("/api/ping", HTTP_GET, []() { server.send(200, "application/json", "{\"ok\":true}"); });
  server.onNotFound([]() {
    if (fallbackApActive) {
      server.sendHeader("Location", "http://192.168.4.1/", true);
      server.send(302, "text/plain", "");
    } else {
      server.send(404, "application/json", "{\"error\":\"not found\"}");
    }
  });
  server.begin();
}

void startMdns() {
  if (WiFi.status() != WL_CONNECTED || mdnsActive) return;
  if (MDNS.begin(hostName.c_str())) {
    MDNS.addService("http", "tcp", HTTP_PORT);
    MDNS.addService("battery-monitor", "tcp", HTTP_PORT);
    MDNS.addServiceTxt("battery-monitor", "tcp", "id", deviceId);
    MDNS.addServiceTxt("battery-monitor", "tcp", "name", deviceName);
    MDNS.addServiceTxt("battery-monitor", "tcp", "api", String(API_VERSION));
    mdnsActive = true;
  }
}

void stopMdns() {
  if (mdnsActive) {
    MDNS.end();
    mdnsActive = false;
  }
}

void startFallbackAp() {
  if (fallbackApActive) return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apSsid.c_str());
  fallbackApActive = true;
  Serial.printf("Setup AP active: %s at %s\n", apSsid.c_str(), WiFi.softAPIP().toString().c_str());
}

void stopFallbackAp() {
  if (!fallbackApActive) return;
  WiFi.softAPdisconnect(true);
  fallbackApActive = false;
  WiFi.mode(WIFI_STA);
}

bool blockingInitialConnect() {
  if (wifiSsid.length() == 0) return false;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < CONNECT_ATTEMPT_MS) {
    delay(200);
  }
  return WiFi.status() == WL_CONNECTED;
}

void serviceWifiState() {
  bool connected = WiFi.status() == WL_CONNECTED;
  unsigned long now = millis();

  if (connected) {
    wifiDisconnectedSinceMs = 0;
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    if (fallbackApActive) stopFallbackAp();
    startMdns();
    return;
  }

  stopMdns();
  if (wifiDisconnectedSinceMs == 0) wifiDisconnectedSinceMs = now;

  if (!fallbackApActive && (wifiSsid.length() == 0 || now - wifiDisconnectedSinceMs >= CONNECT_ATTEMPT_MS)) {
    startFallbackAp();
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  }

  if (wifiSsid.length() > 0 && (int32_t)(now - nextReconnectAttemptMs) >= 0) {
    Serial.printf("Retrying Wi-Fi SSID %s\n", wifiSsid.c_str());
    WiFi.mode(fallbackApActive ? WIFI_AP_STA : WIFI_STA);
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  }
}

void serviceDiscovery() {
  int packetSize = discoveryUdp.parsePacket();
  if (packetSize <= 0) return;

  char buffer[96];
  int len = discoveryUdp.read(buffer, sizeof(buffer) - 1);
  if (len <= 0) return;
  buffer[len] = '\0';
  String request(buffer);
  request.trim();
  if (request != DISCOVERY_REQUEST) return;

  String reply = "{";
  reply += "\"protocol\":\"BATMON_DISCOVERY_V1\",";
  reply += "\"apiVersion\":" + String(API_VERSION) + ",";
  reply += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  reply += "\"name\":\"" + jsonEscape(deviceName) + "\",";
  reply += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  reply += "\"ip\":\"" + localIpString() + "\",";
  reply += "\"port\":" + String(HTTP_PORT) + ",";
  reply += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\"}";

  discoveryUdp.beginPacket(discoveryUdp.remoteIP(), discoveryUdp.remotePort());
  discoveryUdp.write((const uint8_t*)reply.c_str(), reply.length());
  discoveryUdp.endPacket();
}

void serviceResetButton() {
  bool pressed = digitalRead(RESET_WIFI_PIN) == LOW;
  unsigned long now = millis();
  if (pressed) {
    if (bootButtonPressedSinceMs == 0) bootButtonPressedSinceMs = now;
    if (now - bootButtonPressedSinceMs >= WIFI_RESET_HOLD_MS) {
      Serial.println("BOOT held 5 seconds: clearing Wi-Fi settings");
      clearWifiSettings();
      // GPIO0 is a boot strap pin. Wait for release before rebooting so the
      // board does not restart into the serial bootloader.
      while (digitalRead(RESET_WIFI_PIN) == LOW) delay(50);
      delay(100);
      ESP.restart();
    }
  } else {
    bootButtonPressedSinceMs = 0;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  uint64_t mac = ESP.getEfuseMac();
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "%06llX", (unsigned long long)(mac & 0xFFFFFFULL));
  deviceId = String("BM-") + suffix;
  String suffixLower = String(suffix);
  suffixLower.toLowerCase();
  hostName = String("battery-") + suffixLower;
  apSsid = String("BatteryMonitor-") + suffix;

  loadSettings();

  pinMode(RESET_WIFI_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_ADC_PIN, ADC_11db);
  sampleBattery();

  bool connected = blockingInitialConnect();
  if (connected) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    startMdns();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  } else {
    startFallbackAp();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  }

  configureHttpServer();
  discoveryUdp.begin(DISCOVERY_PORT);
  Serial.printf("Device %s (%s), hostname %s.local\n", deviceId.c_str(), deviceName.c_str(), hostName.c_str());
}

void loop() {
  server.handleClient();
  serviceDiscovery();
  serviceWifiState();
  serviceResetButton();

  unsigned long intervalMs = sampleIntervalSec * 1000UL;
  if (millis() - lastSampleMs >= intervalMs) sampleBattery();

  delay(2);
}
