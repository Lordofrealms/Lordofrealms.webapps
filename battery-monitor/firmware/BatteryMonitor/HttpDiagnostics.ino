// Optional native-HTTP/source diagnostics emitted over trusted USB serial.
//
// Trace mode is volatile and defaults OFF after every reboot. It measures both
// producer/source work (Wi-Fi driver, ADC, NVS) and HTTP consumer work (snapshot
// copies, JSON construction, socket send), so a hardware stall can be localized
// without changing normal production behavior.

#include <atomic>

struct HttpStatusBuildTiming {
  uint32_t configCopyUs = 0;
  uint32_t batteryCopyUs = 0;
  uint32_t networkCopyUs = 0;
  uint32_t jsonBuildUs = 0;
  uint32_t totalBuildUs = 0;
  bool configReady = false;
  bool batteryReady = false;
  bool networkReady = false;
};

static std::atomic<bool> httpTraceEnabled{false};
static std::atomic<uint32_t> httpTraceSequence{0};

bool isHttpTraceEnabled() {
  return httpTraceEnabled.load(std::memory_order_acquire);
}

void setHttpTraceEnabled(bool enabled) {
  httpTraceEnabled.store(enabled, std::memory_order_release);
}

uint32_t nextHttpTraceSequence() {
  return httpTraceSequence.fetch_add(1, std::memory_order_relaxed) + 1;
}

String httpTraceSummary() {
  return String("HTTPTRACE ") + (isHttpTraceEnabled() ? "ON" : "OFF") +
         " seq=" + String((unsigned long)httpTraceSequence.load(std::memory_order_relaxed));
}

void httpTraceLogSimple(uint32_t sequence,
                        const char* route,
                        uint32_t buildUs,
                        uint32_t sendUs,
                        uint32_t totalUs,
                        int sendResult) {
  if (!isHttpTraceEnabled()) return;
  Serial.printf(
    "HTTPTRACE req=%lu route=%s build_us=%lu send_us=%lu total_us=%lu send_rc=%d heap=%lu min_heap=%lu\n",
    (unsigned long)sequence,
    route,
    (unsigned long)buildUs,
    (unsigned long)sendUs,
    (unsigned long)totalUs,
    sendResult,
    (unsigned long)ESP.getFreeHeap(),
    (unsigned long)ESP.getMinFreeHeap());
}

void httpTraceLogStatus(uint32_t sequence,
                        const HttpStatusBuildTiming& timing,
                        uint32_t sendUs,
                        uint32_t totalUs,
                        int sendResult) {
  if (!isHttpTraceEnabled()) return;
  Serial.printf(
    "HTTPTRACE req=%lu route=/api/status config_copy_us=%lu battery_copy_us=%lu network_copy_us=%lu "
    "json_us=%lu build_total_us=%lu config_ready=%u battery_ready=%u network_ready=%u "
    "send_us=%lu total_us=%lu send_rc=%d heap=%lu min_heap=%lu\n",
    (unsigned long)sequence,
    (unsigned long)timing.configCopyUs,
    (unsigned long)timing.batteryCopyUs,
    (unsigned long)timing.networkCopyUs,
    (unsigned long)timing.jsonBuildUs,
    (unsigned long)timing.totalBuildUs,
    timing.configReady ? 1U : 0U,
    timing.batteryReady ? 1U : 0U,
    timing.networkReady ? 1U : 0U,
    (unsigned long)sendUs,
    (unsigned long)totalUs,
    sendResult,
    (unsigned long)ESP.getFreeHeap(),
    (unsigned long)ESP.getMinFreeHeap());
}

void httpTraceLogNetworkPublish(uint32_t statusUs,
                                uint32_t rssiUs,
                                uint32_t ipUs,
                                uint32_t publishUs,
                                uint32_t totalUs) {
  if (!isHttpTraceEnabled()) return;
  Serial.printf(
    "HTTPTRACE producer=network wifi_status_us=%lu wifi_rssi_us=%lu wifi_ip_us=%lu cache_publish_us=%lu total_us=%lu\n",
    (unsigned long)statusUs,
    (unsigned long)rssiUs,
    (unsigned long)ipUs,
    (unsigned long)publishUs,
    (unsigned long)totalUs);
}

void httpTraceLogAdcSample(uint32_t adcUs,
                           uint32_t configCopyUs,
                           uint32_t publishUs,
                           uint32_t totalUs) {
  if (!isHttpTraceEnabled()) return;
  Serial.printf(
    "HTTPTRACE producer=adc adc_us=%lu config_copy_us=%lu cache_publish_us=%lu total_us=%lu\n",
    (unsigned long)adcUs,
    (unsigned long)configCopyUs,
    (unsigned long)publishUs,
    (unsigned long)totalUs);
}

void httpTraceLogConfigPersist(const char* operation, uint32_t persistUs, uint32_t publishUs) {
  if (!isHttpTraceEnabled()) return;
  Serial.printf(
    "HTTPTRACE producer=config operation=%s nvs_write_us=%lu cache_publish_us=%lu\n",
    operation,
    (unsigned long)persistUs,
    (unsigned long)publishUs);
}
