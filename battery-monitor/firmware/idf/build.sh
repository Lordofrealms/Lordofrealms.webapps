#!/usr/bin/env bash
set -euo pipefail

# One authoritative Battery Monitor firmware build.
#
# Usage:
#   IDF_PATH=/path/to/esp-idf ./build.sh [output-directory]
#
# Both ordinary CI and the signed-release workflow call this script. There is
# no separate Arduino-CLI firmware build.

EXPECTED_IDF_COMMIT="b774170ff46c393eeb5e495ea37936038d3f4f4f" # ESP-IDF v5.5.5
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$PROJECT_DIR/out}"

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

rm -rf "$PROJECT_DIR/build" "$PROJECT_DIR/sdkconfig" "$OUT_DIR"
mkdir -p "$OUT_DIR"

cd "$PROJECT_DIR"
idf.py set-target esp32
idf.py build

# Keep the established Windows/update artifact names even though ESP-IDF is now
# the sole compiler. Application update remains app0 @ 0x10000.
cp build/BatteryMonitor.bin "$OUT_DIR/BatteryMonitor.ino.bin"

# Create a complete 4 MiB factory/recovery image. ESP-IDF merge-bin supplies
# bootloader, partition table, OTA data and application at their configured
# offsets; padding the tail with 0xFF preserves the existing destructive
# full-flash semantics and makes the artifact size deterministic.
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
application_flash_offset=0x10000
application_sha256=$app_sha
merged_sha256=$merged_sha
secure_boot=disabled-pending-explicit-production-gate
flash_encryption=disabled-pending-P1-1-activation
EOF

ls -lh "$OUT_DIR"
