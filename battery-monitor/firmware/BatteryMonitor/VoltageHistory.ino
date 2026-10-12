// Volatile on-device hourly (or configured interval) voltage history.
// Never writes samples to flash; loss on reboot/power failure is intentional.
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

struct VoltageHistoryRecord {
  uint32_t sequence;
  uint32_t startMs;
  float minimum, maximum, average;
  uint32_t sampleCount;
};
static constexpr size_t HISTORY_CAPACITY = 168;
static VoltageHistoryRecord historyRecords[HISTORY_CAPACITY] = {};
static size_t historyHead = 0, historyCount = 0;
static uint32_t historyBootId = 0, historyNextSequence = 1;
static uint32_t historyCurrentStartMs = 0, historyCurrentCount = 0, historyCurrentIntervalMs = 0;
static float historyMin = 0, historyMax = 0;
static double historySum = 0;
static SemaphoreHandle_t historyMutex = nullptr;

void captureHistoryVoltage(float voltage, uint32_t intervalMinutes, uint32_t nowMs) {
  if (historyMutex == nullptr) historyMutex = xSemaphoreCreateMutex();
  if (historyMutex == nullptr || xSemaphoreTake(historyMutex, pdMS_TO_TICKS(10)) != pdTRUE) return;
  if (historyBootId == 0) historyBootId = esp_random() | 1U;
  uint32_t intervalMs = max((uint32_t)1, min(intervalMinutes, (uint32_t)60)) * 60000UL;
  if (historyCurrentCount > 0 &&
      (historyCurrentIntervalMs != intervalMs || (uint32_t)(nowMs - historyCurrentStartMs) >= historyCurrentIntervalMs)) {
    historyRecords[historyHead] = {historyNextSequence++, historyCurrentStartMs,
                                   historyMin, historyMax, (float)(historySum / historyCurrentCount),
                                   historyCurrentCount};
    historyHead = (historyHead + 1) % HISTORY_CAPACITY;
    if (historyCount < HISTORY_CAPACITY) ++historyCount;
    historyCurrentCount = 0;
    historySum = 0;
  }
  if (historyCurrentCount == 0) {
    historyCurrentStartMs = nowMs;
    historyCurrentIntervalMs = intervalMs;
    historyMin = historyMax = voltage;
  }
  historyMin = min(historyMin, voltage);
  historyMax = max(historyMax, voltage);
  historySum += voltage;
  ++historyCurrentCount;
  xSemaphoreGive(historyMutex);
}

String batteryHistoryJson() {
  if (historyMutex == nullptr) return "{\"error\":\"history unavailable\"}";
  auto* copy = (VoltageHistoryRecord*)malloc(HISTORY_CAPACITY * sizeof(VoltageHistoryRecord));
  if (copy == nullptr) return "{\"error\":\"history allocation failed\"}";
  size_t count;
  uint32_t boot, now = millis();
  if (xSemaphoreTake(historyMutex, pdMS_TO_TICKS(20)) != pdTRUE) {
    free(copy);
    return "{\"error\":\"history busy\"}";
  }
  count = historyCount;
  boot = historyBootId;
  for (size_t i = 0; i < count; ++i)
    copy[i] = historyRecords[(historyHead + HISTORY_CAPACITY - count + i) % HISTORY_CAPACITY];
  xSemaphoreGive(historyMutex);
  String json = "{\"deviceId\":\"" + jsonEscape(deviceId) + "\",\"bootId\":\"" +
                String(boot, HEX) + "\",\"records\":[";
  json.reserve(100 + count * 85);
  for (size_t i = 0; i < count; ++i) {
    if (i) json += ",";
    const auto& item = copy[i];
    json += "[" + String(item.sequence) + "," + String((uint32_t)(now - item.startMs) / 1000UL) +
            "," + String(item.minimum, 3) + "," + String(item.maximum, 3) +
            "," + String(item.average, 3) + "," + String(item.sampleCount) + "]";
  }
  json += "]}";
  free(copy);
  return json;
}
