#include "esp_flash_encrypt.h"
#include "esp_rom_sys.h"
#include "sdkconfig.h"

/*
 * Factory-only Secure Boot retrofit guard.
 *
 * ESP-IDF 5.5.5 only exposes CONFIG_SECURE_FLASH_REQUIRE_ALREADY_ENABLED in
 * Flash Encryption DEVELOPMENT mode, so it cannot be used by this RELEASE-mode
 * migration build. This hook runs after bootloader hardware/eFuse init but
 * before partition selection and before Secure Boot v2 can permanently enable
 * itself while loading the application.
 *
 * Normal Battery Monitor builds have Secure Boot v2 disabled, so the guard is
 * compiled as a no-op there.
 */
void bootloader_hooks_include(void)
{
}

void bootloader_after_init(void)
{
#if defined(CONFIG_SECURE_BOOT_V2_ENABLED) && defined(CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE)
    if (esp_get_flash_encryption_mode() != ESP_FLASH_ENC_MODE_RELEASE) {
        esp_rom_printf("Battery Monitor migration requires pre-existing release-mode Flash Encryption; refusing before Secure Boot activation.\n");
        esp_rom_delay_us(100000);
        esp_rom_software_reset_system();
        for (;;) {
            /* esp_rom_software_reset_system() should not return. */
        }
    }
#endif
}
