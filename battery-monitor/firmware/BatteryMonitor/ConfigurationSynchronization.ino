// Cross-task synchronization for Battery Monitor configuration state.
//
// Mutable configuration is authoritative in the application globals and is
// serialized by deviceConfigMutex while it is changed/persisted. Readers do not
// wait on that writer/NVS mutex: every successful write publishes a coherent RAM
// snapshot behind publishedConfigMutex. HTTP, discovery, reconnect logic, and
// the battery sampler consume only that published snapshot.
//
// This mirrors the BatterySnapshot architecture: slow persistence never blocks
// status/config reads, and readers never trigger NVS I/O.

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
static SemaphoreHandle_t publishedConfigMutex = nullptr;
static bool deviceConfigSyncErrorReported = false;
static bool publishedConfigReady = false;
static DeviceConfigState publishedConfig = {};
static String publishedConfigJson;
static std::atomic<bool> configuredWifiPresent{false};
static std::atomic<uint32_t> cachedSampleIntervalSec{10};

static String buildPublishedConfigJson(const DeviceConfigState& state) {
  String json = "{";
  json += "\"apiVersion\":" + String(API_VERSION) + ",";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"name\":\"" + jsonEscape(state.deviceName) + "\",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"batteryType\":\"" + jsonEscape(state.batteryType) + "\",";
  json += "\"lowVoltage\":" + String(state.lowVoltage, 3) + ",";
  json += "\"criticalVoltage\":" + String(state.criticalVoltage, 3) + ",";
  json += "\"calibrationFactor\":" + String(state.calibrationFactor, 6) + ",";
  json += "\"calibrationOffset\":" + String(state.calibrationOffset, 4) + ",";
  json += "\"sampleIntervalSec\":" + String(state.sampleIntervalSec) + ",";
  json += "\"configuredSsid\":\"" + jsonEscape(state.wifiSsid) + "\"";
  json += "}";
  return json;
}

static DeviceConfigState captureConfigGlobalsUnlocked() {
  DeviceConfigState state = {};
  state.deviceName = deviceName;
  state.batteryType = batteryType;
  state.wifiSsid = wifiSsid;
  state.wifiPassword = wifiPassword;
  state.lowVoltage = lowVoltage;
  state.criticalVoltage = criticalVoltage;
  state.calibrationFactor = calibrationFactor;
  state.calibrationOffset = calibrationOffset;
  state.sampleIntervalSec = sampleIntervalSec;
  return state;
}

static bool publishConfigState(const DeviceConfigState& state) {
  if (publishedConfigMutex == nullptr) return false;
  String json = buildPublishedConfigJson(state);
  if (xSemaphoreTake(publishedConfigMutex, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  publishedConfig = state;
  publishedConfigJson = json;
  publishedConfigReady = true;
  xSemaphoreGive(publishedConfigMutex);
  configuredWifiPresent.store(state.wifiSsid.length() > 0, std::memory_order_release);
  cachedSampleIntervalSec.store(state.sampleIntervalSec, std::memory_order_release);
  return true;
}

bool initializeDeviceConfigSynchronization() {
  if (deviceConfigMutex != nullptr && publishedConfigMutex != nullptr) return true;

  if (deviceConfigMutex == nullptr) deviceConfigMutex = xSemaphoreCreateMutex();
  if (publishedConfigMutex == nullptr) publishedConfigMutex = xSemaphoreCreateMutex();
  if (deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) {
    if (!deviceConfigSyncErrorReported) {
      deviceConfigSyncErrorReported = true;
      Serial.println("ERROR: Could not allocate configuration synchronization mutexes; network configuration access is disabled.");
    }
    return false;
  }

  // setup() loads globals before any concurrent network service starts.
  DeviceConfigState initial = captureConfigGlobalsUnlocked();
  return publishConfigState(initial);
}

static bool takeDeviceConfigMutex(TickType_t waitTicks = pdMS_TO_TICKS(1000)) {
  if ((deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) &&
      !initializeDeviceConfigSynchronization()) return false;
  return xSemaphoreTake(deviceConfigMutex, waitTicks) == pdTRUE;
}

static void giveDeviceConfigMutex() {
  if (deviceConfigMutex != nullptr) xSemaphoreGive(deviceConfigMutex);
}

bool copyDeviceConfigState(DeviceConfigState& out) {
  if ((deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) &&
      !initializeDeviceConfigSynchronization()) return false;
  if (xSemaphoreTake(publishedConfigMutex, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  bool ready = publishedConfigReady;
  if (ready) out = publishedConfig;
  xSemaphoreGive(publishedConfigMutex);
  return ready;
}

bool copyConfiguredWifi(String& ssidOut, String& passwordOut) {
  DeviceConfigState state = {};
  if (!copyDeviceConfigState(state)) return false;
  ssidOut = state.wifiSsid;
  passwordOut = state.wifiPassword;
  return true;
}

bool hasConfiguredWifi() {
  if ((deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) &&
      !initializeDeviceConfigSynchronization()) return false;
  return configuredWifiPresent.load(std::memory_order_acquire);
}

uint32_t synchronizedSampleIntervalSec() {
  if ((deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) &&
      !initializeDeviceConfigSynchronization()) return 10;
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
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next)) {
    errorOut = "CONFIG_PUBLISH_UNAVAILABLE";
    return false;
  }
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

bool setDeviceNameSynchronized(const String& newName, String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  deviceName = newName;
  saveDeviceSettingsUnlocked();
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next)) { errorOut = "CONFIG_PUBLISH_UNAVAILABLE"; return false; }
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
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next)) { errorOut = "CONFIG_PUBLISH_UNAVAILABLE"; return false; }
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

bool setSampleIntervalSynchronized(uint32_t newSampleIntervalSec, String& errorOut) {
  if (!takeDeviceConfigMutex()) { errorOut = "CONFIG_SYNC_UNAVAILABLE"; return false; }
  sampleIntervalSec = newSampleIntervalSec;
  saveDeviceSettingsUnlocked();
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next)) { errorOut = "CONFIG_PUBLISH_UNAVAILABLE"; return false; }
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
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next)) { errorOut = "CONFIG_PUBLISH_UNAVAILABLE"; return false; }
  refreshBatterySnapshotConfiguration();
  errorOut = "";
  return true;
}

// Compatibility wrappers around the original BatteryMonitorCore persistence/UI
// functions. Those implementations are renamed to *Unlocked at include time.
void saveDeviceSettings() {
  if (!takeDeviceConfigMutex()) return;
  saveDeviceSettingsUnlocked();
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  publishConfigState(next);
}

void saveWifiSettings(const String& ssid, const String& pass) {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be saved because configuration synchronization is unavailable.");
    return;
  }
  saveWifiSettingsUnlocked(ssid, pass);
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next))
    Serial.println("ERROR: Wi-Fi configuration was persisted but could not be published to the RAM snapshot.");
}

void clearWifiSettings() {
  if (!takeDeviceConfigMutex()) {
    Serial.println("ERROR: Wi-Fi credentials could not be cleared because configuration synchronization is unavailable.");
    return;
  }
  clearWifiSettingsUnlocked();
  DeviceConfigState next = captureConfigGlobalsUnlocked();
  giveDeviceConfigMutex();
  if (!publishConfigState(next))
    Serial.println("ERROR: Cleared Wi-Fi configuration could not be published to the RAM snapshot.");
}

String configJson() {
  if ((deviceConfigMutex == nullptr || publishedConfigMutex == nullptr) &&
      !initializeDeviceConfigSynchronization()) return "{\"error\":\"configuration unavailable\"}";
  if (xSemaphoreTake(publishedConfigMutex, pdMS_TO_TICKS(20)) != pdTRUE)
    return "{\"error\":\"configuration unavailable\"}";
  String result = publishedConfigReady ? publishedConfigJson : "{\"error\":\"configuration unavailable\"}";
  xSemaphoreGive(publishedConfigMutex);
  return result;
}

String statusTextForVoltage(float voltage) {
  DeviceConfigState state = {};
  if (!copyDeviceConfigState(state)) return "unknown";
  if (voltage <= state.criticalVoltage) return "critical";
  if (voltage <= state.lowVoltage) return "low";
  return "good";
}

void startMdns() {
  // startMdnsUnlocked() reads deviceName from the authoritative globals. Keep
  // that uncommon lifecycle operation serialized with writers, while ordinary
  // HTTP/status readers remain isolated on the published snapshot.
  if (!takeDeviceConfigMutex(pdMS_TO_TICKS(250))) return;
  startMdnsUnlocked();
  giveDeviceConfigMutex();
}
