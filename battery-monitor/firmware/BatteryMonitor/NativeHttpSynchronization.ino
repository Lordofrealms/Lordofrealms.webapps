// Cross-task synchronization layer for the native ESP-IDF HTTP server.
//
// NativeHttpServer.ino remains the one parser/route implementation. This layer
// replaces only handlers that mutate shared application state or hand work to
// the Arduino application task. That keeps the native server small while making
// configuration writes and deferred provisioning/reboot control race-free.
//
// A public server stop always terminates esp_http_server first, then invalidates
// management challenges/sessions. Therefore a restarted server cannot have an
// already-authenticated client capable of reaching a core mutating route during
// the very short interval before synchronized replacements are installed.

#include <atomic>

static std::atomic<uint32_t> synchronizedProvisioningStartAtMs{0};
static std::atomic<uint32_t> synchronizedFirmwareRebootAtMs{0};
static std::atomic<bool> synchronizedFirmwareRebootPending{false};

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
  // httpd_stop() waits for the server task to terminate. Only after that task is
  // gone do we touch its challenge/session arrays from the application task.
  // This preserves single-task ownership while guaranteeing no authenticated
  // session survives into a later server start/replacement interval.
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