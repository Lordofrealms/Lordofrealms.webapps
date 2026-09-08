# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Prototype family:** `0.1.0`  
**Authoritative firmware version / software release sequence:** `0.1.0.2` / `2`  
**Production signature status:** pending protected manual signed-release workflow

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before making changes. Documentation-only commits may be newer than the validated product source.

Latest fully validated **product/security source**:

`d1d6c0ed782116d58f925543ae599939c0ec0191` — `Invalidate factory QR on code or port changes`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#167**
- Run ID: **`34263129626`**
- Result: **SUCCESS**

Run #167 passed:

- authoritative ESP32 ESP-IDF firmware build;
- Android provisioning APK build/package;
- exact firmware-artifact handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build/smoke test;
- Windows .NET 8 client build;
- P0-3/protocol self-test including Device Password compatibility vectors;
- self-contained Windows publish/bundle/artifact upload.

Exact candidate evidence is frozen in:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

## B. Final normal-CI artifacts

Run #167 artifacts:

- firmware: `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`, artifact ID `10070951566`, digest `13480473e4a76fed49a15fb05bed70a6294ad1148cd91ee246c07c2c898690b5`;
- Android: `Battery-Monitor-Setup-Android-v0.1.0`, artifact ID `10070801187`, digest `bf9f6eb606f4043cd5b32bc9a171fe674b5881d7567048ffec9569c6b737d129`;
- Windows: `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`, artifact ID `10071096083`, digest `4c8ad2a07af51a7fe3d78e6135a848b4fad3128851d3a9fea92975e16c9b187a`.

Authoritative application image SHA-256:

`6be7c689ac1ef00446a7ed8c612d359f153150567d097ee77aa87320a4b44004`

Authoritative merged blank-device image SHA-256:

`4b0bd958b15a605a195b9aff2fd49bcbc28e51193b2ada462452daaafe9b3d5b`

The Windows bundle contains exactly those same two firmware images.

These normal-CI artifacts are intentionally **unsigned** and are not the production signed hardware-test package.

## C. Canonical production firmware architecture

There is one production firmware architecture:

- ESP-IDF **5.5.5**;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- target classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 stable base **3.3.11**;
- authoritative Arduino source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- WebServer hardening PR #12794 included;
- project root `battery-monitor/firmware/idf/`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- sole runtime implementation under `battery-monitor/firmware/BatteryMonitor/`;
- sole authoritative build entrypoint `battery-monitor/firmware/idf/build.sh`.

Do not restore PlatformIO, Arduino-ESP32 3.3.7, or a second firmware runtime.

## D. Device-at-rest security

Current production ESP-IDF configuration:

- Flash Encryption: Release mode enabled;
- NVS Encryption: enabled;
- encrypted `nvs_keys` at `0x294000`;
- partition table at `0xF000`;
- `app0` at `0x10000`;
- `app1` at `0x150000`;
- Secure Boot intentionally OFF pending real encrypted-device validation;
- irreversible eFuse application anti-rollback OFF pending the later production gate.

The 4 MiB merged image is for a blank/un-encrypted ESP32 first install only. It is not post-encryption recovery media.

## E. Signed USB OTA and release authority

Post-encryption updates use `SIGNED_USB_OTA_V1` over trusted physical USB:

1. Windows verifies the detached production RSA-3072-PSS-SHA256 signature.
2. Windows transfers the application image in bounded chunks.
3. Running firmware writes the inactive OTA slot through `esp_ota_write()` so Flash Encryption is applied by the device.
4. ESP32 independently verifies image hash, application identity, release sequence, and production signature.
5. Only a valid candidate may be selected for next boot.

Production public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Automatic application rollback is enabled. A newly selected candidate receives a 60-second health probation before being marked valid. The encrypted-NVS software release floor prevents equal/older signed releases from being selected after a newer release is accepted.

## F. Device Password / provisioning authority

The validated candidate implements one normal Device Password concept across trusted USB administration, LAN management, protected setup Wi-Fi, Security-2 provisioning, Windows, Android, and embedded WebUI.

Key rules:

- normal Windows `USB Setup` can initialize or rotate an arbitrary Device Password;
- optional Windows DPAPI storage is supported;
- trusted serial password commands are redacted from logs;
- arbitrary Device Passwords remain literal and case-sensitive;
- only the exact historical restricted `XXXX-XXXX-XXXX-XXXX` factory-code pattern receives legacy canonicalization;
- firmware, Windows, Android, and embedded WebUI use the same compatibility boundary;
- factory/printed-code generation remains a separate Advanced/manufacturing path;
- factory QR output is allowed only after the code is verified against the currently read physical device;
- editing the code or changing COM ports invalidates QR/device authority;
- Write/Verify re-check the physical Device ID immediately before credential action so a swapped board fails closed.

Focused compatibility procedure:

`battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`

## G. Runtime behavior retained

The validated `0.1.0.2` source also retains:

- initial trusted-USB Device Password creation immediately enables protected WPA2 + Security-2 setup when no home Wi-Fi exists;
- saved-Wi-Fi failure falls back to protected setup and retries home Wi-Fi on the established ~10-minute cadence;
- scheduled fallback transition waits for provisioning shutdown;
- an actively associated setup client defers scheduled retry instead of being disconnected mid-setup;
- embedded WebUI status polling is ~1 second independent of ADC sample cadence;
- runtime version reporting comes from the ESP-IDF application descriptor;
- USB Setup chemistry selection does not silently overwrite thresholds; defaults require `Apply Chemistry Defaults`;
- Advanced Tools uses the preconfigured high-entropy gate with PBKDF2-SHA256 verification and escalating lockout; its plaintext credential is not stored in repository authority documents.

## H. P0 security status

- P0-1 secure provisioning: source/build resolved; hardware/adversarial matrix pending.
- P0-2 administrator security/recovery: source/build resolved; hardware/adversarial matrix pending; active-LAN request-integrity hardening remains future work.
- P0-3 monitoring identity/spoof resistance: source/build resolved; protocol self-test green; real-network adversarial matrix pending.

Known residual risk: normal LAN management still uses HTTP on the local LAN, so an active on-path attacker may observe session/CSRF bearer material. Proposed future replacement remains `BATMON-MGMT-WRITE-V2`, implemented atomically across firmware, embedded WebUI, Windows, and Android.

## I. Next production action

The next production-signed hardware-test package must be built by the existing protected manual workflow:

`Battery Monitor Signed Firmware Release`

Exact inputs:

- `source_sha`: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- `version`: `0.1.0.2`

Do **not** sign a later documentation-only head as a substitute for that validated product SHA.

Exact operator procedure:

`battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`

The connected GitHub tool surface used from chat does not expose workflow dispatch, so the production signed `0.1.0.2` run has not been launched from chat.

## J. Hardware gate before Secure Boot

Use:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
- `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

Where older test documents still mention `9f833f8e...` / Toolchain #156, `VALIDATED_CANDIDATE_0_1_0_2.md` supersedes **only their source/run/artifact metadata**. Their substantive test requirements remain in force.

Before enabling Secure Boot, validate at minimum blank first install, Release Flash Encryption activation, encrypted NVS persistence, Device Password/setup behavior, fallback Wi-Fi transition, signed USB OTA both directions, tampered/wrong-signature rejection, interrupted OTA, candidate rollback, signed downgrade rejection, hostile-network P0 checks, relay/freshness behavior, ADC sanity, and controlled power interruption.

## K. Distribution work still open

- production-sign `0.1.0.2` from the exact validated source;
- real encrypted-device hardware matrix;
- production Android APK signing/release packaging;
- Windows Authenticode/code signing;
- repository branch/ruleset protection;
- later `BATMON-MGMT-WRITE-V2` active-LAN write integrity;
- Secure Boot/eFuse production gate only after physical validation.

## L. Read-first authorities

At the exact live branch head, read in this order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`
4. `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
5. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
6. `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
7. `battery-monitor/firmware/README.md`
8. `battery-monitor/firmware/idf/README.md`
9. `battery-monitor/firmware/idf/build.sh`
10. `battery-monitor/firmware/idf/version.txt`
11. `battery-monitor/firmware/idf/sdkconfig.defaults`
12. `battery-monitor/firmware/idf/partitions.csv`
13. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
14. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
15. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
16. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
17. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
18. `battery-monitor/windows/BatteryMonitor.Client/UsbSetupForm.cs`
19. `battery-monitor/windows/BatteryMonitor.Client/ProvisioningAdminForm.cs`
20. `.github/workflows/battery-monitor-ci.yml`
21. `.github/workflows/battery-monitor-signed-release.yml`

Then resolve the latest applicable normal toolchain and signed-release history before modifying product source.

## M. Remote/local warning

This state is based on the GitHub remote branch. Any local checkout must fetch and compare against live `battery-monitor-dev` before use.
