// Monotonic signed-release policy for Battery Monitor firmware.
//
// The ESP-IDF application version is authoritative and must use exactly three
// single-digit numeric components:
//   major.minor.patch
// No component may become two digits; carry to the next component instead.
// The internal software release sequence is derived as:
//   major*100 + minor*10 + patch
// so 0.1.1 -> 11, 0.1.2 -> 12, 0.1.9 -> 19, and 0.2.0 -> 20.
// The highest accepted sequence is persisted in the encrypted default NVS
// partition. A correctly signed image is still rejected if its sequence is not
// strictly newer than both the persisted floor and the currently running image.
//
// This is deliberately software policy. ESP-IDF eFuse anti-rollback remains
// disabled until the later Secure Boot / production eFuse activation gate.

#include <esp_app_desc.h>
#include <esp_ota_ops.h>
#include <Preferences.h>

static const char* BATMON_RELEASE_PREF_NAMESPACE = "batmon";
static const char* BATMON_RELEASE_FLOOR_KEY = "fwseq";

static bool batteryMonitorParseReleaseSequence(const char* version,
                                               uint32_t& sequenceOut) {
  if (version == nullptr) return false;

  // Enforce exactly X.Y.Z where every component is one decimal digit. This is
  // intentionally stricter than ordinary semantic versioning because the
  // project-wide version rule forbids two-digit components.
  if (version[0] < '0' || version[0] > '9' ||
      version[1] != '.' ||
      version[2] < '0' || version[2] > '9' ||
      version[3] != '.' ||
      version[4] < '0' || version[4] > '9' ||
      version[5] != '\0') {
    return false;
  }

  uint32_t major = (uint32_t)(version[0] - '0');
  uint32_t minor = (uint32_t)(version[2] - '0');
  uint32_t patch = (uint32_t)(version[4] - '0');
  uint32_t sequence = major * 100U + minor * 10U + patch;
  if (sequence == 0) return false;

  sequenceOut = sequence;
  return true;
}

static bool batteryMonitorRunningReleaseSequence(uint32_t& sequenceOut,
                                                 String& errorOut) {
  const esp_app_desc_t* app = esp_app_get_description();
  if (app == nullptr || !batteryMonitorParseReleaseSequence(app->version, sequenceOut)) {
    errorOut = "FW_RUNNING_RELEASE_SEQUENCE_INVALID";
    return false;
  }
  return true;
}

static bool batteryMonitorReadReleaseFloor(uint32_t& floorOut,
                                           String& errorOut) {
  // Open read/write so a blank device can create the namespace before its first
  // floor write. The underlying default NVS partition is encrypted by ESP-IDF.
  Preferences releasePrefs;
  if (!releasePrefs.begin(BATMON_RELEASE_PREF_NAMESPACE, false)) {
    errorOut = "FW_RELEASE_FLOOR_OPEN_FAILED";
    return false;
  }
  floorOut = releasePrefs.getUInt(BATMON_RELEASE_FLOOR_KEY, 0);
  releasePrefs.end();
  return true;
}

static bool batteryMonitorWriteReleaseFloor(uint32_t floor,
                                            String& errorOut) {
  if (floor == 0) {
    errorOut = "FW_RELEASE_FLOOR_ZERO";
    return false;
  }

  Preferences releasePrefs;
  if (!releasePrefs.begin(BATMON_RELEASE_PREF_NAMESPACE, false)) {
    errorOut = "FW_RELEASE_FLOOR_OPEN_FAILED";
    return false;
  }
  size_t written = releasePrefs.putUInt(BATMON_RELEASE_FLOOR_KEY, floor);
  releasePrefs.end();
  if (written != sizeof(uint32_t)) {
    errorOut = "FW_RELEASE_FLOOR_WRITE_FAILED";
    return false;
  }
  return true;
}

bool initializeFirmwareReleasePolicy(String& errorOut) {
  uint32_t runningSequence = 0;
  if (!batteryMonitorRunningReleaseSequence(runningSequence, errorOut)) return false;

  uint32_t storedFloor = 0;
  if (!batteryMonitorReadReleaseFloor(storedFloor, errorOut)) return false;

  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  bool pendingVerify = running != nullptr &&
                       esp_ota_get_state_partition(running, &state) == ESP_OK &&
                       state == ESP_OTA_IMG_PENDING_VERIFY;

  // A pending candidate is allowed above the old floor but must not advance the
  // floor until the local health probation succeeds. This preserves automatic
  // fallback to the previous valid slot if the candidate crashes or resets.
  if (pendingVerify) {
    if (storedFloor != 0 && runningSequence <= storedFloor) {
      errorOut = "FW_PENDING_RELEASE_NOT_NEWER";
      return false;
    }
    Serial.printf("Firmware release policy: pending sequence %lu, stored floor %lu.\n",
                  (unsigned long)runningSequence,
                  (unsigned long)storedFloor);
    errorOut = "";
    return true;
  }

  // Stable first-install/current images establish or repair the software floor.
  if (storedFloor == 0 || runningSequence > storedFloor) {
    if (!batteryMonitorWriteReleaseFloor(runningSequence, errorOut)) return false;
    storedFloor = runningSequence;
  }

  if (runningSequence < storedFloor) {
    errorOut = "FW_RUNNING_RELEASE_BELOW_FLOOR";
    return false;
  }

  Serial.printf("Firmware release policy: running sequence %lu, floor %lu.\n",
                (unsigned long)runningSequence,
                (unsigned long)storedFloor);
  errorOut = "";
  return true;
}

bool commitRunningFirmwareReleaseFloor(String& errorOut) {
  uint32_t runningSequence = 0;
  if (!batteryMonitorRunningReleaseSequence(runningSequence, errorOut)) return false;

  uint32_t storedFloor = 0;
  if (!batteryMonitorReadReleaseFloor(storedFloor, errorOut)) return false;
  if (runningSequence < storedFloor) {
    errorOut = "FW_RUNNING_RELEASE_BELOW_FLOOR";
    return false;
  }
  if (runningSequence == storedFloor) {
    errorOut = "";
    return true;
  }

  if (!batteryMonitorWriteReleaseFloor(runningSequence, errorOut)) return false;
  Serial.printf("Firmware release floor advanced to sequence %lu.\n",
                (unsigned long)runningSequence);
  errorOut = "";
  return true;
}

// FirmwareUpdate.ino's final esp_ota_set_boot_partition() call is redirected to
// this wrapper by BatteryMonitorApp.cpp. The transfer/hash/signature/image checks
// still run unchanged; this is an additional final policy gate immediately
// before otadata is modified.
esp_err_t batteryMonitorPolicySetBootPartition(const esp_partition_t* partition) {
  if (partition == nullptr) return ESP_ERR_INVALID_ARG;

  esp_app_desc_t candidate = {};
  if (esp_ota_get_partition_description(partition, &candidate) != ESP_OK) {
    return ESP_ERR_OTA_VALIDATE_FAILED;
  }

  uint32_t candidateSequence = 0;
  if (!batteryMonitorParseReleaseSequence(candidate.version, candidateSequence)) {
    Serial.printf("Rejecting OTA candidate with invalid release version '%s'.\n",
                  candidate.version);
    return ESP_ERR_OTA_VALIDATE_FAILED;
  }

  String policyError;
  uint32_t runningSequence = 0;
  if (!batteryMonitorRunningReleaseSequence(runningSequence, policyError)) {
    Serial.printf("Rejecting OTA because running release sequence is invalid: %s\n",
                  policyError.c_str());
    return ESP_ERR_OTA_VALIDATE_FAILED;
  }

  uint32_t storedFloor = 0;
  if (!batteryMonitorReadReleaseFloor(storedFloor, policyError)) {
    Serial.printf("Rejecting OTA because release floor is unavailable: %s\n",
                  policyError.c_str());
    return ESP_ERR_OTA_VALIDATE_FAILED;
  }

  uint32_t effectiveFloor = storedFloor > runningSequence ? storedFloor : runningSequence;
  if (candidateSequence <= effectiveFloor) {
    Serial.printf("Rejecting signed OTA downgrade/replay: candidate sequence %lu, floor %lu.\n",
                  (unsigned long)candidateSequence,
                  (unsigned long)effectiveFloor);
    return ESP_ERR_OTA_SMALL_SEC_VER;
  }

  Serial.printf("Signed OTA release sequence accepted: %lu -> %lu.\n",
                (unsigned long)effectiveFloor,
                (unsigned long)candidateSequence);
  return esp_ota_set_boot_partition(partition);
}
