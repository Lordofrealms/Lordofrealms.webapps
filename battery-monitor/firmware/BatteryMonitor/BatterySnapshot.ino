// Coherent cached battery measurement state.
//
// ADC conversions are owned by the application sampling path. HTTP, Windows,
// discovery, and other readers never trigger an ADC conversion; they only copy
// the last completed snapshot under a very short mutex. Configuration and
// network state are also copied from their published snapshots, so status JSON
// does not call NVS or the Wi-Fi driver.

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

struct BatterySnapshot {
  float voltage;
  uint32_t adcMillivolts;
  uint16_t adcRaw;
  unsigned long sampleTimeMs;
  float lowVoltage;
  float criticalVoltage;
  float calibrationFactor;
  float calibrationOffset;
  uint32_t sampleIntervalSec;
  char state[10];
};

static SemaphoreHandle_t batterySnapshotMutex = nullptr;
static BatterySnapshot publishedBatterySnapshot = {};
static bool publishedBatterySnapshotReady = false;

static bool ensureBatterySnapshotMutex() {
  if (batterySnapshotMutex != nullptr) return true;
  batterySnapshotMutex = xSemaphoreCreateMutex();
  return batterySnapshotMutex != nullptr;
}

static void classifyBatterySnapshot(BatterySnapshot& snapshot) {
  const char* state = snapshot.voltage <= snapshot.criticalVoltage ? "critical" :
                      snapshot.voltage <= snapshot.lowVoltage ? "low" : "good";
  strlcpy(snapshot.state, state, sizeof(snapshot.state));
}

bool initializeBatterySnapshotState() {
  if (!ensureBatterySnapshotMutex()) {
    Serial.println("ERROR: Could not allocate battery snapshot mutex.");
    return false;
  }
  return true;
}

bool copyBatterySnapshot(BatterySnapshot& out) {
  if (!ensureBatterySnapshotMutex()) return false;
  if (xSemaphoreTake(batterySnapshotMutex, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  bool ready = publishedBatterySnapshotReady;
  if (ready) out = publishedBatterySnapshot;
  xSemaphoreGive(batterySnapshotMutex);
  return ready;
}

void refreshBatterySnapshotConfiguration() {
  DeviceConfigState config = {};
  if (!copyDeviceConfigState(config)) return;
  if (!ensureBatterySnapshotMutex()) return;
  if (xSemaphoreTake(batterySnapshotMutex, pdMS_TO_TICKS(20)) != pdTRUE) return;
  if (publishedBatterySnapshotReady) {
    publishedBatterySnapshot.lowVoltage = config.lowVoltage;
    publishedBatterySnapshot.criticalVoltage = config.criticalVoltage;
    publishedBatterySnapshot.calibrationFactor = config.calibrationFactor;
    publishedBatterySnapshot.calibrationOffset = config.calibrationOffset;
    publishedBatterySnapshot.sampleIntervalSec = config.sampleIntervalSec;
    publishedBatterySnapshot.voltage =
      (((float)publishedBatterySnapshot.adcMillivolts / 1000.0f) *
       DIVIDER_MULTIPLIER * config.calibrationFactor) + config.calibrationOffset;
    classifyBatterySnapshot(publishedBatterySnapshot);

    batteryVoltage = publishedBatterySnapshot.voltage;
    adcMilliVolts = publishedBatterySnapshot.adcMillivolts;
    adcRaw = publishedBatterySnapshot.adcRaw;
    lastSampleMs = publishedBatterySnapshot.sampleTimeMs;
  }
  xSemaphoreGive(batterySnapshotMutex);
}

void sampleBatterySnapshot() {
  const bool trace = isHttpTraceEnabled();
  const uint32_t totalStart = trace ? micros() : 0;
  const uint32_t adcStart = trace ? micros() : 0;

  for (int i = 0; i < 4; ++i) {
    analogReadMilliVolts(BATTERY_ADC_PIN);
    delay(2);
  }

  const int N = 20;
  uint32_t mv[N];
  uint32_t rawSum = 0;
  for (int i = 0; i < N; ++i) {
    mv[i] = analogReadMilliVolts(BATTERY_ADC_PIN);
    rawSum += analogRead(BATTERY_ADC_PIN);
    delay(2);
  }

  for (int i = 1; i < N; ++i) {
    uint32_t key = mv[i];
    int j = i - 1;
    while (j >= 0 && mv[j] > key) {
      mv[j + 1] = mv[j];
      --j;
    }
    mv[j + 1] = key;
  }

  uint32_t sum = 0;
  for (int i = 4; i < 16; ++i) sum += mv[i];

  const uint32_t measuredMillivolts = sum / 12;
  const uint16_t measuredRaw = (uint16_t)(rawSum / N);
  const unsigned long measuredAt = millis();
  const uint32_t adcUs = trace ? (uint32_t)(micros() - adcStart) : 0;

  const uint32_t configStart = trace ? micros() : 0;
  DeviceConfigState config = {};
  if (!copyDeviceConfigState(config)) return;
  const uint32_t configCopyUs = trace ? (uint32_t)(micros() - configStart) : 0;

  const uint32_t publishStart = trace ? micros() : 0;
  if (!ensureBatterySnapshotMutex()) return;
  if (xSemaphoreTake(batterySnapshotMutex, pdMS_TO_TICKS(20)) != pdTRUE) return;

  BatterySnapshot next = {};
  next.adcMillivolts = measuredMillivolts;
  next.adcRaw = measuredRaw;
  next.sampleTimeMs = measuredAt;
  next.lowVoltage = config.lowVoltage;
  next.criticalVoltage = config.criticalVoltage;
  next.calibrationFactor = config.calibrationFactor;
  next.calibrationOffset = config.calibrationOffset;
  next.sampleIntervalSec = config.sampleIntervalSec;
  next.voltage = (((float)measuredMillivolts / 1000.0f) *
                  DIVIDER_MULTIPLIER * next.calibrationFactor) + next.calibrationOffset;
  classifyBatterySnapshot(next);

  publishedBatterySnapshot = next;
  publishedBatterySnapshotReady = true;

  batteryVoltage = next.voltage;
  adcMilliVolts = next.adcMillivolts;
  adcRaw = next.adcRaw;
  lastSampleMs = next.sampleTimeMs;

  xSemaphoreGive(batterySnapshotMutex);
  const uint32_t publishUs = trace ? (uint32_t)(micros() - publishStart) : 0;

  if (trace) {
    httpTraceLogAdcSample(adcUs, configCopyUs, publishUs,
                          (uint32_t)(micros() - totalStart));
  }
}

String batterySnapshotStatusJson(HttpStatusBuildTiming* timing) {
  const uint32_t totalStart = timing ? micros() : 0;
  uint32_t stageStart = timing ? micros() : 0;

  DeviceConfigState config = {};
  bool configReady = copyDeviceConfigState(config);
  if (timing) {
    timing->configCopyUs = (uint32_t)(micros() - stageStart);
    timing->configReady = configReady;
  }
  if (!configReady) return "{\"error\":\"configuration unavailable\"}";

  stageStart = timing ? micros() : 0;
  BatterySnapshot snapshot = {};
  bool batteryReady = copyBatterySnapshot(snapshot);
  if (timing) {
    timing->batteryCopyUs = (uint32_t)(micros() - stageStart);
    timing->batteryReady = batteryReady;
  }
  if (!batteryReady) {
    snapshot.lowVoltage = config.lowVoltage;
    snapshot.criticalVoltage = config.criticalVoltage;
    snapshot.calibrationFactor = config.calibrationFactor;
    snapshot.calibrationOffset = config.calibrationOffset;
    snapshot.sampleIntervalSec = config.sampleIntervalSec;
    snapshot.sampleTimeMs = millis();
    classifyBatterySnapshot(snapshot);
  }

  stageStart = timing ? micros() : 0;
  NetworkSnapshot network = {};
  bool networkReady = copyNetworkSnapshot(network);
  if (timing) {
    timing->networkCopyUs = (uint32_t)(micros() - stageStart);
    timing->networkReady = networkReady;
  }
  if (!networkReady) {
    strlcpy(network.ip, "0.0.0.0", sizeof(network.ip));
    network.wifiConnected = false;
    network.setupApActive = false;
    network.rssi = 0;
    network.publishedAtMs = millis();
  }

  const uint32_t jsonStart = timing ? micros() : 0;
  String json = "{";
  json += "\"apiVersion\":" + String(API_VERSION) + ",";
  json += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\",";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"name\":\"" + jsonEscape(config.deviceName) + "\",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"ip\":\"" + String(network.ip) + "\",";
  json += "\"wifiConnected\":" + String(network.wifiConnected ? "true" : "false") + ",";
  json += "\"setupApActive\":" + String(network.setupApActive ? "true" : "false") + ",";
  json += "\"rssi\":" + String(network.rssi) + ",";
  json += "\"batteryType\":\"" + jsonEscape(config.batteryType) + "\",";
  json += "\"voltage\":" + String(snapshot.voltage, 3) + ",";
  json += "\"state\":\"" + String(snapshot.state) + "\",";
  json += "\"adcRaw\":" + String(snapshot.adcRaw) + ",";
  json += "\"adcMillivolts\":" + String(snapshot.adcMillivolts) + ",";
  json += "\"lowVoltage\":" + String(snapshot.lowVoltage, 3) + ",";
  json += "\"criticalVoltage\":" + String(snapshot.criticalVoltage, 3) + ",";
  json += "\"calibrationFactor\":" + String(snapshot.calibrationFactor, 6) + ",";
  json += "\"calibrationOffset\":" + String(snapshot.calibrationOffset, 4) + ",";
  json += "\"sampleIntervalSec\":" + String(snapshot.sampleIntervalSec) + ",";
  json += "\"uptimeSec\":" + String(millis() / 1000UL) + ",";
  json += "\"lastSampleAgeMs\":" + String(millis() - snapshot.sampleTimeMs) + ",";
  json += "\"networkSnapshotAgeMs\":" + String(millis() - network.publishedAtMs);
  json += "}";

  if (timing) {
    timing->jsonBuildUs = (uint32_t)(micros() - jsonStart);
    timing->totalBuildUs = (uint32_t)(micros() - totalStart);
  }
  return json;
}

String batterySnapshotStatusJson() {
  return batterySnapshotStatusJson(nullptr);
}
