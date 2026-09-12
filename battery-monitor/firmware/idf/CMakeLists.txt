cmake_minimum_required(VERSION 3.16)

# Battery Monitor has one authoritative firmware architecture:
# ESP-IDF + Arduino-ESP32 as a managed component.
#
# Application behavior remains in ../BatteryMonitor/*.ino so the firmware is
# still easy to inspect as ordinary Arduino/C++ source. ESP-IDF owns the
# official build, partitioning and security configuration.
#
# Normal production builds use sdkconfig.defaults + version.txt. The Factory
# Secure Boot retrofit build intentionally reuses this exact source tree while
# supplying an additional sdkconfig defaults overlay and a separate monotonically
# newer migration version file through environment variables. This keeps the
# retrofit candidate isolated without creating a second firmware implementation.
if(DEFINED ENV{BATMON_SDKCONFIG_DEFAULTS} AND NOT "$ENV{BATMON_SDKCONFIG_DEFAULTS}" STREQUAL "")
  set(SDKCONFIG_DEFAULTS "$ENV{BATMON_SDKCONFIG_DEFAULTS}")
else()
  set(SDKCONFIG_DEFAULTS "sdkconfig.defaults")
endif()

if(DEFINED ENV{BATMON_VERSION_FILE} AND NOT "$ENV{BATMON_VERSION_FILE}" STREQUAL "")
  set(BATMON_VERSION_FILE "$ENV{BATMON_VERSION_FILE}")
else()
  set(BATMON_VERSION_FILE "${CMAKE_CURRENT_LIST_DIR}/version.txt")
endif()
if(NOT IS_ABSOLUTE "${BATMON_VERSION_FILE}")
  set(BATMON_VERSION_FILE "${CMAKE_CURRENT_LIST_DIR}/${BATMON_VERSION_FILE}")
endif()

# User-facing Battery Monitor versions use exactly three single-digit numeric
# components: major.minor.patch. No component may become two digits; carry to
# the next component instead (for example 0.1.9 -> 0.2.0).
#
# The software anti-downgrade sequence is derived from those digits as
# major*100 + minor*10 + patch. This preserves the existing monotonic sequence
# values (0.1.1 -> 11, 0.1.2 -> 12) without exposing a fourth version field.
file(STRINGS "${BATMON_VERSION_FILE}" BATMON_APP_VERSION LIMIT_COUNT 1)
string(STRIP "${BATMON_APP_VERSION}" BATMON_APP_VERSION)
if(NOT BATMON_APP_VERSION MATCHES "^[0-9]\\.[0-9]\\.[0-9]$")
  message(FATAL_ERROR "Battery Monitor version must use exactly three single-digit numeric components: major.minor.patch")
endif()
message(STATUS "Battery Monitor authoritative app version: ${BATMON_APP_VERSION}")
message(STATUS "Battery Monitor version authority file: ${BATMON_VERSION_FILE}")
message(STATUS "Battery Monitor sdkconfig defaults: ${SDKCONFIG_DEFAULTS}")

# ESP-IDF gives a top-level version.txt precedence over project(... VERSION ...).
# Set PROJECT_VER explicitly before project.cmake so the selected authority file
# also controls esp_app_desc_t.version. Normal builds still select version.txt;
# the isolated migration build selects version-secure-boot-migration.txt.
set(PROJECT_VER "${BATMON_APP_VERSION}")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(BatteryMonitor VERSION ${BATMON_APP_VERSION})
