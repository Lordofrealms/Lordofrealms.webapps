// Coherent cached battery measurement state.
//
// ADC conversions are owned by the application sampling path. HTTP, Windows,
// discovery, and other readers never trigger an ADC conversion; they only copy
// the last completed snapshot under a very short mutex. The ADC work itself is
// deliberately performed outside the mutex.

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
  if (!ensureBatterySnapshotMutex()) return;
  if (xSemaphoreTake(batterySnapshotMutex, pdMS_TO_TICKS(20)) != pdTRUE) return;
  if (publishedBatterySnapshotReady) {
    publishedBatterySnapshot.lowVoltage = lowVoltage;
    publishedBatterySnapshot.criticalVoltage = criticalVoltage;
    publishedBatterySnapshot.calibrationFactor = calibrationFactor;
    publishedBatterySnapshot.calibrationOffset = calibrationOffset;
    publishedBatterySnapshot.sampleIntervalSec = sampleIntervalSec;
    // Recalculate voltage from the already measured ADC millivolts when
    // calibration changes; no new ADC read is required just to publish config.
    publishedBatterySnapshot.voltage =
      (((float)publishedBatterySnapshot.adcMillivolts / 1000.0f) *
       DIVIDER_MULTIPLIER * calibrationFactor) + calibrationOffset;
    classifyBatterySnapshot(publishedBatterySnapshot);

    // Preserve legacy readers (USB STATUS and older internal helpers).
    batteryVoltage = publishedBatterySnapshot.voltage;
    adcMilliVolts = publishedBatterySnapshot.adcMillivolts;
    adcRaw = publishedBatterySnapshot.adcRaw;
    lastSampleMs = publishedBatterySnapshot.sampleTimeMs;
  }
  xSemaphoreGive(batterySnapshotMutex);
}

void sampleBatterySnapshot() {
  // High-impedance divider: throw away initial conversions, then use a trimmed
  // mean. All conversion/delay work happens before taking the snapshot mutex.
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

  if (!ensureBatterySnapshotMutex()) return;
  if (xSemaphoreTake(batterySnapshotMutex, pdMS_TO_TICKS(20)) != pdTRUE) return;

  BatterySnapshot next = {};
  next.adcMillivolts = measuredMillivolts;
  next.adcRaw = measuredRaw;
  next.sampleTimeMs = measuredAt;
  // Apply the CURRENT calibration/threshold values only at publication time.
  // A concurrent HTTP config change therefore cannot produce a half-old,
  // half-new snapshot.
  next.lowVoltage = lowVoltage;
  next.criticalVoltage = criticalVoltage;
  next.calibrationFactor = calibrationFactor;
  next.calibrationOffset = calibrationOffset;
  next.sampleIntervalSec = sampleIntervalSec;
  next.voltage = (((float)measuredMillivolts / 1000.0f) *
                  DIVIDER_MULTIPLIER * next.calibrationFactor) + next.calibrationOffset;
  classifyBatterySnapshot(next);

  publishedBatterySnapshot = next;
  publishedBatterySnapshotReady = true;

  // Keep legacy/USB consumers synchronized with the same completed snapshot.
  batteryVoltage = next.voltage;
  adcMilliVolts = next.adcMillivolts;
  adcRaw = next.adcRaw;
  lastSampleMs = next.sampleTimeMs;

  xSemaphoreGive(batterySnapshotMutex);
}

String batterySnapshotStatusJson() {
  BatterySnapshot snapshot = {};
  bool ready = copyBatterySnapshot(snapshot);
  if (!ready) {
    snapshot.voltage = batteryVoltage;
    snapshot.adcMillivolts = adcMilliVolts;
    snapshot.adcRaw = adcRaw;
    snapshot.sampleTimeMs = lastSampleMs;
    snapshot.lowVoltage = lowVoltage;
    snapshot.criticalVoltage = criticalVoltage;
    snapshot.calibrationFactor = calibrationFactor;
    snapshot.calibrationOffset = calibrationOffset;
    snapshot.sampleIntervalSec = sampleIntervalSec;
    classifyBatterySnapshot(snapshot);
  }

  String json = "{";
  json += "\"apiVersion\":" + String(API_VERSION) + ",";
  json += "\"firmwareVersion\":\"" + String(FW_VERSION) + "\",";
  json += "\"deviceId\":\"" + jsonEscape(deviceId) + "\",";
  json += "\"name\":\"" + jsonEscape(deviceName) + "\",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"ip\":\"" + localIpString() + "\",";
  json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  json += "\"setupApActive\":" + String(fallbackApActive ? "true" : "false") + ",";
  json += "\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
  json += "\"batteryType\":\"" + jsonEscape(batteryType) + "\",";
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
  json += "\"lastSampleAgeMs\":" + String(millis() - snapshot.sampleTimeMs);
  json += "}";
  return json;
}
