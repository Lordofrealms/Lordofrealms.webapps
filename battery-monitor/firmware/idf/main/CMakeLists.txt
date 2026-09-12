execute_process(
    COMMAND python3 "${CMAKE_CURRENT_LIST_DIR}/../check_native_http_authority.py"
    RESULT_VARIABLE BATMON_NATIVE_HTTP_GUARD_RESULT
    OUTPUT_VARIABLE BATMON_NATIVE_HTTP_GUARD_OUTPUT
    ERROR_VARIABLE BATMON_NATIVE_HTTP_GUARD_ERROR
)
if(NOT BATMON_NATIVE_HTTP_GUARD_RESULT EQUAL 0)
    message(FATAL_ERROR
        "Battery Monitor native HTTP architecture guard failed:\n"
        "${BATMON_NATIVE_HTTP_GUARD_OUTPUT}${BATMON_NATIVE_HTTP_GUARD_ERROR}"
    )
endif()
message(STATUS "${BATMON_NATIVE_HTTP_GUARD_OUTPUT}")

idf_component_register(
    SRCS "BatteryMonitorApp.cpp"
    INCLUDE_DIRS "."
    REQUIRES
        arduino-esp32
        app_update
        efuse
        esp_http_server
        mbedtls
)
