cmake_minimum_required(VERSION 3.16)

# Battery Monitor has one authoritative firmware architecture:
# ESP-IDF + Arduino-ESP32 as a managed component.
#
# Application behavior remains in ../BatteryMonitor/*.ino so the firmware is
# still easy to inspect as ordinary Arduino/C++ source. ESP-IDF owns the
# official build, partitioning and security configuration.

set(SDKCONFIG_DEFAULTS "sdkconfig.defaults")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(BatteryMonitor)
