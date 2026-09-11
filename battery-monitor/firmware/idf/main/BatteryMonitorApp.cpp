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
#include "../../BatteryMonitor/HttpRuntimeSettings.ino"

// BatteryMonitorCore owns the single persistence/UI implementations. Rename the
// mutable configuration entry points while including it, then expose the normal
// names through ConfigurationSynchronization.ino so HTTP, USB, provisioning
// callbacks, discovery, and the sampler never race Arduino Strings or the
// shared Preferences handle.
#define saveDeviceSettings saveDeviceSettingsUnlocked
#define saveWifiSettings saveWifiSettingsUnlocked
#define clearWifiSettings clearWifiSettingsUnlocked
#define configJson configJsonUnlocked
#define statusTextForVoltage statusTextForVoltageUnlocked
#define startMdns startMdnsUnlocked
#include "../../BatteryMonitor/BatteryMonitorCore.ino"
#undef startMdns
#undef statusTextForVoltage
#undef configJson
#undef clearWifiSettings
#undef saveWifiSettings
#undef saveDeviceSettings
#include "../../BatteryMonitor/ConfigurationSynchronization.ino"

#include "../../BatteryMonitor/SecureProvisioning.ino"
#include "../../BatteryMonitor/ManagementSecurityCore.ino"
#include "../../BatteryMonitor/MonitoringIdentityCore.ino"
#include "../../BatteryMonitor/HttpDiagnostics.ino"
#include "../../BatteryMonitor/NetworkSnapshot.ino"
#include "../../BatteryMonitor/BatterySnapshot.ino"
#include "../../BatteryMonitor/FirmwareReleasePolicy.ino"
#include "../../BatteryMonitor/SecurityState.ino"

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

// Client-side roaming is layered above the synchronized OTA/configuration
// primitives. It uses background RSSI scans only; no 802.11k/v/r assistance is
// enabled or required.
#include "../../BatteryMonitor/WifiRoaming.ino"

#include "../../BatteryMonitor/ZZZTrustedUsbIdentity.ino"

// NativeHttpServer.ino remains the single parser/route implementation. Interpose
// two native-transport hooks while it is included:
//  - httpd_start receives the persisted runtime client-session limit;
//  - ordinary httpd_resp_send responses receive the route-appropriate TCP send
//    buffer. The synchronized root route uses chunked output and applies its
//    configured send buffer directly before the first chunk.
static esp_err_t batteryMonitorHttpdStartRuntime(httpd_handle_t* handle,
                                                 const httpd_config_t* config) {
  loadHttpRuntimeSettings();
  httpd_config_t adjusted = *config;
  adjusted.max_open_sockets = httpRuntimeMaxClients();
  return httpd_start(handle, &adjusted);
}

static esp_err_t batteryMonitorHttpdRespSendRuntime(httpd_req_t* req,
                                                    const char* buffer,
                                                    ssize_t length) {
  httpRuntimeApplySendBufferForRequest(req);
  return httpd_resp_send(req, buffer, length);
}

// Keep NativeHttpServer.ino as the single parser/route implementation, but
// interpose synchronized replacements for cross-task configuration and deferred
// control routes. Both start and stop are renamed while the core is included:
// the public stop wrapper terminates the HTTP task before invalidating sessions,
// so no authenticated write can survive into the short route-replacement phase
// of a later restart.
#define httpd_start batteryMonitorHttpdStartRuntime
#define httpd_resp_send batteryMonitorHttpdRespSendRuntime
#define startNativeHttpServer startNativeHttpServerCore
#define stopNativeHttpServer stopNativeHttpServerCore
#include "../../BatteryMonitor/NativeHttpServer.ino"
#undef stopNativeHttpServer
#undef startNativeHttpServer
#undef httpd_resp_send
#undef httpd_start
#include "../../BatteryMonitor/NativeHttpSynchronization.ino"
#include "../../BatteryMonitor/NetworkSnapshotControl.ino"
#include "../../BatteryMonitor/TrustedUsbSecuritySynchronization.ino"

// Serial provisioning is the trusted physical transport. Keep its protocol
// implementation untouched, rename only its top-level byte-pump/event entry
// points, then add a thin router that intercepts engineering-only HTTPTRACE and
// HTTP transport-setting commands before delegating normal commands unchanged.
#define setDevicePasswordFlexible setDevicePasswordFlexibleTrustedUsb
#define clearProvisioningIdentity clearProvisioningIdentityTrustedUsb
#define provisioningIdentitySummary provisioningIdentitySummaryTrustedUsb
#define sampleBattery sampleBatterySnapshot
#define serviceSerialProvisioning serviceSerialProvisioningCore
#define serialEvent serialEventCore
#include "../../BatteryMonitor/SerialProvisioning.ino"
#undef serialEvent
#undef serviceSerialProvisioning
#undef sampleBattery
#undef provisioningIdentitySummary
#undef clearProvisioningIdentity
#undef setDevicePasswordFlexible
#include "../../BatteryMonitor/HttpDiagnosticsSerialRouter.ino"

// setup()/loop() are included last so the runtime sees every service primitive
// above. Network source acquisition also stays on the main task; HTTP only reads
// the published network snapshot.
#define startNativeHttpServer startNativeHttpServerWithNetworkSnapshot
#define serviceNativeHttpControl serviceNativeHttpControlWithNetworkSnapshot
#include "../../BatteryMonitor/BatteryMonitor.ino"
#undef serviceNativeHttpControl
#undef startNativeHttpServer
