idf_component_register(
    SRCS "BatteryMonitorApp.cpp"
    INCLUDE_DIRS "."
    REQUIRES
        arduino-esp32
        app_update
        esp_http_server
        mbedtls
)
