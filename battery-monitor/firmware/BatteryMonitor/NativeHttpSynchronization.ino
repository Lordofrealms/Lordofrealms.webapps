// Cross-task synchronization layer for the native ESP-IDF HTTP server.
//
// NativeHttpServer.ino remains the one parser/route implementation. This layer
// replaces handlers that mutate shared application state or hand work to the
// Arduino application task. It also owns the browser-facing read routes so the
// WebUI cannot be held hostage by config loading or stale persistent sockets.
//
// A public server stop always terminates esp_http_server first, then invalidates
// management challenges/sessions. Therefore a restarted server cannot have an
// already-authenticated client capable of reaching a core mutating route during
// the very short interval before synchronized replacements are installed.

#include <atomic>
#include <sys/time.h>

static std::atomic<uint32_t> synchronizedProvisioningStartAtMs{0};
static std::atomic<uint32_t> synchronizedFirmwareRebootAtMs{0};
static std::atomic<bool> synchronizedFirmwareRebootPending{false};
static std::atomic<uint32_t> browserRootSlowResponses{0};
static std::atomic<uint32_t> browserStatusSlowResponses{0};
static std::atomic<uint32_t> browserConfigSlowResponses{0};
static const size_t BROWSER_ROOT_CHUNK_BYTES = 1024;

static void prepareBrowserResponse(httpd_req_t* req) {
  // esp_http_server uses one server task. A browser tab that disappears while a
  // response is being sent must not own that task for the global 3-second send
  // timeout. Browser read responses are intentionally short-lived connections.
  httpd_resp_set_hdr(req, "Connection", "close");
  int fd = httpd_req_to_sockfd(req);
  if (fd >= 0) {
    struct timeval timeout = {};
    timeout.tv_sec = 1;
    timeout.tv_usec = 0;
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  }
}

static void recordBrowserResponseLatency(const char* route,
                                         uint32_t startedUs,
                                         std::atomic<uint32_t>& slowCounter) {
  uint32_t elapsed = (uint32_t)(micros() - startedUs);
  if (elapsed < 250000UL) return;
  slowCounter.fetch_add(1, std::memory_order_relaxed);
  Serial.printf("WARNING: Native HTTP %s response took %lu ms.\n",
                route, (unsigned long)(elapsed / 1000UL));
}

static esp_err_t synchronizedNativeRootHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  const bool trace = isHttpTraceEnabled();
  const uint32_t sequence = trace ? nextHttpTraceSequence() : 0;
  const uint32_t startedUs = micros();
  prepareBrowserResponse(req);

  const uint32_t buildStart = trace ? micros() : 0;
  String page = buildIndexPage();
  // Live status must never depend on the settings/config endpoint. Populate
  // configuration only after successful management unlock; status starts as
  // soon as the HTML/JS has loaded.
  page.replace("loadConfig().then(refreshLoop);", "refreshLoop();");
  page.replace(
    "session=s.session;csrf=s.csrf;el('devicePassword').value='';el('settings').disabled=false;",
    "session=s.session;csrf=s.csrf;await loadConfig();el('devicePassword').value='';el('settings').disabled=false;"
  );
  const uint32_t buildUs = trace ? (uint32_t)(micros() - buildStart) : 0;

  // The self-contained page is much larger than the JSON responses. Send it in
  // bounded chunks so a partial/disconnected client fails at a known chunk and
  // cannot require one monolithic socket write. This also lets HTTPTRACE report
  // exactly how far a truncated framework transfer progressed.
  httpd_resp_set_status(req, nativeHttpStatusText(200));
  httpd_resp_set_type(req, "text/html; charset=utf-8");
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");

  const uint32_t sendStart = trace ? micros() : 0;
  esp_err_t result = ESP_OK;
  uint32_t chunksSent = 0;
  uint32_t maxChunkUs = 0;
  int failedChunk = -1;
  size_t offset = 0;
  while (offset < page.length()) {
    size_t remaining = page.length() - offset;
    size_t chunkBytes = remaining < BROWSER_ROOT_CHUNK_BYTES ? remaining : BROWSER_ROOT_CHUNK_BYTES;
    uint32_t chunkStart = trace ? micros() : 0;
    result = httpd_resp_send_chunk(req, page.c_str() + offset, chunkBytes);
    if (trace) {
      uint32_t chunkUs = (uint32_t)(micros() - chunkStart);
      if (chunkUs > maxChunkUs) maxChunkUs = chunkUs;
    }
    if (result != ESP_OK) {
      failedChunk = (int)chunksSent;
      break;
    }
    offset += chunkBytes;
    chunksSent++;
  }
  if (result == ESP_OK) {
    uint32_t chunkStart = trace ? micros() : 0;
    result = httpd_resp_send_chunk(req, nullptr, 0);
    if (trace) {
      uint32_t chunkUs = (uint32_t)(micros() - chunkStart);
      if (chunkUs > maxChunkUs) maxChunkUs = chunkUs;
    }
    if (result != ESP_OK) failedChunk = (int)chunksSent;
  }
  const uint32_t sendUs = trace ? (uint32_t)(micros() - sendStart) : 0;
  if (trace) {
    httpTraceLogRootChunks(sequence, buildUs, page.length(), chunksSent, maxChunkUs,
                           failedChunk, sendUs, (uint32_t)(micros() - startedUs), (int)result);
  }
  recordBrowserResponseLatency("/", startedUs, browserRootSlowResponses);
  return result;
}

static esp_err_t synchronizedNativeStatusHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  const bool trace = isHttpTraceEnabled();
  const uint32_t sequence = trace ? nextHttpTraceSequence() : 0;
  const uint32_t startedUs = micros();
  prepareBrowserResponse(req);

  HttpStatusBuildTiming timing = {};
  String body = batterySnapshotStatusJson(trace ? &timing : nullptr);

  const uint32_t sendStart = trace ? micros() : 0;
  esp_err_t result = nativeSendJson(req, 200, body);
  const uint32_t sendUs = trace ? (uint32_t)(micros() - sendStart) : 0;
  if (trace) httpTraceLogStatus(sequence, timing, sendUs,
                                (uint32_t)(micros() - startedUs), (int)result);
  recordBrowserResponseLatency("/api/status", startedUs, browserStatusSlowResponses);
  return result;
}

static esp_err_t synchronizedNativeConfigGetHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  const bool trace = isHttpTraceEnabled();
  const uint32_t sequence = trace ? nextHttpTraceSequence() : 0;
  const uint32_t startedUs = micros();
  prepareBrowserResponse(req);

  const uint32_t buildStart = trace ? micros() : 0;
  // configJson() is prebuilt when configuration is published. Reads do not wait
  // for NVS persistence and do not copy mutable authoritative globals.
  String body = configJson();
  const uint32_t buildUs = trace ? (uint32_t)(micros() - buildStart) : 0;

  const uint32_t sendStart = trace ? micros() : 0;
  esp_err_t result = nativeSendJson(req, 200, body);
  const uint32_t sendUs = trace ? (uint32_t)(micros() - sendStart) : 0;
  if (trace) httpTraceLogSimple(sequence, "/api/config", buildUs, sendUs,
                                (uint32_t)(micros() - startedUs), (int)result);
  recordBrowserResponseLatency("/api/config", startedUs, browserConfigSlowResponses);
  return result;
}

static esp_err_t synchronizedNativeConfigPostHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  String body;
  if (!nativeReadBody(req, body, 4096))
    return nativeSendJson(req, 413, "{\"error\":\"configuration body too large\"}");

  DeviceConfigState current = {};
  if (!copyDeviceConfigState(current))
    return nativeSendJson(req, 503, "{\"error\":\"configuration synchronization unavailable\"}");

  String proposedName = current.deviceName;
  String proposedType = current.batteryType;
  float proposedLow = current.lowVoltage;
  float proposedCritical = current.criticalVoltage;
  float proposedFactor = current.calibrationFactor;
  float proposedOffset = current.calibrationOffset;
  uint32_t proposedSample = current.sampleIntervalSec;
  bool valid = true;
  String value;

  if (nativeFormValue(body, "name", value)) {
    value.trim();
    if (value.length() >= 1 && value.length() <= 48) proposedName = value; else valid = false;
  }
  if (nativeFormValue(body, "batteryType", value)) {
    value.trim();
    if (isValidBatteryProfileId(value)) proposedType = value; else valid = false;
  }
  if (nativeFormValue(body, "lowVoltage", value)) proposedLow = value.toFloat();
  if (nativeFormValue(body, "criticalVoltage", value)) proposedCritical = value.toFloat();
  if (nativeFormValue(body, "sampleIntervalSec", value)) proposedSample = (uint32_t)value.toInt();
  if (nativeFormValue(body, "calibrationFactor", value)) proposedFactor = value.toFloat();
  if (nativeFormValue(body, "calibrationOffset", value)) proposedOffset = value.toFloat();

  if (proposedSample < 1) proposedSample = 1;
  if (proposedSample > 3600) proposedSample = 3600;
  if (!valid || proposedCritical < 6.0f || proposedCritical > 20.0f ||
      proposedLow <= proposedCritical || proposedLow > 20.0f ||
      proposedFactor < 0.5f || proposedFactor > 1.5f ||
      proposedOffset < -5.0f || proposedOffset > 5.0f) {
    return nativeSendJson(req, 400, "{\"error\":\"invalid configuration\"}");
  }

  String error;
  if (!applyDeviceConfiguration(proposedName, proposedType, proposedLow, proposedCritical,
                                proposedFactor, proposedOffset, proposedSample, error)) {
    return nativeSendJson(req, 503, String("{\"error\":\"") + jsonEscape(error) + "\"}");
  }
  return nativeSendJson(req, 200, configJson());
}

static esp_err_t synchronizedNativeProvisioningHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  if (!hasProvisioningIdentity() && !loadDeviceCredentialIdentity())
    return nativeSendJson(req, 503, "{\"error\":\"device password not initialized\"}");
  synchronizedProvisioningStartAtMs.store((uint32_t)(millis() + 350UL), std::memory_order_release);
  return nativeSendJson(req, 200, String("{\"ok\":true,\"setupSsid\":\"") + jsonEscape(apSsid) + "\"}");
}

static esp_err_t synchronizedNativeFirmwareEndHandler(httpd_req_t* req) {
  NativeHttpRequestScope scope;
  if (!nativeRequireManagementWriteAuth(req)) return ESP_OK;
  if (!firmwareUpdateIsLanTransport()) {
    String error = firmwareUpdateInProgress() ? "FW_TRANSPORT_MISMATCH" : "FW_NO_ACTIVE_UPDATE";
    return nativeSendJson(req, 409, String("{\"ok\":false,\"error\":\"") + error + "\"}");
  }
  String version, error;
  if (!finishSignedFirmwareUpdateLan(version, error))
    return nativeSendJson(req, 400, String("{\"ok\":false,\"error\":\"") + jsonEscape(error) + "\"}");
  synchronizedFirmwareRebootAtMs.store((uint32_t)(millis() + 750UL), std::memory_order_relaxed);
  synchronizedFirmwareRebootPending.store(true, std::memory_order_release);
  return nativeSendJson(req, 200, String("{\"ok\":true,\"verified\":true,\"version\":\"") +
                        jsonEscape(version) + "\",\"rebooting\":true}");
}

static bool replaceNativeHandler(const char* uri,
                                 httpd_method_t method,
                                 esp_err_t (*handler)(httpd_req_t*)) {
  esp_err_t unreg = httpd_unregister_uri_handler(nativeHttpServer, uri, method);
  if (unreg != ESP_OK) {
    Serial.printf("ERROR: Could not replace native HTTP route %s: unregister=%s\n",
                  uri, esp_err_to_name(unreg));
    return false;
  }
  if (!registerNativeUri(uri, method, handler)) {
    Serial.printf("ERROR: Could not replace native HTTP route %s: registration failed.\n", uri);
    return false;
  }
  return true;
}

void stopNativeHttpServer() {
  stopNativeHttpServerCore();
  invalidateManagementSessions();
}

bool startNativeHttpServer() {
  if (!initializeDeviceConfigSynchronization()) {
    httpServerActive = false;
    return false;
  }
  if (!startNativeHttpServerCore()) return false;

  bool routesOk =
    replaceNativeHandler("/", HTTP_GET, synchronizedNativeRootHandler) &&
    replaceNativeHandler("/api/status", HTTP_GET, synchronizedNativeStatusHandler) &&
    replaceNativeHandler("/api/config", HTTP_GET, synchronizedNativeConfigGetHandler) &&
    replaceNativeHandler("/api/config", HTTP_POST, synchronizedNativeConfigPostHandler) &&
    replaceNativeHandler("/api/wifi/provisioning", HTTP_POST, synchronizedNativeProvisioningHandler) &&
    replaceNativeHandler("/api/reset-wifi", HTTP_POST, synchronizedNativeProvisioningHandler) &&
    replaceNativeHandler("/api/firmware/end", HTTP_POST, synchronizedNativeFirmwareEndHandler);
  if (!routesOk) {
    stopNativeHttpServer();
    return false;
  }
  return true;
}

void serviceNativeHttpControlMainSafe() {
  uint32_t provisioningAt = synchronizedProvisioningStartAtMs.load(std::memory_order_acquire);
  if (provisioningAt != 0 && (int32_t)((uint32_t)millis() - provisioningAt) >= 0) {
    if (synchronizedProvisioningStartAtMs.compare_exchange_strong(
          provisioningAt, 0, std::memory_order_acq_rel, std::memory_order_acquire)) {
      if (!fallbackApActive) {
        stopNativeHttpServer();
        stopMdns();
        stopDiscovery();
        startFallbackAp();
      }
    }
  }

  if (synchronizedFirmwareRebootPending.load(std::memory_order_acquire)) {
    uint32_t rebootAt = synchronizedFirmwareRebootAtMs.load(std::memory_order_relaxed);
    if ((int32_t)((uint32_t)millis() - rebootAt) >= 0 &&
        synchronizedFirmwareRebootPending.exchange(false, std::memory_order_acq_rel)) {
      Serial.println("Signed native LAN OTA verified; rebooting into candidate partition.");
      Serial.flush();
      delay(25);
      ESP.restart();
    }
  }
}
