idf_component_register(
    SRCS "migration_guard.c"
    REQUIRES bootloader_support esp_rom
)

# bootloader_hooks_include() in migration_guard.c forces this component into
# the bootloader link even though ESP-IDF declares the hook itself as weak.
