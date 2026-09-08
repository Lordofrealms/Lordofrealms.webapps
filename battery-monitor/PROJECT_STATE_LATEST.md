# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Version:** V0.1.0 prototype

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before making changes. Do not assume the SHA in this document is still the branch head.

The latest fully validated **product-source** checkpoint is:

`68926765874db20db034edef46ef3694a340c871` — `Pin upstream hardened Arduino WebServer`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#139**
- Run ID: **`34190803829`**
- Result: **SUCCESS**

Run #139 completed all normal Toolchain jobs successfully, including:

- ESP32 ESP-IDF + Arduino firmware build;
- Android provisioning APK build/package;
- exact firmware artifact handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build/smoke test;
- Windows .NET 8 client build;
- **P0-3 protocol self-test**;
- self-contained Windows publish, firmware/tool bundle, and artifact upload.

The run #139 firmware artifact was inspected after CI. `dependencies.lock` resolved Arduino-ESP32 from upstream Git at exact commit `5cdf8975ae8d9e35888b724b01a444d22406424e`, and `BUILD_AUTHORITY.txt` recorded the security/build authority described below.

Later commits `8a078164cd7d674781f8532cfad8fb7f10bc538a` and `dca76f7a40be55fb7240e0cef63cdc12d76d8258` only align signed-release provenance and clarify blank-device image wording; they do not modify Battery Monitor runtime behavior. Toolchain #140 was started by the CI-workflow wording change and is an additional revalidation, not a new product architecture.

## B. Canonical production firmware architecture

Battery Monitor has **one production firmware architecture**:

- ESP-IDF **v5.5.5**;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- target: classic ESP32 / ESP32-WROOM-32;
- Arduino compatibility/runtime base: Arduino-ESP32 **3.3.11**;
- authoritative Arduino source: immutable upstream Git commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- that commit is exactly two commits after the 3.3.11 release and includes Espressif's merged WebServer hardening PR #12794;
- project root: `battery-monitor/firmware/idf/`;
- application component: `battery-monitor/firmware/idf/main/`;
- thin wrapper/entrypoint: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- sole runtime behavior implementation: the existing Arduino-style source under `battery-monitor/firmware/BatteryMonitor/`;
- sole authoritative firmware build entrypoint: `battery-monitor/firmware/idf/build.sh`.

There is no production PlatformIO path and no second firmware runtime. `BatteryMonitorApp.cpp` remains only the ESP-IDF translation-unit wrapper around the established `.ino` implementation.

### Retired Arduino 3.3.7 pin

Arduino-ESP32 3.3.7 is **not** current authority. It was briefly used during the ESP-IDF migration and was retired after security follow-up identified that versions through 3.3.7 are affected by the critical WebServer multipart-boundary overflow fixed in 3.3.8. Because multipart parsing occurs before Battery Monitor route authentication, application authentication is not a sufficient mitigation for that parser defect.

The current exact upstream commit uses 3.3.11 as its stable base and additionally includes upstream PR #12794 request/parser hardening. `build.sh` fails closed if `idf_component.yml` drifts from this exact source pin.

## C. Active device-at-rest security

The production ESP-IDF configuration now enables:

- **Flash Encryption: enabled in Release mode**;
- **NVS Encryption: enabled**, with NVS XTS keys protected by Flash Encryption;
- encrypted `nvs_keys` partition at `0x294000`, size `0x1000`;
- partition table at `0xF000`;
- `app0` authority remains at `0x10000`;
- `app1` remains at `0x150000`;
- **Secure Boot: intentionally disabled pending explicit encrypted-hardware validation and later activation**.

`build.sh` verifies the generated `sdkconfig` and partition table and rejects a build if required Flash/NVS Encryption settings or the protected layout drift. It also rejects unexpected Secure Boot activation before the explicit post-test gate.

On a blank ESP32, the first boot generates the per-device Flash Encryption key in eFuse and encrypts protected flash regions in place. NVS encryption keys are generated on-device when the encrypted `nvs_keys` partition is blank.

## D. Firmware image roles — do not conflate them

`BatteryMonitor.ino.bin` and `BatteryMonitor.ino.merged.bin` have different roles under release-mode Flash Encryption:

- **`BatteryMonitor.ino.bin`** — plaintext application image used as the signed payload for application-mediated post-encryption OTA; application offset remains `0x10000`.
- **`BatteryMonitor.ino.merged.bin`** — deterministic 4 MiB **blank-device first-install image only**.

The merged image is **not a post-encryption recovery image**. After a device's first encrypted boot, do not use plaintext `esptool write-flash` to overwrite the application or write the merged image. Release-mode Flash Encryption permanently changes the safe recovery/update model.

The Windows first-install/factory path deliberately does not force a plaintext write to an encrypted device; esptool's encrypted-device protection remains an additional guard.

## E. Signed post-encryption update authority

Normal firmware updates after first encrypted boot use **`SIGNED_USB_OTA_V1`** over trusted physical USB.

Current update chain:

1. Windows verifies the detached production **RSA-3072-PSS-SHA256** signature before transfer.
2. Windows transfers the plaintext application image to the running Battery Monitor over physical USB in bounded binary chunks.
3. Firmware writes the inactive OTA partition with `esp_ota_write()`; ESP-IDF performs device-specific Flash Encryption during the write.
4. The ESP32 independently verifies the received image/hash and the same production signature using its compiled trust root.
5. Firmware selects the new boot partition only after validation succeeds.

The production firmware-signing public-key SPKI SHA-256 fingerprint is:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

`build.sh` independently derives the fingerprint of the repository public key and of the public key embedded in `FirmwareUpdate.ino`; ordinary firmware CI fails if either differs from the expected production trust root.

Interrupted transfer, timeout, wrong hash/signature, malformed/wrong application image, OTA write failure, or boot-selection failure remains fail-closed and must not intentionally replace the current boot partition.

## F. Run #139 emitted build authority

The inspected run #139 `BUILD_AUTHORITY.txt` recorded:

- `architecture=ESP-IDF+Arduino-component`;
- `esp_idf_version=5.5.5`;
- `arduino_esp32_base_release=3.3.11`;
- `arduino_esp32_component_source=upstream-git`;
- `arduino_esp32_commit=5cdf8975ae8d9e35888b724b01a444d22406424e`;
- `arduino_esp32_webserver_hardening=upstream-pr-12794-merged`;
- `flash_encryption=enabled-release-mode`;
- `nvs_encryption=enabled-flash-encryption-key-protection`;
- `signed_usb_ota=SIGNED_USB_OTA_V1`;
- `factory_image_scope=blank-unencrypted-device-first-install-only`;
- `post_encryption_plaintext_uart_flash=disabled`;
- `post_encryption_update_path=signed-application-mediated-ota`.

For that exact CI build, the artifact also recorded:

- application SHA-256: `0dfd0a7e207ebc2fccd32e09eab1725f454a0fc4419b67012e1ab74ec0666cd2`;
- merged first-install image SHA-256: `2ba099a42ca2c5379634e4ca75429597e61c9f3e6b89beccae4d4804d34fe2e1`.

These hashes identify the unsigned CI output from run #139; they are not a substitute for production detached signatures.

## G. Manual signed-production release gate

`.github/workflows/battery-monitor-signed-release.yml` remains a manual `workflow_dispatch` production-release gate. Do not dispatch it merely to obtain a green migration/security badge.

It builds through the same authoritative `firmware/idf/build.sh` path and enforces:

- exact requested source SHA;
- production signing-key fingerprint;
- RSA-3072-PSS-SHA256 signatures;
- independent signature verification;
- tampered-image rejection;
- wrong-key rejection;
- production Windows `FirmwareSignatureVerifier` validation and tamper rejection;
- signed-release provenance for ESP-IDF 5.5.5 and the exact hardened Arduino source (`3.3.11` base + `5cdf8975...`).

No production release was requested during this security closeout, so this manual workflow has not been dispatched as a substitute for normal CI.

## H. Frozen runtime/security expectations

Do not weaken the established Battery Monitor behavior, including:

- relay safety/fail-safe behavior;
- voltage/current/operating-state freshness checks;
- secure provisioning and administrator recovery controls;
- authenticated/paired device identity expectations;
- OTA availability and fail-closed update behavior;
- signed update/release-policy enforcement and rollback protections;
- WebUI and SerialUI administrator security/recovery;
- lockout/human-challenge behavior;
- audit persistence/export behavior;
- production signature/trust-root verification;
- P0-3 protocol identity/authentication behavior.

Security/build changes must stay in the one existing runtime rather than creating a parallel implementation.

## I. Next security gate: hardware validation before Secure Boot

The next security milestone is **real encrypted-device validation**, not another architecture migration. Before enabling Secure Boot, exercise at minimum:

1. blank-device first install using the merged image;
2. first boot and confirmation that Flash Encryption Release mode activates;
3. Wi-Fi/config provisioning and NVS persistence across reboot/power loss;
4. successful signed USB OTA to the inactive slot;
5. wrong/tampered signature rejection by Windows and by the ESP32;
6. interrupted/timeout OTA behavior with the old application remaining bootable;
7. repeated signed OTA in both slot directions;
8. confirmation that plaintext direct UART flashing is not treated as a supported post-encryption recovery path;
9. normal monitoring, relay safety, discovery/authentication, and administrator workflows on the encrypted unit.

Only after those tests should Secure Boot activation be considered. Secure Boot remains a separate, deliberate security change with its own recovery/manufacturing implications.

## J. Historical review note

`battery-monitor/SECURITY_REVIEW_2026-09-07.md` is a historical point-in-time review of an older source head. Statements in it describing an open setup AP, unauthenticated APIs, Arduino 3.3.11 slow-header exposure, or encryption as not enabled must not be treated as current live authority without checking the present source and this state file.

## K. Read-first authorities

At the exact live branch head, use these as primary authorities:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/idf/README.md`
4. `battery-monitor/firmware/idf/build.sh`
5. `battery-monitor/firmware/idf/main/idf_component.yml`
6. `battery-monitor/firmware/idf/sdkconfig.defaults`
7. `battery-monitor/firmware/idf/partitions.csv`
8. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino` when OTA/security work is relevant
9. `.github/workflows/battery-monitor-ci.yml`
10. `.github/workflows/battery-monitor-signed-release.yml` when production release work is relevant
11. `battery-monitor/signing/firmware_signatures_v0_1_0.json`

Earlier references to `battery-monitor/AGENTS.md`, `battery-monitor/firmware/README.md`, and `battery-monitor/firmware/include/` were verified absent during migration closeout; do not silently substitute stale/default-branch files.

## L. Remote/local warning

This state is based on the **GitHub remote branch**. A local clone is not proven current by this document. Fetch and compare against the live `battery-monitor-dev` remote head before further work.
