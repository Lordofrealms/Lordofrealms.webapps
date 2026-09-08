# Battery Monitor — Session Handoff

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA below is still current.**

## 1. Current validated checkpoint

Latest fully green **product-source** checkpoint:

`68926765874db20db034edef46ef3694a340c871` — `Pin upstream hardened Arduino WebServer`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#139**
- Run ID: **`34190803829`**
- Result: **SUCCESS**

Run #139 passed:

- authoritative ESP32 ESP-IDF firmware build;
- Android provisioning APK build/package;
- exact firmware artifact handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build/smoke test;
- Windows .NET 8 client build;
- **P0-3 protocol self-test**;
- self-contained Windows publish/bundle/artifact upload.

The firmware artifact was inspected after CI. `dependencies.lock` resolved Arduino-ESP32 at exact upstream commit `5cdf8975ae8d9e35888b724b01a444d22406424e`, and `BUILD_AUTHORITY.txt` recorded Flash Encryption Release mode, NVS Encryption, `SIGNED_USB_OTA_V1`, the production trust root, and blank-device-only merged-image scope.

Later commits are authority/documentation-only:

- `8a078164cd7d674781f8532cfad8fb7f10bc538a` — align signed-release Arduino provenance;
- `dca76f7a40be55fb7240e0cef63cdc12d76d8258` — remove stale `factory/recovery` wording from ordinary CI;
- subsequent state/handoff commits only document the validated implementation.

Toolchain #140 / run ID `34221672000` was triggered by the CI-workflow wording-only change. Resolve its final status in the next session if this handoff is read before that run completes.

## 2. Canonical firmware architecture

There is **one production firmware build architecture**:

- ESP-IDF **v5.5.5**;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- target `esp32` for classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 stable base **3.3.11**;
- exact authoritative Arduino source: upstream Git commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- that source is exactly two commits after 3.3.11 and contains Espressif's merged WebServer hardening PR #12794;
- project root: `battery-monitor/firmware/idf/`;
- wrapper: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- sole runtime implementation: existing `.ino` code under `battery-monitor/firmware/BatteryMonitor/`;
- sole official build entrypoint: `battery-monitor/firmware/idf/build.sh`.

**Do not restore Arduino-ESP32 3.3.7.** It is retired because versions through 3.3.7 are affected by the critical multipart-boundary WebServer overflow fixed in 3.3.8. Battery Monitor's route authentication does not protect the pre-handler multipart parser.

**Do not restore PlatformIO or create a second production firmware runtime.**

## 3. Active at-rest security

Current production configuration has:

- **Flash Encryption enabled in Release mode**;
- **NVS Encryption enabled** with the NVS key partition protected by Flash Encryption;
- partition table at `0xF000`;
- `app0` at `0x10000`;
- `app1` at `0x150000`;
- encrypted `nvs_keys` at `0x294000`, size `0x1000`;
- **Secure Boot disabled pending explicit hardware validation**.

`build.sh` fails closed if these generated security/layout settings drift or if Secure Boot is accidentally enabled before its later activation gate.

## 4. Firmware image roles — critical operational rule

- `BatteryMonitor.ino.bin` is the plaintext signed application payload used by the running application's post-encryption OTA writer.
- `BatteryMonitor.ino.merged.bin` is a deterministic 4 MiB **blank, unencrypted device first-install image only**.

The merged image is **not** a post-encryption recovery image. After first encrypted boot, do not use plaintext `esptool write-flash` as the normal update/recovery path.

The Windows first-install path deliberately does not force a plaintext write to an already encrypted device.

## 5. Signed USB OTA authority

Normal post-encryption updates use **`SIGNED_USB_OTA_V1`**:

1. Windows verifies the detached production RSA-3072-PSS-SHA256 signature.
2. It transfers the plaintext application image over trusted physical USB in bounded chunks.
3. The running ESP32 writes the inactive OTA slot with `esp_ota_write()`; ESP-IDF encrypts the flash write using that device's key.
4. The ESP32 independently verifies the image/hash and production signature using its compiled public trust root.
5. Only a validated image is selected as the next boot partition.

Production firmware public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Ordinary firmware CI now verifies that both the repository public key and the key embedded in `FirmwareUpdate.ino` resolve to this fingerprint.

## 6. Manual signed-release workflow

`.github/workflows/battery-monitor-signed-release.yml` remains the manual `workflow_dispatch` production release gate.

It builds through the same `firmware/idf/build.sh` authority and enforces exact source SHA, production signing-key fingerprint, RSA-3072-PSS-SHA256 signing, independent verification, tamper rejection, wrong-key rejection, and production Windows verifier tests.

Its `SIGNED_RELEASE.txt` provenance now records:

- ESP-IDF 5.5.5 + exact commit;
- Arduino-ESP32 3.3.11 base;
- upstream Git source;
- exact Arduino commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- upstream PR #12794 hardening.

No production release was requested during this closeout; do not claim the manual signed-release workflow was run merely for validation.

## 7. Next work order: encrypted-device hardware validation

Before enabling Secure Boot, test a real device through the new lifecycle:

1. blank-device first install with the merged image;
2. first boot and Flash Encryption Release-mode activation;
3. secure provisioning/config persistence and NVS behavior across reboot/power loss;
4. successful signed USB OTA;
5. wrong/tampered signature rejection at Windows and ESP32 layers;
6. interrupted/timeout OTA with the previous application remaining bootable;
7. repeated signed OTA in both OTA-slot directions;
8. confirmation that plaintext UART flashing is not treated as supported post-encryption recovery;
9. normal monitoring, relay fail-safe behavior, discovery/authentication, WebUI/SerialUI admin workflows, and audit behavior while encrypted.

**Do not enable Secure Boot until this hardware test gate is complete.** Secure Boot is the next deliberate security change, not incidental cleanup.

## 8. Frozen behavior/security expectations

Do not weaken or bypass established behavior, including:

- relay safety/fail-safe logic;
- voltage/current/state freshness checks;
- secure provisioning and administrator recovery;
- paired/authenticated identity expectations;
- signed update/release-policy enforcement;
- rollback/fail-closed update behavior;
- WebUI and SerialUI administrator security;
- lockout/human-challenge behavior;
- audit persistence/export;
- production trust-root verification;
- P0-3 protocol behavior.

## 9. Read first in the next session

At the exact **live** `battery-monitor-dev` SHA, read in this order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/idf/README.md`
4. `battery-monitor/firmware/idf/build.sh`
5. `battery-monitor/firmware/idf/main/idf_component.yml`
6. `battery-monitor/firmware/idf/sdkconfig.defaults`
7. `battery-monitor/firmware/idf/partitions.csv`
8. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
9. `.github/workflows/battery-monitor-ci.yml`
10. `.github/workflows/battery-monitor-signed-release.yml`
11. `battery-monitor/signing/firmware_signatures_v0_1_0.json`

Then resolve the latest applicable Battery Monitor Toolchain run before changing production source.

`battery-monitor/SECURITY_REVIEW_2026-09-07.md` is a historical point-in-time review, **not current live authority**. Its original findings predate later provisioning/authentication/encryption/WebServer-hardening work.

Earlier references to `battery-monitor/AGENTS.md`, `battery-monitor/firmware/README.md`, and `battery-monitor/firmware/include/` were verified absent during migration closeout; do not silently substitute stale/default-branch files.

## 10. Remote/local warning

This handoff is based on the **GitHub remote branch**. A local checkout must be fetched and compared against the live `battery-monitor-dev` remote head before further work.
