#!/usr/bin/env bash
set -euo pipefail

# One authoritative Battery Monitor firmware build.
#
# Usage:
#   IDF_PATH=/path/to/esp-idf ./build.sh [output-directory]
#
# Both ordinary CI and the signed-release workflow call this script. There is
# no separate Arduino-CLI firmware build and no separate dev/prod firmware tree.

EXPECTED_IDF_COMMIT="b774170ff46c393eeb5e495ea37936038d3f4f4f" # ESP-IDF v5.5.5
EXPECTED_FW_KEY_FINGERPRINT="69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$PROJECT_DIR/out}"
SIGNING_PUBLIC_KEY="$PROJECT_DIR/../../signing/battery_monitor_secureboot_rsa3072_public.pem"
FIRMWARE_UPDATE_SOURCE="$PROJECT_DIR/../BatteryMonitor/FirmwareUpdate.ino"

if [[ -z "${IDF_PATH:-}" ]]; then
  echo "IDF_PATH is not set. Install/activate ESP-IDF v5.5.5 first." >&2
  exit 2
fi

actual_idf_commit="$(git -C "$IDF_PATH" rev-parse HEAD 2>/dev/null || true)"
if [[ "$actual_idf_commit" != "$EXPECTED_IDF_COMMIT" ]]; then
  echo "Battery Monitor requires exact ESP-IDF commit $EXPECTED_IDF_COMMIT (v5.5.5)." >&2
  echo "Current IDF_PATH resolves to: ${actual_idf_commit:-not-a-git-checkout}" >&2
  exit 2
fi

# Fail closed if the firmware's embedded signed-update trust root drifts from
# the repository production public key. The Windows verifier is independently
# exercised by the signed-release workflow; this check brings the ESP32 trust
# root under ordinary firmware CI as well.
if [[ ! -f "$SIGNING_PUBLIC_KEY" || ! -f "$FIRMWARE_UPDATE_SOURCE" ]]; then
  echo 'Firmware update trust-root authority file is missing.' >&2
  exit 3
fi

repo_key_fingerprint="$(openssl pkey -pubin -in "$SIGNING_PUBLIC_KEY" -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
if [[ "$repo_key_fingerprint" != "$EXPECTED_FW_KEY_FINGERPRINT" ]]; then
  echo "Repository firmware public-key fingerprint mismatch: $repo_key_fingerprint" >&2
  exit 3
fi

embedded_key_file="$(mktemp)"
trap 'rm -f "$embedded_key_file"' EXIT
python - "$FIRMWARE_UPDATE_SOURCE" "$embedded_key_file" <<'PY'
from pathlib import Path
import ast
import re
import sys

source = Path(sys.argv[1]).read_text(encoding="utf-8")
match = re.search(
    r"static\s+const\s+char\s+BATMON_FW_PUBLIC_KEY_PEM\[\]\s*=\s*(.*?);",
    source,
    re.S,
)
if not match:
    raise SystemExit("Could not locate BATMON_FW_PUBLIC_KEY_PEM in FirmwareUpdate.ino")
parts = re.findall(r'"(?:\\.|[^"\\])*"', match.group(1))
if not parts:
    raise SystemExit("BATMON_FW_PUBLIC_KEY_PEM contains no C string fragments")
pem = "".join(ast.literal_eval(part) for part in parts)
if not pem.startswith("-----BEGIN PUBLIC KEY-----\n") or not pem.endswith("-----END PUBLIC KEY-----\n"):
    raise SystemExit("BATMON_FW_PUBLIC_KEY_PEM is not a complete PEM public key")
Path(sys.argv[2]).write_text(pem, encoding="ascii")
PY
embedded_key_fingerprint="$(openssl pkey -pubin -in "$embedded_key_file" -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
rm -f "$embedded_key_file"
trap - EXIT
if [[ "$embedded_key_fingerprint" != "$repo_key_fingerprint" ]]; then
  echo "Firmware embedded OTA key fingerprint mismatch: $embedded_key_fingerprint (repository: $repo_key_fingerprint)" >&2
  exit 3
fi

rm -rf "$PROJECT_DIR/build" "$PROJECT_DIR/sdkconfig" "$OUT_DIR"
mkdir -p "$OUT_DIR"

cd "$PROJECT_DIR"
idf.py set-target esp32
idf.py build

# Fail closed if the generated configuration ever drifts from the production
# device-at-rest security authority.
for required in \
  'CONFIG_SECURE_FLASH_ENC_ENABLED=y' \
  'CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y' \
  'CONFIG_NVS_ENCRYPTION=y' \
  'CONFIG_NVS_SEC_KEY_PROTECT_USING_FLASH_ENC=y' \
  'CONFIG_PARTITION_TABLE_OFFSET=0xF000'; do
  if ! grep -qx "$required" sdkconfig; then
    echo "Required production security/layout setting missing from generated sdkconfig: $required" >&2
    exit 3
  fi
done
if grep -qx 'CONFIG_SECURE_BOOT=y' sdkconfig; then
  echo 'Secure Boot must remain disabled until the explicit post-test activation gate.' >&2
  exit 3
fi
if ! grep -Eq '^nvs_keys,[[:space:]]*data,[[:space:]]*nvs_keys,[[:space:]]*0x294000,[[:space:]]*0x1000,[[:space:]]*encrypted[[:space:]]*$' partitions.csv; then
  echo 'Required encrypted 4 KiB nvs_keys partition is missing or moved.' >&2
  exit 3
fi
if ! grep -Eq '^app0,[[:space:]]*app,[[:space:]]*ota_0,[[:space:]]*0x10000,' partitions.csv; then
  echo 'Application authority must remain app0 @ 0x10000.' >&2
  exit 3
fi

# Keep the established Windows/update artifact names even though ESP-IDF is now
# the sole compiler. The plaintext application image is suitable for first-time
# factory flashing before encryption activates and for the signed application-
# mediated OTA writer after activation; it must not be written directly by the
# UART ROM bootloader once release-mode Flash Encryption is active.
cp build/BatteryMonitor.bin "$OUT_DIR/BatteryMonitor.ino.bin"

# Create a complete 4 MiB first-install image. ESP-IDF merge-bin supplies
# bootloader, partition table, OTA data and application at their configured
# offsets. On a blank ESP32, first boot generates the per-device Flash
# Encryption key and encrypts the protected regions in place. This plaintext
# merged image is intentionally NOT a post-encryption recovery image.
idf.py merge-bin -o "$OUT_DIR/BatteryMonitor.ino.merged.bin" -f raw
python - "$OUT_DIR/BatteryMonitor.ino.merged.bin" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
target = 4 * 1024 * 1024
data = p.read_bytes()
if len(data) > target:
    raise SystemExit(f"merged image is larger than 4 MiB: {len(data)} bytes")
if len(data) < target:
    with p.open("ab") as f:
        f.write(b"\xff" * (target - len(data)))
PY

cp sdkconfig "$OUT_DIR/sdkconfig"
cp partitions.csv "$OUT_DIR/partitions.csv"
cp build/partition_table/partition-table.bin "$OUT_DIR/partition-table.bin"
cp build/bootloader/bootloader.bin "$OUT_DIR/bootloader.bin"
if [[ -f build/flasher_args.json ]]; then cp build/flasher_args.json "$OUT_DIR/flasher_args.json"; fi
if [[ -f dependencies.lock ]]; then cp dependencies.lock "$OUT_DIR/dependencies.lock"; fi

app_sha="$(sha256sum "$OUT_DIR/BatteryMonitor.ino.bin" | awk '{print $1}')"
merged_sha="$(sha256sum "$OUT_DIR/BatteryMonitor.ino.merged.bin" | awk '{print $1}')"
cat > "$OUT_DIR/BUILD_AUTHORITY.txt" <<EOF
schema=BATMON_IDF_BUILD_V1
architecture=ESP-IDF+Arduino-component
esp_idf_version=5.5.5
esp_idf_commit=$EXPECTED_IDF_COMMIT
arduino_esp32_component=3.3.7
target=esp32
flash_size=4MB
partition_table_offset=0xF000
application_flash_offset=0x10000
application_sha256=$app_sha
merged_sha256=$merged_sha
secure_boot=disabled-pending-post-test-activation
flash_encryption=enabled-release-mode
nvs_encryption=enabled-flash-encryption-key-protection
nvs_keys_partition=0x294000+0x1000-encrypted
signed_usb_ota=SIGNED_USB_OTA_V1
firmware_update_signature_algorithm=RSA-3072-PSS-SHA256
firmware_update_public_key_spki_sha256=$repo_key_fingerprint
firmware_update_transport=trusted-physical-usb-application-mediated
factory_image_scope=blank-unencrypted-device-first-install-only
post_encryption_plaintext_uart_flash=disabled
post_encryption_update_path=signed-application-mediated-ota
EOF

ls -lh "$OUT_DIR"
