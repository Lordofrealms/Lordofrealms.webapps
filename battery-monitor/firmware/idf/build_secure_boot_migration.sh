#!/usr/bin/env bash
set -euo pipefail

# Factory-only Secure Boot v2 retrofit candidate build.
#
# This reuses the one authoritative Battery Monitor ESP-IDF source tree but
# overlays Secure Boot v2/ECO3 settings and uses a separate monotonically newer
# release sequence. CI deliberately produces secure-padded *unsigned* app and
# bootloader images. The Secure Boot private key belongs only in the protected
# migration-signing workflow.

EXPECTED_IDF_COMMIT="b774170ff46c393eeb5e495ea37936038d3f4f4f" # ESP-IDF v5.5.5
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$PROJECT_DIR/out-secure-boot-migration}"
VERSION_FILE="$PROJECT_DIR/version-secure-boot-migration.txt"
BASE_DEFAULTS="$PROJECT_DIR/sdkconfig.defaults"
MIGRATION_DEFAULTS="$PROJECT_DIR/sdkconfig.secure_boot_migration.defaults"
PARTITIONS="$PROJECT_DIR/partitions.csv"

if [[ -z "${IDF_PATH:-}" ]]; then
  echo "IDF_PATH is not set. Install/activate ESP-IDF v5.5.5 first." >&2
  exit 2
fi
actual_idf_commit="$(git -C "$IDF_PATH" rev-parse HEAD 2>/dev/null || true)"
if [[ "$actual_idf_commit" != "$EXPECTED_IDF_COMMIT" ]]; then
  echo "Secure Boot migration requires exact ESP-IDF commit $EXPECTED_IDF_COMMIT (v5.5.5)." >&2
  exit 2
fi
for file in "$VERSION_FILE" "$BASE_DEFAULTS" "$MIGRATION_DEFAULTS" "$PARTITIONS"; do
  test -f "$file" || { echo "Required migration build authority missing: $file" >&2; exit 3; }
done

APP_VERSION="$(tr -d '\r\n' < "$VERSION_FILE")"
if [[ ! "$APP_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)\.([1-9][0-9]*)$ ]]; then
  echo "Migration version must be major.minor.patch.release_sequence: $APP_VERSION" >&2
  exit 3
fi
APP_RELEASE_SEQUENCE="${BASH_REMATCH[4]}"
if (( APP_RELEASE_SEQUENCE > 4294967295 )); then
  echo "Migration release sequence exceeds uint32 range: $APP_RELEASE_SEQUENCE" >&2
  exit 3
fi

# The deployed units use this exact partition layout. Migration must not depend
# on rewriting it. app slots remain 0x140000 each and coredump is a 0x10000
# temporary staging area for the second-stage bootloader.
grep -Eq '^app0,[[:space:]]*app,[[:space:]]*ota_0,[[:space:]]*0x10000,[[:space:]]*0x140000,' "$PARTITIONS" || {
  echo 'Migration requires deployed app0 layout @ 0x10000 size 0x140000.' >&2; exit 3; }
grep -Eq '^app1,[[:space:]]*app,[[:space:]]*ota_1,[[:space:]]*0x150000,[[:space:]]*0x140000,' "$PARTITIONS" || {
  echo 'Migration requires deployed app1 layout @ 0x150000 size 0x140000.' >&2; exit 3; }
grep -Eq '^coredump,[[:space:]]*data,[[:space:]]*coredump,[[:space:]]*0x3F0000,[[:space:]]*0x10000,' "$PARTITIONS" || {
  echo 'Migration requires the existing 64 KiB coredump staging partition.' >&2; exit 3; }

rm -rf "$PROJECT_DIR/build" "$PROJECT_DIR/sdkconfig" "$OUT_DIR"
mkdir -p "$OUT_DIR"

export BATMON_VERSION_FILE="$VERSION_FILE"
export BATMON_SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.secure_boot_migration.defaults"

cd "$PROJECT_DIR"
idf.py set-target esp32
idf.py build

for required in \
  'CONFIG_ESP32_REV_MIN_3=y' \
  'CONFIG_ESP32_REV_MIN=3' \
  'CONFIG_SECURE_BOOT=y' \
  'CONFIG_SECURE_BOOT_V2_ENABLED=y' \
  'CONFIG_SECURE_FLASH_ENC_ENABLED=y' \
  'CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y' \
  'CONFIG_NVS_ENCRYPTION=y' \
  'CONFIG_NVS_SEC_KEY_PROTECT_USING_FLASH_ENC=y' \
  'CONFIG_PARTITION_TABLE_OFFSET=0xF000'; do
  if ! grep -qx "$required" sdkconfig; then
    echo "Required Secure Boot migration setting missing: $required" >&2
    exit 3
  fi
done
if grep -qx 'CONFIG_SECURE_BOOT_BUILD_SIGNED_BINARIES=y' sdkconfig; then
  echo 'CI migration build must remain remotely signed; private Secure Boot key must not be required here.' >&2
  exit 3
fi
if grep -qx 'CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK=y' sdkconfig; then
  echo 'Hardware application anti-rollback stays disabled during Secure Boot migration validation.' >&2
  exit 3
fi

APP_BIN="$PROJECT_DIR/build/BatteryMonitor.bin"
BOOT_BIN="$PROJECT_DIR/build/bootloader/bootloader.bin"
test -f "$APP_BIN" || { echo 'Secure Boot migration application binary missing.' >&2; exit 3; }
test -f "$BOOT_BIN" || { echo 'Secure Boot migration bootloader binary missing.' >&2; exit 3; }

# Remote Secure Boot v2 signing appends one 4 KiB signature sector. Prove the
# final signed images can still fit the already-deployed partitions before they
# ever reach the protected signer.
app_size="$(stat -c %s "$APP_BIN")"
boot_size="$(stat -c %s "$BOOT_BIN")"
app_limit=$((0x140000 - 0x1000))
boot_limit=$((0xE000 - 0x1000))
staging_limit=$((0x10000 - 0x1000))
if (( app_size > app_limit )); then
  echo "Secure Boot migration app leaves no room for signature sector: $app_size > $app_limit" >&2
  exit 3
fi
if (( boot_size > boot_limit )); then
  echo "Secure Boot migration bootloader leaves no room for signature sector in primary region: $boot_size > $boot_limit" >&2
  exit 3
fi
if (( boot_size > staging_limit )); then
  echo "Secure Boot migration bootloader leaves no room for signature sector in 64 KiB staging partition: $boot_size > $staging_limit" >&2
  exit 3
fi

cp "$APP_BIN" "$OUT_DIR/BatteryMonitor.secureboot.app.unsigned.bin"
cp "$BOOT_BIN" "$OUT_DIR/BatteryMonitor.secureboot.bootloader.unsigned.bin"
cp sdkconfig "$OUT_DIR/sdkconfig.secure-boot-migration"
cp "$PARTITIONS" "$OUT_DIR/partitions.csv"
cp "$VERSION_FILE" "$OUT_DIR/version-secure-boot-migration.txt"
cp build/partition_table/partition-table.bin "$OUT_DIR/partition-table.bin"

python - "$OUT_DIR/BatteryMonitor.secureboot.app.unsigned.bin" "$APP_VERSION" <<'PY'
from pathlib import Path
import sys
image = Path(sys.argv[1]).read_bytes()
version = sys.argv[2].encode('ascii') + b'\x00'
if version not in image:
    raise SystemExit(f"Migration version {sys.argv[2]} is not embedded in the candidate application")
PY

app_sha="$(sha256sum "$OUT_DIR/BatteryMonitor.secureboot.app.unsigned.bin" | awk '{print $1}')"
boot_sha="$(sha256sum "$OUT_DIR/BatteryMonitor.secureboot.bootloader.unsigned.bin" | awk '{print $1}')"
cat > "$OUT_DIR/MIGRATION_BUILD_AUTHORITY.txt" <<EOF
schema=BATMON_SECURE_BOOT_MIGRATION_BUILD_V1
architecture=ESP-IDF+Arduino-component
esp_idf_version=5.5.5
esp_idf_commit=$EXPECTED_IDF_COMMIT
target=esp32
migration_scope=existing-release-encrypted-ECO3-plus-units-only
migration_version=$APP_VERSION
release_sequence=$APP_RELEASE_SEQUENCE
normal_provisioning_default_secure_boot=unchanged-disabled
secure_boot=enabled-v2-rsa-remote-signing
secure_boot_build_signed_binaries=disabled-protected-workflow-signs
minimum_esp32_revision=3.0-ECO3
flash_encryption=enabled-release-mode
nvs_encryption=enabled
hardware_efuse_app_anti_rollback=disabled-during-migration-validation
partition_table_offset=0xF000
primary_bootloader_offset=0x1000
primary_bootloader_region_size=0xE000
bootloader_staging_partition=coredump@0x3F0000+0x10000
app_partition_size=0x140000
unsigned_application_size=$app_size
unsigned_bootloader_size=$boot_size
unsigned_application_sha256=$app_sha
unsigned_bootloader_sha256=$boot_sha
EOF

ls -lh "$OUT_DIR"
