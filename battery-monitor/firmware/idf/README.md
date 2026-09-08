# Battery Monitor firmware build authority

Battery Monitor has **one authoritative firmware architecture**:

- ESP-IDF v5.5.5, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- Arduino-ESP32 from immutable upstream Git commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
  - this commit is exactly two commits after Arduino-ESP32 3.3.11;
  - it contains Espressif's merged WebServer hardening PR #12794;
  - 3.3.11 is the stable base release and is based on ESP-IDF 5.5.5;
- target: classic ESP32 / ESP32-WROOM-32;
- application behavior remains in `../BatteryMonitor/*.ino` as readable Arduino/C++ source;
- `main/BatteryMonitorApp.cpp` is a thin translation-unit wrapper that compiles those same application files under ESP-IDF;
- `build.sh` is the sole firmware build entry point used by CI and signed releases.

There is no separate Arduino-CLI firmware authority and no separate development firmware codebase.

## Why the Arduino component is pinned to an upstream commit

Battery Monitor briefly used Arduino-ESP32 3.3.7 as the managed-component authority during the ESP-IDF migration. That pin is retired for security reasons.

Upstream security advisory GHSA-8cmm-3887-r32j identifies Arduino-ESP32 versions through 3.3.7 as affected by a critical WebServer multipart-boundary stack overflow, patched in 3.3.8. The Battery Monitor uses synchronous `WebServer`, and multipart request parsing happens before an application route handler can enforce Battery Monitor authentication, so application authentication is not a sufficient mitigation for that parser defect.

The latest stable Arduino-ESP32 release is 3.3.11, which already contains the 3.3.8 security fixes and is based on ESP-IDF 5.5.5. Upstream PR #12794 subsequently hardened WebServer request parsing against slow/incomplete headers and additional malformed-request/DoS cases. The exact merge commit `5cdf8975ae8d9e35888b724b01a444d22406424e` is only two commits ahead of the 3.3.11 tag, so Battery Monitor pins that immutable upstream commit rather than following a floating branch or maintaining a local fork.

`build.sh` verifies that `main/idf_component.yml` still points to this exact Git commit before it accepts a firmware build.

## Why this architecture exists

The application is intentionally still easy to inspect as familiar Arduino code, while ESP-IDF owns the official build and exposes the low-level security configuration required for Flash Encryption, NVS Encryption, signed-update policy and eventual Secure Boot activation.

## Local official build

Install ESP-IDF v5.5.5 at the exact pinned commit, activate its environment, then from the repository root run:

```bash
. "$IDF_PATH/export.sh"
bash battery-monitor/firmware/idf/build.sh
```

The build script verifies the exact ESP-IDF commit, exact Arduino-ESP32 upstream source pin, production security configuration, and firmware update trust root before accepting the build. It produces the established Battery Monitor artifact names:

- `BatteryMonitor.ino.bin` — plaintext application image; application authority remains `app0 @ 0x10000`; this is the signed payload used for normal post-encryption application updates;
- `BatteryMonitor.ino.merged.bin` — deterministic 4 MiB **first-install** image for a blank, unencrypted ESP32 only;
- build/partition/toolchain/security authority metadata.

## Arduino IDE

The files under `battery-monitor/firmware/BatteryMonitor/` remain ordinary Arduino-style C++ and may be opened in Arduino IDE for inspection or editing. Arduino IDE is **not** an authoritative way to compile/release Battery Monitor firmware. The official binary always comes from this ESP-IDF project.

## CI versus signed release

Ordinary CI and the signed-release workflow call the **same `build.sh`** and therefore the same compiler/configuration architecture.

- ordinary CI leaves the resulting images unsigned for build validation;
- the gated signed-release workflow signs those same build outputs with the production RSA-3072 authority and bundles the detached signatures with Windows;
- signed-release provenance must record Arduino-ESP32 base release **3.3.11** and exact upstream commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- `BUILD_AUTHORITY.txt` records the immutable Arduino source pin, upstream WebServer hardening, `SIGNED_USB_OTA_V1`, the RSA-3072-PSS-SHA256 trust-root fingerprint, and that the merged image is blank-device first-install only.

Unsigned CI output is not a second firmware architecture. Production Windows tooling requires detached release signatures before it will transfer an application update.

## Active device-at-rest security

The one production configuration enables:

- **Flash Encryption:** enabled on boot in **Release mode**;
- **NVS Encryption:** enabled for the default `nvs` partition using the Flash Encryption-backed XTS key scheme;
- **Secure Boot:** intentionally disabled until the encrypted-hardware test program is complete.

Release-mode Flash Encryption increases the classic ESP32 bootloader beyond the former `0x7000`-byte allowance. The authoritative layout therefore uses:

- bootloader: `0x1000` through before the partition table;
- partition table: **`0xF000`**;
- `app0`: **`0x10000`**, unchanged;
- `app1`: `0x150000`, unchanged;
- `nvs`: `0x290000`, 16 KiB;
- encrypted `nvs_keys`: **`0x294000`**, 4 KiB;
- `otadata`: `0x295000`, 8 KiB;
- SPIFFS: `0x297000` through `0x3EFFFF`;
- coredump: `0x3F0000`, unchanged.

The two OTA application slots retain their full previous size. Only SPIFFS gives up the small amount of space required for the relocated NVS/OTA metadata.

On the first boot of a blank ESP32, ESP-IDF generates a unique Flash Encryption key in eFuse and encrypts protected flash regions in place. `nvs_flash_init()` generates the NVS XTS keys on-device when the `nvs_keys` partition is blank; the key partition itself is protected by Flash Encryption.

## Signed post-encryption update path

Normal firmware updates after the first encrypted boot use **`SIGNED_USB_OTA_V1`**:

1. Windows verifies the detached production RSA-3072-PSS-SHA256 signature before transfer.
2. The plaintext application image is streamed over trusted physical USB to the running Battery Monitor in bounded binary chunks.
3. The ESP32 writes the inactive OTA application partition with `esp_ota_write()`; ESP-IDF transparently performs device-specific Flash Encryption on the write.
4. The ESP32 independently hashes the received plaintext image and verifies the same production signature using its compiled public trust root.
5. Only after hash/signature/image validation succeeds does firmware call `esp_ota_set_boot_partition()`.

A transfer timeout, interrupted transfer, bad hash, bad signature, malformed image, wrong application image, OTA write failure, or boot-selection failure does not intentionally replace the currently running boot partition. This keeps the update channel fail-closed even before Secure Boot is activated.

### Important flashing consequence

Release-mode Flash Encryption permanently disables the ROM bootloader's flash encryption/decryption operations. Therefore:

- the merged image is a **first-install image only** for a blank/un-encrypted device;
- after first encrypted boot, do **not** use plaintext `esptool write-flash` for the application or a merged recovery image;
- Windows normal update uses the running application's signed USB OTA writer instead of direct `write-flash 0x10000`;
- the Windows factory/first-install path deliberately does not use `--force`, so esptool's encrypted-device protection remains a final guard against accidental plaintext overwrite;
- Secure Boot remains a separate later activation step after this encrypted-device update/recovery behavior has been exercised thoroughly on hardware.
