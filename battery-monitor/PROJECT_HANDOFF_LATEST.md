# Battery Monitor — Session Handoff

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA below is still current.**

## 1. Latest validated product/security checkpoint

`9f833f8e6ebd596b6f8b7906b478858492d116cf` — `Harden protected fallback Wi-Fi retry transition`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#156**
- Run ID: **`34257017954`**
- Result: **SUCCESS**

Run #156 passed firmware, Android, exact firmware handoff to Windows, pinned esptool/Security-2 helper, Windows build, P0-3 protocol self-test, self-contained publish, bundle, and artifact upload.

Validated artifacts:

- firmware CI artifact ID `10068644852`;
- Android setup artifact ID `10068418517`;
- Windows CI artifact ID `10068718875`.

The CI artifact names still use the prototype-family `v0.1.0` label. The authoritative ESP-IDF application version is **`0.1.0.2`**, software release sequence **2**.

Documentation commits after `9f833f8e...` do not supersede it as the validated product-source checkpoint.

## 2. Important branch-history note

After `9f833f8e...`, `.github/workflows/battery-monitor-signed-release.yml` was briefly replaced while attempting to update its default version input, then restored exactly. The restoration commit was:

`bb98096e9ddeca52b6246b5ecc4ee11a75eb335d` — `Restore Battery Monitor signed release workflow`

Its tree is identical to the `9f833f8e...` tree. No signed release was dispatched during the transient workflow edit. Do not treat the transient commit as a release authority.

## 3. One production firmware architecture

- ESP-IDF **5.5.5**, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- target `esp32` / classic ESP32-WROOM-32
- Arduino-ESP32 base **3.3.11**
- exact hardened Arduino source `5cdf8975ae8d9e35888b724b01a444d22406424e`
- upstream WebServer hardening PR #12794 included
- ESP-IDF root `battery-monitor/firmware/idf/`
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- sole runtime implementation under `battery-monitor/firmware/BatteryMonitor/`
- sole official build entrypoint `battery-monitor/firmware/idf/build.sh`

Do not restore Arduino-ESP32 3.3.7, PlatformIO, or a second firmware runtime.

## 4. Active encryption posture

Production configuration has:

- Release-mode Flash Encryption ON;
- NVS Encryption ON;
- encrypted `nvs_keys @ 0x294000`;
- partition table `0xF000`;
- `app0 @ 0x10000`;
- `app1 @ 0x150000`;
- Secure Boot OFF pending real encrypted-device testing;
- irreversible eFuse application anti-rollback OFF pending the later Secure Boot/eFuse gate.

The merged 4 MiB image is blank/un-encrypted first install only, not post-encryption recovery.

## 5. Signed USB OTA and version authority

Normal post-encryption updates use `SIGNED_USB_OTA_V1` over physical USB:

1. Windows verifies RSA-3072-PSS-SHA256 release signature.
2. Windows transfers the application image in bounded chunks.
3. Running firmware writes the inactive OTA slot through `esp_ota_write()` so Flash Encryption is applied by the device.
4. ESP32 independently verifies image hash, application identity, release sequence, and production signature.
5. Only a valid candidate can be selected for next boot.

Production trust-root SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Authoritative version file:

`battery-monitor/firmware/idf/version.txt` = `0.1.0.2`

The fourth numeric component is monotonic software release sequence **2**. Equal/older signed releases are rejected against the encrypted-NVS software floor.

## 6. Runtime and desktop fixes now validated

The `0.1.0.2` validated product source includes all of the following:

- initial trusted-USB Device Password creation now immediately starts the protected WPA2 + Security-2 setup AP when no home Wi-Fi exists;
- protected fallback still retries saved home Wi-Fi on the ~10-minute cadence;
- fallback retry waits for Espressif provisioning shutdown to complete before changing Wi-Fi mode;
- an actively associated setup client defers the scheduled home-Wi-Fi retry instead of being disconnected during setup;
- embedded WebUI status polling is 1 second and does not alter ADC sampling cadence;
- runtime version reporting is derived from the ESP-IDF application descriptor rather than a stale hard-coded `0.1.0` literal;
- Windows Advanced Tools no longer permits first-run creation of the gate password;
- Advanced Tools uses a preconfigured PBKDF2-SHA256 verifier/salt, fixed-time comparison, and escalating lockout;
- the plaintext Advanced Tools credential is intentionally not stored in the repository or this handoff;
- USB Setup no longer changes voltage thresholds merely because chemistry is selected; threshold defaults require the explicit `Apply Chemistry Defaults` action.

## 7. P0 status

- P0-1 secure provisioning: source/build resolved; real hardware/adversarial matrix pending.
- P0-2 administrator security/recovery: source/build resolved; real hardware/adversarial matrix pending.
- P0-3 monitoring identity/spoof resistance: source/build resolved; protocol self-test green; real hostile-LAN matrix pending.

Residual LAN-management issue remains: normal LAN management is HTTP to dynamic local addresses, so session/CSRF bearer values can be observed by an active on-path LAN attacker. The proposed future replacement is `BATMON-MGMT-WRITE-V2`, implemented atomically across firmware, embedded WebUI, Windows, and Android.

Do not disable Android cleartext globally before that replacement is ready.

## 8. Real-device test gate before Secure Boot

The detailed physical procedure is now maintained at:

`battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`

Before enabling Secure Boot, test at minimum:

1. blank-device first install;
2. first boot / Release Flash Encryption activation;
3. NVS Encryption persistence and power-loss behavior;
4. initial trusted-USB Device Password -> protected setup AP transition;
5. secure provisioning and administrator recovery;
6. saved-Wi-Fi unavailable -> protected fallback AP -> scheduled home-Wi-Fi retry -> STA recovery;
7. verify an associated setup client is not interrupted by scheduled retry;
8. signed USB OTA in both OTA-slot directions;
9. tampered/wrong signature rejection at Windows and ESP32;
10. interrupted OTA retaining old app;
11. successful probation and deliberate candidate-failure rollback;
12. older legitimately signed image rejected by software release floor;
13. direct plaintext UART flashing not treated as post-encryption recovery;
14. P0-1/P0-2/P0-3 adversarial network tests;
15. normal monitoring, relay safety/freshness behavior, WebUI/SerialUI, and audit persistence while encrypted.

Do not enable Secure Boot until this hardware gate is complete.

Rollback-capable bootloader behavior is installed with the current blank-device first-install image. An already encrypted unit created with an older bootloader cannot retrofit that bootloader using the current application-only signed OTA path.

## 9. Manual production signing — next concrete action

The exact operator procedure is now maintained at:

`battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`

`.github/workflows/battery-monitor-signed-release.yml` remains manual `workflow_dispatch` and uses the `battery-monitor-production-signing` environment. Do not add a push trigger, bypass environment protection, or move the private key into repository content.

For the next signed hardware-test package, dispatch with:

- `source_sha`: `9f833f8e6ebd596b6f8b7906b478858492d116cf`
- `version`: `0.1.0.2`

The workflow validates the exact source SHA/version, authoritative `version.txt`, production signing-key fingerprint, RSA-PSS signatures, tamper rejection, wrong-key rejection, and Windows production verifier before creating signed artifacts.

Current release-run history check: the only `workflow_dispatch` run found on `battery-monitor-dev` is the older successful signed-release run #1 / run `34239873501` at SHA `f846e2c628b96e5a7ddccc8413701fa832864b3d`. It predates validated `0.1.0.2` product source and must not be used as the `0.1.0.2` hardware-test release.

The currently connected GitHub tool surface in chat does not expose `workflow_dispatch`; therefore the signed `0.1.0.2` package has **not** been created from this chat session.

For an already-encrypted hardware unit, use the resulting **signed application USB OTA package** through Windows `Firmware Update -> Update Firmware`. Do not use `Advanced First Install -> First Install (Blank ESP32)` and do not use plaintext direct UART flashing as recovery.

For a genuinely blank, unencrypted ESP32, `Advanced First Install -> First Install (Blank ESP32)` is the supported initial-install path after the signed package exists.

## 10. Distribution/security work still open

- production-sign `0.1.0.2` through the existing manual release gate;
- real encrypted-device hardware matrix above;
- production Android APK signing/release packaging;
- Windows Authenticode/code signing;
- repository branch/ruleset protection;
- later active-LAN privileged-write integrity (`BATMON-MGMT-WRITE-V2`);
- Secure Boot/eFuse production gate only after hardware validation.

## 11. Frozen behavior/security expectations

Do not weaken relay fail-safe behavior, freshness checks, secure provisioning/recovery, paired identity, signed update enforcement, rollback/downgrade protection, WebUI/SerialUI administrator controls, rate limiting/challenge behavior, audit persistence/export, trust-root verification, P0-3 behavior, fallback recovery behavior, or the manual production signing gate.

## 12. Read first next session

At the exact live remote SHA, read in this order:

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

Then resolve the latest applicable `Battery Monitor Toolchain` run and signed-release run history before modifying production source.

## 13. Remote/local warning

This handoff is based on the GitHub remote branch. Any local checkout must fetch and compare against live `battery-monitor-dev` before use.
