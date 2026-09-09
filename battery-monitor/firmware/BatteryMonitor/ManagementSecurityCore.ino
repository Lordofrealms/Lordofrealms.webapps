// Battery Monitor authenticated LAN-management security core.
//
// This file is transport-neutral. It owns the Device Password credential blob,
// challenge/session state, rate limiting, key derivation, and password wrapping
// primitives. NativeHttpServer.ino owns HTTP parsing/headers/responses.

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
  unsigned long cooldownSec = 30UL << step;
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

static bool isLegacyInitialCodeCompatibilityChar(char c) {
  if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
  return (c >= '0' && c <= '9') ||
         (c >= 'A' && c <= 'H') ||
         (c >= 'J' && c <= 'K') ||
         (c >= 'M' && c <= 'N') ||
         (c >= 'P' && c <= 'T') ||
         (c >= 'V' && c <= 'Z');
}

static String devicePasswordCompatibilityValue(const String& password) {
  if (password.length() != 19 || password[4] != '-' || password[9] != '-' || password[14] != '-') return password;

  String canonical;
  canonical.reserve(16);
  for (size_t i = 0; i < password.length(); ++i) {
    if (i == 4 || i == 9 || i == 14) continue;
    char c = password[i];
    if (!isLegacyInitialCodeCompatibilityChar(c)) return password;
    if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
    canonical += c;
  }
  return canonical.length() == 16 ? canonical : password;
}

static bool deriveFlexiblePasswordCheckHash(const String& password, uint8_t out[32]) {
  String effective = devicePasswordCompatibilityValue(password);
  if (!validateDevicePasswordBytes(effective)) return false;
  return sha256String(String("BATMON-CODECHECK-V1|") + deviceId + "|" + effective, out);
}

static String deriveFlexibleSoftApPassword(const String& password) {
  String effective = devicePasswordCompatibilityValue(password);
  if (!validateDevicePasswordBytes(effective)) return "";
  uint8_t digest[32];
  if (!sha256String(String("BATMON-SOFTAP-V1|") + deviceId + "|" + effective, digest)) return "";
  static const char HEX_DIGITS[] = "0123456789ABCDEF";
  String result;
  result.reserve(32);
  for (size_t i = 0; i < 16; ++i) {
    result += HEX_DIGITS[(digest[i] >> 4) & 0x0F];
    result += HEX_DIGITS[digest[i] & 0x0F];
  }
  return result;
}

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
  Preferences secPrefs;
  bool v2Present = false;
  if (secPrefs.begin(PROV_NAMESPACE, true)) {
    v2Present = secPrefs.getBytesLength(DEVICE_CRED_BLOB_KEY) > 0;
    secPrefs.end();
  }
  if (v2Present) return loadDeviceCredentialBlob();
  return loadProvisioningIdentity();
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
  if (written == total) {
    secPrefs.remove("user");
    secPrefs.remove("apkey");
    secPrefs.remove("codehash");
    secPrefs.remove("salt");
    secPrefs.remove("verifier");
  }
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

  String effectivePassword = devicePasswordCompatibilityValue(password);
  if (!validateDevicePasswordBytes(effectivePassword, &errorOut)) return false;

  String apKey = deriveFlexibleSoftApPassword(effectivePassword);
  uint8_t checkHash[32];
  if (apKey.length() < 8 || !deriveFlexiblePasswordCheckHash(effectivePassword, checkHash)) {
    errorOut = "CREDENTIAL_DERIVATION_FAILED";
    return false;
  }

  char* salt = nullptr;
  char* verifier = nullptr;
  int verifierLen = 0;
  esp_err_t err = esp_srp_gen_salt_verifier(
    username.c_str(), username.length(),
    effectivePassword.c_str(), effectivePassword.length(),
    &salt, (int)PROV_SALT_BYTES,
    &verifier, &verifierLen
  );
  effectivePassword = "";
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

static bool derivePasswordWrapKey(MgmtSession* session, uint8_t out[32]) {
  if (!session) return false;
  uint8_t managementKey[32];
  if (!getManagementKey(managementKey)) return false;
  String message = String("BATMON-PASSWORD-WRAP-V1|") + session->token + "|" + session->csrf;
  bool ok = managementHmac(managementKey, message, out);
  memset(managementKey, 0, sizeof(managementKey));
  return ok;
}
