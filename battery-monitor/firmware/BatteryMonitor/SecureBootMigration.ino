// Factory-only Secure Boot v2 retrofit protocol for already release-encrypted
// ESP32 ECO3+ Battery Monitor units.
//
// Normal production firmware compiles fail-closed stubs. The isolated 0.1.0.12
// Secure Boot migration build enables the implementation below. The migration
// application itself is first installed through the existing signed app OTA and
// must finish its normal rollback probation/release-floor commit before this
// protocol will accept a bootloader.
//
// A signed bootloader is staged in the existing 64 KiB coredump partition. The
// complete transfer is SHA-256 checked, independently authorized by the normal
// Battery Monitor detached RSA-PSS release key, and read back from flash before
// it can be committed. Only SBMIGCOMMIT calls esp_ota_end(); ESP-IDF then
// validates the staged Secure Boot image and copies the entire primary
// bootloader region to 0x1000 using encryption-aware partition writes.
//
// IMPORTANT: the final bootloader copy is inherently power-loss-sensitive. A
// power loss during SBMIGCOMMIT can leave the unit without a bootable second-
// stage bootloader. The Factory application must present an explicit final
// irreversible-action confirmation immediately before issuing that command.

#include <esp_chip_info.h>
#include <esp_flash_encrypt.h>
#include <esp_partition.h>
#include <esp_secure_boot.h>

#if CONFIG_SECURE_BOOT_V2_ENABLED

static const size_t BATMON_SBMIG_MAX_CHUNK = 4096;
static const size_t BATMON_SBMIG_STAGING_ADDRESS = 0x3F0000;
static const size_t BATMON_SBMIG_STAGING_SIZE = 0x10000;
static const size_t BATMON_SBMIG_PRIMARY_BOOTLOADER_ADDRESS = 0x1000;
static const size_t BATMON_SBMIG_PRIMARY_BOOTLOADER_SIZE = 0xE000;
static const unsigned long BATMON_SBMIG_TRANSFER_TIMEOUT_MS = 30000UL;
static const unsigned long BATMON_SBMIG_STAGED_TIMEOUT_MS = 15UL * 60UL * 1000UL;

static bool secureBootMigrationActive = false;
static bool secureBootMigrationStagedVerified = false;
static bool secureBootMigrationOtaHandleActive = false;
static esp_ota_handle_t secureBootMigrationHandle = 0;
static const esp_partition_t* secureBootMigrationStagingPartition = nullptr;
static const esp_partition_t* secureBootMigrationPrimaryPartition = nullptr;
static bool secureBootMigrationPrimaryRegistered = false;
static size_t secureBootMigrationExpectedSize = 0;
static size_t secureBootMigrationWritten = 0;
static size_t secureBootMigrationRawRemaining = 0;
static size_t secureBootMigrationChunkUsed = 0;
static uint8_t secureBootMigrationExpectedDigest[BATMON_FW_SHA256_BYTES] = {};
static uint8_t secureBootMigrationSignature[BATMON_FW_SIGNATURE_BYTES] = {};
static uint8_t secureBootMigrationChunk[BATMON_SBMIG_MAX_CHUNK] = {};
static mbedtls_sha256_context secureBootMigrationSha;
static bool secureBootMigrationShaActive = false;
static unsigned long secureBootMigrationLastActivityMs = 0;

static void secureBootMigrationClearSensitiveState() {
  memset(secureBootMigrationExpectedDigest, 0, sizeof(secureBootMigrationExpectedDigest));
  memset(secureBootMigrationSignature, 0, sizeof(secureBootMigrationSignature));
  memset(secureBootMigrationChunk, 0, sizeof(secureBootMigrationChunk));
}

static void secureBootMigrationReleasePrimaryRegistration() {
  if (secureBootMigrationPrimaryRegistered && secureBootMigrationPrimaryPartition != nullptr) {
    esp_partition_deregister_external(secureBootMigrationPrimaryPartition);
  }
  secureBootMigrationPrimaryRegistered = false;
  secureBootMigrationPrimaryPartition = nullptr;
}

static void secureBootMigrationResetState(bool abortOta) {
  if (abortOta && secureBootMigrationOtaHandleActive) {
    esp_ota_abort(secureBootMigrationHandle);
  }
  secureBootMigrationOtaHandleActive = false;
  secureBootMigrationHandle = 0;
  secureBootMigrationStagingPartition = nullptr;
  secureBootMigrationExpectedSize = 0;
  secureBootMigrationWritten = 0;
  secureBootMigrationRawRemaining = 0;
  secureBootMigrationChunkUsed = 0;
  secureBootMigrationLastActivityMs = 0;
  secureBootMigrationStagedVerified = false;
  if (secureBootMigrationShaActive) {
    mbedtls_sha256_free(&secureBootMigrationSha);
    secureBootMigrationShaActive = false;
  }
  secureBootMigrationReleasePrimaryRegistration();
  secureBootMigrationClearSensitiveState();
  secureBootMigrationActive = false;
}

static bool secureBootMigrationHardwareEligible(String& errorOut) {
  esp_chip_info_t chip = {};
  esp_chip_info(&chip);
  if (chip.model != CHIP_ESP32) {
    errorOut = "SBMIG_NOT_CLASSIC_ESP32";
    return false;
  }
  if (chip.revision < 300) {
    errorOut = String("SBMIG_ECO3_REQUIRED_") + String((unsigned int)chip.revision);
    return false;
  }
  if (!esp_flash_encryption_enabled() || esp_get_flash_encryption_mode() != ESP_FLASH_ENC_MODE_RELEASE) {
    errorOut = "SBMIG_FLASH_ENCRYPTION_RELEASE_REQUIRED";
    return false;
  }
  if (esp_secure_boot_enabled()) {
    errorOut = "SBMIG_SECURE_BOOT_ALREADY_ENABLED";
    return false;
  }
  return true;
}

static bool secureBootMigrationReleaseReady(String& errorOut) {
  const esp_partition_t* running = esp_ota_get_running_partition();
  if (running == nullptr) {
    errorOut = "SBMIG_RUNNING_PARTITION_UNAVAILABLE";
    return false;
  }

  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (esp_ota_get_state_partition(running, &state) == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY) {
    errorOut = "SBMIG_APP_PROBATION_PENDING";
    return false;
  }

  uint32_t runningSequence = 0;
  if (!batteryMonitorRunningReleaseSequence(runningSequence, errorOut)) return false;
  uint32_t storedFloor = 0;
  if (!batteryMonitorReadReleaseFloor(storedFloor, errorOut)) return false;
  if (runningSequence == 0 || storedFloor != runningSequence) {
    errorOut = String("SBMIG_RELEASE_FLOOR_NOT_COMMITTED_") + String((unsigned long)runningSequence) + "_" + String((unsigned long)storedFloor);
    return false;
  }
  return true;
}

static bool secureBootMigrationResolvePartitions(String& errorOut) {
  const esp_partition_t* staging = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, "coredump");
  if (staging == nullptr || staging->address != BATMON_SBMIG_STAGING_ADDRESS || staging->size != BATMON_SBMIG_STAGING_SIZE) {
    errorOut = "SBMIG_STAGING_PARTITION_MISMATCH";
    return false;
  }

  const esp_partition_t* primary = esp_partition_find_first(
      ESP_PARTITION_TYPE_BOOTLOADER, ESP_PARTITION_SUBTYPE_BOOTLOADER_PRIMARY, nullptr);
  if (primary == nullptr) {
    esp_err_t registerErr = esp_partition_register_external(
        nullptr,
        BATMON_SBMIG_PRIMARY_BOOTLOADER_ADDRESS,
        BATMON_SBMIG_PRIMARY_BOOTLOADER_SIZE,
        "PrimaryBTLDR",
        ESP_PARTITION_TYPE_BOOTLOADER,
        ESP_PARTITION_SUBTYPE_BOOTLOADER_PRIMARY,
        &primary);
    if (registerErr != ESP_OK || primary == nullptr) {
      errorOut = String("SBMIG_PRIMARY_REGISTER_") + String((int)registerErr);
      return false;
    }
    secureBootMigrationPrimaryRegistered = true;
  }

  if (primary->address != BATMON_SBMIG_PRIMARY_BOOTLOADER_ADDRESS ||
      primary->size != BATMON_SBMIG_PRIMARY_BOOTLOADER_SIZE ||
      !primary->encrypted) {
    if (secureBootMigrationPrimaryRegistered) {
      esp_partition_deregister_external(primary);
      secureBootMigrationPrimaryRegistered = false;
    }
    errorOut = "SBMIG_PRIMARY_PARTITION_MISMATCH";
    return false;
  }

  secureBootMigrationStagingPartition = staging;
  secureBootMigrationPrimaryPartition = primary;
  return true;
}

static bool secureBootMigrationReadbackDigest(uint8_t digestOut[BATMON_FW_SHA256_BYTES], String& errorOut) {
  if (secureBootMigrationStagingPartition == nullptr || secureBootMigrationExpectedSize == 0) {
    errorOut = "SBMIG_NO_STAGED_IMAGE";
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  if (mbedtls_sha256_starts(&sha, 0) != 0) {
    mbedtls_sha256_free(&sha);
    errorOut = "SBMIG_READBACK_SHA_INIT_FAILED";
    return false;
  }

  uint8_t buffer[BATMON_SBMIG_MAX_CHUNK];
  size_t offset = 0;
  while (offset < secureBootMigrationExpectedSize) {
    size_t count = min(sizeof(buffer), secureBootMigrationExpectedSize - offset);
    esp_err_t readErr = esp_partition_read(secureBootMigrationStagingPartition, offset, buffer, count);
    if (readErr != ESP_OK || mbedtls_sha256_update(&sha, buffer, count) != 0) {
      memset(buffer, 0, sizeof(buffer));
      mbedtls_sha256_free(&sha);
      errorOut = readErr != ESP_OK
          ? String("SBMIG_READBACK_") + String((int)readErr)
          : "SBMIG_READBACK_SHA_UPDATE_FAILED";
      return false;
    }
    offset += count;
  }
  memset(buffer, 0, sizeof(buffer));

  int finishRc = mbedtls_sha256_finish(&sha, digestOut);
  mbedtls_sha256_free(&sha);
  if (finishRc != 0) {
    memset(digestOut, 0, BATMON_FW_SHA256_BYTES);
    errorOut = "SBMIG_READBACK_SHA_FINISH_FAILED";
    return false;
  }
  return true;
}

String secureBootMigrationCapabilitySummary() {
  String error;
  if (!secureBootMigrationHardwareEligible(error)) return String("UNAVAILABLE ") + error;
  if (!secureBootMigrationReleaseReady(error)) return String("NOT_READY ") + error;
  return String("SECURE_BOOT_V2_MIGRATION_V1 ") + String(BATMON_SBMIG_MAX_CHUNK) +
         " staging=0x3F0000+0x10000 primary=0x1000+0xE000 power_loss_risk=bootloader_copy";
}

bool secureBootMigrationInProgress() { return secureBootMigrationActive; }
bool secureBootMigrationRawBytesPending() {
  return secureBootMigrationActive && !secureBootMigrationStagedVerified && secureBootMigrationRawRemaining > 0;
}
size_t secureBootMigrationBytesWritten() { return secureBootMigrationWritten; }

bool beginSecureBootMigration(const String& sizeToken,
                              const String& expectedSha256Hex,
                              const String& signatureBase64,
                              String& errorOut) {
  if (secureBootMigrationActive) {
    errorOut = "SBMIG_ALREADY_ACTIVE";
    return false;
  }
  if (firmwareUpdateInProgress()) {
    errorOut = "SBMIG_FIRMWARE_UPDATE_ACTIVE";
    return false;
  }
  if (!secureBootMigrationHardwareEligible(errorOut) || !secureBootMigrationReleaseReady(errorOut)) return false;

  char* end = nullptr;
  unsigned long parsedSize = strtoul(sizeToken.c_str(), &end, 10);
  if (!end || *end != '\0' || parsedSize < 1024UL || parsedSize > BATMON_SBMIG_PRIMARY_BOOTLOADER_SIZE || parsedSize > BATMON_SBMIG_STAGING_SIZE) {
    errorOut = "SBMIG_INVALID_SIZE";
    return false;
  }
  if (!firmwareParseHexExact(expectedSha256Hex, secureBootMigrationExpectedDigest, BATMON_FW_SHA256_BYTES)) {
    secureBootMigrationClearSensitiveState();
    errorOut = "SBMIG_INVALID_SHA256";
    return false;
  }

  size_t signatureLen = 0;
  int decodeRc = mbedtls_base64_decode(
      secureBootMigrationSignature,
      sizeof(secureBootMigrationSignature),
      &signatureLen,
      (const unsigned char*)signatureBase64.c_str(),
      signatureBase64.length());
  if (decodeRc != 0 || signatureLen != BATMON_FW_SIGNATURE_BYTES) {
    secureBootMigrationClearSensitiveState();
    errorOut = "SBMIG_INVALID_SIGNATURE_ENCODING";
    return false;
  }

  if (!secureBootMigrationResolvePartitions(errorOut)) {
    secureBootMigrationClearSensitiveState();
    return false;
  }

  // OTA_SIZE_UNKNOWN intentionally erases the entire 64 KiB staging partition.
  // ESP-IDF's finalize-with-copy path copies the entire 0xE000 primary region,
  // not only the signed image length, so the unused staging tail must be 0xFF
  // rather than stale coredump contents.
  esp_ota_handle_t handle = 0;
  esp_err_t beginErr = esp_ota_begin(secureBootMigrationStagingPartition, OTA_SIZE_UNKNOWN, &handle);
  if (beginErr != ESP_OK) {
    secureBootMigrationReleasePrimaryRegistration();
    secureBootMigrationClearSensitiveState();
    errorOut = String("SBMIG_OTA_BEGIN_") + String((int)beginErr);
    return false;
  }

  esp_err_t finalErr = esp_ota_set_final_partition(handle, secureBootMigrationPrimaryPartition, true);
  if (finalErr != ESP_OK) {
    esp_ota_abort(handle);
    secureBootMigrationReleasePrimaryRegistration();
    secureBootMigrationClearSensitiveState();
    errorOut = String("SBMIG_SET_FINAL_") + String((int)finalErr);
    return false;
  }

  mbedtls_sha256_init(&secureBootMigrationSha);
  if (mbedtls_sha256_starts(&secureBootMigrationSha, 0) != 0) {
    esp_ota_abort(handle);
    mbedtls_sha256_free(&secureBootMigrationSha);
    secureBootMigrationReleasePrimaryRegistration();
    secureBootMigrationClearSensitiveState();
    errorOut = "SBMIG_SHA_INIT_FAILED";
    return false;
  }

  secureBootMigrationShaActive = true;
  secureBootMigrationOtaHandleActive = true;
  secureBootMigrationHandle = handle;
  secureBootMigrationExpectedSize = (size_t)parsedSize;
  secureBootMigrationWritten = 0;
  secureBootMigrationRawRemaining = 0;
  secureBootMigrationChunkUsed = 0;
  secureBootMigrationStagedVerified = false;
  secureBootMigrationLastActivityMs = millis();
  secureBootMigrationActive = true;
  errorOut = "";
  return true;
}

bool prepareSecureBootMigrationChunk(size_t chunkSize, String& errorOut) {
  if (!secureBootMigrationActive || !secureBootMigrationOtaHandleActive || secureBootMigrationStagedVerified) {
    errorOut = secureBootMigrationStagedVerified ? "SBMIG_ALREADY_STAGED" : "SBMIG_NO_ACTIVE_TRANSFER";
    return false;
  }
  if (secureBootMigrationRawRemaining != 0) {
    errorOut = "SBMIG_CHUNK_ALREADY_PENDING";
    return false;
  }
  if (chunkSize < 1 || chunkSize > BATMON_SBMIG_MAX_CHUNK || secureBootMigrationWritten + chunkSize > secureBootMigrationExpectedSize) {
    errorOut = "SBMIG_INVALID_CHUNK_SIZE";
    return false;
  }
  secureBootMigrationChunkUsed = 0;
  secureBootMigrationRawRemaining = chunkSize;
  secureBootMigrationLastActivityMs = millis();
  errorOut = "";
  return true;
}

void serviceSecureBootMigrationRawSerial() {
  if (!secureBootMigrationRawBytesPending()) return;

  while (secureBootMigrationRawRemaining > 0 && Serial.available() > 0) {
    int value = Serial.read();
    if (value < 0) break;
    secureBootMigrationChunk[secureBootMigrationChunkUsed++] = (uint8_t)value;
    secureBootMigrationRawRemaining--;
    secureBootMigrationLastActivityMs = millis();
  }
  if (secureBootMigrationRawRemaining != 0) return;

  size_t completedChunk = secureBootMigrationChunkUsed;
  esp_err_t writeErr = esp_ota_write(secureBootMigrationHandle, secureBootMigrationChunk, completedChunk);
  if (writeErr == ESP_OK && mbedtls_sha256_update(&secureBootMigrationSha, secureBootMigrationChunk, completedChunk) != 0)
    writeErr = ESP_FAIL;
  memset(secureBootMigrationChunk, 0, completedChunk);
  secureBootMigrationChunkUsed = 0;

  if (writeErr != ESP_OK) {
    String message = String("SBMIG_WRITE_") + String((int)writeErr);
    secureBootMigrationResetState(true);
    Serial.print("BATMON1 ERR ");
    Serial.println(message);
    return;
  }

  secureBootMigrationWritten += completedChunk;
  secureBootMigrationLastActivityMs = millis();
  Serial.print("BATMON1 OK SBMIGCHUNK ");
  Serial.println((unsigned long)secureBootMigrationWritten);
}

bool finishSecureBootMigrationStaging(String& resultOut, String& errorOut) {
  if (!secureBootMigrationActive || !secureBootMigrationOtaHandleActive) {
    errorOut = "SBMIG_NO_ACTIVE_TRANSFER";
    return false;
  }
  if (secureBootMigrationStagedVerified) {
    resultOut = "STAGED VERIFIED";
    errorOut = "";
    return true;
  }
  if (secureBootMigrationRawRemaining != 0 || secureBootMigrationWritten != secureBootMigrationExpectedSize) {
    errorOut = "SBMIG_SIZE_MISMATCH";
    return false;
  }

  uint8_t digest[BATMON_FW_SHA256_BYTES] = {};
  if (mbedtls_sha256_finish(&secureBootMigrationSha, digest) != 0) {
    memset(digest, 0, sizeof(digest));
    secureBootMigrationResetState(true);
    errorOut = "SBMIG_SHA_FINISH_FAILED";
    return false;
  }
  mbedtls_sha256_free(&secureBootMigrationSha);
  secureBootMigrationShaActive = false;

  if (!firmwareConstantTimeEquals(digest, secureBootMigrationExpectedDigest, sizeof(digest))) {
    memset(digest, 0, sizeof(digest));
    secureBootMigrationResetState(true);
    errorOut = "SBMIG_SHA256_MISMATCH";
    return false;
  }

  String signatureError;
  if (!firmwareVerifyProductionSignature(digest, secureBootMigrationSignature, signatureError)) {
    memset(digest, 0, sizeof(digest));
    secureBootMigrationResetState(true);
    errorOut = String("SBMIG_") + signatureError;
    return false;
  }

  uint8_t readbackDigest[BATMON_FW_SHA256_BYTES] = {};
  if (!secureBootMigrationReadbackDigest(readbackDigest, errorOut) ||
      !firmwareConstantTimeEquals(readbackDigest, digest, sizeof(digest))) {
    memset(digest, 0, sizeof(digest));
    memset(readbackDigest, 0, sizeof(readbackDigest));
    secureBootMigrationResetState(true);
    if (errorOut.length() == 0) errorOut = "SBMIG_READBACK_SHA_MISMATCH";
    return false;
  }
  memset(readbackDigest, 0, sizeof(readbackDigest));
  memset(digest, 0, sizeof(digest));

  // Basic bootloader image sanity before arming commit. ESP-IDF performs the
  // authoritative image + embedded Secure Boot signature verification inside
  // esp_ota_end() immediately before the final copy.
  uint8_t magic = 0;
  if (esp_partition_read(secureBootMigrationStagingPartition, 0, &magic, 1) != ESP_OK || magic != ESP_IMAGE_HEADER_MAGIC) {
    secureBootMigrationResetState(true);
    errorOut = "SBMIG_INVALID_BOOTLOADER_MAGIC";
    return false;
  }

  secureBootMigrationStagedVerified = true;
  secureBootMigrationLastActivityMs = millis();
  resultOut = String("STAGED VERIFIED ") + String((unsigned long)secureBootMigrationExpectedSize);
  errorOut = "";
  return true;
}

bool commitSecureBootMigration(const String& confirmationSha256Hex,
                               String& resultOut,
                               String& errorOut) {
  if (!secureBootMigrationActive || !secureBootMigrationOtaHandleActive || !secureBootMigrationStagedVerified) {
    errorOut = "SBMIG_NOT_STAGED_VERIFIED";
    return false;
  }
  uint8_t confirmationDigest[BATMON_FW_SHA256_BYTES] = {};
  if (!firmwareParseHexExact(confirmationSha256Hex, confirmationDigest, sizeof(confirmationDigest)) ||
      !firmwareConstantTimeEquals(confirmationDigest, secureBootMigrationExpectedDigest, sizeof(confirmationDigest))) {
    memset(confirmationDigest, 0, sizeof(confirmationDigest));
    errorOut = "SBMIG_COMMIT_SHA_MISMATCH";
    return false;
  }
  memset(confirmationDigest, 0, sizeof(confirmationDigest));

  // Re-run every irreversible-action prerequisite immediately before the copy.
  if (firmwareUpdateInProgress()) {
    errorOut = "SBMIG_FIRMWARE_UPDATE_ACTIVE";
    return false;
  }
  if (!secureBootMigrationHardwareEligible(errorOut) || !secureBootMigrationReleaseReady(errorOut)) return false;

  esp_ota_handle_t handle = secureBootMigrationHandle;
  secureBootMigrationOtaHandleActive = false;
  secureBootMigrationHandle = 0;

  // POWER-LOSS-SENSITIVE WINDOW STARTS HERE. esp_ota_end validates the staged
  // Secure Boot bootloader, erases the primary bootloader region, and copies the
  // complete final region through encryption-aware partition writes.
  esp_err_t endErr = esp_ota_end(handle);
  secureBootMigrationReleasePrimaryRegistration();
  if (endErr != ESP_OK) {
    // esp_ota_end has already consumed the handle. Do NOT reboot: while this app
    // is still executing, Factory can stage the known-good bootloader again and
    // retry the final copy. A reboot/power loss after a partial copy may brick.
    secureBootMigrationOtaHandleActive = false;
    secureBootMigrationActive = false;
    secureBootMigrationStagedVerified = false;
    secureBootMigrationClearSensitiveState();
    errorOut = String("SBMIG_COMMIT_COPY_FAILED_") + String((int)endErr) + "_DO_NOT_REBOOT_OR_REMOVE_POWER";
    return false;
  }

  secureBootMigrationActive = false;
  secureBootMigrationStagedVerified = false;
  secureBootMigrationClearSensitiveState();
  resultOut = "COMMITTED REBOOT_REQUIRED";
  errorOut = "";
  return true;
}

bool abortSecureBootMigration(String& resultOut) {
  if (!secureBootMigrationActive) {
    resultOut = "NO_ACTIVE_MIGRATION";
    return false;
  }
  secureBootMigrationResetState(true);
  resultOut = "ABORTED";
  return true;
}

void serviceSecureBootMigrationTimeout() {
  if (!secureBootMigrationActive || secureBootMigrationLastActivityMs == 0) return;
  unsigned long timeout = secureBootMigrationStagedVerified
      ? BATMON_SBMIG_STAGED_TIMEOUT_MS
      : BATMON_SBMIG_TRANSFER_TIMEOUT_MS;
  if ((unsigned long)(millis() - secureBootMigrationLastActivityMs) < timeout) return;
  bool staged = secureBootMigrationStagedVerified;
  secureBootMigrationResetState(true);
  Serial.println(staged
      ? "BATMON1 ERR SBMIG_STAGED_CONFIRMATION_TIMEOUT"
      : "BATMON1 ERR SBMIG_TRANSFER_TIMEOUT");
}

#else

String secureBootMigrationCapabilitySummary() { return "UNAVAILABLE SECURE_BOOT_MIGRATION_BUILD_REQUIRED"; }
bool secureBootMigrationInProgress() { return false; }
bool secureBootMigrationRawBytesPending() { return false; }
size_t secureBootMigrationBytesWritten() { return 0; }
bool beginSecureBootMigration(const String&, const String&, const String&, String& errorOut) {
  errorOut = "SBMIG_UNAVAILABLE"; return false;
}
bool prepareSecureBootMigrationChunk(size_t, String& errorOut) {
  errorOut = "SBMIG_UNAVAILABLE"; return false;
}
void serviceSecureBootMigrationRawSerial() {}
bool finishSecureBootMigrationStaging(String&, String& errorOut) {
  errorOut = "SBMIG_UNAVAILABLE"; return false;
}
bool commitSecureBootMigration(const String&, String&, String& errorOut) {
  errorOut = "SBMIG_UNAVAILABLE"; return false;
}
bool abortSecureBootMigration(String& resultOut) {
  resultOut = "UNAVAILABLE"; return false;
}
void serviceSecureBootMigrationTimeout() {}

#endif
