// Signed application-mediated firmware update for encrypted Battery Monitor units.
//
// Release-mode Flash Encryption prevents the ROM downloader from safely writing
// a plaintext application after encryption is active. The running application
// therefore owns normal updates: Windows streams the plaintext signed app image
// over trusted USB, esp_ota_write() writes the inactive OTA partition (and the
// flash driver encrypts it on-device), and this code verifies the production
// RSA-3072/PSS signature before selecting that partition for the next boot.
//
// A bad signature, bad hash, malformed image, interrupted transfer, or write
// error never changes the boot partition. Secure Boot remains a separate later
// hardware gate; this verifier prevents the OTA path from becoming an unsigned
// firmware bypass in the meantime.

#include <esp_ota_ops.h>
#include <mbedtls/base64.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>

static const size_t BATMON_FW_SIGNATURE_BYTES = 384; // RSA-3072
static const size_t BATMON_FW_SHA256_BYTES = 32;
static const size_t BATMON_FW_MAX_CHUNK = 4096;
static const unsigned long BATMON_FW_TRANSFER_TIMEOUT_MS = 30000UL;

// Production verification key. This is a public trust root, not a secret.
// Fingerprint (SPKI SHA-256):
// 69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e
static const char BATMON_FW_PUBLIC_KEY_PEM[] =
  "-----BEGIN PUBLIC KEY-----\n"
  "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAkFyEmLUrfcb3Tv/gfErm\n"
  "lwit36pmiPd8d1lohTlTtTGsma0b9HxCd/SVLghwy46DlqVIkxJtugxv5UCm57yT\n"
  "fE3MpJ92AdT8e+I13DX6fef8p/qlw+LN+1QQYPgCWwyfyFdZb6rUeqLgfeVzsv7K\n"
  "4Bg4JAetuaUmBAKaVBczF5gKNCj2NC3D/+xrLZmgY5lCl+/UyE5RUmQ7L1drZcnZ\n"
  "n/udNm6628tPNYugFU1vLhgbnZs1HhlEns4TXM71531DmMIr3EDzgPZ7QmBpYD79\n"
  "qtQOBSZfI/AHIpVVkTO3VqtfS4aFerzRK1TYNrs+u0mlCRwctVOIa3S66coSBIK7\n"
  "QluYCcSXOKlYYt3rRF7EoVhbhMFQl0tp5L3zMj6z0tMnNx5/B/9NMdiugGJwYlYT\n"
  "Gf0m0vCfiRRrgTSzRfsxPb+YT5y4deqfzT4Ehzw9kQvA9Ppj1ExArVA2W0ct4nih\n"
  "JmnZvEvzUMCWlGTYOjYWIDjF+SBjo1wicB2VT21ihmRFAgMBAAE=\n"
  "-----END PUBLIC KEY-----\n";

static bool firmwareUpdateActive = false;
static bool firmwareUpdateOtaHandleActive = false;
static esp_ota_handle_t firmwareUpdateHandle = 0;
static const esp_partition_t* firmwareUpdatePartition = nullptr;
static size_t firmwareUpdateExpectedSize = 0;
static size_t firmwareUpdateWritten = 0;
static uint8_t firmwareUpdateExpectedDigest[BATMON_FW_SHA256_BYTES] = {};
static uint8_t firmwareUpdateSignature[BATMON_FW_SIGNATURE_BYTES] = {};
static mbedtls_sha256_context firmwareUpdateSha;
static bool firmwareUpdateShaActive = false;
static uint8_t firmwareUpdateChunk[BATMON_FW_MAX_CHUNK];
static size_t firmwareUpdateChunkUsed = 0;
static size_t firmwareUpdateRawRemaining = 0;
static unsigned long firmwareUpdateLastActivityMs = 0;

static int firmwareHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool firmwareParseHexExact(const String& value, uint8_t* out, size_t outLen) {
  if (value.length() != outLen * 2) return false;
  for (size_t i = 0; i < outLen; ++i) {
    int hi = firmwareHexNibble(value[i * 2]);
    int lo = firmwareHexNibble(value[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
  return true;
}

static bool firmwareConstantTimeEquals(const uint8_t* a, const uint8_t* b, size_t len) {
  uint8_t diff = 0;
  for (size_t i = 0; i < len; ++i) diff |= a[i] ^ b[i];
  return diff == 0;
}

static void firmwareUpdateClearSensitiveState() {
  memset(firmwareUpdateExpectedDigest, 0, sizeof(firmwareUpdateExpectedDigest));
  memset(firmwareUpdateSignature, 0, sizeof(firmwareUpdateSignature));
  memset(firmwareUpdateChunk, 0, sizeof(firmwareUpdateChunk));
}

static void firmwareUpdateResetState(bool abortOta) {
  if (abortOta && firmwareUpdateOtaHandleActive) {
    esp_ota_abort(firmwareUpdateHandle);
  }
  firmwareUpdateOtaHandleActive = false;
  firmwareUpdateHandle = 0;
  firmwareUpdatePartition = nullptr;
  firmwareUpdateExpectedSize = 0;
  firmwareUpdateWritten = 0;
  firmwareUpdateChunkUsed = 0;
  firmwareUpdateRawRemaining = 0;
  firmwareUpdateLastActivityMs = 0;
  if (firmwareUpdateShaActive) {
    mbedtls_sha256_free(&firmwareUpdateSha);
    firmwareUpdateShaActive = false;
  }
  firmwareUpdateClearSensitiveState();
  firmwareUpdateActive = false;
}

static bool firmwareVerifyProductionSignature(const uint8_t digest[BATMON_FW_SHA256_BYTES],
                                              const uint8_t signature[BATMON_FW_SIGNATURE_BYTES],
                                              String& errorOut) {
  mbedtls_pk_context key;
  mbedtls_pk_init(&key);
  int rc = mbedtls_pk_parse_public_key(&key,
                                       (const unsigned char*)BATMON_FW_PUBLIC_KEY_PEM,
                                       sizeof(BATMON_FW_PUBLIC_KEY_PEM));
  if (rc != 0) {
    mbedtls_pk_free(&key);
    errorOut = "FW_TRUST_KEY_PARSE_FAILED";
    return false;
  }

  mbedtls_pk_rsassa_pss_options pssOptions;
  pssOptions.mgf1_hash_id = MBEDTLS_MD_SHA256;
  pssOptions.expected_salt_len = MBEDTLS_RSA_SALT_LEN_ANY;
  rc = mbedtls_pk_verify_ext(MBEDTLS_PK_RSASSA_PSS,
                             &pssOptions,
                             &key,
                             MBEDTLS_MD_SHA256,
                             digest,
                             BATMON_FW_SHA256_BYTES,
                             signature,
                             BATMON_FW_SIGNATURE_BYTES);
  mbedtls_pk_free(&key);
  if (rc != 0) {
    errorOut = "FW_SIGNATURE_INVALID";
    return false;
  }
  return true;
}

String firmwareUpdateCapabilitySummary() {
  return String("SIGNED_USB_OTA_V1 ") + String(BATMON_FW_MAX_CHUNK) + " RSA-3072-PSS-SHA256";
}

bool firmwareUpdateInProgress() {
  return firmwareUpdateActive;
}

bool firmwareUpdateRawBytesPending() {
  return firmwareUpdateActive && firmwareUpdateRawRemaining > 0;
}

bool beginSignedFirmwareUpdate(const String& sizeToken,
                               const String& expectedSha256Hex,
                               const String& signatureBase64,
                               String& errorOut) {
  if (firmwareUpdateActive) {
    errorOut = "FW_UPDATE_ALREADY_ACTIVE";
    return false;
  }

  char* end = nullptr;
  unsigned long parsedSize = strtoul(sizeToken.c_str(), &end, 10);
  if (!end || *end != '\0' || parsedSize < 1024UL) {
    errorOut = "FW_INVALID_SIZE";
    return false;
  }

  if (!firmwareParseHexExact(expectedSha256Hex,
                             firmwareUpdateExpectedDigest,
                             BATMON_FW_SHA256_BYTES)) {
    firmwareUpdateClearSensitiveState();
    errorOut = "FW_INVALID_SHA256";
    return false;
  }

  size_t signatureLen = 0;
  int decodeRc = mbedtls_base64_decode(firmwareUpdateSignature,
                                       sizeof(firmwareUpdateSignature),
                                       &signatureLen,
                                       (const unsigned char*)signatureBase64.c_str(),
                                       signatureBase64.length());
  if (decodeRc != 0 || signatureLen != BATMON_FW_SIGNATURE_BYTES) {
    firmwareUpdateClearSensitiveState();
    errorOut = "FW_INVALID_SIGNATURE_ENCODING";
    return false;
  }

  const esp_partition_t* target = esp_ota_get_next_update_partition(nullptr);
  if (!target || parsedSize > target->size) {
    firmwareUpdateClearSensitiveState();
    errorOut = "FW_NO_UPDATE_PARTITION";
    return false;
  }

  esp_ota_handle_t handle = 0;
  esp_err_t err = esp_ota_begin(target, (size_t)parsedSize, &handle);
  if (err != ESP_OK) {
    firmwareUpdateClearSensitiveState();
    errorOut = String("FW_OTA_BEGIN_") + String((int)err);
    return false;
  }

  mbedtls_sha256_init(&firmwareUpdateSha);
  if (mbedtls_sha256_starts(&firmwareUpdateSha, 0) != 0) {
    esp_ota_abort(handle);
    mbedtls_sha256_free(&firmwareUpdateSha);
    firmwareUpdateClearSensitiveState();
    errorOut = "FW_SHA256_INIT_FAILED";
    return false;
  }

  firmwareUpdateShaActive = true;
  firmwareUpdateOtaHandleActive = true;
  firmwareUpdateHandle = handle;
  firmwareUpdatePartition = target;
  firmwareUpdateExpectedSize = (size_t)parsedSize;
  firmwareUpdateWritten = 0;
  firmwareUpdateChunkUsed = 0;
  firmwareUpdateRawRemaining = 0;
  firmwareUpdateLastActivityMs = millis();
  firmwareUpdateActive = true;
  errorOut = "";
  return true;
}

bool prepareSignedFirmwareChunk(size_t chunkSize, String& errorOut) {
  if (!firmwareUpdateActive || !firmwareUpdateOtaHandleActive) {
    errorOut = "FW_NO_ACTIVE_UPDATE";
    return false;
  }
  if (firmwareUpdateRawRemaining != 0) {
    errorOut = "FW_CHUNK_ALREADY_PENDING";
    return false;
  }
  if (chunkSize < 1 || chunkSize > BATMON_FW_MAX_CHUNK ||
      firmwareUpdateWritten + chunkSize > firmwareUpdateExpectedSize) {
    errorOut = "FW_INVALID_CHUNK_SIZE";
    return false;
  }

  firmwareUpdateChunkUsed = 0;
  firmwareUpdateRawRemaining = chunkSize;
  firmwareUpdateLastActivityMs = millis();
  errorOut = "";
  return true;
}

void serviceSignedFirmwareRawSerial() {
  if (!firmwareUpdateRawBytesPending()) return;

  while (firmwareUpdateRawRemaining > 0 && Serial.available() > 0) {
    int value = Serial.read();
    if (value < 0) break;
    firmwareUpdateChunk[firmwareUpdateChunkUsed++] = (uint8_t)value;
    firmwareUpdateRawRemaining--;
    firmwareUpdateLastActivityMs = millis();
  }

  if (firmwareUpdateRawRemaining != 0) return;

  size_t completedChunk = firmwareUpdateChunkUsed;
  esp_err_t err = esp_ota_write(firmwareUpdateHandle, firmwareUpdateChunk, completedChunk);
  if (err == ESP_OK && mbedtls_sha256_update(&firmwareUpdateSha, firmwareUpdateChunk, completedChunk) != 0) {
    err = ESP_FAIL;
  }
  memset(firmwareUpdateChunk, 0, completedChunk);
  firmwareUpdateChunkUsed = 0;

  if (err != ESP_OK) {
    firmwareUpdateResetState(true);
    Serial.print("BATMON1 ERR FW_WRITE_");
    Serial.println((int)err);
    return;
  }

  firmwareUpdateWritten += completedChunk;
  firmwareUpdateLastActivityMs = millis();
  Serial.print("BATMON1 OK FWCHUNK ");
  Serial.println((unsigned long)firmwareUpdateWritten);
}

bool finishSignedFirmwareUpdate(String& resultOut, String& errorOut) {
  if (!firmwareUpdateActive || !firmwareUpdateOtaHandleActive) {
    errorOut = "FW_NO_ACTIVE_UPDATE";
    return false;
  }
  if (firmwareUpdateRawRemaining != 0) {
    errorOut = "FW_CHUNK_INCOMPLETE";
    return false;
  }
  if (firmwareUpdateWritten != firmwareUpdateExpectedSize) {
    errorOut = "FW_SIZE_MISMATCH";
    return false;
  }

  uint8_t digest[BATMON_FW_SHA256_BYTES];
  if (mbedtls_sha256_finish(&firmwareUpdateSha, digest) != 0) {
    memset(digest, 0, sizeof(digest));
    firmwareUpdateResetState(true);
    errorOut = "FW_SHA256_FINISH_FAILED";
    return false;
  }
  mbedtls_sha256_free(&firmwareUpdateSha);
  firmwareUpdateShaActive = false;

  if (!firmwareConstantTimeEquals(digest, firmwareUpdateExpectedDigest, sizeof(digest))) {
    memset(digest, 0, sizeof(digest));
    firmwareUpdateResetState(true);
    errorOut = "FW_SHA256_MISMATCH";
    return false;
  }

  String signatureError;
  if (!firmwareVerifyProductionSignature(digest, firmwareUpdateSignature, signatureError)) {
    memset(digest, 0, sizeof(digest));
    firmwareUpdateResetState(true);
    errorOut = signatureError;
    return false;
  }
  memset(digest, 0, sizeof(digest));

  const esp_partition_t* completedPartition = firmwareUpdatePartition;
  esp_ota_handle_t completedHandle = firmwareUpdateHandle;
  firmwareUpdateOtaHandleActive = false; // esp_ota_end always consumes the handle.
  firmwareUpdateHandle = 0;
  esp_err_t endErr = esp_ota_end(completedHandle);
  if (endErr != ESP_OK) {
    firmwareUpdateResetState(false);
    errorOut = String("FW_OTA_VALIDATE_") + String((int)endErr);
    return false;
  }

  esp_app_desc_t appDesc = {};
  esp_err_t descErr = esp_ota_get_partition_description(completedPartition, &appDesc);
  if (descErr != ESP_OK || strncmp(appDesc.project_name, "BatteryMonitor", sizeof(appDesc.project_name)) != 0) {
    firmwareUpdateResetState(false);
    errorOut = "FW_WRONG_APPLICATION";
    return false;
  }

  esp_err_t bootErr = esp_ota_set_boot_partition(completedPartition);
  if (bootErr != ESP_OK) {
    firmwareUpdateResetState(false);
    errorOut = String("FW_SET_BOOT_") + String((int)bootErr);
    return false;
  }

  resultOut = String(appDesc.version);
  firmwareUpdateResetState(false);
  errorOut = "";
  return true;
}

bool abortSignedFirmwareUpdate(String& resultOut) {
  if (!firmwareUpdateActive) {
    resultOut = "NO_ACTIVE_UPDATE";
    return false;
  }
  firmwareUpdateResetState(true);
  resultOut = "ABORTED";
  return true;
}

void serviceFirmwareUpdateTimeout() {
  if (!firmwareUpdateActive || firmwareUpdateLastActivityMs == 0) return;
  if ((unsigned long)(millis() - firmwareUpdateLastActivityMs) < BATMON_FW_TRANSFER_TIMEOUT_MS) return;
  firmwareUpdateResetState(true);
  Serial.println("BATMON1 ERR FW_TRANSFER_TIMEOUT");
}
