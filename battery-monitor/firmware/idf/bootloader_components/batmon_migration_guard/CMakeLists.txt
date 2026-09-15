idf_component_register(
    SRCS "migration_guard.c"
    REQUIRES bootloader_support esp_rom
    PRIV_REQUIRES hal
)

# esp_flash_encrypt.h directly includes hal/efuse_ll.h. bootloader_support uses
# hal privately, so this guard must declare hal itself to compile against that
# public bootloader-support header.
#
# bootloader_hooks_include() in migration_guard.c forces this component into
# the bootloader link even though ESP-IDF declares the hook itself as weak.
