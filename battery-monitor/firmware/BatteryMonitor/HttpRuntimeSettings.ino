// Runtime HTTP transport tuning for Battery Monitor.
//
// The only live-configurable transport knob on the pinned ESP-IDF/lwIP stack is
// the esp_http_server client-session limit. TCP send buffering is a build-time
// lwIP setting (CONFIG_LWIP_TCP_SND_BUF_DEFAULT) and the global socket ceiling is
// likewise compile-time (CONFIG_LWIP_MAX_SOCKETS). The compatibility accessors
// below intentionally report those global values so existing diagnostics remain
// accurate without pretending per-socket buffer resizing is supported.

#include <Preferences.h>
#include <atomic>
#include <esp_http_server.h>

static const char* BATMON_HTTP_CLIENTS_KEY = "hcli";

static const uint32_t BATMON_HTTP_CLIENTS_DEFAULT = 15;
static const uint32_t BATMON_HTTP_CLIENTS_MIN = 4;
static const uint32_t BATMON_HTTP_CLIENTS_MAX = 20;

static std::atomic<uint32_t> httpRuntimeMaxClientsValue{BATMON_HTTP_CLIENTS_DEFAULT};
static std::atomic<bool> httpRuntimeSettingsLoaded{false};
static std::atomic<bool> httpRuntimeServerRestartRequested{false};

static bool validHttpClients(uint32_t value) {
  return value >= BATMON_HTTP_CLIENTS_MIN && value <= BATMON_HTTP_CLIENTS_MAX;
}

void loadHttpRuntimeSettings() {
  if (httpRuntimeSettingsLoaded.load(std::memory_order_acquire)) return;

  uint32_t clients = BATMON_HTTP_CLIENTS_DEFAULT;
  Preferences prefs;
  if (prefs.begin("batmon", true)) {
    uint32_t storedClients = prefs.getUInt(BATMON_HTTP_CLIENTS_KEY, clients);
    prefs.end();
    if (validHttpClients(storedClients)) clients = storedClients;
  }

  httpRuntimeMaxClientsValue.store(clients, std::memory_order_relaxed);
  httpRuntimeSettingsLoaded.store(true, std::memory_order_release);
}

uint16_t httpRuntimeMaxClients() {
  loadHttpRuntimeSettings();
  return (uint16_t)httpRuntimeMaxClientsValue.load(std::memory_order_acquire);
}

// Compatibility accessors used by runtime diagnostics. All routes use the one
// global lwIP TCP send-buffer default on this stack.
uint32_t httpRuntimeRootSendBufferBytes() {
  return (uint32_t)CONFIG_LWIP_TCP_SND_BUF_DEFAULT;
}

uint32_t httpRuntimeSmallSendBufferBytes() {
  return (uint32_t)CONFIG_LWIP_TCP_SND_BUF_DEFAULT;
}

uint32_t httpRuntimeScanSendBufferBytes() {
  return (uint32_t)CONFIG_LWIP_TCP_SND_BUF_DEFAULT;
}

// Retained as no-op compatibility hooks for the synchronized HTTP layer. The
// pinned lwIP socket API does not implement SO_SNDBUF/TCP_SNDBUF resizing.
bool httpRuntimeApplySendBuffer(httpd_req_t* req, uint32_t bytes) {
  (void)req;
  (void)bytes;
  return true;
}

bool httpRuntimeApplySendBufferForRequest(httpd_req_t* req) {
  (void)req;
  return true;
}

String httpRuntimeSettingsSummary() {
  loadHttpRuntimeSettings();
  String result = "HTTP ";
  result += String(httpRuntimeMaxClients()) + " ";
  result += String((unsigned long)CONFIG_LWIP_TCP_SND_BUF_DEFAULT) + " ";
  result += String((unsigned long)CONFIG_LWIP_MAX_SOCKETS);
  return result;
}

bool setHttpRuntimeMaxClients(uint32_t clients, String& errorOut) {
  loadHttpRuntimeSettings();

  if (!validHttpClients(clients)) {
    errorOut = "HTTP_INVALID_CLIENTS";
    return false;
  }

  uint32_t oldClients = httpRuntimeMaxClientsValue.load(std::memory_order_acquire);
  if (clients == oldClients) {
    errorOut = "";
    return true;
  }

  Preferences prefs;
  if (!prefs.begin("batmon", false)) {
    errorOut = "HTTP_NVS_OPEN_FAILED";
    return false;
  }
  bool persisted = prefs.putUInt(BATMON_HTTP_CLIENTS_KEY, clients) == sizeof(uint32_t);
  prefs.end();
  if (!persisted) {
    errorOut = "HTTP_NVS_WRITE_FAILED";
    return false;
  }

  httpRuntimeMaxClientsValue.store(clients, std::memory_order_release);
  httpRuntimeServerRestartRequested.store(true, std::memory_order_release);
  errorOut = "";
  return true;
}

bool consumeHttpRuntimeServerRestartRequest() {
  return httpRuntimeServerRestartRequested.exchange(false, std::memory_order_acq_rel);
}
