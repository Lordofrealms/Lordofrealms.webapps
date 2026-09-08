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

The application is intentionally still easy to inspect as familiar Arduino code, while ESP-IDF owns the official build and exposes the low-level security configuration that Arduino IDE/Boards Manager precompiled libraries cannot control. This is required for the Battery Monitor security roadmap, including Flash Encryption, NVS Encryption, signed-app policy and eventually Secure Boot.

## Local official build

Install ESP-IDF v5.5.5 at the exact pinned commit, activate its environment, then from the repository root run:

```bash
. "$IDF_PATH/export.sh"
bash battery-monitor/firmware/idf/build.sh
```

The build script verifies the exact ESP-IDF commit before compiling. It produces the established Battery Monitor artifact names:

- `BatteryMonitor.ino.bin` — application image, authority remains `app0 @ 0x10000`;
- `BatteryMonitor.ino.merged.bin` — deterministic 4 MiB factory/recovery image;
- build/partition/toolchain authority metadata.

## Arduino IDE

The files under `battery-monitor/firmware/BatteryMonitor/` remain ordinary Arduino-style C++ and may be opened in Arduino IDE for inspection or editing. Arduino IDE is **not** an authoritative way to compile/release Battery Monitor firmware. The official binary always comes from this ESP-IDF project.

## CI versus signed release

Ordinary CI and the signed-release workflow call the **same `build.sh`** and therefore the same compiler/configuration architecture.

- ordinary CI leaves the resulting images unsigned for build validation;
- the gated signed-release workflow signs those same build outputs with the production RSA-3072 authority and bundles the detached signatures with Windows;
- signed-release provenance must record the same Arduino-ESP32 **3.3.7** component pin used by the authoritative ESP-IDF build.

Unsigned CI output is not a second firmware architecture. The Windows flasher deliberately refuses it because production signatures are absent.

## Security activation state

At the initial migration checkpoint:

- Windows host-side firmware signature verification: implemented;
- Secure Boot: intentionally disabled;
- Flash Encryption: intentionally not activated yet;
- NVS Encryption: intentionally not activated yet.

Flash/NVS encryption will be activated deliberately as the P1-1 security change after this single architecture is build-validated. Secure Boot remains a later explicit production gate and must not be enabled casually on development hardware.
