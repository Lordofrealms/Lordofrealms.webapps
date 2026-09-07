// Battery Monitor P0-2 authenticated LAN management.
//
// The normal Device Password is never sent as an ordinary LAN HTTP parameter.
// Clients derive a domain-separated management key locally, prove possession
// with HMAC-SHA-256 over a one-time challenge, then receive a 15-minute session.
// Every state-changing endpoint requires both the session and its CSRF token.
//
// Password rotation uses AES-256-GCM under a session-specific wrapping key.
// The credential set is stored as one versioned NVS blob so SRP verifier, AP
// key and verification material change as one committed unit.

#include <mbedtls/md.h>
#include <mbedtls/gcm.h>
#include <esp_system.h>
#include <esp_srp.h>

static const char* DEVICE_CRED_BLOB_KEY = "credv2";
static const uint8_t DEVICE_CRED_BLOB_VERSION = 1;
static const size_t DEVICE_PASSWORD_MAX_BYTES = 128;
static const unsigned long MGMT_CHALLENGE_TTL_MS = 60UL * 1000UL;
static const unsigned long MGMT_SESSION_TTL_MS = 15UL * 60UL * 1000UL;
static const size_t MGMT_MAX_CHALLENGES = 4;
static const size_t MGMT_MAX_SESSIONS = 4;

struct MgmtChallenge {
  bool active;
  String id;
  uint8_t nonce[16];
  IPAddress remoteIp;
  unsigned long expiresAt;
};

struct MgmtSession {
  bool active;
  String token;
  String csrf;
  IPAddress remoteIp;
  unsigned long expiresAt;
};

static MgmtChallenge mgmtChallenges[MGMT_MAX_CHALLENGES] = {};
static MgmtSession mgmtSessions[MGMT_MAX_SESSIONS] = {};
static unsigned long deferredProvisioningStartAtMs = 0;
static uint8_t mgmtAuthFailures = 0;
static unsigned long mgmtAuthBlockedUntilMs = 0;

static String bytesToLowerHex(const uint8_t* data, size_t len) {
  static const char DIGITS[] = "0123456789abcdef";
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out += DIGITS[(data[i] >> 4) & 0x0F];
    out += DIGITS[data[i] & 0x0F];
  }
  return out;
}

static int managementHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool parseManagementHex(const String& input, uint8_t* out, size_t outLen) {
  if (input.length() != outLen * 2) return false;
  for (size_t i = 0; i < outLen; ++i) {
    int hi = managementHexNibble(input[i * 2]);
    int lo = managementHexNibble(input[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
  return true;
}

static bool managementHmac(const uint8_t key[32], const String& message, uint8_t out[32]) {
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!info) return false;
  return mbedtls_md_hmac(info, key, 32,
                         (const unsigned char*)message.c_str(), message.length(), out) == 0;
}

static bool managementExpired(unsigned long expiresAt) {
  return (long)(millis() - expiresAt) >= 0;
}

static void expireManagementState() {
  for (auto& challenge : mgmtChallenges) {
    if (challenge.active && managementExpired(challenge.expiresAt)) challenge.active = false;
  }
  for (auto& session : mgmtSessions) {
    if (session.active && managementExpired(session.expiresAt)) session.active = false;
  }
  if (mgmtAuthBlockedUntilMs != 0 && managementExpired(mgmtAuthBlockedUntilMs)) mgmtAuthBlockedUntilMs = 0;
}

static unsigned long managementAuthCooldownRemainingMs() {
  expireManagementState();
  if (mgmtAuthBlockedUntilMs == 0) return 0;
  long remaining = (long)(mgmtAuthBlockedUntilMs - millis());
  return remaining > 0 ? (unsigned long)remaining : 0;
}

static void recordManagementAuthFailure() {
  if (mgmtAuthFailures < 250) mgmtAuthFailures++;
  if (mgmtAuthFailures < 5) return;
  uint8_t step = mgmtAuthFailures - 5;
  if (step > 4) step = 4;
  unsigned long cooldownSec = 30UL << step; // 30s, 60s, 120s, 240s, 480s max.
  mgmtAuthBlockedUntilMs = millis() + cooldownSec * 1000UL;
}

static void clearManagementAuthFailures() {
  mgmtAuthFailures = 0;
  mgmtAuthBlockedUntilMs = 0;
}

static String randomHex(size_t bytes) {
  uint8_t buffer[32];
  if (bytes > sizeof(buffer)) return "";
  esp_fill_random(buffer, bytes);
  return bytesToLowerHex(buffer, bytes);
}

static bool validateDevicePasswordBytes(const String& password, String* errorOut = nullptr) {
  size_t len = password.length();
  if (len < 1 || len > DEVICE_PASSWORD_MAX_BYTES) {
    if (errorOut) *errorOut = "DEVICE_PASSWORD_LENGTH";
    return false;
  }
  for (size_t i = 0; i < len; ++i) {
    uint8_t c = (uint8_t)password[i];
    if (c < 0x20 || c == 0x7F) {
      if (errorOut) *errorOut = "DEVICE_PASSWORD_CONTROL_CHARACTER";
      return false;
    }
  }
  return true;
}

static bool deriveFlexiblePasswordCheckHash(const String& password, uint8_t out[32]) {
  if (!validateDevicePasswordBytes(password)) return false;
  return sha256String(String("BATMON-CODECHECK-V1|") + deviceId + "|" + password, out);
}

static String deriveFlexibleSoftApPassword(const String& password) {
  if (!validateDevicePasswordBytes(password)) return "";
  uint8_t digest[32];
  if (!sha256String(String("BATMON-SOFTAP-V1|") + deviceId + "|" + password, digest)) return "";
  static const char HEX_DIGITS[] = "0123456789ABCDEF";
  String result;
  result.reserve(32);
  for (size_t i = 0; i < 16; ++i) {
    result += HEX_DIGITS[(digest[i] >> 4) & 0x0F];
    result += HEX_DIGITS[digest[i] & 0x0F];
  }
  return result;
}

// Versioned single-blob credential format:
// magic[4]="BMC2", version[1], usernameLen[1], apKeyLen[1],
// saltLenLE[2], verifierLenLE[2], checkHash[32], then variable fields.
static bool loadDeviceCredentialBlob() {
  Preferences secPrefs;
  if (!secPrefs.begin(PROV_NAMESPACE, true)) return false;
  size_t blobLen = secPrefs.getBytesLength(DEVICE_CRED_BLOB_KEY);
  if (blobLen < 43 || blobLen > 2048) { secPrefs.end(); return false; }

  uint8_t* blob = (uint8_t*)malloc(blobLen);
  if (!blob) { secPrefs.end(); return false; }
  size_t read = secPrefs.getBytes(DEVICE_CRED_BLOB_KEY, blob, blobLen);
  secPrefs.end();
  if (read != blobLen) { free(blob); return false; }

  if (blob[0] != 'B' || blob[1] != 'M' || blob[2] != 'C' || blob[3] != '2' || blob[4] != DEVICE_CRED_BLOB_VERSION) {
    free(blob);
    return false;
  }

  size_t usernameLen = blob[5];
  size_t apKeyLen = blob[6];
  size_t saltLen = (size_t)blob[7] | ((size_t)blob[8] << 8);
  size_t verifierLen = (size_t)blob[9] | ((size_t)blob[10] << 8);
  size_t expected = 43 + usernameLen + apKeyLen + saltLen + verifierLen;
  if (usernameLen < 1 || usernameLen > 32 || apKeyLen < 8 || apKeyLen > 63 ||
      saltLen < 8 || saltLen > 64 || verifierLen < 64 || verifierLen > 512 || expected != blobLen) {
    free(blob);
    return false;
  }

  size_t offset = 43;
  String username;
  username.reserve(usernameLen);
  for (size_t i = 0; i < usernameLen; ++i) username += (char)blob[offset + i];
  offset += usernameLen;
  String apKey;
  apKey.reserve(apKeyLen);
  for (size_t i = 0; i < apKeyLen; ++i) apKey += (char)blob[offset + i];
  offset += apKeyLen;

  uint8_t* newSalt = (uint8_t*)malloc(saltLen);
  uint8_t* newVerifier = (uint8_t*)malloc(verifierLen);
  if (!newSalt || !newVerifier) {
    if (newSalt) free(newSalt);
    if (newVerifier) free(newVerifier);
    free(blob);
    return false;
  }
  memcpy(newSalt, blob + offset, saltLen);
  offset += saltLen;
  memcpy(newVerifier, blob + offset, verifierLen);

  freeProvisioningMaterial();
  provisioningUsername = username;
  provisioningServiceKey = apKey;
  memcpy(provisioningCodeHash, blob + 11, PROV_CODE_HASH_BYTES);
  provisioningCodeHashLoaded = true;
  provisioningSalt = newSalt;
  provisioningSaltLen = saltLen;
  provisioningVerifier = newVerifier;
  provisioningVerifierLen = verifierLen;
  provisioningSec2Params.salt = (const char*)provisioningSalt;
  provisioningSec2Params.salt_len = (uint16_t)provisioningSaltLen;
  provisioningSec2Params.verifier = (const char*)provisioningVerifier;
  provisioningSec2Params.verifier_len = (uint16_t)provisioningVerifierLen;
  free(blob);
  return true;
}

bool loadDeviceCredentialIdentity() {
  if (loadDeviceCredentialBlob()) return true;
  return loadProvisioningIdentity(); // Backward compatibility with pre-P0-2 units.
}

bool verifyDevicePasswordFlexible(const String& candidate) {
  if (!provisioningCodeHashLoaded && !loadDeviceCredentialIdentity()) return false;
  uint8_t candidateHash[32];
  if (!deriveFlexiblePasswordCheckHash(candidate, candidateHash)) return false;
  return constantTimeEquals(candidateHash, provisioningCodeHash, sizeof(candidateHash));
}

static bool writeDeviceCredentialBlob(const String& username,
                                      const String& apKey,
                                      const uint8_t checkHash[32],
                                      const uint8_t* salt,
                                      size_t saltLen,
                                      const uint8_t* verifier,
                                      size_t verifierLen,
                                      String& errorOut) {
  size_t usernameLen = username.length();
  size_t apKeyLen = apKey.length();
  size_t total = 43 + usernameLen + apKeyLen + saltLen + verifierLen;
  uint8_t* blob = (uint8_t*)malloc(total);
  if (!blob) { errorOut = "OUT_OF_MEMORY"; return false; }

  blob[0] = 'B'; blob[1] = 'M'; blob[2] = 'C'; blob[3] = '2';
  blob[4] = DEVICE_CRED_BLOB_VERSION;
  blob[5] = (uint8_t)usernameLen;
  blob[6] = (uint8_t)apKeyLen;
  blob[7] = (uint8_t)(saltLen & 0xFF); blob[8] = (uint8_t)((saltLen >> 8) & 0xFF);
  blob[9] = (uint8_t)(verifierLen & 0xFF); blob[10] = (uint8_t)((verifierLen >> 8) & 0xFF);
  memcpy(blob + 11, checkHash, 32);
  size_t offset = 43;
  memcpy(blob + offset, username.c_str(), usernameLen); offset += usernameLen;
  memcpy(blob + offset, apKey.c_str(), apKeyLen); offset += apKeyLen;
  memcpy(blob + offset, salt, saltLen); offset += saltLen;
  memcpy(blob + offset, verifier, verifierLen);

  Preferences secPrefs;
  if (!secPrefs.begin(PROV_NAMESPACE, false)) {
    free(blob);
    errorOut = "NVS_OPEN_FAILED";
    return false;
  }
  size_t written = secPrefs.putBytes(DEVICE_CRED_BLOB_KEY, blob, total);
  secPrefs.end();
  free(blob);
  if (written != total) {
    errorOut = "NVS_WRITE_FAILED";
    return false;
  }
  return true;
}

bool setDevicePasswordFlexible(const String& usernameValue, const String& password, String& errorOut) {
#if !defined(CONFIG_ESP_PROTOCOMM_SUPPORT_SECURITY_VERSION_2)
  errorOut = "SECURITY2_NOT_ENABLED";
  return false;
#else
  String username = usernameValue;
  username.trim();
  if (username.length() < 1 || username.length() > 32) {
    errorOut = "INVALID_USERNAME";
    return false;
  }
  if (!validateDevicePasswordBytes(password, &errorOut)) return false;

  String apKey = deriveFlexibleSoftApPassword(password);
  uint8_t checkHash[32];
  if (apKey.length() < 8 || !deriveFlexiblePasswordCheckHash(password, checkHash)) {
    errorOut = "CREDENTIAL_DERIVATION_FAILED";
    return false;
  }

  char* salt = nullptr;
  char* verifier = nullptr;
  int verifierLen = 0;
  esp_err_t err = esp_srp_gen_salt_verifier(
    username.c_str(), username.length(),
    password.c_str(), password.length(),
    &salt, (int)PROV_SALT_BYTES,
    &verifier, &verifierLen
  );
  if (err != ESP_OK || !salt || !verifier || verifierLen <= 0) {
    if (salt) free(salt);
    if (verifier) free(verifier);
    errorOut = String("SRP_GENERATION_FAILED_") + String((int)err);
    return false;
  }

  bool ok = writeDeviceCredentialBlob(username, apKey, checkHash,
                                      (const uint8_t*)salt, PROV_SALT_BYTES,
                                      (const uint8_t*)verifier, (size_t)verifierLen,
                                      errorOut);
  free(salt);
  free(verifier);
  if (!ok) return false;
  if (!loadDeviceCredentialBlob()) {
    errorOut = "CREDENTIAL_RELOAD_FAILED";
    return false;
  }
  errorOut = "";
  return true;
#endif
}

static bool getManagementKey(uint8_t out[32]) {
  if (!provisioningCodeHashLoaded && !loadDeviceCredentialIdentity()) return false;
  String rootHex = bytesToLowerHex(provisioningCodeHash, PROV_CODE_HASH_BYTES);
  return sha256String(String("BATMON-LAN-MGMT-V1|") + deviceId + "|" + rootHex, out);
}

static String managementCookieToken() {
  String cookie = server.header("Cookie");
  int start = cookie.indexOf("BATMON_SESSION=");
  if (start < 0) return "";
  start += 15;
  int end = cookie.indexOf(';', start);
  if (end < 0) end = cookie.length();
  String token = cookie.substring(start, end);
  token.trim();
  return token;
}

static MgmtSession* findManagementSession() {
  expireManagementState();
  String token = server.header("X-Batmon-Session");
  if (token.length() == 0) token = managementCookieToken();
  if (token.length() == 0) return nullptr;
  IPAddress remote = server.client().remoteIP();
  for (auto& session : mgmtSessions) {
    if (session.active && session.token == token && session.remoteIp == remote && !managementExpired(session.expiresAt))
      return &session;
  }
  return nullptr;
}

bool requireManagementWriteAuth() {
  MgmtSession* session = findManagementSession();
  if (!session) {
    server.send(401, "application/json", "{\"error\":\"authentication required\"}");
    return false;
  }
  String csrf = server.header("X-Batmon-CSRF");
  if (csrf.length() == 0 || csrf != session->csrf) {
    server.send(403, "application/json", "{\"error\":\"csrf token required\"}");
    return false;
  }
  session->expiresAt = millis() + MGMT_SESSION_TTL_MS;
  return true;
}

static MgmtChallenge* allocateManagementChallenge() {
  expireManagementState();
  for (auto& challenge : mgmtChallenges) if (!challenge.active) return &challenge;
  return &mgmtChallenges[0];
}

static MgmtSession* allocateManagementSession() {
  expireManagementState();
  for (auto& session : mgmtSessions) if (!session.active) return &session;
  return &mgmtSessions[0];
}

void invalidateManagementSessions() {
  for (auto& challenge : mgmtChallenges) challenge.active = false;
  for (auto& session : mgmtSessions) session.active = false;
}

void handleManagementChallenge() {
  unsigned long cooldown = managementAuthCooldownRemainingMs();
  if (cooldown > 0) {
    server.send(429, "application/json", String("{\"error\":\"authentication temporarily rate limited\",\"retryAfterSec\":") + String((cooldown + 999UL) / 1000UL) + "}");
    return;
  }
  if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity()) {
    server.send(503, "application/json", "{\"error\":\"device password not initialized\"}");
    return;
  }

  MgmtChallenge* challenge = allocateManagementChallenge();
  challenge->active = true;
  challenge->id = randomHex(8);
  esp_fill_random(challenge->nonce, sizeof(challenge->nonce));
  challenge->remoteIp = server.client().remoteIP();
  challenge->expiresAt = millis() + MGMT_CHALLENGE_TTL_MS;

  String json = "{";
  json += "\"version\":1,";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"challengeId\":\"" + challenge->id + "\",";
  json += "\"nonce\":\"" + bytesToLowerHex(challenge->nonce, sizeof(challenge->nonce)) + "\",";
  json += "\"kdf\":\"BATMON-LAN-MGMT-V1\",";
  json += "\"proof\":\"HMAC-SHA-256\",";
  json += "\"expiresInSec\":60}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json);
}

void handleManagementSession() {
  unsigned long cooldown = managementAuthCooldownRemainingMs();
  if (cooldown > 0) {
    server.send(429, "application/json", String("{\"error\":\"authentication temporarily rate limited\",\"retryAfterSec\":") + String((cooldown + 999UL) / 1000UL) + "}");
    return;
  }
  if (!server.hasArg("challengeId") || !server.hasArg("proof")) {
    server.send(400, "application/json", "{\"error\":\"challengeId and proof required\"}");
    return;
  }

  String challengeId = server.arg("challengeId");
  String proofHex = server.arg("proof");
  IPAddress remote = server.client().remoteIP();
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
    server.send(401, "application/json", "{\"error\":\"invalid or expired challenge\"}");
    return;
  }

  // Challenges are single-use whether the proof succeeds or fails.
  selected->active = false;
  uint8_t supplied[32];
  uint8_t expected[32];
  uint8_t managementKey[32];
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
    server.send(401, "application/json", "{\"error\":\"invalid device password proof\"}");
    return;
  }

  clearManagementAuthFailures();
  MgmtSession* session = allocateManagementSession();
  session->active = true;
  session->token = randomHex(24);
  session->csrf = randomHex(16);
  session->remoteIp = remote;
  session->expiresAt = millis() + MGMT_SESSION_TTL_MS;

  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("Set-Cookie", String("BATMON_SESSION=") + session->token + "; Path=/; HttpOnly; SameSite=Strict");
  String json = String("{\"ok\":true,\"session\":\"") + session->token +
                "\",\"csrf\":\"" + session->csrf + "\",\"expiresInSec\":900}";
  server.send(200, "application/json", json);
}

void handleManagementLogout() {
  if (!requireManagementWriteAuth()) return;
  MgmtSession* session = findManagementSession();
  if (session) session->active = false;
  server.sendHeader("Set-Cookie", "BATMON_SESSION=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
  server.send(200, "application/json", "{\"ok\":true}");
}

static bool derivePasswordWrapKey(MgmtSession* session, uint8_t out[32]) {
  if (!session) return false;
  uint8_t managementKey[32];
  if (!getManagementKey(managementKey)) return false;
  String message = String("BATMON-PASSWORD-WRAP-V1|") + session->token + "|" + session->csrf;
  bool ok = managementHmac(managementKey, message, out);
  memset(managementKey, 0, sizeof(managementKey));
  return ok;
}

void handleDevicePasswordPost() {
  if (!requireManagementWriteAuth()) return;
  MgmtSession* session = findManagementSession();
  if (!session) { server.send(401, "application/json", "{\"error\":\"session expired\"}"); return; }
  if (!server.hasArg("iv") || !server.hasArg("ciphertext") || !server.hasArg("tag")) {
    server.send(400, "application/json", "{\"error\":\"encrypted password envelope required\"}");
    return;
  }

  String ivHex = server.arg("iv");
  String cipherHex = server.arg("ciphertext");
  String tagHex = server.arg("tag");
  if (cipherHex.length() < 2 || cipherHex.length() > DEVICE_PASSWORD_MAX_BYTES * 2 || (cipherHex.length() & 1)) {
    server.send(400, "application/json", "{\"error\":\"invalid encrypted password length\"}");
    return;
  }
  size_t cipherLen = cipherHex.length() / 2;
  uint8_t iv[12];
  uint8_t tag[16];
  uint8_t* cipher = (uint8_t*)malloc(cipherLen);
  uint8_t* plain = (uint8_t*)malloc(cipherLen + 1);
  if (!cipher || !plain || !parseManagementHex(ivHex, iv, sizeof(iv)) ||
      !parseManagementHex(tagHex, tag, sizeof(tag)) || !parseManagementHex(cipherHex, cipher, cipherLen)) {
    if (cipher) free(cipher);
    if (plain) free(plain);
    server.send(400, "application/json", "{\"error\":\"invalid encrypted password envelope\"}");
    return;
  }

  uint8_t wrapKey[32];
  if (!derivePasswordWrapKey(session, wrapKey)) {
    free(cipher); free(plain);
    server.send(500, "application/json", "{\"error\":\"password wrapping key unavailable\"}");
    return;
  }
  String aad = String("BATMON-PASSWORD-ROTATE-V1|") + deviceId + "|" + session->token;
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int rc = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, wrapKey, 256);
  if (rc == 0) {
    rc = mbedtls_gcm_auth_decrypt(&gcm, cipherLen,
                                  iv, sizeof(iv),
                                  (const unsigned char*)aad.c_str(), aad.length(),
                                  tag, sizeof(tag),
                                  cipher, plain);
  }
  mbedtls_gcm_free(&gcm);
  memset(wrapKey, 0, sizeof(wrapKey));
  free(cipher);
  if (rc != 0) {
    memset(plain, 0, cipherLen + 1); free(plain);
    server.send(400, "application/json", "{\"error\":\"password envelope authentication failed\"}");
    return;
  }
  plain[cipherLen] = 0;
  String newPassword((const char*)plain);
  memset(plain, 0, cipherLen + 1);
  free(plain);
  String validationError;
  if (!validateDevicePasswordBytes(newPassword, &validationError)) {
    server.send(400, "application/json", String("{\"error\":\"") + validationError + "\"}");
    return;
  }

  String error;
  String username = provisioningUsername.length() > 0 ? provisioningUsername : "batmon";
  if (!setDevicePasswordFlexible(username, newPassword, error)) {
    server.send(500, "application/json", String("{\"error\":\"") + jsonEscape(error) + "\"}");
    return;
  }
  newPassword = "";
  invalidateManagementSessions();
  clearManagementAuthFailures();
  server.sendHeader("Set-Cookie", "BATMON_SESSION=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"device password changed; re-authentication required\"}");
}

void handleEnterSecureProvisioningPost() {
  if (!requireManagementWriteAuth()) return;
  if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity()) {
    server.send(503, "application/json", "{\"error\":\"device password not initialized\"}");
    return;
  }
  server.send(200, "application/json", String("{\"ok\":true,\"setupSsid\":\"") + jsonEscape(apSsid) + "\"}");
  deferredProvisioningStartAtMs = millis() + 350UL;
}

void serviceManagementAuth() {
  expireManagementState();
  if (deferredProvisioningStartAtMs != 0 && (long)(millis() - deferredProvisioningStartAtMs) >= 0) {
    deferredProvisioningStartAtMs = 0;
    if (!fallbackApActive) startFallbackAp();
  }
}
