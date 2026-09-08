// Authenticated LAN transport for the existing signed Battery Monitor OTA core.
//
// This is intentionally only a transport adapter. FirmwareUpdate.ino remains
// the sole image writer/verifier and therefore owns hash, RSA-PSS signature,
// application identity, release floor, OTA-slot selection, and rollback policy.
// Every state-changing request below requires an authenticated management
// session + CSRF token. There is no generic/unsigned HTTP BIN upload endpoint.

#include <mbedtls/base64.h>

static bool wifiFirmwareRebootPending = false;
static unsigned long wifiFirmwareRebootAtMs = 0;

static void sendWifiFirmwareError(int status, const String& code) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(status, "application/json",
              String("{\"ok\":false,\"error\":\"") + jsonEscape(code) + "\"}");
}

static void handleWifiFirmwareCaps() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json",
              String("{\"protocol\":\"SIGNED_LAN_OTA_V1\",\"maxChunk\":") +
              String((unsigned long)firmwareUpdateLanMaxChunk()) +
              ",\"signatureAlgorithm\":\"RSA-3072-PSS-SHA256\",\"firmwareVersion\":\"" +
              jsonEscape(String(FW_VERSION)) + "\"}");
}

static void handleWifiFirmwareBegin() {
  if (!requireManagementWriteAuth()) return;
  if (!server.hasArg("size") || !server.hasArg("sha256") || !server.hasArg("signature")) {
    sendWifiFirmwareError(400, "FW_METADATA_REQUIRED");
    return;
  }

  String error;
  if (!beginSignedFirmwareUpdateLan(server.arg("size"), server.arg("sha256"), server.arg("signature"), error)) {
    sendWifiFirmwareError(error == "FW_UPDATE_ALREADY_ACTIVE" ? 409 : 400, error);
    return;
  }

  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json",
              String("{\"ok\":true,\"protocol\":\"SIGNED_LAN_OTA_V1\",\"maxChunk\":") +
              String((unsigned long)firmwareUpdateLanMaxChunk()) + "}");
}

static void handleWifiFirmwareChunk() {
  if (!requireManagementWriteAuth()) return;
  if (!firmwareUpdateIsLanTransport()) {
    sendWifiFirmwareError(409, firmwareUpdateInProgress() ? "FW_TRANSPORT_MISMATCH" : "FW_NO_ACTIVE_UPDATE");
    return;
  }
  if (!server.hasArg("offset") || !server.hasArg("data")) {
    sendWifiFirmwareError(400, "FW_CHUNK_FIELDS_REQUIRED");
    return;
  }

  char* end = nullptr;
  unsigned long offset = strtoul(server.arg("offset").c_str(), &end, 10);
  if (!end || *end != '\0') {
    sendWifiFirmwareError(400, "FW_INVALID_OFFSET");
    return;
  }

  String encoded = server.arg("data");
  if (encoded.length() < 4 || encoded.length() > ((firmwareUpdateLanMaxChunk() + 2) / 3) * 4 + 4) {
    sendWifiFirmwareError(400, "FW_INVALID_CHUNK_ENCODING");
    return;
  }

  size_t maxChunk = firmwareUpdateLanMaxChunk();
  uint8_t* decoded = (uint8_t*)malloc(maxChunk);
  if (!decoded) {
    sendWifiFirmwareError(500, "FW_CHUNK_ALLOC_FAILED");
    return;
  }

  size_t decodedLen = 0;
  int rc = mbedtls_base64_decode(decoded, maxChunk, &decodedLen,
                                 (const unsigned char*)encoded.c_str(), encoded.length());
  if (rc != 0 || decodedLen < 1 || decodedLen > maxChunk) {
    memset(decoded, 0, maxChunk);
    free(decoded);
    sendWifiFirmwareError(400, "FW_INVALID_CHUNK_ENCODING");
    return;
  }

  size_t totalWritten = 0;
  String error;
  bool ok = writeSignedFirmwareLanChunk(decoded, decodedLen, (size_t)offset, totalWritten, error);
  memset(decoded, 0, maxChunk);
  free(decoded);
  if (!ok) {
    sendWifiFirmwareError(error.startsWith("FW_OFFSET_MISMATCH_") ? 409 : 400, error);
    return;
  }

  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json",
              String("{\"ok\":true,\"written\":") + String((unsigned long)totalWritten) + "}");
}

static void handleWifiFirmwareEnd() {
  if (!requireManagementWriteAuth()) return;
  if (!firmwareUpdateIsLanTransport()) {
    sendWifiFirmwareError(409, firmwareUpdateInProgress() ? "FW_TRANSPORT_MISMATCH" : "FW_NO_ACTIVE_UPDATE");
    return;
  }

  String version;
  String error;
  if (!finishSignedFirmwareUpdateLan(version, error)) {
    sendWifiFirmwareError(400, error);
    return;
  }

  wifiFirmwareRebootPending = true;
  wifiFirmwareRebootAtMs = millis() + 750UL;
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json",
              String("{\"ok\":true,\"verified\":true,\"version\":\"") +
              jsonEscape(version) + "\",\"rebooting\":true}");
}

static void handleWifiFirmwareAbort() {
  if (!requireManagementWriteAuth()) return;
  String result;
  if (!abortSignedFirmwareUpdateLan(result)) {
    sendWifiFirmwareError(409, String("FW_") + result);
    return;
  }
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", "{\"ok\":true,\"aborted\":true}");
}

void registerWifiFirmwareUpdateRoutes() {
  server.on("/api/firmware/caps", HTTP_GET, handleWifiFirmwareCaps);
  server.on("/api/firmware/begin", HTTP_POST, handleWifiFirmwareBegin);
  server.on("/api/firmware/chunk", HTTP_POST, handleWifiFirmwareChunk);
  server.on("/api/firmware/end", HTTP_POST, handleWifiFirmwareEnd);
  server.on("/api/firmware/abort", HTTP_POST, handleWifiFirmwareAbort);
}

void serviceWifiFirmwareUpdate() {
  if (!wifiFirmwareRebootPending) return;
  if ((int32_t)(millis() - wifiFirmwareRebootAtMs) < 0) return;
  wifiFirmwareRebootPending = false;
  Serial.println("Signed LAN OTA verified; rebooting into candidate partition.");
  Serial.flush();
  delay(25);
  ESP.restart();
}
