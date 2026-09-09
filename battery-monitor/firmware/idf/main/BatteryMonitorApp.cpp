// Battery Monitor authoritative ESP-IDF application translation unit.
//
// ESP-IDF is the sole production build architecture. Arduino compatibility is
// retained only for selected hardware/network utility classes; HTTP is native
// esp_http_server. No Arduino WebServer module is part of this include chain.

#include <Arduino.h>
#include <esp_ota_ops.h>

// Cross-module declarations required before their implementation is included.
static String percentEncode(const String& value);
String trustedUsbMonitoringIdentityKeyHex();
bool verifyDevicePasswordFlexible(const String& candidate);
bool setDevicePasswordFlexible(const String& usernameValue, const String& password, String& errorOut);
void serviceSerialProvisioning();
void startFallbackAp();
void stopNativeHttpServer();
bool firmwareUpdateInProgress();
void serviceFirmwareUpdateTimeout();
bool initializeFirmwareReleasePolicy(String& errorOut);
bool commitRunningFirmwareReleaseFloor(String& errorOut);
esp_err_t batteryMonitorPolicySetBootPartition(const esp_partition_t* partition);

#include "../../BatteryMonitor/WifiRadioSettings.ino"
#include "../../BatteryMonitor/BatteryMonitorCore.ino"
#include "../../BatteryMonitor/SecureProvisioning.ino"
#include "../../BatteryMonitor/ManagementSecurityCore.ino"
#include "../../BatteryMonitor/MonitoringIdentityCore.ino"
#include "../../BatteryMonitor/BatterySnapshot.ino"
#include "../../BatteryMonitor/FirmwareReleasePolicy.ino"

// Signed-update implementation remains transport-neutral. The release policy is
// injected only at the final OTA boot-selection call.
#define esp_ota_set_boot_partition batteryMonitorPolicySetBootPartition
#include "../../BatteryMonitor/FirmwareUpdate.ino"
#undef esp_ota_set_boot_partition

// USB calibration publishes through the same coherent snapshot path as the
// periodic sampler. It never updates an independent set of measurement fields.
#define sampleBattery sampleBatterySnapshot
#include "../../BatteryMonitor/SerialProvisioning.ino"
#undef sampleBattery

#include "../../BatteryMonitor/ZZZTrustedUsbIdentity.ino"
#include "../../BatteryMonitor/NativeHttpServer.ino"

// setup()/loop() are included last so the runtime sees every service primitive
// above, while SerialProvisioning can still call the forward-declared
// startFallbackAp() implemented here.
#include "../../BatteryMonitor/BatteryMonitor.ino"
