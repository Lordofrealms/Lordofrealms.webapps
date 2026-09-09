// Cross-task synchronization for Battery Monitor configuration state.
//
// Device settings are shared by the Arduino application task, esp_http_server,
// and the Espressif provisioning event callback. Arduino String mutation and the
// shared Preferences handle in BatteryMonitorCore are not safe to use from those
// tasks concurrently, so every post-setup read/write of mutable configuration is
// serialized here. BatterySnapshot consumes copied configuration after releasing
// this mutex, which prevents config<->snapshot lock inversion.

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

void refreshBatterySnapshotConfiguration();

struct DeviceConfigState {
  String deviceName;
  String batteryType;
  String wifiSsid;
  String wifiPassword;
  float lowVoltage;
  float criticalVoltage;
  float calibrationFactor;
  float calibrationOffset;
  uint32_t sampleIntervalSec;
};

static SemaphoreHandle_t deviceConfigMutex = nullptr;
static bool deviceConfigSyncErrorReported = false;

bool initializeDeviceConfigSynchronization() {
  if (deviceConfigMutex != nullptr) return true;
  deviceConfigMutex = xSemaphoreCreateMutex();
  if (deviceConfigMutex == nullptr && !deviceConfigSyncErrorReported) {
    deviceConfigSyncErrorReported = true;
    Serial.println("ERROR: Could not allocate configuration synchronization mutex; network configuration access is disabled.");
  }
  return deviceConfigMutex != nullptr;
}

static bool takeDeviceConfigMutex(TickType_t waitTicks = pdMS_TO_TICKS(1000)) {
  if (deviceConfigMutex == nullptr && !initializeDeviceConfigSynchronization()) return false;
  return xSemaphoreTake(deviceConfigMutex, waitTicks) == pdTRUE;
}

static void giveDeviceConfigMutex() {
  if (deviceConfigMutex != nullptr) xSemaphoreGive(deviceConfigMutex);
}

bool copyDeviceConfigState(DeviceConfigState& out) {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(100))) return false;
  out.deviceName = deviceName;
  out.batteryType = batteryType;
  out.wifiSsid = wifiSsid;
  out.wifiPassword = wifiPassword;
  out.lowVoltage = lowVoltage;
  out.criticalVoltage = criticalVoltage;
  out.calibrationFactor = calibrationFactor;
  out.calibrationOffset = calibrationOffset;
  out.sampleIntervalSec = sampleIntervalSec;
  giveDeviceConfigMutex();
  return true;
}

bool copyConfiguredWifi(String& ssidOut, String& passwordOut) {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(100))) return false;
  ssidOut = wifiSsid;
  passwordOut = wifiPassword;
  giveDeviceConfigMutex();
  return true;
}

bool hasConfiguredWifi() {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(100))) return false;
  bool configured = wifiSsid.length() > 0;
  giveDeviceConfigMutex();
  return configured;
}

uint32_t synchronizedSampleIntervalSec() {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(100))) return 10;
  uint32_t value = sampleIntervalSec;
  giveDeviceConfigMutex();
  return value;
}

bool applyDeviceConfiguration(const String& newName,
                              const String& newBatteryType,
                              float newLowVoltage,
                              float newCriticalVoltage,
                              float newCalibrationFactor,
                              float newCalibrationOffset,
                              uint32_t newSampleIntervalSec,
                              String& errorOut) {
  if (!takeDeviceConfigMutex()) {
    errorOut = "CONFIG_SYNC_UNAVAILABLE";
    return false;
  }
  deviceName = newName;
  batteryType = newBatteryType;
  lowVoltage = newLowVoltage;
  criticalVoltage = newCriticalVoltage;
  calibrationFactor = newCalibrationFactor;
  calibrationOffset = newCalibrationOffset;
  sampleIntervalSec = newSampleIntervalSec;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

bool setDeviceNameSynchronized(const String& newName, String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  deviceName = newName;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
  errorOut = "";
  return true;
}

bool setBatterySettingsSynchronized(const String& newBatteryType,
                                    float newLowVoltage,
                                    float newCriticalVoltage,
                                    String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  batteryType = newBatteryType;
  lowVoltage = newLowVoltage;
  criticalVoltage = newCriticalVoltage;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

bool setSampleIntervalSynchronized(uint32_t newSampleIntervalSec, String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  sampleIntervalSec = newSampleIntervalSec;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

bool setCalibrationSynchronized(float newCalibrationFactor,
                                float newCalibrationOffset,
                                String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  calibrationFactor = newCalibrationFactor;
  calibrationOffset = newCalibrationOffset;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

// Compatibility wrappers around the original BatteryMonitorCore persistence/UI
// functions. Those implementations are renamed to *Unlocked at include time.
void saveDeviceSettings() {
  if (!takeDeviceConfigMutex()) return;
  saveDeviceSettingsUnlocked();
  giveDeviceConfigMutex();
}

void saveWifiSettings(const String& ssid, const String& pass) {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be saved because configuration synchronization is unavailable.");
    return;
  }
  saveWifiSettingsUnlocked(ssid, pass);
  giveDeviceConfigMutex();
}

void clearWifiSettings() {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be cleared because configuration synchronization is unavailable.");
    return;
  }
  clearWifiSettingsUnlocked();
  giveDeviceConfigMutex();
}

String configJson() {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(250))) return "{\"error\":\"configuration unavailable\"}";
  String result = configJsonUnlocked();
  giveDeviceConfigMutex();
  return result;
}

String statusTextForVoltage(float voltage) {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(100))) return "unknown";
  String result = statusTextForVoltageUnlocked(voltage);
  giveDeviceConfigMutex();
  return result;
}

void startMdns() {
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(250))) return;
  startMdnsUnlocked();
  giveDeviceConfigMutex();
}
