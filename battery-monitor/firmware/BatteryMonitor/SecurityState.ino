// Read-only production security-state reporting for trusted physical USB.
// This intentionally reports actual eFuse/runtime state rather than only the
// build-time security configuration so factory provisioning can prove that the
// irreversible first-boot transition actually happened before labeling a unit.

#include <esp_flash_encrypt.h>
#include <esp_secure_boot.h>

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
  return reply;
}
