// Read-only production security-state reporting for trusted physical USB.
// This intentionally reports actual eFuse/runtime state rather than only the
// build-time security configuration so factory provisioning can prove that the
// irreversible first-boot transition actually happened before labeling a unit.

#include <esp_flash_encrypt.h>
#include <esp_secure_boot.h>
#include <esp_efuse.h>
#include <esp_efuse_table.h>

static const char* batteryMonitorFlashEncryptionModeName() {
  switch (esp_get_flash_encryption_mode()) {
    case ESP_FLASH_ENC_MODE_DISABLED: return "disabled";
    case ESP_FLASH_ENC_MODE_DEVELOPMENT: return "development";
    case ESP_FLASH_ENC_MODE_RELEASE: return "release";
    default: return "unknown";
  }
}

String trustedUsbSecurityStateSummary() {
  uint32_t releaseSequence = 0;
  String releaseError;
  bool releaseSequenceValid = batteryMonitorRunningReleaseSequence(releaseSequence, releaseError);

  // Classic ESP32 Secure Boot v2 can only use its dedicated BLK2 digest block
  // when the global coding scheme resolves to NONE and that block is truly
  // unused/unprotected. Report these prerequisites even in the normal
  // Secure-Boot-disabled firmware so Factory can reject an incompatible unit
  // before installing the monotonic migration release.
  esp_efuse_coding_scheme_t sbv2CodingScheme = esp_efuse_get_coding_scheme(EFUSE_BLK_SECURE_BOOT);
  bool sbv2KeyBlockUnused = esp_efuse_key_block_unused(EFUSE_BLK_SECURE_BOOT);
  bool sbv2EfuseEligible =
      sbv2CodingScheme == EFUSE_CODING_SCHEME_NONE && sbv2KeyBlockUnused;

  String reply = "SECURITYINFO ";
  reply += "flash_encryption=";
  reply += esp_flash_encryption_enabled() ? "1" : "0";
  reply += " flash_mode=";
  reply += batteryMonitorFlashEncryptionModeName();
  reply += " secure_boot=";
  reply += esp_secure_boot_enabled() ? "1" : "0";
  reply += " firmware=";
  reply += String(FW_VERSION);
  reply += " release_sequence=";
  reply += releaseSequenceValid ? String(releaseSequence) : "0";
  reply += " sbv2_coding_scheme=";
  reply += String((int)sbv2CodingScheme);
  reply += " sbv2_key_block_unused=";
  reply += sbv2KeyBlockUnused ? "1" : "0";
  reply += " sbv2_efuse_eligible=";
  reply += sbv2EfuseEligible ? "1" : "0";
  return reply;
}
