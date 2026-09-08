// Dedicated WebUI servicing for Battery Monitor.
//
// The classic ESP32 is dual-core. Arduino's application loop normally runs on
// Core 1 while Espressif networking work is concentrated on Core 0. Keep the
// synchronous Arduino WebServer object for its already-hardened parser and
// existing authenticated handlers, but service it from a dedicated Core-0
// FreeRTOS task so HTTP latency is not tied to ADC sampling / application-loop
// cadence.
//
// WebServer itself is not safe to start/stop while another task is inside
// handleClient(). The domain mutex therefore serializes HTTP servicing against
// normal-network lifecycle transitions, secure provisioning, USB configuration,
// ADC/config snapshots and OTA transitions performed by the main loop.
//
// USB OTA intentionally quiesces HTTP. Authenticated LAN OTA is different: its
// subsequent chunk/finalize requests arrive through this same WebServer, so HTTP
// servicing must stay alive while the OTA core is owned by the LAN transport.

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

bool firmwareUpdateInProgress();
bool firmwareUpdateIsLanTransport();

static SemaphoreHandle_t batteryMonitorWebDomainMutex = nullptr;
static TaskHandle_t batteryMonitorWebTaskHandle = nullptr;

bool lockBatteryMonitorWebDomain() {
  if (batteryMonitorWebDomainMutex == nullptr) return true;
  return xSemaphoreTake(batteryMonitorWebDomainMutex, portMAX_DELAY) == pdTRUE;
}

void unlockBatteryMonitorWebDomain() {
  if (batteryMonitorWebDomainMutex != nullptr) xSemaphoreGive(batteryMonitorWebDomainMutex);
}

static bool batteryMonitorWebMayServe() {
  return !firmwareUpdateInProgress() || firmwareUpdateIsLanTransport();
}

static void batteryMonitorWebTask(void*) {
  for (;;) {
    if (httpServerActive && !fallbackApActive && batteryMonitorWebMayServe()) {
      if (xSemaphoreTake(batteryMonitorWebDomainMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        // Re-check after taking the mutex because the main loop may have changed
        // network/OTA state while this task was waiting.
        if (httpServerActive && !fallbackApActive && batteryMonitorWebMayServe()) {
          server.handleClient();
        }
        xSemaphoreGive(batteryMonitorWebDomainMutex);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

bool initializeDedicatedWebServerTask() {
  if (batteryMonitorWebTaskHandle != nullptr) return true;

  batteryMonitorWebDomainMutex = xSemaphoreCreateMutex();
  if (batteryMonitorWebDomainMutex == nullptr) {
    Serial.println("WARNING: Could not allocate WebUI domain mutex; using synchronous WebServer servicing.");
    return false;
  }

  BaseType_t created = xTaskCreatePinnedToCore(
    batteryMonitorWebTask,
    "batmon-web",
    8192,
    nullptr,
    2,
    &batteryMonitorWebTaskHandle,
    0
  );

  if (created != pdPASS) {
    vSemaphoreDelete(batteryMonitorWebDomainMutex);
    batteryMonitorWebDomainMutex = nullptr;
    batteryMonitorWebTaskHandle = nullptr;
    Serial.println("WARNING: Could not create Core-0 WebUI task; using synchronous WebServer servicing.");
    return false;
  }

  Serial.println("WebUI HTTP servicing active on dedicated Core-0 FreeRTOS task.");
  return true;
}
