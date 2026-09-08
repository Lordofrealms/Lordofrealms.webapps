cmake_minimum_required(VERSION 3.16)

# Battery Monitor has one authoritative firmware architecture:
# ESP-IDF + Arduino-ESP32 as a managed component.
#
# Application behavior remains in ../BatteryMonitor/*.ino so the firmware is
# still easy to inspect as ordinary Arduino/C++ source. ESP-IDF owns the
# official build, partitioning and security configuration.

set(SDKCONFIG_DEFAULTS "sdkconfig.defaults")

# Production app versions use four numeric components:
#   major.minor.patch.release_sequence
# The fourth component is a monotonic software anti-downgrade sequence. It must
# never be reset or reused for a different production release. The firmware
# persists the highest accepted sequence in encrypted NVS and rejects signed
# candidates whose sequence is not strictly newer.
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/version.txt" BATMON_APP_VERSION LIMIT_COUNT 1)
string(STRIP "${BATMON_APP_VERSION}" BATMON_APP_VERSION)
if(NOT BATMON_APP_VERSION MATCHES "^[0-9]+\\.[0-9]+\\.[0-9]+\\.[1-9][0-9]*$")
  message(FATAL_ERROR "Battery Monitor version.txt must be major.minor.patch.release_sequence with a positive monotonic release sequence")
endif()
message(STATUS "Battery Monitor authoritative app version: ${BATMON_APP_VERSION}")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(BatteryMonitor VERSION ${BATMON_APP_VERSION})
