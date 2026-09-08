# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Prototype family:** `0.1.0`  
**Authoritative firmware app version / software release sequence:** `0.1.0.2` / `2`  
**Production signature status:** pending manual signed-release workflow

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before making changes. Do not assume a SHA in this document is still the branch head.

Latest fully validated **product/security-source** checkpoint:

`9f833f8e6ebd596b6f8b7906b478858492d116cf` — `Harden protected fallback Wi-Fi retry transition`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#156**
- Run ID: **`34257017954`**
- Result: **SUCCESS**

Run #156 passed the complete normal toolchain:

- authoritative ESP32 ESP-IDF firmware build;
- Android provisioning APK build/package;
- exact firmware-artifact handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build/smoke test;
- Windows .NET 8 client build;
- P0-3 protocol self-test;
- self-contained Windows publish/bundle/artifact upload.

Validated CI artifacts from run #156:

- `battery-monitor-esp32-CI-UNSIGNED-v0.1.0` — artifact ID `10068644852`;
- `Battery-Monitor-Setup-Android-v0.1.0` — artifact ID `10068418517`;
- `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0` — artifact ID `10068718875`.

The artifact names retain the prototype-family `v0.1.0` label, but the authoritative ESP-IDF application version embedded by `version.txt` is `0.1.0.2`.

The #156 Windows CI artifact was inspected after validation. It contains the self-contained Windows client, both unsigned CI firmware images, pinned Security-2 helper, and pinned esptool. Its `UNSIGNED_CI_BUILD.txt` explicitly states that these images are intentionally unsigned and that Windows first-install/update functions reject them. The CI artifact must not be substituted for a production-signed hardware-test package.

After the product checkpoint, two workflow-history commits briefly changed and then restored `.github/workflows/battery-monitor-signed-release.yml`. The final restoration commit is `bb98096e9ddeca52b6246b5ecc4ee11a75eb335d`; its tree is identical to `9f833f8e...`. No production release was dispatched during that transient edit. Documentation commits after that point do not supersede `9f833f8e...` as the validated product-source checkpoint.

## B. Canonical production firmware architecture

Battery Monitor has one production firmware architecture:

- ESP-IDF **v5.5.5**;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- target: classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 stable base **3.3.11**;
- authoritative Arduino source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- that source includes Espressif WebServer hardening PR #12794;
- project root: `battery-monitor/firmware/idf/`;
- wrapper: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- sole runtime behavior implementation: Arduino-style source under `battery-monitor/firmware/BatteryMonitor/`;
- sole authoritative build entrypoint: `battery-monitor/firmware/idf/build.sh`.

There is no production PlatformIO path and no second firmware runtime.

Do not restore Arduino-ESP32 3.3.7. Versions through 3.3.7 are affected by the critical pre-handler multipart WebServer overflow fixed in 3.3.8.

## C. Active device-at-rest security

Current production ESP-IDF configuration:

- Flash Encryption: **Release mode enabled**;
- NVS Encryption: **enabled** with XTS keys protected by Flash Encryption;
- partition table: `0xF000`;
- `app0`: `0x10000`;
- `app1`: `0x150000`;
- encrypted `nvs_keys`: `0x294000`, size `0x1000`;
- Secure Boot: intentionally **disabled pending encrypted-device hardware validation**;
- irreversible eFuse application anti-rollback: disabled pending the later Secure Boot/eFuse production gate.

`build.sh` fails closed if these security/layout authorities drift.

## D. Firmware image roles

- `BatteryMonitor.ino.bin` — plaintext application payload for the running application's signed OTA writer. Device-specific Flash Encryption occurs during OTA writes.
- `BatteryMonitor.ino.merged.bin` — deterministic 4 MiB blank, unencrypted ESP32 first-install image only.

The merged image is not a post-encryption recovery image. After first encrypted boot, plaintext direct UART/esptool flashing is not the supported application-update path and the Windows tool does not use `--force` to bypass encrypted-device protection.

## E. Signed USB OTA and trust authority

Post-encryption application updates use `SIGNED_USB_OTA_V1`:

1. Windows validates the detached production RSA-3072-PSS-SHA256 signature.
2. The image is transferred over physical USB in bounded chunks.
3. The running ESP32 writes the inactive OTA slot with `esp_ota_write()`; ESP-IDF encrypts the flash writes.
4. The ESP32 independently checks the image hash, application identity, release sequence, and production RSA-PSS signature.
5. Only a fully validated candidate may be selected as the next boot partition.

Production firmware public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Ordinary CI fails if the repository key or firmware-embedded key drifts from this trust root.

## F. Post-boot rollback and anti-downgrade

ESP-IDF automatic application rollback is enabled with `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`.

A newly selected signed OTA candidate receives a 60-second local health probation. It is marked valid only after setup succeeds, Monitoring Identity is available, and the main loop executes repeatedly. Wi-Fi availability is intentionally not a health requirement.

Authoritative app version is now **`0.1.0.2`**. The fourth numeric component is monotonic software release sequence **2**.

Before boot selection, firmware compares the candidate signed-image sequence against the effective release floor. Equal or older signed images are rejected. The highest accepted sequence is persisted as `batmon/fwseq` in encrypted NVS. Supported Wi-Fi/password/admin recovery paths do not erase that floor.

## G. Runtime/desktop fixes validated in #156

The validated `0.1.0.2` product source includes:

- after initial trusted-USB Device Password creation, if no home Wi-Fi exists, the protected WPA2 + Espressif Security-2 setup AP starts immediately without requiring a reboot;
- protected fallback continues to retry saved home Wi-Fi on the established ~10-minute cadence;
- scheduled fallback retry now waits for Espressif provisioning shutdown to finish before switching to STA mode;
- an actively associated setup client defers the scheduled retry rather than being disconnected mid-setup;
- embedded WebUI status polling is 1 second, independent of ADC sample interval;
- WebUI/discovery/USB PING firmware version reporting comes from the authoritative ESP-IDF application descriptor rather than a stale duplicate literal;
- Windows Advanced Tools no longer supports first-run user creation of its gate password; it uses a preconfigured high-entropy PBKDF2-SHA256 verifier/salt with fixed-time verification and escalating lockout;
- the Advanced Tools plaintext credential is intentionally not stored in source, resources, state, or handoff documentation;
- USB Setup battery-chemistry changes no longer silently overwrite voltage thresholds; defaults are applied only through the explicit `Apply Chemistry Defaults` action.

## H. Current supply-chain/distribution posture

Completed:

- ESP-IDF pinned to immutable commit;
- hardened Arduino source pinned to immutable commit;
- esptool download SHA-256 verified;
- Security-2 helper sources pinned;
- Python provisioning-helper dependencies pinned;
- normal CI and manual signed-release Actions pinned to immutable commits;
- firmware release RSA-PSS signing, tamper rejection, wrong-key rejection, and Windows verifier gates implemented;
- Android application backup disabled;
- `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md` now records the exact protected signing procedure and hardware-use split;
- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md` now records the complete pre-Secure-Boot physical validation matrix.

Still open:

- production signing of the `0.1.0.2` firmware package;
- production Android APK signing/release packaging;
- Windows Authenticode/code signing for distributed executables;
- repository branch/ruleset protection. The live branch remains unprotected and the connected GitHub authority used from chat does not expose administration/write access for rulesets.

## I. LAN management residual risk

P0-2 management authentication is implemented: Device Password proof uses a one-time HMAC challenge; sessions are source-IP-bound, short-lived, CSRF-protected, rate-limited, and password rotation/Monitoring Identity Key export add cryptographic protection of sensitive payloads.

Normal LAN management still uses HTTP on dynamically addressed local devices. Session and CSRF bearer values therefore cross the LAN in cleartext. An active on-path LAN attacker may be able to observe a valid session and interfere with privileged management traffic.

Proposed future protocol: `BATMON-MGMT-WRITE-V2`, requiring management-key HMAC plus monotonic per-session write counter over canonical semantic request fields for every privileged write. It must be implemented atomically across embedded WebUI, Windows, Android, and firmware verifier/replay state.

Do not disable Android cleartext globally before that replacement protocol/transport is ready.

## J. P0 security status

- P0-1 secure provisioning: source/build resolved; hardware/adversarial matrix pending.
- P0-2 administrator security/recovery: source/build resolved; hardware/adversarial matrix pending; active-LAN request-integrity hardening remains open.
- P0-3 monitoring identity/spoof resistance: source/build resolved; protocol self-test green; real-network adversarial matrix pending.

`battery-monitor/SECURITY_REVIEW_2026-09-07.md` is historical and is not live authority.

## K. Next hardware security gate

Detailed procedure:

`battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`

Before enabling Secure Boot, validate real encrypted devices through at minimum:

1. blank-device first install;
2. first-boot Release Flash Encryption activation;
3. encrypted NVS persistence through reboot/power interruption;
4. secure Wi-Fi provisioning and administrator recovery;
5. signed USB OTA in both OTA-slot directions;
6. Windows and ESP32 wrong/tampered signature rejection;
7. interrupted/timeout OTA retaining the old application;
8. 60-second probation success and deliberate candidate-failure rollback;
9. software downgrade rejection with an older legitimately signed image;
10. confirmation that plaintext UART flashing is not treated as post-encryption recovery;
11. P0-1/P0-2/P0-3 hostile-network tests;
12. normal monitoring, relay fail-safe, freshness checks, WebUI/SerialUI, and audit behavior while encrypted;
13. first-provisioning flow: trusted USB Device Password -> protected setup AP appears immediately;
14. fallback retry: unavailable saved Wi-Fi -> protected AP -> scheduled retry -> successful STA recovery;
15. verify a connected setup client is not interrupted by the scheduled fallback retry.

Only after this test gate should Secure Boot/eFuse production policy be activated.

Important migration caveat: post-boot rollback support is a bootloader feature. A blank unit installed with the current merged image gets the rollback-capable bootloader. An already encrypted device installed with an older bootloader cannot retrofit that bootloader through the current application-only signed OTA path.

## L. Manual signed-release workflow

Exact operator checklist:

`battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`

`.github/workflows/battery-monitor-signed-release.yml` remains a manual `workflow_dispatch` production release gate. Do not add a push trigger or bypass the `battery-monitor-production-signing` environment merely to create a signed artifact.

For the next real production-signed hardware-test package, use:

- `source_sha`: `9f833f8e6ebd596b6f8b7906b478858492d116cf`
- `version`: `0.1.0.2`

The workflow independently checks that the requested version matches authoritative `battery-monitor/firmware/idf/version.txt` and validates the production signing-key fingerprint before signing.

Release-run history was checked explicitly using `event=workflow_dispatch`. The only signed-release run currently present on `battery-monitor-dev` is older run #1 / run ID `34239873501`, successful at SHA `f846e2c628b96e5a7ddccc8413701fa832864b3d`. It predates the validated `0.1.0.2` source and is not the `0.1.0.2` hardware-test package.

The connected GitHub actions available in the current chat session do not expose `workflow_dispatch`, so the production `0.1.0.2` signing run has not been launched from chat.

Expected successful `0.1.0.2` release artifacts are:

- `Battery-Monitor-Signed-Firmware-0.1.0.2`;
- `Battery-Monitor-Windows-Signed-0.1.0.2`.

For an already-encrypted unit, use Windows `Firmware Update -> Update Firmware`. For a genuinely blank/un-encrypted ESP32, use `Advanced First Install -> First Install (Blank ESP32)`. Never use the blank first-install function as recovery after Flash Encryption is active.

## M. Frozen expectations

Do not weaken or bypass established relay safety/fail-safe behavior, freshness checks, secure provisioning/recovery, paired monitoring identity, signed update enforcement, rollback/downgrade protections, WebUI/SerialUI administrator controls, lockout/challenge behavior, audit persistence/export, trust-root verification, P0-3 behavior, or the manual production-signing gate.

## N. Read-first authorities

At the exact live branch head, read:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
4. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
5. `battery-monitor/firmware/README.md`
6. `battery-monitor/firmware/idf/README.md`
7. `battery-monitor/firmware/idf/build.sh`
8. `battery-monitor/firmware/idf/version.txt`
9. `battery-monitor/firmware/idf/sdkconfig.defaults`
10. `battery-monitor/firmware/idf/partitions.csv`
11. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
12. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
13. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
14. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
15. `battery-monitor/windows/BatteryMonitor.Client/AdminSecurity.cs`
16. `battery-monitor/windows/BatteryMonitor.Client/UsbSetupForm.cs`
17. `battery-monitor/windows/BatteryMonitor.Client/FirmwareUpdateForm.cs`
18. `battery-monitor/windows/BatteryMonitor.Client/FirmwareFlashForm.cs`
19. `.github/workflows/battery-monitor-ci.yml`
20. `.github/workflows/battery-monitor-signed-release.yml`

Then resolve the latest applicable `Battery Monitor Toolchain` run and signed-release run history before changing production source.

## O. Remote/local warning

This state is based on the GitHub remote branch. Any local checkout must fetch and compare against the live `battery-monitor-dev` remote head before further work.
