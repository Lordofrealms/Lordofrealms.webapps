// Battery Monitor authenticated monitoring-identity core.
//
// This file owns the stable 256-bit Monitoring Identity Key, HMAC helpers, and
// UDP discovery. NativeHttpServer.ino owns the HTTP status/key-export routes.

#include <mbedtls/md.h>
#include <mbedtls/gcm.h>
#include <esp_system.h>

static const char* MONITOR_ID_NAMESPACE = "batident";
static const char* MONITOR_ID_KEY_NAME = "monkey";
static const size_t MONITOR_ID_KEY_BYTES = 32;
static uint8_t monitoringIdentityKey[MONITOR_ID_KEY_BYTES] = {};
static bool monitoringIdentityReady = false;

static String monitorBase64Encode(const uint8_t* data, size_t len) {
  static const char TABLE[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String out;
  out.reserve(((len + 2) / 3) * 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t v = (uint32_t)data[i] << 16;
    bool have2 = i + 1 < len;
    bool have3 = i + 2 < len;
    if (have2) v |= (uint32_t)data[i + 1] << 8;
    if (have3) v |= data[i + 2];
    out += TABLE[(v >> 18) & 0x3F];
    out += TABLE[(v >> 12) & 0x3F];
    out += have2 ? TABLE[(v >> 6) & 0x3F] : '=';
    out += have3 ? TABLE[v & 0x3F] : '=';
  }
  return out;
}

static bool validMonitorNonce(const String& nonce) {
  if (nonce.length() != 32) return false;
  uint8_t decoded[16];
  return parseManagementHex(nonce, decoded, sizeof(decoded));
}

static bool monitoringHmac(const char* domain, const String& nonce, const String& payload, uint8_t out[32]) {
  if (!monitoringIdentityReady) return false;
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!info) return false;
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  int rc = mbedtls_md_setup(&ctx, info, 1);
  if (rc == 0) rc = mbedtls_md_hmac_starts(&ctx, monitoringIdentityKey, sizeof(monitoringIdentityKey));
  if (rc == 0) rc = mbedtls_md_hmac_update(&ctx, (const unsigned char*)domain, strlen(domain));
  static const uint8_t separator = '|';
  if (rc == 0) rc = mbedtls_md_hmac_update(&ctx, &separator, 1);
  if (rc == 0) rc = mbedtls_md_hmac_update(&ctx, (const unsigned char*)nonce.c_str(), nonce.length());
  if (rc == 0) rc = mbedtls_md_hmac_update(&ctx, &separator, 1);
  if (rc == 0) rc = mbedtls_md_hmac_update(&ctx, (const unsigned char*)payload.c_str(), payload.length());
  if (rc == 0) rc = mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
  return rc == 0;
}

bool loadOrCreateMonitoringIdentity() {
  Preferences idPrefs;
  if (!idPrefs.begin(MONITOR_ID_NAMESPACE, false)) return false;
  size_t len = idPrefs.getBytesLength(MONITOR_ID_KEY_NAME);
  if (len == MONITOR_ID_KEY_BYTES) {
    size_t read = idPrefs.getBytes(MONITOR_ID_KEY_NAME, monitoringIdentityKey, sizeof(monitoringIdentityKey));
    idPrefs.end();
    monitoringIdentityReady = read == sizeof(monitoringIdentityKey);
    return monitoringIdentityReady;
  }
  if (len != 0) {
    idPrefs.end();
    memset(monitoringIdentityKey, 0, sizeof(monitoringIdentityKey));
    monitoringIdentityReady = false;
    return false;
  }

  esp_fill_random(monitoringIdentityKey, sizeof(monitoringIdentityKey));
  size_t written = idPrefs.putBytes(MONITOR_ID_KEY_NAME, monitoringIdentityKey, sizeof(monitoringIdentityKey));
  idPrefs.end();
  monitoringIdentityReady = written == sizeof(monitoringIdentityKey);
  if (!monitoringIdentityReady) memset(monitoringIdentityKey, 0, sizeof(monitoringIdentityKey));
  return monitoringIdentityReady;
}

static String authenticatedDiscoveryPayload() {
  String payload = "{";
  payload += "\"apiVersion\":" + String(API_VERSION) + ",";
  payload += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  payload += "\"name\":\"" + jsonEscape(deviceName) + "\",";
  payload += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  payload += "\"ip\":\"" + localIpString() + "\",";
  payload += "\"port\":" + String(HTTP_PORT) + ",";
  payload += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\"}";
  return payload;
}

static void sendLegacyDiscoveryReply() {
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

void serviceAuthenticatedDiscovery() {
  if (!discoveryActive) return;
  int packetSize = discoveryUdp.parsePacket();
  if (packetSize <= 0) return;

  char buffer[128];
  int len = discoveryUdp.read(buffer, sizeof(buffer) - 1);
  if (len <= 0) return;
  buffer[len] = '\0';
  String request(buffer);
  request.trim();

  if (request == "BATMON_DISCOVER_V1") {
    sendLegacyDiscoveryReply();
    return;
  }

  const String prefix = "BATMON_DISCOVER_V2 ";
  if (!request.startsWith(prefix)) return;
  String nonce = request.substring(prefix.length());
  nonce.toLowerCase();
  if (!validMonitorNonce(nonce)) return;
  if (!monitoringIdentityReady && !loadOrCreateMonitoringIdentity()) return;

  String payload = authenticatedDiscoveryPayload();
  uint8_t mac[32];
  if (!monitoringHmac("BATMON-DISCOVERY-V2", nonce, payload, mac)) return;
  String encoded = monitorBase64Encode((const uint8_t*)payload.c_str(), payload.length());
  String reply = String("{\"protocol\":\"BATMON_DISCOVERY_V2\",\"nonce\":\"") + nonce +
                 "\",\"payload\":\"" + encoded +
                 "\",\"hmac\":\"" + bytesToLowerHex(mac, sizeof(mac)) + "\"}";

  discoveryUdp.beginPacket(discoveryUdp.remoteIP(), discoveryUdp.remotePort());
  discoveryUdp.write((const uint8_t*)reply.c_str(), reply.length());
  discoveryUdp.endPacket();
}
