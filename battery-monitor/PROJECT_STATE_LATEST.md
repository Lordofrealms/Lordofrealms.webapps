# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Prototype family:** `0.1.0`  
**Authoritative firmware version / software release sequence:** `0.1.0.2` / `2`  
**Production signature status:** **VERIFIED — signed hardware-test release exists; physical validation pending**

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before making changes. Documentation-only commits may be newer than the validated product source.

Latest fully validated **product/security source**:

`d1d6c0ed782116d58f925543ae599939c0ec0191` — `Invalidate factory QR on code or port changes`

Authoritative normal-CI validation:

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

Normal-CI application image SHA-256:

`6be7c689ac1ef00446a7ed8c612d359f153150567d097ee77aa87320a4b44004`

Normal-CI merged blank-device image SHA-256:

`4b0bd958b15a605a195b9aff2fd49bcbc28e51193b2ada462452daaafe9b3d5b`

The normal-CI Windows bundle contains exactly those same two unsigned firmware images. These normal-CI artifacts are intentionally **unsigned** and must not be substituted for the signed hardware-test release.

## C. Production signed release — VERIFIED

Protected manual release:

- Workflow: `Battery Monitor Signed Firmware Release`
- Run: **#2**
- Run ID: **`34267079480`**
- Event: `workflow_dispatch`
- Conclusion: **SUCCESS**
- Signed source SHA: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- Version: `0.1.0.2`
- Software release sequence: `2`
- Signature algorithm: `RSA-3072-PSS-SHA256`

Signed firmware artifact:

- name: `Battery-Monitor-Signed-Firmware-0.1.0.2`
- artifact ID: `10072544011`
- artifact/ZIP SHA-256: `b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`
- application image SHA-256: `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`
- application signature SHA-256: `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`
- merged first-install image SHA-256: `0a964fd57bc055ab88c31accc8d4162462e865bc4f3e63d22198aa26435affd1`
- merged first-install signature SHA-256: `2550dfd3bf8c8096148eee7fbabc4dddc744076efe4fd2d21017ac2759a415a0`

Signed Windows artifact:

- name: `Battery-Monitor-Windows-Signed-0.1.0.2`
- artifact ID: `10072631425`
- artifact/ZIP SHA-256: `42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`
- `BatteryMonitor.Client.exe` SHA-256: `280a0d6f39250dbc3cafb4eea4756e4dea5f3d05047ee4ad172e4691f04afb06`
- bundled signed images/signatures and release manifest match the signed firmware artifact byte-for-byte.

`SIGNED_RELEASE.txt` records the exact validated product SHA, `0.1.0.2`, release sequence 2, `SIGNED_USB_OTA_V1`, and the frozen production-key fingerprint.

Independent post-download OpenSSL verification was also performed using the public key embedded in the exact validated firmware source:

- derived SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e` — exact match;
- application RSA-PSS signature: `Verified OK`;
- merged-image RSA-PSS signature: `Verified OK`.

Full package evidence is authoritative in:

`battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

## D. Canonical production firmware architecture

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

## E. Device-at-rest security

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

## F. Signed USB OTA and release authority

Post-encryption updates use `SIGNED_USB_OTA_V1` over trusted physical USB:

1. Windows verifies the detached production RSA-3072-PSS-SHA256 signature.
2. Windows transfers the application image in bounded chunks.
3. Running firmware writes the inactive OTA slot through `esp_ota_write()` so Flash Encryption is applied by the device.
4. ESP32 independently verifies image hash, application identity, release sequence, and production signature.
5. Only a valid candidate may be selected for next boot.

Production public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Automatic application rollback is enabled. A newly selected candidate receives a 60-second health probation before being marked valid. The encrypted-NVS software release floor prevents equal/older signed releases from being selected after a newer release is accepted.

## G. Device Password / provisioning authority

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

## H. Runtime behavior retained

The validated `0.1.0.2` source also retains:

- initial trusted-USB Device Password creation immediately enables protected WPA2 + Security-2 setup when no home Wi-Fi exists;
- saved-Wi-Fi failure falls back to protected setup and retries home Wi-Fi on the established ~10-minute cadence;
- scheduled fallback transition waits for provisioning shutdown;
- an actively associated setup client defers scheduled retry instead of being disconnected mid-setup;
- embedded WebUI status polling is ~1 second independent of ADC sample cadence;
- runtime version reporting comes from the ESP-IDF application descriptor;
- USB Setup chemistry selection does not silently overwrite thresholds; defaults require `Apply Chemistry Defaults`;
- calibration factor/offset are stored in NVS as `calf`/`calo` and persist through reboot, power loss, and normal application-mediated signed OTA; full erase/NVS destruction is not persistence-preserving;
- Advanced Tools uses the preconfigured high-entropy gate with PBKDF2-SHA256 verification and escalating lockout; its plaintext credential is not stored in repository authority documents.

## I. P0 security status

- P0-1 secure provisioning: source/build/signed release resolved; hardware/adversarial matrix pending.
- P0-2 administrator security/recovery: source/build/signed release resolved; hardware/adversarial matrix pending; active-LAN request-integrity hardening remains future work.
- P0-3 monitoring identity/spoof resistance: source/build/signed release resolved; protocol self-test green; real-network adversarial matrix pending.

Known residual risk: normal LAN management still uses HTTP on the local LAN, so an active on-path attacker may observe session/CSRF bearer material. Proposed future replacement remains `BATMON-MGMT-WRITE-V2`, implemented atomically across firmware, embedded WebUI, Windows, and Android.

## J. Current production action: physical hardware validation

Production signing is complete. Do not re-sign merely to begin testing.

Use the verified signed artifacts recorded in `battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`.

For an existing already-encrypted Battery Monitor:

- use `Battery-Monitor-Windows-Signed-0.1.0.2`;
- use `Firmware Update -> Update Firmware`;
- do not use the merged first-install image or direct plaintext esptool flashing.

For a genuinely blank, unencrypted ESP32:

- use `Advanced First Install -> First Install (Blank ESP32)` from the signed Windows package;
- allow first encrypted boot to complete without power interruption.

Then execute:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`

Do not enable Secure Boot until the complete physical encrypted-device validation matrix passes.

## K. Distribution work still open

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
3. `battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`
4. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`
5. `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
6. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
7. `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
8. `battery-monitor/firmware/README.md`
9. `battery-monitor/firmware/idf/README.md`
10. `battery-monitor/firmware/idf/build.sh`
11. `battery-monitor/firmware/idf/version.txt`
12. `battery-monitor/firmware/idf/sdkconfig.defaults`
13. `battery-monitor/firmware/idf/partitions.csv`
14. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
15. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
16. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
17. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
18. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
19. `battery-monitor/windows/BatteryMonitor.Client/UsbSetupForm.cs`
20. `battery-monitor/windows/BatteryMonitor.Client/ProvisioningAdminForm.cs`
21. `.github/workflows/battery-monitor-ci.yml`
22. `.github/workflows/battery-monitor-signed-release.yml`

Then resolve the latest applicable normal toolchain and signed-release history before modifying product source.

## M. Remote/local warning

This state is based on the GitHub remote branch. Any local checkout must fetch and compare against live `battery-monitor-dev` before use.
