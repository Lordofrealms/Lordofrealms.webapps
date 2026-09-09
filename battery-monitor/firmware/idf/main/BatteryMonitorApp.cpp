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

// FirmwareUpdate.ino remains the one verifier/writer implementation. Rename its
// cross-task entry points while including it, then expose synchronized wrappers
// with the original API names. This prevents trusted USB and native LAN HTTP
// from racing the same OTA handle/SHA state while leaving cryptographic policy
// in exactly one implementation.
#define esp_ota_set_boot_partition batteryMonitorPolicySetBootPartition
#define firmwareUpdateInProgress firmwareUpdateInProgressUnlocked
#define firmwareUpdateIsLanTransport firmwareUpdateIsLanTransportUnlocked
#define firmwareUpdateRawBytesPending firmwareUpdateRawBytesPendingUnlocked
#define firmwareUpdateBytesWritten firmwareUpdateBytesWrittenUnlocked
#define beginSignedFirmwareUpdate beginSignedFirmwareUpdateUnlocked
#define beginSignedFirmwareUpdateLan beginSignedFirmwareUpdateLanUnlocked
#define prepareSignedFirmwareChunk prepareSignedFirmwareChunkUnlocked
#define writeSignedFirmwareLanChunk writeSignedFirmwareLanChunkUnlocked
#define serviceSignedFirmwareRawSerial serviceSignedFirmwareRawSerialUnlocked
#define finishSignedFirmwareUpdate finishSignedFirmwareUpdateUnlocked
#define finishSignedFirmwareUpdateLan finishSignedFirmwareUpdateLanUnlocked
#define abortSignedFirmwareUpdate abortSignedFirmwareUpdateUnlocked
#define abortSignedFirmwareUpdateLan abortSignedFirmwareUpdateLanUnlocked
#define serviceFirmwareUpdateTimeout serviceFirmwareUpdateTimeoutUnlocked
#include "../../BatteryMonitor/FirmwareUpdate.ino"
#undef serviceFirmwareUpdateTimeout
#undef abortSignedFirmwareUpdateLan
#undef abortSignedFirmwareUpdate
#undef finishSignedFirmwareUpdateLan
#undef finishSignedFirmwareUpdate
#undef serviceSignedFirmwareRawSerial
#undef writeSignedFirmwareLanChunk
#undef prepareSignedFirmwareChunk
#undef beginSignedFirmwareUpdateLan
#undef beginSignedFirmwareUpdate
#undef firmwareUpdateBytesWritten
#undef firmwareUpdateRawBytesPending
#undef firmwareUpdateIsLanTransport
#undef firmwareUpdateInProgress
#undef esp_ota_set_boot_partition
#include "../../BatteryMonitor/FirmwareUpdateSynchronization.ino"

// USB calibration publishes through the same coherent snapshot path as the
// periodic sampler. It never updates an independent set of measurement fields.
#define sampleBattery sampleBatterySnapshot
#include "../../BatteryMonitor/SerialProvisioning.ino"
#undef sampleBattery

#include "../../BatteryMonitor/ZZZTrustedUsbIdentity.ino"
#include "../../BatteryMonitor/NativeHttpServer.ino"
#include "../../BatteryMonitor/NativeHttpMainControl.ino"

// setup()/loop() are included last so the runtime sees every service primitive
// above. Remap only the main-loop control service: management session expiry
// remains owned by the native HTTP task rather than being mutated by both cores.
#define serviceNativeHttpControl serviceNativeHttpControlMainSafe
#include "../../BatteryMonitor/BatteryMonitor.ino"
#undef serviceNativeHttpControl
