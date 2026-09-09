// Coherent cached network status for Battery Monitor.
//
// Wi-Fi driver queries are owned by the Arduino/main task. Native HTTP and
// authenticated discovery read only this published snapshot, so an HTTP request
// never calls WiFi.status(), WiFi.RSSI(), localIP(), or softAPIP().

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

struct NetworkSnapshot {
  bool wifiConnected;
  bool setupApActive;
  int32_t rssi;
  char ip[16];
  unsigned long publishedAtMs;
};

static SemaphoreHandle_t networkSnapshotMutex = nullptr;
static NetworkSnapshot publishedNetworkSnapshot = {};
static bool publishedNetworkSnapshotReady = false;
static unsigned long nextNetworkSnapshotAtMs = 0;
static const unsigned long NETWORK_SNAPSHOT_INTERVAL_MS = 1000UL;

static bool ensureNetworkSnapshotMutex() {
  if (networkSnapshotMutex != nullptr) return true;
  networkSnapshotMutex = xSemaphoreCreateMutex();
  return networkSnapshotMutex != nullptr;
}

bool initializeNetworkSnapshotState() {
  if (!ensureNetworkSnapshotMutex()) {
    Serial.println("ERROR: Could not allocate network snapshot mutex.");
    return false;
  }
  return true;
}

bool copyNetworkSnapshot(NetworkSnapshot& out) {
  if (!ensureNetworkSnapshotMutex()) return false;
  if (xSemaphoreTake(networkSnapshotMutex, pdMS_TO_TICKS(10)) != pdTRUE) return false;
  bool ready = publishedNetworkSnapshotReady;
  if (ready) out = publishedNetworkSnapshot;
  xSemaphoreGive(networkSnapshotMutex);
  return ready;
}

void publishNetworkSnapshotNow() {
  NetworkSnapshot next = {};
  next.publishedAtMs = millis();
  next.wifiConnected = WiFi.status() == WL_CONNECTED;
  next.setupApActive = secureProvisioningActive.load(std::memory_order_acquire) || fallbackApActive;
  next.rssi = next.wifiConnected ? WiFi.RSSI() : 0;

  IPAddress ip(0, 0, 0, 0);
  if (next.wifiConnected) ip = WiFi.localIP();
  else if (next.setupApActive) ip = WiFi.softAPIP();
  String ipText = ip.toString();
  strlcpy(next.ip, ipText.c_str(), sizeof(next.ip));

  if (!ensureNetworkSnapshotMutex()) return;
  if (xSemaphoreTake(networkSnapshotMutex, pdMS_TO_TICKS(10)) != pdTRUE) return;
  publishedNetworkSnapshot = next;
  publishedNetworkSnapshotReady = true;
  xSemaphoreGive(networkSnapshotMutex);
  nextNetworkSnapshotAtMs = next.publishedAtMs + NETWORK_SNAPSHOT_INTERVAL_MS;
}

void serviceNetworkSnapshot() {
  unsigned long now = millis();
  if (nextNetworkSnapshotAtMs != 0 && (int32_t)(now - nextNetworkSnapshotAtMs) < 0) return;
  publishNetworkSnapshotNow();
}
