// Battery Monitor authoritative application translation unit.
//
// The user-facing application source remains in ../BatteryMonitor as ordinary
// Arduino-style .ino files. ESP-IDF compiles this wrapper, which includes the
// sketch tabs in the same order Arduino's sketch preprocessor used. This keeps
// one application source authority while giving the official build full
// ESP-IDF sdkconfig/security control.

#include <Arduino.h>
#include <esp_ota_ops.h>

// The Arduino sketch preprocessor normally synthesizes cross-tab function
// prototypes before compiling .ino files. ESP-IDF compiles this wrapper as
// ordinary C++, so declare only the helpers that are referenced before the tab
// containing their implementation is included. Implementations remain solely
// in the existing production .ino runtime.
static String percentEncode(const String& value);
String trustedUsbMonitoringIdentityKeyHex();
bool verifyDevicePasswordFlexible(const String& candidate);
bool setDevicePasswordFlexible(const String& usernameValue, const String& password, String& errorOut);
void serviceSerialProvisioning();
bool firmwareUpdateInProgress();
void serviceFirmwareUpdateTimeout();
bool initializeFirmwareReleasePolicy(String& errorOut);
bool commitRunningFirmwareReleaseFloor(String& errorOut);
esp_err_t batteryMonitorPolicySetBootPartition(const esp_partition_t* partition);

#include "../../BatteryMonitor/WifiRadioSettings.ino"
#include "../../BatteryMonitor/BatteryMonitor.ino"
#include "../../BatteryMonitor/WebServerTask.ino"
#include "../../BatteryMonitor/SecureProvisioning.ino"
#include "../../BatteryMonitor/FirmwareReleasePolicy.ino"

// Keep FirmwareUpdate.ino's signed-transfer implementation unchanged and add
// the monotonic release-sequence policy only at its final boot-selection call.
// esp_ota_ops.h has already been included above, so this macro affects the call
// site in FirmwareUpdate.ino rather than the ESP-IDF declaration itself.
#define esp_ota_set_boot_partition batteryMonitorPolicySetBootPartition
#include "../../BatteryMonitor/FirmwareUpdate.ino"
#undef esp_ota_set_boot_partition

#include "../../BatteryMonitor/WifiFirmwareUpdate.ino"
#include "../../BatteryMonitor/SerialProvisioning.ino"
#include "../../BatteryMonitor/YManagementAuthPrototypes.ino"
#include "../../BatteryMonitor/ZManagementAuth.ino"
#include "../../BatteryMonitor/ZZMonitorIdentity.ino"
#include "../../BatteryMonitor/ZZZTrustedUsbIdentity.ino"
