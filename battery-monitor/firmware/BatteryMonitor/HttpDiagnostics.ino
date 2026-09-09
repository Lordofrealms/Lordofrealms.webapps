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

// One-shot hard-source probe used only from trusted USB Advanced Tools. Unlike
// normal HTTP/status, this deliberately bypasses the published caches exactly
// once so we can measure the underlying getters themselves.
String runHttpSourceTimingDiagnostic() {
  const uint32_t totalStart = micros();
  uint32_t stageStart = 0;

  uint32_t nvsBeginUs = 0, nvsNameUs = 0, nvsChemUs = 0, nvsLowUs = 0;
  uint32_t nvsCritUs = 0, nvsCalFactorUs = 0, nvsCalOffsetUs = 0;
  uint32_t nvsSampleUs = 0, nvsSsidUs = 0, nvsPassUs = 0, nvsEndUs = 0;
  bool nvsOpened = false;
  String diagName, diagChem, diagSsid, diagPass;
  float diagLow = 0.0f, diagCrit = 0.0f, diagCalFactor = 0.0f, diagCalOffset = 0.0f;
  uint32_t diagSample = 0;

  Preferences diagnosticPrefs;
  stageStart = micros();
  nvsOpened = diagnosticPrefs.begin("batmon", true);
  nvsBeginUs = (uint32_t)(micros() - stageStart);
  if (nvsOpened) {
    stageStart = micros(); diagName = diagnosticPrefs.getString("name", ""); nvsNameUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagChem = diagnosticPrefs.getString("chem", ""); nvsChemUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagLow = diagnosticPrefs.getFloat("low", 0.0f); nvsLowUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagCrit = diagnosticPrefs.getFloat("crit", 0.0f); nvsCritUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagCalFactor = diagnosticPrefs.getFloat("calf", 0.0f); nvsCalFactorUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagCalOffset = diagnosticPrefs.getFloat("calo", 0.0f); nvsCalOffsetUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagSample = diagnosticPrefs.getUInt("sample", 0); nvsSampleUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagSsid = diagnosticPrefs.getString("ssid", ""); nvsSsidUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagPass = diagnosticPrefs.getString("pass", ""); nvsPassUs = (uint32_t)(micros() - stageStart);
    stageStart = micros(); diagnosticPrefs.end(); nvsEndUs = (uint32_t)(micros() - stageStart);
  }

  stageStart = micros();
  const wl_status_t wifiStatus = WiFi.status();
  const uint32_t wifiStatusUs = (uint32_t)(micros() - stageStart);

  stageStart = micros();
  const int32_t rssi = wifiStatus == WL_CONNECTED ? WiFi.RSSI() : 0;
  const uint32_t wifiRssiUs = (uint32_t)(micros() - stageStart);

  stageStart = micros();
  IPAddress ip(0, 0, 0, 0);
  if (wifiStatus == WL_CONNECTED) ip = WiFi.localIP();
  else if (secureProvisioningActive.load(std::memory_order_acquire) || fallbackApActive) ip = WiFi.softAPIP();
  const String ipText = ip.toString();
  const uint32_t wifiIpUs = (uint32_t)(micros() - stageStart);

  // Match the real battery sampling workload closely: four throwaways followed
  // by twenty mV + raw pairs with the same settling delays. This does not publish
  // the result; it is purely a timing probe.
  stageStart = micros();
  for (int i = 0; i < 4; ++i) {
    analogReadMilliVolts(BATTERY_ADC_PIN);
    delay(2);
  }
  uint32_t mvSum = 0;
  uint32_t rawSum = 0;
  for (int i = 0; i < 20; ++i) {
    mvSum += analogReadMilliVolts(BATTERY_ADC_PIN);
    rawSum += analogRead(BATTERY_ADC_PIN);
    delay(2);
  }
  const uint32_t adcUs = (uint32_t)(micros() - stageStart);
  const uint32_t adcMv = mvSum / 20U;
  const uint32_t adcRawValue = rawSum / 20U;

  const uint32_t totalUs = (uint32_t)(micros() - totalStart);

  String result = "SOURCES";
  result += " total_us=" + String(totalUs);
  result += " nvs_open=" + String(nvsOpened ? 1 : 0);
  result += " nvs_begin_us=" + String(nvsBeginUs);
  result += " nvs_name_us=" + String(nvsNameUs);
  result += " nvs_chem_us=" + String(nvsChemUs);
  result += " nvs_low_us=" + String(nvsLowUs);
  result += " nvs_crit_us=" + String(nvsCritUs);
  result += " nvs_calf_us=" + String(nvsCalFactorUs);
  result += " nvs_calo_us=" + String(nvsCalOffsetUs);
  result += " nvs_sample_us=" + String(nvsSampleUs);
  result += " nvs_ssid_us=" + String(nvsSsidUs);
  result += " nvs_pass_us=" + String(nvsPassUs);
  result += " nvs_end_us=" + String(nvsEndUs);
  result += " wifi_status_us=" + String(wifiStatusUs);
  result += " wifi_rssi_us=" + String(wifiRssiUs);
  result += " wifi_ip_us=" + String(wifiIpUs);
  result += " wifi_status=" + String((int)wifiStatus);
  result += " rssi=" + String(rssi);
  result += " ip=" + ipText;
  result += " adc_us=" + String(adcUs);
  result += " adc_mv=" + String(adcMv);
  result += " adc_raw=" + String(adcRawValue);
  result += " cfg_name_len=" + String(diagName.length());
  result += " cfg_chem=" + diagChem;
  result += " cfg_low=" + String(diagLow, 3);
  result += " cfg_crit=" + String(diagCrit, 3);
  result += " cfg_calf=" + String(diagCalFactor, 6);
  result += " cfg_calo=" + String(diagCalOffset, 4);
  result += " cfg_sample=" + String(diagSample);
  result += " cfg_ssid_len=" + String(diagSsid.length());
  result += " cfg_pass_len=" + String(diagPass.length());

  // Do not retain a diagnostic copy of the Wi-Fi password any longer than the
  // one-shot read requires.
  diagPass = "";
  return result;
}
