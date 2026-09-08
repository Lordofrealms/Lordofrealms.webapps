#include <WiFi.h>
#include <WebServer.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <esp_app_desc.h>

// Battery Monitor firmware v0.1.0
// Target: ESP32-WROOM-32 / classic ESP32 dev boards
// ADC input: GPIO34 (board label P34)
// Divider: battery+ -> 100k -> GPIO34 -> 22k -> GND

// Secure provisioning hooks.
bool loadProvisioningIdentity();
bool startSecureProvisioning();
void requestStopSecureProvisioning();
void serviceSecureProvisioning();

// P0-2 authenticated LAN-management hooks (ZManagementAuth.ino).
bool loadDeviceCredentialIdentity();
bool requireManagementWriteAuth();
void handleManagementChallenge();
void handleManagementSession();
void handleManagementLogout();
void handleDevicePasswordPost();
void handleEnterSecureProvisioningPost();
void serviceManagementAuth();

// Report the version embedded by the authoritative ESP-IDF build rather than
// maintaining a second manually synchronized firmware-version literal.
#define FW_VERSION (esp_app_get_description()->version)
static const int API_VERSION = 1;
static const uint8_t BATTERY_ADC_PIN = 34;
static const uint8_t RESET_WIFI_PIN = 0;
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
bool fallbackApActive = false; // true only while secure provisioning is active
bool mdnsActive = false;
bool httpServerActive = false;
bool discoveryActive = false;

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
      default: if ((uint8_t)c >= 0x20) out += c; break;
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
    lowOut = 12.80f;
    criticalOut = 12.00f;
  } else {
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
  // GPIO34 is fed through a relatively high-impedance divider. Use throw-away
  // samples followed by a trimmed mean to reduce ADC/noise sensitivity.
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
  batteryVoltage = (((float)adcMilliVolts / 1000.0f) * DIVIDER_MULTIPLIER * calibrationFactor) + calibrationOffset;
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
  return R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Battery Monitor</title>
<style>
body{font-family:Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:#f5f5f5;color:#222}.card{background:#fff;border-radius:12px;padding:18px;margin:12px 0;box-shadow:0 1px 5px #ccc}h1{margin:0 0 8px}.voltage{font-size:3rem;font-weight:700}.good{color:#188038}.low{color:#b06000}.critical{color:#b3261e}label{display:block;margin-top:10px;font-weight:600}input,select,button{font-size:1rem;padding:9px;margin-top:4px;box-sizing:border-box}input,select{width:100%}button{margin-right:8px;cursor:pointer}.small{color:#666;font-size:.9rem}.warn{color:#9a6700}.ok{color:#188038}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}fieldset{border:0;padding:0;margin:0}fieldset:disabled{opacity:.55}@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="card"><h1 id="nameTitle">Battery Monitor</h1><div id="voltage" class="voltage">--.-- V</div><div id="state">Loading...</div><div class="small" id="details"></div></div>
<div class="card"><h2>Management access</h2><label>Device Password</label><input id="devicePassword" type="password" autocomplete="current-password" maxlength="128"><p><button onclick="unlockSettings()">Unlock settings</button><button onclick="lockSettings()">Lock</button></p><div id="authState" class="small">Settings are locked. Battery status remains readable.</div></div>
<div class="card"><h2>Device settings</h2><fieldset id="settings" disabled>
<label>Device name</label><input id="name" maxlength="48">
<label>Battery type</label><select id="batteryType"><option value="lead_acid">12 V Lead Acid</option><option value="lifepo4_4s">4S LiFePO4</option></select>
<div class="grid"><div><label>Low warning (V)</label><input id="low" type="number" step="0.01"></div><div><label>Critical (V)</label><input id="crit" type="number" step="0.01"></div></div>
<div class="grid"><div><label>Sample interval (seconds)</label><input id="sample" type="number" min="1" max="3600"></div><div><label>Calibration factor</label><input id="calf" type="number" step="0.0001"></div></div>
<label>Calibration offset (V)</label><input id="calo" type="number" step="0.001"><p><button onclick="saveConfig()">Save settings</button><button onclick="applyPreset()">Apply chemistry defaults</button></p>
<h3>Wi-Fi</h3><div id="wifiInfo" class="small"></div><p><button onclick="enterProvisioning()">Change Wi-Fi / Secure Setup</button></p><div class="small">This starts the protected BatteryMonitor setup network without erasing your Device Password. Home Wi-Fi credentials are sent only through Espressif Security 2.</div></fieldset></div>
<script>
let refreshMs=1000,session='',csrf='';const el=id=>document.getElementById(id),te=new TextEncoder();
function ror(n,x){return(x>>>n)|(x<<(32-n))}function sha256(bytes){const K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];let l=bytes.length,b=((l+9+63)>>6)<<6,m=new Uint8Array(b);m.set(bytes);m[l]=128;let bit=l*8,d=new DataView(m.buffer);d.setUint32(b-4,bit>>>0);d.setUint32(b-8,Math.floor(bit/4294967296));let H=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],w=new Uint32Array(64);for(let o=0;o<b;o+=64){for(let i=0;i<16;i++)w[i]=d.getUint32(o+i*4);for(let i=16;i<64;i++){let a=w[i-15],c=w[i-2],s0=ror(7,a)^ror(18,a)^(a>>>3),s1=ror(17,c)^ror(19,c)^(c>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}let[a,b1,c,e,f,g,h,j]=H;for(let i=0;i<64;i++){let S1=ror(6,f)^ror(11,f)^ror(25,f),ch=(f&g)^(~f&h),t1=(j+S1+ch+K[i]+w[i])>>>0,S0=ror(2,a)^ror(13,a)^ror(22,a),maj=(a&b1)^(a&c)^(b1&c),t2=(S0+maj)>>>0;j=h;h=g;g=f;f=(e+t1)>>>0;e=c;c=b1;b1=a;a=(t1+t2)>>>0}H=[(H[0]+a)>>>0,(H[1]+b1)>>>0,(H[2]+c)>>>0,(H[3]+e)>>>0,(H[4]+f)>>>0,(H[5]+g)>>>0,(H[6]+h)>>>0,(H[7]+j)>>>0]}let out=new Uint8Array(32),v=new DataView(out.buffer);H.forEach((x,i)=>v.setUint32(i*4,x));return out}
function hmac(key,msg){let k=key;if(k.length>64)k=sha256(k);let kb=new Uint8Array(64);kb.set(k);let i=new Uint8Array(64),o=new Uint8Array(64);for(let n=0;n<64;n++){i[n]=kb[n]^54;o[n]=kb[n]^92}let a=new Uint8Array(64+msg.length);a.set(i);a.set(msg,64);let inner=sha256(a),b=new Uint8Array(96);b.set(o);b.set(inner,64);return sha256(b)}function hex(a){return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')}
function initialCodeCompat(p){if(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/i.test(p)){return p.replaceAll('-','').toUpperCase().replaceAll('O','0').replaceAll('I','1').replaceAll('L','1')}return p}
async function api(url,opts={},auth=false){opts.headers=opts.headers||{};if(auth){opts.headers['X-Batmon-Session']=session;opts.headers['X-Batmon-CSRF']=csrf}let r=await fetch(url,opts);let t=await r.text();if(!r.ok)throw new Error(t||('HTTP '+r.status));return t?JSON.parse(t):{}}
async function refresh(){try{let s=await api('/api/status');el('nameTitle').textContent=s.name;let v=el('voltage');v.textContent=s.voltage.toFixed(2)+' V';v.className='voltage '+s.state;el('state').textContent=s.state.toUpperCase();el('details').textContent='ID '+s.deviceId+' | '+s.hostname+'.local | RSSI '+s.rssi+' dBm | FW '+s.firmwareVersion;el('wifiInfo').textContent=s.wifiConnected?'Connected at '+s.ip:'Not connected'}catch(e){el('state').textContent='Unable to refresh: '+e.message}}
async function loadConfig(){let c=await api('/api/config');el('name').value=c.name;el('batteryType').value=c.batteryType;el('low').value=c.lowVoltage;el('crit').value=c.criticalVoltage;el('sample').value=c.sampleIntervalSec;el('calf').value=c.calibrationFactor;el('calo').value=c.calibrationOffset}
async function unlockSettings(){try{let c=await api('/api/auth/challenge'),p=initialCodeCompat(el('devicePassword').value),root=sha256(te.encode('BATMON-CODECHECK-V1|'+c.deviceId+'|'+p)),key=sha256(te.encode('BATMON-LAN-MGMT-V1|'+c.deviceId+'|'+hex(root))),proof=hex(hmac(key,te.encode('BATMON-AUTH-V1|'+c.deviceId+'|'+c.challengeId+'|'+c.nonce))),body=new URLSearchParams({challengeId:c.challengeId,proof}),s=await api('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});session=s.session;csrf=s.csrf;el('devicePassword').value='';el('settings').disabled=false;el('authState').textContent='Unlocked for up to 15 minutes of activity.';el('authState').className='small ok'}catch(e){session='';csrf='';el('settings').disabled=true;el('authState').textContent='Unlock failed. Check the Device Password. '+e.message;el('authState').className='small warn'}}
async function lockSettings(){try{if(session)await api('/api/auth/logout',{method:'POST'},true)}catch(e){}session='';csrf='';el('settings').disabled=true;el('authState').textContent='Settings are locked. Battery status remains readable.';el('authState').className='small'}
function applyPreset(){if(el('batteryType').value==='lifepo4_4s'){el('low').value='12.80';el('crit').value='12.00'}else{el('low').value='12.20';el('crit').value='11.90'}}
async function saveConfig(){try{let b=new URLSearchParams({name:el('name').value,batteryType:el('batteryType').value,lowVoltage:el('low').value,criticalVoltage:el('crit').value,sampleIntervalSec:el('sample').value,calibrationFactor:el('calf').value,calibrationOffset:el('calo').value});await api('/api/config',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b},true);alert('Saved');await loadConfig();await refresh()}catch(e){alert('Save failed: '+e.message)}}
async function enterProvisioning(){if(!confirm('Start the secure setup network to change Wi-Fi? Your Device Password and current settings will be preserved.'))return;try{let r=await api('/api/wifi/provisioning',{method:'POST'},true);alert('Secure setup is starting as '+r.setupSsid+'. Use the Battery Monitor Windows/Android setup app and the same Device Password.')}catch(e){alert('Could not start secure setup: '+e.message)}}
loadConfig().then(refresh);setInterval(refresh,refreshMs);
</script></body></html>)HTML";
}

void handleRoot() { server.send(200, "text/html; charset=utf-8", buildIndexPage()); }
void handleStatus() { server.sendHeader("Cache-Control", "no-store"); server.send(200, "application/json", statusJson()); }
void handleConfigGet() { server.sendHeader("Cache-Control", "no-store"); server.send(200, "application/json", configJson()); }

void handleConfigPost() {
  if (!requireManagementWriteAuth()) return;

  String oldName = deviceName;
  String oldType = batteryType;
  float oldLow = lowVoltage, oldCritical = criticalVoltage, oldFactor = calibrationFactor, oldOffset = calibrationOffset;
  uint32_t oldSample = sampleIntervalSec;

  if (server.hasArg("name")) {
    String value = server.arg("name"); value.trim();
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
  if (criticalVoltage < 6.0f || criticalVoltage > 20.0f || lowVoltage <= criticalVoltage || lowVoltage > 20.0f ||
      calibrationFactor < 0.5f || calibrationFactor > 1.5f || calibrationOffset < -5.0f || calibrationOffset > 5.0f) {
    deviceName = oldName; batteryType = oldType; lowVoltage = oldLow; criticalVoltage = oldCritical;
    sampleIntervalSec = oldSample; calibrationFactor = oldFactor; calibrationOffset = oldOffset;
    server.send(400, "application/json", "{\"error\":\"invalid configuration\"}");
    return;
  }

  saveDeviceSettings();
  server.send(200, "application/json", configJson());
}

void handleWifiScan() {
  // This read-only scan remains available for diagnostics. Home Wi-Fi passwords
  // are never accepted by the normal LAN API.
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

void handleRemovedPlaintextWifiPost() {
  server.send(410, "application/json", "{\"error\":\"plaintext LAN Wi-Fi changes were removed; use /api/wifi/provisioning after authentication\"}");
}

void configureHttpServer() {
  const char* headers[] = { "Cookie", "X-Batmon-Session", "X-Batmon-CSRF" };
  server.collectHeaders(headers, 3);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/config", HTTP_GET, handleConfigGet);
  server.on("/api/config", HTTP_POST, handleConfigPost);
  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);

  // P0-2 challenge/session endpoints. All normal state changes below are gated
  // by the short-lived session and its CSRF token.
  server.on("/api/auth/challenge", HTTP_GET, handleManagementChallenge);
  server.on("/api/auth/session", HTTP_POST, handleManagementSession);
  server.on("/api/auth/logout", HTTP_POST, handleManagementLogout);
  server.on("/api/password", HTTP_POST, handleDevicePasswordPost);
  server.on("/api/wifi/provisioning", HTTP_POST, handleEnterSecureProvisioningPost);

  // Retain the legacy URLs only as safe migration failures/aliases. The old
  // plaintext Wi-Fi credential path cannot modify state anymore.
  server.on("/api/wifi", HTTP_POST, handleRemovedPlaintextWifiPost);
  server.on("/api/reset-wifi", HTTP_POST, handleEnterSecureProvisioningPost);
  server.on("/api/ping", HTTP_GET, []() { server.send(200, "application/json", "{\"ok\":true}"); });
  server.onNotFound([]() { server.send(404, "application/json", "{\"error\":\"not found\"}"); });
  server.begin();
  httpServerActive = true;
}

void stopHttpServer() {
  if (!httpServerActive) return;
  server.stop();
  httpServerActive = false;
}

void startDiscovery() {
  if (discoveryActive) return;
  discoveryUdp.begin(DISCOVERY_PORT);
  discoveryActive = true;
}

void stopDiscovery() {
  if (!discoveryActive) return;
  discoveryUdp.stop();
  discoveryActive = false;
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
  if (mdnsActive) { MDNS.end(); mdnsActive = false; }
}

void startNormalNetworkServices() {
  if (!httpServerActive) configureHttpServer();
  startDiscovery();
  startMdns();
}

void stopNormalNetworkServices() {
  stopMdns();
  stopDiscovery();
  stopHttpServer();
}

void startFallbackAp() {
  if (fallbackApActive) return;
  stopNormalNetworkServices();
  if (!startSecureProvisioning()) {
    fallbackApActive = false;
    Serial.println("Secure setup could not start. Connect by trusted USB to initialize or repair the Device Password.");
  }
}

void stopFallbackAp() {
  if (!fallbackApActive) return;
  requestStopSecureProvisioning();
  fallbackApActive = false;
  WiFi.mode(WIFI_STA);
}

bool blockingInitialConnect() {
  if (wifiSsid.length() == 0) return false;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostName.c_str());
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < CONNECT_ATTEMPT_MS) delay(200);
  return WiFi.status() == WL_CONNECTED;
}

void serviceWifiState() {
  // While Security-2 provisioning owns the Wi-Fi stack, don't run normal STA
  // reconnect logic or ordinary HTTP/discovery services alongside it.
  if (fallbackApActive) return;

  bool connected = WiFi.status() == WL_CONNECTED;
  unsigned long now = millis();
  if (connected) {
    wifiDisconnectedSinceMs = 0;
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    startNormalNetworkServices();
    return;
  }

  stopMdns();
  if (wifiDisconnectedSinceMs == 0) wifiDisconnectedSinceMs = now;
  if (now - wifiDisconnectedSinceMs >= CONNECT_ATTEMPT_MS) {
    startFallbackAp();
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
    return;
  }

  if (wifiSsid.length() > 0 && (int32_t)(now - nextReconnectAttemptMs) >= 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(hostName.c_str());
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
    nextReconnectAttemptMs = now + RETRY_INTERVAL_MS;
  }
}

void serviceDiscovery() {
  if (!discoveryActive) return;
  int packetSize = discoveryUdp.parsePacket();
  if (packetSize <= 0) return;

  char buffer[96];
  int len = discoveryUdp.read(buffer, sizeof(buffer) - 1);
  if (len <= 0) return;
  buffer[len] = '\0';
  String request(buffer); request.trim();
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
      Serial.println("BOOT held 5 seconds: entering secure Wi-Fi provisioning; Device Password and settings are preserved");
      while (digitalRead(RESET_WIFI_PIN) == LOW) delay(50);
      bootButtonPressedSinceMs = 0;
      startFallbackAp();
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
  String suffixLower = String(suffix); suffixLower.toLowerCase();
  hostName = String("battery-") + suffixLower;
  apSsid = String("BatteryMonitor-") + suffix;

  loadSettings();
  bool provisioningReady = loadDeviceCredentialIdentity();

  pinMode(RESET_WIFI_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(BATTERY_ADC_PIN, ADC_11db);
  sampleBattery();

  bool connected = blockingInitialConnect();
  if (connected) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    startNormalNetworkServices();
    nextReconnectAttemptMs = millis() + RETRY_INTERVAL_MS;
  } else if (provisioningReady) {
    startFallbackAp();
  } else {
    Serial.println("No Wi-Fi and no Device Password credential. Secure provisioning is disabled until trusted USB initialization.");
  }

  Serial.printf("Device %s (%s), hostname %s.local\n", deviceId.c_str(), deviceName.c_str(), hostName.c_str());
}

void loop() {
  if (!fallbackApActive) {
    if (httpServerActive) server.handleClient();
    serviceDiscovery();
    serviceWifiState();
  } else {
    serviceSecureProvisioning();
  }
  serviceResetButton();
  serviceManagementAuth();

  unsigned long intervalMs = sampleIntervalSec * 1000UL;
  if (millis() - lastSampleMs >= intervalMs) sampleBattery();
  delay(2);
}
