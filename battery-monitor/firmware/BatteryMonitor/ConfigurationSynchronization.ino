// Cross-task synchronization for Battery Monitor configuration/network state.
//
// Device settings are shared by the Arduino application task, esp_http_server,
// and the Espressif provisioning event callback. Arduino String mutation and the
// shared Preferences handle in BatteryMonitorCore are not safe to use from those
// tasks concurrently, so every post-setup read/write of mutable configuration is
// serialized here. BatterySnapshot consumes copied configuration after releasing
// this mutex, which prevents config<->snapshot lock inversion.
//
// Scalar values used on hot/cross-task read paths are mirrored atomically so the
// main loop and HTTP status path do not take this mutex unnecessarily.

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <atomic>

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
static std::atomic<bool> configuredWifiPresent{false};
static std::atomic<uint32_t> cachedSampleIntervalSec{10};
static std::atomic<bool> publishedFallbackApActive{false};

bool initializeDeviceConfigSynchronization() {
  if (deviceConfigMutex != nullptr) return true;
  deviceConfigMutex = xSemaphoreCreateMutex();
  if (deviceConfigMutex == nullptr) {
    if (!deviceConfigSyncErrorReported) {
      deviceConfigSyncErrorReported = true;
      Serial.println("ERROR: Could not allocate configuration synchronization mutex; network configuration access is disabled.");
    }
    return false;
  }

  // setup() loads the globals before concurrent network services start, so this
  // initial publication is race-free. Subsequent changes are published below.
  configuredWifiPresent.store(wifiSsid.length() > 0, std::memory_order_release);
  cachedSampleIntervalSec.store(sampleIntervalSec, std::memory_order_release);
  publishedFallbackApActive.store(fallbackApActive, std::memory_order_release);
  return true;
}

static bool takeDeviceConfigMutex(TickType_t waitTicks = pdMS_TO_TICKS(1000)) {
  if (deviceConfigMutex == nullptr && !initializeDeviceConfigSynchronization()) return false;
  return xSemaphoreTake(deviceConfigMutex, waitTicks) == pdTRUE;
}

static void giveDeviceConfigMutex() {
  if (deviceConfigMutex != nullptr) xSemaphoreGive(deviceConfigMutex);
}

void publishFallbackApState(bool active) {
  // fallbackApActive itself is application-task-owned. HTTP readers consume the
  // atomic publication below, so there is no cross-core access to that raw bool.
  fallbackApActive = active;
  publishedFallbackApActive.store(active, std::memory_order_release);
}

bool synchronizedFallbackApActive() {
  return publishedFallbackApActive.load(std::memory_order_acquire);
}

String localIpString() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  if (synchronizedFallbackApActive()) return WiFi.softAPIP().toString();
  return "0.0.0.0";
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
  if (deviceConfigMutex == nullptr && !initializeDeviceConfigSynchronization()) return false;
  return configuredWifiPresent.load(std::memory_order_acquire);
}

uint32_t synchronizedSampleIntervalSec() {
  if (deviceConfigMutex == nullptr && !initializeDeviceConfigSynchronization()) return 10;
  return cachedSampleIntervalSec.load(std::memory_order_acquire);
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
  cachedSampleIntervalSec.store(sampleIntervalSec, std::memory_order_release);
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
  cachedSampleIntervalSec.store(sampleIntervalSec, std::memory_order_release);
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
  cachedSampleIntervalSec.store(sampleIntervalSec, std::memory_order_release);
  giveDeviceConfigMutex();
}

void saveWifiSettings(const String& ssid, const String& pass) {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be saved because configuration synchronization is unavailable.");
    return;
  }
  saveWifiSettingsUnlocked(ssid, pass);
  configuredWifiPresent.store(wifiSsid.length() > 0, std::memory_order_release);
  giveDeviceConfigMutex();
}

void clearWifiSettings() {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be cleared because configuration synchronization is unavailable.");
    return;
  }
  clearWifiSettingsUnlocked();
  configuredWifiPresent.store(false, std::memory_order_release);
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