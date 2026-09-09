// Native ESP-IDF HTTP transport for Battery Monitor.
//
// This replaces Arduino WebServer as the production HTTP parser/socket owner.
// Security state, cryptographic primitives, signed OTA core, configuration, and
// measurement ownership remain unchanged. esp_http_server owns one dedicated
// server task and multiplexes up to ten client sessions; handlers must remain
// short and bounded.

#include <esp_http_server.h>
#include <lwip/sockets.h>
#include <mbedtls/base64.h>

static const uint16_t BATMON_NATIVE_HTTP_MAX_CLIENTS = 10;
static const size_t BATMON_NATIVE_HTTP_MAX_BODY = 12288;
static httpd_handle_t nativeHttpServer = nullptr;
static unsigned long nativeProvisioningStartAtMs = 0;
static bool nativeFirmwareRebootPending = false;
static unsigned long nativeFirmwareRebootAtMs = 0;
static uint32_t nativeHttpRequests = 0;
static uint32_t nativeHttpMaxHandlerUs = 0;

struct NativeHttpRequestScope {
  uint32_t startedUs;
  NativeHttpRequestScope() : startedUs(micros()) { nativeHttpRequests++; }
  ~NativeHttpRequestScope() {
    uint32_t elapsed = (uint32_t)(micros() - startedUs);
    if (elapsed > nativeHttpMaxHandlerUs) nativeHttpMaxHandlerUs = elapsed;
  }
};

static const char* nativeHttpStatusText(int status) {
  switch (status) {
    case 200: return "200 OK";
    case 202: return "202 Accepted";
    case 400: return "400 Bad Request";
    case 401: return "401 Unauthorized";
    case 403: return "403 Forbidden";
    case 404: return "404 Not Found";
    case 409: return "409 Conflict";
    case 410: return "410 Gone";
    case 413: return "413 Payload Too Large";
    case 429: return "429 Too Many Requests";
    case 500: return "500 Internal Server Error";
    case 503: return "503 Service Unavailable";
    default: return "500 Internal Server Error";
  }
}

static esp_err_t nativeSend(httpd_req_t* req, int status, const char* type, const String& body) {
  httpd_resp_set_status(req, nativeHttpStatusText(status));
  httpd_resp_set_type(req, type);
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  return httpd_resp_send(req, body.c_str(), body.length());
}

static esp_err_t nativeSendJson(httpd_req_t* req, int status, const String& body) {
  return nativeSend(req, status, "application/json", body);
}

static String nativeHeader(httpd_req_t* req, const char* name) {
  size_t len = httpd_req_get_hdr_value_len(req, name);
  if (len == 0 || len > 1024) return "";
  char* buffer = (char*)malloc(len + 1);
  if (!buffer) return "";
  String result;
  if (httpd_req_get_hdr_value_str(req, name, buffer, len + 1) == ESP_OK) result = buffer;
  free(buffer);
  return result;
}

static IPAddress nativeRemoteIp(httpd_req_t* req) {
  int fd = httpd_req_to_sockfd(req);
  struct sockaddr_storage address = {};
  socklen_t addressLen = sizeof(address);
  if (fd < 0 || getpeername(fd, (struct sockaddr*)&address, &addressLen) != 0) return IPAddress(0, 0, 0, 0);
  if (address.ss_family == AF_INET) {
    const struct sockaddr_in* ipv4 = (const struct sockaddr_in*)&address;
    uint32_t host = ntohl(ipv4->sin_addr.s_addr);
    return IPAddress((host >> 24) & 0xFF, (host >> 16) & 0xFF, (host >> 8) & 0xFF, host & 0xFF);
  }
  return IPAddress(0, 0, 0, 0);
}

static int nativeHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static String nativeUrlDecode(const String& input) {
  String out;
  out.reserve(input.length());
  for (size_t i = 0; i < input.length(); ++i) {
    char c = input[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < input.length()) {
      int hi = nativeHexNibble(input[i + 1]);
      int lo = nativeHexNibble(input[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out += (char)((hi << 4) | lo);
        i += 2;
      } else {
        out += c;
      }
    } else {
      out += c;
    }
  }
  return out;
}

static bool nativeReadBody(httpd_req_t* req, String& body, size_t maxLen = BATMON_NATIVE_HTTP_MAX_BODY) {
  if (req->content_len > maxLen) return false;
  body = "";
  body.reserve(req->content_len + 1);
  size_t remaining = req->content_len;
  char buffer[768];
  while (remaining > 0) {
    size_t wanted = remaining < sizeof(buffer) ? remaining : sizeof(buffer);
    int received = httpd_req_recv(req, buffer, wanted);
    if (received <= 0) return false;
    body.concat(buffer, (unsigned int)received);
    remaining -= (size_t)received;
  }
  return true;
}

static bool nativeFormValue(const String& body, const char* key, String& valueOut) {
  int start = 0;
  while (start <= (int)body.length()) {
    int end = body.indexOf('&', start);
    if (end < 0) end = body.length();
    int equals = body.indexOf('=', start);
    if (equals >= start && equals < end) {
      String encodedKey = body.substring(start, equals);
      if (nativeUrlDecode(encodedKey) == key) {
        valueOut = nativeUrlDecode(body.substring(equals + 1, end));
        return true;
      }
    }
    if (end >= (int)body.length()) break;
    start = end + 1;
  }
  return false;
}

static bool nativeQueryValue(httpd_req_t* req, const char* key, String& valueOut) {
  size_t len = httpd_req_get_url_query_len(req);
  if (len == 0 || len > 2048) return false;
  char* query = (char*)malloc(len + 1);
  if (!query) return false;
  bool found = false;
  if (httpd_req_get_url_query_str(req, query, len + 1) == ESP_OK) {
    String body(query);
    found = nativeFormValue(body, key, valueOut);
  }
  free(query);
  return found;
}

static String nativeCookieToken(httpd_req_t* req) {
  String cookie = nativeHeader(req, "Cookie");
  int start = cookie.indexOf("BATMON_SESSION=");
  if (start < 0) return "";
  start += 15;
  int end = cookie.indexOf(';', start);
  if (end < 0) end = cookie.length();
  String token = cookie.substring(start, end);
  token.trim();
  return token;
}

static MgmtSession* nativeFindManagementSession(httpd_req_t* req) {
  expireManagementState();
  String token = nativeHeader(req, "X-Batmon-Session");
  if (token.length() == 0) token = nativeCookieToken(req);
  if (token.length() == 0) return nullptr;
  IPAddress remote = nativeRemoteIp(req);
  for (auto& session : mgmtSessions) {
    if (session.active && session.token == token && session.remoteIp == remote && !managementExpired(session.expiresAt))
      return &session;
  }
  return nullptr;
}

static MgmtSession* nativeRequireManagementWriteAuth(httpd_req_t* req) {
  MgmtSession* session = nativeFindManagementSession(req);
  if (!session) {
    nativeSendJson(req, 401, "{\"error\":\"authentication required\"}");
    return nullptr;
  }
  String csrf = nativeHeader(req, "X-Batmon-CSRF");
  if (csrf.length() == 0 || csrf != session->csrf) {
    nativeSendJson(req, 403, "{\"error\":\"csrf token required\"}");
    return nullptr;
  }
  session->expiresAt = millis() + MGMT_SESSION_TTL_MS;
  return session;
}

static esp_err_t nativeRootHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  String page = buildIndexPage();
  page.replace(
    "loadConfig().then(refresh);setInterval(refresh,refreshMs);",
    "async function refreshLoop(){await refresh();setTimeout(refreshLoop,refreshMs)}loadConfig().then(refreshLoop);"
  );
  return nativeSend(req, 200, "text/html; charset=utf-8", page);
}

static esp_err_t nativeStatusHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  return nativeSendJson(req, 200, batterySnapshotStatusJson());
}

static esp_err_t nativeConfigGetHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  return nativeSendJson(req, 200, configJson());
}

static esp_err_t nativeConfigPostHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  String body;
  if (!nativeReadBody(req, body, 4096)) return nativeSendJson(req, 413, "{\"error\":\"configuration body too large\"}");

  String proposedName = deviceName;
  String proposedType = batteryType;
  float proposedLow = lowVoltage;
  float proposedCritical = criticalVoltage;
  float proposedFactor = calibrationFactor;
  float proposedOffset = calibrationOffset;
  uint32_t proposedSample = sampleIntervalSec;
  bool valid = true;
  String value;

  if (nativeFormValue(body, "name", value)) {
    value.trim();
    if (value.length() >= 1 && value.length() <= 48) proposedName = value; else valid = false;
  }
  if (nativeFormValue(body, "batteryType", value)) {
    value.trim();
    if (isValidBatteryProfileId(value)) proposedType = value; else valid = false;
  }
  if (nativeFormValue(body, "lowVoltage", value)) proposedLow = value.toFloat();
  if (nativeFormValue(body, "criticalVoltage", value)) proposedCritical = value.toFloat();
  if (nativeFormValue(body, "sampleIntervalSec", value)) proposedSample = (uint32_t)value.toInt();
  if (nativeFormValue(body, "calibrationFactor", value)) proposedFactor = value.toFloat();
  if (nativeFormValue(body, "calibrationOffset", value)) proposedOffset = value.toFloat();

  if (proposedSample < 1) proposedSample = 1;
  if (proposedSample > 3600) proposedSample = 3600;
  if (!valid || proposedCritical < 6.0f || proposedCritical > 20.0f ||
      proposedLow <= proposedCritical || proposedLow > 20.0f ||
      proposedFactor < 0.5f || proposedFactor > 1.5f ||
      proposedOffset < -5.0f || proposedOffset > 5.0f) {
    return nativeSendJson(req, 400, "{\"error\":\"invalid configuration\"}");
  }

  // The HTTP task is the only HTTP writer. Publish the new configuration, then
  // refresh the cached snapshot classification/calibration without an ADC read.
  deviceName = proposedName;
  batteryType = proposedType;
  lowVoltage = proposedLow;
  criticalVoltage = proposedCritical;
  calibrationFactor = proposedFactor;
  calibrationOffset = proposedOffset;
  sampleIntervalSec = proposedSample;
  saveDeviceSettings();
  refreshBatterySnapshotConfiguration();
  return nativeSendJson(req, 200, configJson());
}

static esp_err_t nativeWifiScanHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  int result = WiFi.scanComplete();
  if (result == WIFI_SCAN_RUNNING) return nativeSendJson(req, 202, "{\"scanning\":true}");
  if (result == WIFI_SCAN_FAILED) {
    WiFi.scanDelete();
    WiFi.scanNetworks(true, true);
    return nativeSendJson(req, 202, "{\"scanning\":true}");
  }

  String json = "{\"networks\":[";
  bool first = true;
  for (int i = 0; i < result; ++i) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    if (!first) json += ',';
    first = false;
    json += "{\"ssid\":\"" + jsonEscape(ssid) + "\",\"rssi\":" + String(WiFi.RSSI(i)) +
            ",\"secure\":" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true") + "}";
  }
  json += "]}";
  WiFi.scanDelete();
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeAuthChallengeHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  unsigned long cooldown = managementAuthCooldownRemainingMs();
  if (cooldown > 0) {
    return nativeSendJson(req, 429, String("{\"error\":\"authentication temporarily rate limited\",\"retryAfterSec\":") +
                          String((cooldown + 999UL) / 1000UL) + "}");
  }
  if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity())
    return nativeSendJson(req, 503, "{\"error\":\"device password not initialized\"}");

  MgmtChallenge* challenge = allocateManagementChallenge();
  challenge->active = true;
  challenge->id = randomHex(8);
  esp_fill_random(challenge->nonce, sizeof(challenge->nonce));
  challenge->remoteIp = nativeRemoteIp(req);
  challenge->expiresAt = millis() + MGMT_CHALLENGE_TTL_MS;

  String json = "{";
  json += "\"version\":1,";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"challengeId\":\"" + challenge->id + "\",";
  json += "\"nonce\":\"" + bytesToLowerHex(challenge->nonce, sizeof(challenge->nonce)) + "\",";
  json += "\"kdf\":\"BATMON-LAN-MGMT-V1\",";
  json += "\"proof\":\"HMAC-SHA-256\",";
  json += "\"expiresInSec\":60}";
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeAuthSessionHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  unsigned long cooldown = managementAuthCooldownRemainingMs();
  if (cooldown > 0) {
    return nativeSendJson(req, 429, String("{\"error\":\"authentication temporarily rate limited\",\"retryAfterSec\":") +
                          String((cooldown + 999UL) / 1000UL) + "}");
  }
  String body;
  if (!nativeReadBody(req, body, 4096)) return nativeSendJson(req, 413, "{\"error\":\"authentication body too large\"}");
  String challengeId, proofHex;
  if (!nativeFormValue(body, "challengeId", challengeId) || !nativeFormValue(body, "proof", proofHex))
    return nativeSendJson(req, 400, "{\"error\":\"challengeId and proof required\"}");

  IPAddress remote = nativeRemoteIp(req);
  MgmtChallenge* selected = nullptr;
  expireManagementState();
  for (auto& challenge : mgmtChallenges) {
    if (challenge.active && challenge.id == challengeId && challenge.remoteIp == remote && !managementExpired(challenge.expiresAt)) {
      selected = &challenge;
      break;
    }
  }
  if (!selected) {
    recordManagementAuthFailure();
    return nativeSendJson(req, 401, "{\"error\":\"invalid or expired challenge\"}");
  }

  selected->active = false;
  uint8_t supplied[32] = {};
  uint8_t expected[32] = {};
  uint8_t managementKey[32] = {};
  String nonceHex = bytesToLowerHex(selected->nonce, sizeof(selected->nonce));
  String message = String("BATMON-AUTH-V1|") + deviceId + "|" + challengeId + "|" + nonceHex;
  bool ok = parseManagementHex(proofHex, supplied, sizeof(supplied)) &&
            getManagementKey(managementKey) &&
            managementHmac(managementKey, message, expected) &&
            constantTimeEquals(supplied, expected, sizeof(expected));
  memset(managementKey, 0, sizeof(managementKey));
  memset(expected, 0, sizeof(expected));
  if (!ok) {
    recordManagementAuthFailure();
    return nativeSendJson(req, 401, "{\"error\":\"invalid device password proof\"}");
  }

  clearManagementAuthFailures();
  MgmtSession* session = allocateManagementSession();
  session->active = true;
  session->token = randomHex(24);
  session->csrf = randomHex(16);
  session->remoteIp = remote;
  session->expiresAt = millis() + MGMT_SESSION_TTL_MS;
  String cookie = String("BATMON_SESSION=") + session->token + "; Path=/; HttpOnly; SameSite=Strict";
  httpd_resp_set_hdr(req, "Set-Cookie", cookie.c_str());
  String json = String("{\"ok\":true,\"session\":\"") + session->token +
                "\",\"csrf\":\"" + session->csrf + "\",\"expiresInSec\":900}";
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeAuthLogoutHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  MgmtSession* session = nativeRequireManagementWriteAuth(req);
  if (!session) return ESP_OK;
  session->active = false;
  httpd_resp_set_hdr(req, "Set-Cookie", "BATMON_SESSION=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
  return nativeSendJson(req, 200, "{\"ok\":true}");
}

static esp_err_t nativePasswordHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  MgmtSession* session = nativeRequireManagementWriteAuth(req);
  if (!session) return ESP_OK;
  String body;
  if (!nativeReadBody(req, body, 4096)) return nativeSendJson(req, 413, "{\"error\":\"password body too large\"}");
  String ivHex, cipherHex, tagHex;
  if (!nativeFormValue(body, "iv", ivHex) || !nativeFormValue(body, "ciphertext", cipherHex) || !nativeFormValue(body, "tag", tagHex))
    return nativeSendJson(req, 400, "{\"error\":\"encrypted password envelope required\"}");
  if (cipherHex.length() < 2 || cipherHex.length() > DEVICE_PASSWORD_MAX_BYTES * 2 || (cipherHex.length() & 1))
    return nativeSendJson(req, 400, "{\"error\":\"invalid encrypted password length\"}");

  size_t cipherLen = cipherHex.length() / 2;
  uint8_t iv[12] = {};
  uint8_t tag[16] = {};
  uint8_t* cipher = (uint8_t*)malloc(cipherLen);
  uint8_t* plain = (uint8_t*)malloc(cipherLen + 1);
  if (!cipher || !plain || !parseManagementHex(ivHex, iv, sizeof(iv)) ||
      !parseManagementHex(tagHex, tag, sizeof(tag)) || !parseManagementHex(cipherHex, cipher, cipherLen)) {
    if (cipher) free(cipher);
    if (plain) free(plain);
    return nativeSendJson(req, 400, "{\"error\":\"invalid encrypted password envelope\"}");
  }

  uint8_t wrapKey[32] = {};
  if (!derivePasswordWrapKey(session, wrapKey)) {
    free(cipher); free(plain);
    return nativeSendJson(req, 500, "{\"error\":\"password wrapping key unavailable\"}");
  }
  String aad = String("BATMON-PASSWORD-ROTATE-V1|") + deviceId + "|" + session->token;
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int rc = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, wrapKey, 256);
  if (rc == 0) {
    rc = mbedtls_gcm_auth_decrypt(&gcm, cipherLen, iv, sizeof(iv),
                                  (const unsigned char*)aad.c_str(), aad.length(),
                                  tag, sizeof(tag), cipher, plain);
  }
  mbedtls_gcm_free(&gcm);
  memset(wrapKey, 0, sizeof(wrapKey));
  free(cipher);
  if (rc != 0) {
    memset(plain, 0, cipherLen + 1); free(plain);
    return nativeSendJson(req, 400, "{\"error\":\"password envelope authentication failed\"}");
  }
  plain[cipherLen] = 0;
  String newPassword((const char*)plain);
  memset(plain, 0, cipherLen + 1);
  free(plain);
  String validationError;
  if (!validateDevicePasswordBytes(newPassword, &validationError))
    return nativeSendJson(req, 400, String("{\"error\":\"") + validationError + "\"}");

  String error;
  String username = provisioningUsername.length() > 0 ? provisioningUsername : "batmon";
  if (!setDevicePasswordFlexible(username, newPassword, error))
    return nativeSendJson(req, 500, String("{\"error\":\"") + jsonEscape(error) + "\"}");
  newPassword = "";
  invalidateManagementSessions();
  clearManagementAuthFailures();
  httpd_resp_set_hdr(req, "Set-Cookie", "BATMON_SESSION=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
  return nativeSendJson(req, 200, "{\"ok\":true,\"message\":\"device password changed; re-authentication required\"}");
}

static esp_err_t nativeProvisioningHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity())
    return nativeSendJson(req, 503, "{\"error\":\"device password not initialized\"}");
  nativeProvisioningStartAtMs = millis() + 350UL;
  return nativeSendJson(req, 200, String("{\"ok\":true,\"setupSsid\":\"") + jsonEscape(apSsid) + "\"}");
}

static esp_err_t nativeRemovedWifiHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  return nativeSendJson(req, 410, "{\"error\":\"plaintext LAN Wi-Fi changes were removed; use /api/wifi/provisioning after authentication\"}");
}

static esp_err_t nativePingHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  return nativeSendJson(req, 200, "{\"ok\":true}");
}

static esp_err_t nativeAuthenticatedStatusHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  String nonce;
  if (!nativeQueryValue(req, "nonce", nonce)) return nativeSendJson(req, 400, "{\"error\":\"nonce required\"}");
  nonce.toLowerCase();
  if (!validMonitorNonce(nonce)) return nativeSendJson(req, 400, "{\"error\":\"invalid nonce\"}");
  if (!monitoringIdentityReady && !loadOrCreateMonitoringIdentity())
    return nativeSendJson(req, 500, "{\"error\":\"monitoring identity unavailable\"}");

  String payload = batterySnapshotStatusJson();
  uint8_t mac[32] = {};
  if (!monitoringHmac("BATMON-STATUS-V1", nonce, payload, mac))
    return nativeSendJson(req, 500, "{\"error\":\"status authentication failed\"}");
  String encoded = monitorBase64Encode((const uint8_t*)payload.c_str(), payload.length());
  String json = String("{\"protocol\":\"BATMON_STATUS_V1\",\"nonce\":\"") + nonce +
                "\",\"payload\":\"" + encoded +
                "\",\"hmac\":\"" + bytesToLowerHex(mac, sizeof(mac)) + "\"}";
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeMonitorKeyHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  MgmtSession* session = nativeRequireManagementWriteAuth(req);
  if (!session) return ESP_OK;
  if (!monitoringIdentityReady && !loadOrCreateMonitoringIdentity())
    return nativeSendJson(req, 500, "{\"error\":\"monitoring identity unavailable\"}");

  uint8_t managementKey[32] = {};
  uint8_t wrapKey[32] = {};
  if (!getManagementKey(managementKey)) return nativeSendJson(req, 500, "{\"error\":\"management key unavailable\"}");
  String wrapMessage = String("BATMON-MONITOR-KEY-WRAP-V1|") + session->token + "|" + session->csrf;
  bool wrapReady = managementHmac(managementKey, wrapMessage, wrapKey);
  memset(managementKey, 0, sizeof(managementKey));
  if (!wrapReady) {
    memset(wrapKey, 0, sizeof(wrapKey));
    return nativeSendJson(req, 500, "{\"error\":\"monitoring key wrap unavailable\"}");
  }

  uint8_t iv[12] = {};
  uint8_t ciphertext[MONITOR_ID_KEY_BYTES] = {};
  uint8_t tag[16] = {};
  esp_fill_random(iv, sizeof(iv));
  String aad = String("BATMON-MONITOR-KEY-AAD-V1|") + deviceId + "|" + session->token;
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int rc = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, wrapKey, 256);
  if (rc == 0) {
    rc = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT,
                                   sizeof(monitoringIdentityKey), iv, sizeof(iv),
                                   (const unsigned char*)aad.c_str(), aad.length(),
                                   monitoringIdentityKey, ciphertext, sizeof(tag), tag);
  }
  mbedtls_gcm_free(&gcm);
  memset(wrapKey, 0, sizeof(wrapKey));
  if (rc != 0) {
    memset(ciphertext, 0, sizeof(ciphertext));
    return nativeSendJson(req, 500, "{\"error\":\"monitoring key encryption failed\"}");
  }

  String json = String("{\"ok\":true,\"version\":1,\"deviceId\":\"") + jsonEscape(deviceId) +
                "\",\"iv\":\"" + bytesToLowerHex(iv, sizeof(iv)) +
                "\",\"ciphertext\":\"" + bytesToLowerHex(ciphertext, sizeof(ciphertext)) +
                "\",\"tag\":\"" + bytesToLowerHex(tag, sizeof(tag)) + "\"}";
  memset(ciphertext, 0, sizeof(ciphertext));
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeFirmwareCapsHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  String json = String("{\"protocol\":\"SIGNED_LAN_OTA_V1\",\"maxChunk\":") +
                String((unsigned long)firmwareUpdateLanMaxChunk()) +
                ",\"signatureAlgorithm\":\"RSA-3072-PSS-SHA256\",\"firmwareVersion\":\"" +
                jsonEscape(String(FW_VERSION)) + "\"}";
  return nativeSendJson(req, 200, json);
}

static esp_err_t nativeFirmwareBeginHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  String body;
  if (!nativeReadBody(req, body)) return nativeSendJson(req, 413, "{\"error\":\"FW_METADATA_TOO_LARGE\"}");
  String sizeValue, shaValue, sigValue;
  if (!nativeFormValue(body, "size", sizeValue) || !nativeFormValue(body, "sha256", shaValue) || !nativeFormValue(body, "signature", sigValue))
    return nativeSendJson(req, 400, "{\"ok\":false,\"error\":\"FW_METADATA_REQUIRED\"}");
  String error;
  if (!beginSignedFirmwareUpdateLan(sizeValue, shaValue, sigValue, error))
    return nativeSendJson(req, error == "FW_UPDATE_ALREADY_ACTIVE" ? 409 : 400,
                          String("{\"ok\":false,\"error\":\"") + jsonEscape(error) + "\"}");
  return nativeSendJson(req, 200, String("{\"ok\":true,\"protocol\":\"SIGNED_LAN_OTA_V1\",\"maxChunk\":") +
                        String((unsigned long)firmwareUpdateLanMaxChunk()) + "}");
}

static esp_err_t nativeFirmwareChunkHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  if (!firmwareUpdateIsLanTransport()) {
    String error = firmwareUpdateInProgress() ? "FW_TRANSPORT_MISMATCH" : "FW_NO_ACTIVE_UPDATE";
    return nativeSendJson(req, 409, String("{\"ok\":false,\"error\":\"") + error + "\"}");
  }
  String body;
  if (!nativeReadBody(req, body)) return nativeSendJson(req, 413, "{\"ok\":false,\"error\":\"FW_CHUNK_TOO_LARGE\"}");
  String offsetValue, encoded;
  if (!nativeFormValue(body, "offset", offsetValue) || !nativeFormValue(body, "data", encoded))
    return nativeSendJson(req, 400, "{\"ok\":false,\"error\":\"FW_CHUNK_FIELDS_REQUIRED\"}");

  char* end = nullptr;
  unsigned long offset = strtoul(offsetValue.c_str(), &end, 10);
  if (!end || *end != '\0') return nativeSendJson(req, 400, "{\"ok\":false,\"error\":\"FW_INVALID_OFFSET\"}");
  size_t maxChunk = firmwareUpdateLanMaxChunk();
  if (encoded.length() < 4 || encoded.length() > ((maxChunk + 2) / 3) * 4 + 4)
    return nativeSendJson(req, 400, "{\"ok\":false,\"error\":\"FW_INVALID_CHUNK_ENCODING\"}");

  uint8_t* decoded = (uint8_t*)malloc(maxChunk);
  if (!decoded) return nativeSendJson(req, 500, "{\"ok\":false,\"error\":\"FW_CHUNK_ALLOC_FAILED\"}");
  size_t decodedLen = 0;
  int rc = mbedtls_base64_decode(decoded, maxChunk, &decodedLen,
                                 (const unsigned char*)encoded.c_str(), encoded.length());
  if (rc != 0 || decodedLen < 1 || decodedLen > maxChunk) {
    memset(decoded, 0, maxChunk); free(decoded);
    return nativeSendJson(req, 400, "{\"ok\":false,\"error\":\"FW_INVALID_CHUNK_ENCODING\"}");
  }

  size_t totalWritten = 0;
  String error;
  bool ok = writeSignedFirmwareLanChunk(decoded, decodedLen, (size_t)offset, totalWritten, error);
  memset(decoded, 0, maxChunk);
  free(decoded);
  if (!ok) return nativeSendJson(req, error.startsWith("FW_OFFSET_MISMATCH_") ? 409 : 400,
                                 String("{\"ok\":false,\"error\":\"") + jsonEscape(error) + "\"}");
  return nativeSendJson(req, 200, String("{\"ok\":true,\"written\":") + String((unsigned long)totalWritten) + "}");
}

static esp_err_t nativeFirmwareEndHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  if (!firmwareUpdateIsLanTransport()) {
    String error = firmwareUpdateInProgress() ? "FW_TRANSPORT_MISMATCH" : "FW_NO_ACTIVE_UPDATE";
    return nativeSendJson(req, 409, String("{\"ok\":false,\"error\":\"") + error + "\"}");
  }
  String version, error;
  if (!finishSignedFirmwareUpdateLan(version, error))
    return nativeSendJson(req, 400, String("{\"ok\":false,\"error\":\"") + jsonEscape(error) + "\"}");
  nativeFirmwareRebootPending = true;
  nativeFirmwareRebootAtMs = millis() + 750UL;
  return nativeSendJson(req, 200, String("{\"ok\":true,\"verified\":true,\"version\":\"") +
                        jsonEscape(version) + "\",\"rebooting\":true}");
}

static esp_err_t nativeFirmwareAbortHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  String result;
  if (!abortSignedFirmwareUpdateLan(result))
    return nativeSendJson(req, 409, String("{\"ok\":false,\"error\":\"FW_") + jsonEscape(result) + "\"}");
  return nativeSendJson(req, 200, "{\"ok\":true,\"aborted\":true}");
}

static esp_err_t nativeRuntimeHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  String json = "{";
  json += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\",";
  json += "\"httpServer\":\"esp_http_server\",";
  json += "\"maxHttpClients\":" + String(BATMON_NATIVE_HTTP_MAX_CLIENTS) + ",";
  json += "\"cpuMHz\":" + String(ESP.getCpuFreqMHz()) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"minFreeHeap\":" + String(ESP.getMinFreeHeap()) + ",";
  json += "\"wifiRssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
  json += "\"requestCount\":" + String(nativeHttpRequests) + ",";
  json += "\"maxHandlerUs\":" + String(nativeHttpMaxHandlerUs);
  json += "}";
  return nativeSendJson(req, 200, json);
}

static bool registerNativeUri(const char* uri, httpd_method_t method, esp_err_t (*handler)(httpd_req_t*)) {
  httpd_uri_t definition = {};
  definition.uri = uri;
  definition.method = method;
  definition.handler = handler;
  definition.user_ctx = nullptr;
  return httpd_register_uri_handler(nativeHttpServer, &definition) == ESP_OK;
}

bool startNativeHttpServer() {
  if (nativeHttpServer != nullptr) {
    httpServerActive = true;
    return true;
  }

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = HTTP_PORT;
  config.task_priority = tskIDLE_PRIORITY + 5;
  config.stack_size = 8192;
  config.core_id = 0;
  config.max_open_sockets = BATMON_NATIVE_HTTP_MAX_CLIENTS;
  config.max_uri_handlers = 24;
  config.max_resp_headers = 12;
  config.backlog_conn = 10;
  config.lru_purge_enable = true;
  config.recv_wait_timeout = 3;
  config.send_wait_timeout = 3;
  config.keep_alive_enable = true;
  config.keep_alive_idle = 5;
  config.keep_alive_interval = 2;
  config.keep_alive_count = 3;

  esp_err_t err = httpd_start(&nativeHttpServer, &config);
  if (err != ESP_OK) {
    nativeHttpServer = nullptr;
    httpServerActive = false;
    Serial.printf("ERROR: Native ESP-IDF HTTP server start failed: %s\n", esp_err_to_name(err));
    return false;
  }

  bool routesOk =
    registerNativeUri("/", HTTP_GET, nativeRootHandler) &&
    registerNativeUri("/api/status", HTTP_GET, nativeStatusHandler) &&
    registerNativeUri("/api/status-auth", HTTP_GET, nativeAuthenticatedStatusHandler) &&
    registerNativeUri("/api/config", HTTP_GET, nativeConfigGetHandler) &&
    registerNativeUri("/api/config", HTTP_POST, nativeConfigPostHandler) &&
    registerNativeUri("/api/wifi/scan", HTTP_GET, nativeWifiScanHandler) &&
    registerNativeUri("/api/auth/challenge", HTTP_GET, nativeAuthChallengeHandler) &&
    registerNativeUri("/api/auth/session", HTTP_POST, nativeAuthSessionHandler) &&
    registerNativeUri("/api/auth/logout", HTTP_POST, nativeAuthLogoutHandler) &&
    registerNativeUri("/api/password", HTTP_POST, nativePasswordHandler) &&
    registerNativeUri("/api/wifi/provisioning", HTTP_POST, nativeProvisioningHandler) &&
    registerNativeUri("/api/reset-wifi", HTTP_POST, nativeProvisioningHandler) &&
    registerNativeUri("/api/wifi", HTTP_POST, nativeRemovedWifiHandler) &&
    registerNativeUri("/api/monitor-key", HTTP_POST, nativeMonitorKeyHandler) &&
    registerNativeUri("/api/firmware/caps", HTTP_GET, nativeFirmwareCapsHandler) &&
    registerNativeUri("/api/firmware/begin", HTTP_POST, nativeFirmwareBeginHandler) &&
    registerNativeUri("/api/firmware/chunk", HTTP_POST, nativeFirmwareChunkHandler) &&
    registerNativeUri("/api/firmware/end", HTTP_POST, nativeFirmwareEndHandler) &&
    registerNativeUri("/api/firmware/abort", HTTP_POST, nativeFirmwareAbortHandler) &&
    registerNativeUri("/api/runtime", HTTP_GET, nativeRuntimeHandler) &&
    registerNativeUri("/api/ping", HTTP_GET, nativePingHandler);

  if (!routesOk) {
    Serial.println("ERROR: Native HTTP route registration failed; stopping server.");
    httpd_stop(nativeHttpServer);
    nativeHttpServer = nullptr;
    httpServerActive = false;
    return false;
  }

  httpServerActive = true;
  Serial.printf("Native ESP-IDF HTTP server active: %u client sessions, LRU purge enabled.\n",
                (unsigned)BATMON_NATIVE_HTTP_MAX_CLIENTS);
  return true;
}

void stopNativeHttpServer() {
  if (nativeHttpServer == nullptr) {
    httpServerActive = false;
    return;
  }
  httpd_handle_t serverToStop = nativeHttpServer;
  nativeHttpServer = nullptr;
  httpServerActive = false;
  esp_err_t err = httpd_stop(serverToStop);
  if (err != ESP_OK) Serial.printf("WARNING: Native HTTP server stop failed: %s\n", esp_err_to_name(err));
}

void serviceNativeHttpControl() {
  expireManagementState();

  if (nativeProvisioningStartAtMs != 0 && (long)(millis() - nativeProvisioningStartAtMs) >= 0) {
    nativeProvisioningStartAtMs = 0;
    if (!fallbackApActive) {
      stopNativeHttpServer();
      stopMdns();
      stopDiscovery();
      startFallbackAp();
    }
  }

  if (nativeFirmwareRebootPending && (int32_t)(millis() - nativeFirmwareRebootAtMs) >= 0) {
    nativeFirmwareRebootPending = false;
    Serial.println("Signed native LAN OTA verified; rebooting into candidate partition.");
    Serial.flush();
    delay(25);
    ESP.restart();
  }
}
