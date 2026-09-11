// Cross-task synchronization wrapper for the signed firmware-update core.
//
// FirmwareUpdate.ino owns one verifier/writer state machine, but production has
// two callers on different tasks: trusted USB on the Arduino application task
// and authenticated LAN OTA on esp_http_server's task. Every access to mutable
// OTA state is serialized here so the transports can never race an OTA handle,
// SHA-256 context, expected digest/signature, byte counters, or timeout abort.
//
// The Factory-only Secure Boot migration has a separate staged-bootloader state
// machine. New ordinary OTA sessions are rejected while that migration is
// active so LAN/USB application OTA can never compete with a bootloader write.

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

static SemaphoreHandle_t firmwareUpdateMutex = nullptr;
static portMUX_TYPE firmwareUpdateMutexInitMux = portMUX_INITIALIZER_UNLOCKED;
static bool firmwareUpdateSyncErrorReported = false;

bool initializeFirmwareUpdateSynchronization() {
  if (firmwareUpdateMutex != nullptr) return true;

  // Allocation itself must not occur inside a critical section. Two tasks may
  // race the first allocation, so publish exactly one candidate under a tiny
  // spinlock and delete any losing candidate afterward.
  SemaphoreHandle_t candidate = xSemaphoreCreateMutex();
  portENTER_CRITICAL(&firmwareUpdateMutexInitMux);
  if (firmwareUpdateMutex == nullptr && candidate != nullptr) {
    firmwareUpdateMutex = candidate;
    candidate = nullptr;
  }
  bool ready = firmwareUpdateMutex != nullptr;
  portEXIT_CRITICAL(&firmwareUpdateMutexInitMux);
  if (candidate != nullptr) vSemaphoreDelete(candidate);

  if (!ready && !firmwareUpdateSyncErrorReported) {
    firmwareUpdateSyncErrorReported = true;
    Serial.println("ERROR: Could not allocate firmware-update synchronization mutex; OTA is disabled.");
  }
  return ready;
}

static bool takeFirmwareUpdateMutex(TickType_t waitTicks = pdMS_TO_TICKS(5000)) {
  if (firmwareUpdateMutex == nullptr && !initializeFirmwareUpdateSynchronization()) return false;
  return xSemaphoreTake(firmwareUpdateMutex, waitTicks) == pdTRUE;
}

static void giveFirmwareUpdateMutex() {
  if (firmwareUpdateMutex != nullptr) xSemaphoreGive(firmwareUpdateMutex);
}

bool firmwareUpdateInProgress() {
  // Fail closed if synchronization itself is unavailable: the main loop must
  // not start competing network/recovery work while OTA state cannot be read
  // safely.
  if (!takeFirmwareUpdateMutex(pdMS_TO_TICKS(50))) return true;
  bool active = firmwareUpdateInProgressUnlocked();
  giveFirmwareUpdateMutex();
  return active;
}

bool firmwareUpdateIsLanTransport() {
  if (!takeFirmwareUpdateMutex(pdMS_TO_TICKS(250))) return false;
  bool lan = firmwareUpdateIsLanTransportUnlocked();
  giveFirmwareUpdateMutex();
  return lan;
}

bool firmwareUpdateRawBytesPending() {
  if (!takeFirmwareUpdateMutex(pdMS_TO_TICKS(250))) return false;
  bool pending = firmwareUpdateRawBytesPendingUnlocked();
  giveFirmwareUpdateMutex();
  return pending;
}

size_t firmwareUpdateBytesWritten() {
  if (!takeFirmwareUpdateMutex(pdMS_TO_TICKS(250))) return 0;
  size_t written = firmwareUpdateBytesWrittenUnlocked();
  giveFirmwareUpdateMutex();
  return written;
}

bool beginSignedFirmwareUpdate(const String& sizeToken,
                               const String& expectedSha256Hex,
                               const String& signatureBase64,
                               String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  if (secureBootMigrationInProgress()) {
    errorOut = "FW_SECURE_BOOT_MIGRATION_ACTIVE";
    giveFirmwareUpdateMutex();
    return false;
  }
  bool ok = beginSignedFirmwareUpdateUnlocked(sizeToken, expectedSha256Hex, signatureBase64, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool beginSignedFirmwareUpdateLan(const String& sizeToken,
                                  const String& expectedSha256Hex,
                                  const String& signatureBase64,
                                  String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  if (secureBootMigrationInProgress()) {
    errorOut = "FW_SECURE_BOOT_MIGRATION_ACTIVE";
    giveFirmwareUpdateMutex();
    return false;
  }
  bool ok = beginSignedFirmwareUpdateLanUnlocked(sizeToken, expectedSha256Hex, signatureBase64, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool prepareSignedFirmwareChunk(size_t chunkSize, String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  bool ok = prepareSignedFirmwareChunkUnlocked(chunkSize, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool writeSignedFirmwareLanChunk(const uint8_t* data,
                                 size_t chunkSize,
                                 size_t expectedOffset,
                                 size_t& totalWrittenOut,
                                 String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  bool ok = writeSignedFirmwareLanChunkUnlocked(data, chunkSize, expectedOffset, totalWrittenOut, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

void serviceSignedFirmwareRawSerial() {
  if (!takeFirmwareUpdateMutex()) return;
  serviceSignedFirmwareRawSerialUnlocked();
  giveFirmwareUpdateMutex();
}

bool finishSignedFirmwareUpdate(String& resultOut, String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  bool ok = finishSignedFirmwareUpdateUnlocked(resultOut, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool finishSignedFirmwareUpdateLan(String& resultOut, String& errorOut) {
  if (!takeFirmwareUpdateMutex()) { errorOut = "FW_SYNC_UNAVAILABLE"; return false; }
  bool ok = finishSignedFirmwareUpdateLanUnlocked(resultOut, errorOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool abortSignedFirmwareUpdate(String& resultOut) {
  if (!takeFirmwareUpdateMutex()) { resultOut = "SYNC_UNAVAILABLE"; return false; }
  bool ok = abortSignedFirmwareUpdateUnlocked(resultOut);
  giveFirmwareUpdateMutex();
  return ok;
}

bool abortSignedFirmwareUpdateLan(String& resultOut) {
  if (!takeFirmwareUpdateMutex()) { resultOut = "SYNC_UNAVAILABLE"; return false; }
  bool ok = abortSignedFirmwareUpdateLanUnlocked(resultOut);
  giveFirmwareUpdateMutex();
  return ok;
}

void serviceFirmwareUpdateTimeout() {
  if (!takeFirmwareUpdateMutex(pdMS_TO_TICKS(250))) return;
  serviceFirmwareUpdateTimeoutUnlocked();
  giveFirmwareUpdateMutex();
}
