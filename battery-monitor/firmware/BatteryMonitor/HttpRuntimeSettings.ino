// Runtime HTTP transport tuning for Battery Monitor.
//
// These engineering/service settings are stored in the encrypted `batmon` NVS
// namespace and are exposed only through trusted USB Advanced Tools. The global
// lwIP descriptor ceiling remains a build-time sdkconfig setting; these values
// tune esp_http_server client capacity and per-socket TCP send buffering live.

#include <Preferences.h>
#include <atomic>
#include <esp_http_server.h>
#include <lwip/sockets.h>
#include <lwip/tcp.h>

static const char* BATMON_HTTP_CLIENTS_KEY = "hcli";
static const char* BATMON_HTTP_ROOT_SNDBUF_KEY = "hroot";
static const char* BATMON_HTTP_SMALL_SNDBUF_KEY = "hsmall";
static const char* BATMON_HTTP_SCAN_SNDBUF_KEY = "hscan";

static const uint32_t BATMON_HTTP_CLIENTS_DEFAULT = 15;
static const uint32_t BATMON_HTTP_CLIENTS_MIN = 4;
static const uint32_t BATMON_HTTP_CLIENTS_MAX = 20;
static const uint32_t BATMON_HTTP_ROOT_SNDBUF_DEFAULT = 12288;
static const uint32_t BATMON_HTTP_SMALL_SNDBUF_DEFAULT = 3072;
static const uint32_t BATMON_HTTP_SCAN_SNDBUF_DEFAULT = 5760;
static const uint32_t BATMON_HTTP_SNDBUF_MIN = 2880;  // 2 * default TCP MSS (1440).
static const uint32_t BATMON_HTTP_SNDBUF_MAX = 32768;

static std::atomic<uint32_t> httpRuntimeMaxClientsValue{BATMON_HTTP_CLIENTS_DEFAULT};
static std::atomic<uint32_t> httpRuntimeRootSendBufferValue{BATMON_HTTP_ROOT_SNDBUF_DEFAULT};
static std::atomic<uint32_t> httpRuntimeSmallSendBufferValue{BATMON_HTTP_SMALL_SNDBUF_DEFAULT};
static std::atomic<uint32_t> httpRuntimeScanSendBufferValue{BATMON_HTTP_SCAN_SNDBUF_DEFAULT};
static std::atomic<bool> httpRuntimeSettingsLoaded{false};
static std::atomic<bool> httpRuntimeServerRestartRequested{false};
static std::atomic<bool> httpRuntimeSocketWarningReported{false};

static bool validHttpClients(uint32_t value) {
  return value >= BATMON_HTTP_CLIENTS_MIN && value <= BATMON_HTTP_CLIENTS_MAX;
}

static bool validHttpSendBuffer(uint32_t value) {
  return value >= BATMON_HTTP_SNDBUF_MIN && value <= BATMON_HTTP_SNDBUF_MAX;
}

void loadHttpRuntimeSettings() {
  if (httpRuntimeSettingsLoaded.load(std::memory_order_acquire)) return;

  uint32_t clients = BATMON_HTTP_CLIENTS_DEFAULT;
  uint32_t rootSendBuffer = BATMON_HTTP_ROOT_SNDBUF_DEFAULT;
  uint32_t smallSendBuffer = BATMON_HTTP_SMALL_SNDBUF_DEFAULT;
  uint32_t scanSendBuffer = BATMON_HTTP_SCAN_SNDBUF_DEFAULT;

  Preferences prefs;
  if (prefs.begin("batmon", true)) {
    uint32_t storedClients = prefs.getUInt(BATMON_HTTP_CLIENTS_KEY, clients);
    uint32_t storedRoot = prefs.getUInt(BATMON_HTTP_ROOT_SNDBUF_KEY, rootSendBuffer);
    uint32_t storedSmall = prefs.getUInt(BATMON_HTTP_SMALL_SNDBUF_KEY, smallSendBuffer);
    uint32_t storedScan = prefs.getUInt(BATMON_HTTP_SCAN_SNDBUF_KEY, scanSendBuffer);
    prefs.end();

    if (validHttpClients(storedClients)) clients = storedClients;
    if (validHttpSendBuffer(storedRoot)) rootSendBuffer = storedRoot;
    if (validHttpSendBuffer(storedSmall)) smallSendBuffer = storedSmall;
    if (validHttpSendBuffer(storedScan)) scanSendBuffer = storedScan;
  }

  httpRuntimeMaxClientsValue.store(clients, std::memory_order_relaxed);
  httpRuntimeRootSendBufferValue.store(rootSendBuffer, std::memory_order_relaxed);
  httpRuntimeSmallSendBufferValue.store(smallSendBuffer, std::memory_order_relaxed);
  httpRuntimeScanSendBufferValue.store(scanSendBuffer, std::memory_order_relaxed);
  httpRuntimeSettingsLoaded.store(true, std::memory_order_release);
}

uint16_t httpRuntimeMaxClients() {
  loadHttpRuntimeSettings();
  return (uint16_t)httpRuntimeMaxClientsValue.load(std::memory_order_acquire);
}

uint32_t httpRuntimeRootSendBufferBytes() {
  loadHttpRuntimeSettings();
  return httpRuntimeRootSendBufferValue.load(std::memory_order_acquire);
}

uint32_t httpRuntimeSmallSendBufferBytes() {
  loadHttpRuntimeSettings();
  return httpRuntimeSmallSendBufferValue.load(std::memory_order_acquire);
}

uint32_t httpRuntimeScanSendBufferBytes() {
  loadHttpRuntimeSettings();
  return httpRuntimeScanSendBufferValue.load(std::memory_order_acquire);
}

uint32_t httpRuntimeSendBufferForUri(const char* uri) {
  if (uri != nullptr && strcmp(uri, "/") == 0) return httpRuntimeRootSendBufferBytes();
  if (uri != nullptr && strcmp(uri, "/api/wifi/scan") == 0) return httpRuntimeScanSendBufferBytes();
  return httpRuntimeSmallSendBufferBytes();
}

bool httpRuntimeApplySendBuffer(httpd_req_t* req, uint32_t bytes) {
  if (req == nullptr || !validHttpSendBuffer(bytes)) return false;
  int fd = httpd_req_to_sockfd(req);
  if (fd < 0) return false;

  int value = (int)bytes;
  if (lwip_setsockopt(fd, IPPROTO_TCP, TCP_SNDBUF, &value, sizeof(value)) == 0) return true;

  if (!httpRuntimeSocketWarningReported.exchange(true, std::memory_order_acq_rel)) {
    Serial.printf("WARNING: Could not apply HTTP TCP send buffer (%lu bytes), errno=%d.\n",
                  (unsigned long)bytes, errno);
  }
  return false;
}

bool httpRuntimeApplySendBufferForRequest(httpd_req_t* req) {
  return httpRuntimeApplySendBuffer(req, httpRuntimeSendBufferForUri(req == nullptr ? nullptr : req->uri));
}

String httpRuntimeSettingsSummary() {
  loadHttpRuntimeSettings();
  String result = "HTTP ";
  result += String(httpRuntimeMaxClients()) + " ";
  result += String(httpRuntimeRootSendBufferBytes()) + " ";
  result += String(httpRuntimeSmallSendBufferBytes()) + " ";
  result += String(httpRuntimeScanSendBufferBytes()) + " ";
  result += String((unsigned long)CONFIG_LWIP_MAX_SOCKETS);
  return result;
}

bool setHttpRuntimeSettings(uint32_t clients,
                            uint32_t rootSendBuffer,
                            uint32_t smallSendBuffer,
                            uint32_t scanSendBuffer,
                            String& errorOut) {
  loadHttpRuntimeSettings();

  if (!validHttpClients(clients)) {
    errorOut = "HTTP_INVALID_CLIENTS";
    return false;
  }
  if (!validHttpSendBuffer(rootSendBuffer) ||
      !validHttpSendBuffer(smallSendBuffer) ||
      !validHttpSendBuffer(scanSendBuffer)) {
    errorOut = "HTTP_INVALID_SNDBUF";
    return false;
  }

  uint32_t oldClients = httpRuntimeMaxClientsValue.load(std::memory_order_acquire);
  uint32_t oldRoot = httpRuntimeRootSendBufferValue.load(std::memory_order_acquire);
  uint32_t oldSmall = httpRuntimeSmallSendBufferValue.load(std::memory_order_acquire);
  uint32_t oldScan = httpRuntimeScanSendBufferValue.load(std::memory_order_acquire);

  Preferences prefs;
  if (!prefs.begin("batmon", false)) {
    errorOut = "HTTP_NVS_OPEN_FAILED";
    return false;
  }

  bool persisted =
    prefs.putUInt(BATMON_HTTP_CLIENTS_KEY, clients) == sizeof(uint32_t) &&
    prefs.putUInt(BATMON_HTTP_ROOT_SNDBUF_KEY, rootSendBuffer) == sizeof(uint32_t) &&
    prefs.putUInt(BATMON_HTTP_SMALL_SNDBUF_KEY, smallSendBuffer) == sizeof(uint32_t) &&
    prefs.putUInt(BATMON_HTTP_SCAN_SNDBUF_KEY, scanSendBuffer) == sizeof(uint32_t);

  if (!persisted) {
    // Best-effort restoration keeps a partial NVS write from becoming the next
    // boot's configuration when the current runtime values were not accepted.
    prefs.putUInt(BATMON_HTTP_CLIENTS_KEY, oldClients);
    prefs.putUInt(BATMON_HTTP_ROOT_SNDBUF_KEY, oldRoot);
    prefs.putUInt(BATMON_HTTP_SMALL_SNDBUF_KEY, oldSmall);
    prefs.putUInt(BATMON_HTTP_SCAN_SNDBUF_KEY, oldScan);
    prefs.end();
    errorOut = "HTTP_NVS_WRITE_FAILED";
    return false;
  }
  prefs.end();

  httpRuntimeMaxClientsValue.store(clients, std::memory_order_release);
  httpRuntimeRootSendBufferValue.store(rootSendBuffer, std::memory_order_release);
  httpRuntimeSmallSendBufferValue.store(smallSendBuffer, std::memory_order_release);
  httpRuntimeScanSendBufferValue.store(scanSendBuffer, std::memory_order_release);
  httpRuntimeSocketWarningReported.store(false, std::memory_order_release);

  if (clients != oldClients)
    httpRuntimeServerRestartRequested.store(true, std::memory_order_release);

  errorOut = "";
  return true;
}

bool consumeHttpRuntimeServerRestartRequest() {
  return httpRuntimeServerRestartRequested.exchange(false, std::memory_order_acq_rel);
}
