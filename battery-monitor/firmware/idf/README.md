# Battery Monitor firmware build authority

Battery Monitor has **one authoritative firmware architecture**:

- ESP-IDF v5.5.5, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- Arduino-ESP32 3.3.7 as an ESP-IDF managed component;
- target: classic ESP32 / ESP32-WROOM-32;
- application behavior remains in `../BatteryMonitor/*.ino` as readable Arduino/C++ source;
- `main/BatteryMonitorApp.cpp` is a thin translation-unit wrapper that compiles those same application files under ESP-IDF;
- `build.sh` is the sole firmware build entry point used by CI and signed releases.

There is no separate Arduino-CLI firmware authority and no separate development firmware codebase.

## Why this architecture exists

The application is intentionally still easy to inspect as familiar Arduino code, while ESP-IDF owns the official build and exposes the low-level security configuration that Arduino IDE/Boards Manager precompiled libraries cannot control. This is required for Battery Monitor's Flash Encryption, NVS Encryption, signed-release policy and eventual Secure Boot activation.

## Local official build

Install ESP-IDF v5.5.5 at the exact pinned commit, activate its environment, then from the repository root run:

```bash
. "$IDF_PATH/export.sh"
bash battery-monitor/firmware/idf/build.sh
```

The build script verifies the exact ESP-IDF commit and the production security configuration before accepting the build. It produces the established Battery Monitor artifact names:

- `BatteryMonitor.ino.bin` — plaintext application image; application authority remains `app0 @ 0x10000`;
- `BatteryMonitor.ino.merged.bin` — deterministic 4 MiB **first-install** image for a blank, unencrypted ESP32;
- build/partition/toolchain/security authority metadata.

## Arduino IDE

The files under `battery-monitor/firmware/BatteryMonitor/` remain ordinary Arduino-style C++ and may be opened in Arduino IDE for inspection or editing. Arduino IDE is **not** an authoritative way to compile/release Battery Monitor firmware. The official binary always comes from this ESP-IDF project.

## CI versus signed release

Ordinary CI and the signed-release workflow call the **same `build.sh`** and therefore the same compiler/configuration architecture.

- ordinary CI leaves the resulting images unsigned for build validation;
- the gated signed-release workflow signs those same build outputs with the production RSA-3072 authority and bundles the detached signatures with Windows;
- signed-release provenance must record the same Arduino-ESP32 **3.3.7** component pin used by the authoritative ESP-IDF build.

Unsigned CI output is not a second firmware architecture. Production Windows tooling still requires the release signatures where applicable.

## Active device-at-rest security

The one production configuration now enables:

- **Flash Encryption:** enabled on boot in **Release mode**;
- **NVS Encryption:** enabled for the default `nvs` partition using the Flash Encryption-backed XTS key scheme;
- **NVS key partition:** `nvs_keys @ 0xd000`, 4 KiB, marked `encrypted`;
- **Secure Boot:** intentionally disabled until the encrypted-hardware test program is complete.

On the first boot of a blank ESP32, ESP-IDF generates a unique Flash Encryption key in eFuse and encrypts protected flash regions in place. `nvs_flash_init()` generates the NVS XTS keys on-device when the `nvs_keys` partition is blank; the key partition itself is protected by Flash Encryption.

### Important flashing consequence

Release-mode Flash Encryption permanently disables the ROM bootloader's flash encryption/decryption operations. Therefore:

- the merged image is a **first-install image only** for a blank/un-encrypted device;
- after first encrypted boot, do **not** use plaintext `esptool write-flash` for the application or a merged recovery image;
- normal plaintext application updates must be accepted by the running application through an OTA/app-mediated writer, which transparently encrypts writes to the OTA application partition;
- the Windows client must fail closed rather than attempt its previous direct `write-flash 0x10000` update on an encrypted unit;
- Secure Boot remains a separate later activation step after this encrypted-device update/recovery behavior has been exercised thoroughly on hardware.
