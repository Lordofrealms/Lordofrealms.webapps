// Battery Monitor authoritative application translation unit.
//
// ESP-IDF is the sole production build architecture. The historical Arduino
// sketch tabs remain application-source modules, but the production HTTP
// transport is native esp_http_server and battery measurement publication uses
// a coherent cached snapshot.

#include <Arduino.h>
#include <esp_ota_ops.h>

// Arduino's sketch preprocessor normally synthesizes cross-tab prototypes.
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
#include "../../BatteryMonitor/BatterySnapshot.ino"
#include "../../BatteryMonitor/SecureProvisioning.ino"
#include "../../BatteryMonitor/FirmwareReleasePolicy.ino"

// Keep FirmwareUpdate.ino's signed-transfer implementation unchanged and add
// the monotonic release-sequence policy only at its final boot-selection call.
#define esp_ota_set_boot_partition batteryMonitorPolicySetBootPartition
#include "../../BatteryMonitor/FirmwareUpdate.ino"
#undef esp_ota_set_boot_partition

// USB CAL must publish through the same coherent snapshot path as periodic ADC
// sampling rather than invoking the historical direct-global sampler.
#define sampleBattery sampleBatterySnapshot
#include "../../BatteryMonitor/SerialProvisioning.ino"
#undef sampleBattery

#include "../../BatteryMonitor/YManagementAuthPrototypes.ino"
#include "../../BatteryMonitor/ZManagementAuth.ino"
#include "../../BatteryMonitor/ZZMonitorIdentity.ino"
#include "../../BatteryMonitor/ZZZTrustedUsbIdentity.ino"

// Native HTTP is included last so its transport adapters can reuse the existing
// static management/monitoring cryptographic primitives in this same translation
// unit without duplicating or weakening the security protocol.
#include "../../BatteryMonitor/NativeHttpServer.ino"
