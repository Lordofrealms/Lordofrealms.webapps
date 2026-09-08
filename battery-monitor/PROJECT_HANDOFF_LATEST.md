# Battery Monitor — Session Handoff

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume the documentation head equals the validated product SHA.**

## 1. Latest validated product/security checkpoint

`d1d6c0ed782116d58f925543ae599939c0ec0191` — `Invalidate factory QR on code or port changes`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#167**
- Run ID: **`34263129626`**
- Result: **SUCCESS**

Run #167 passed firmware, Android, exact firmware handoff to Windows, pinned esptool/Security-2 helper, Windows build, protocol/P0-3 self-test, self-contained publish, bundle, and artifact upload.

Exact candidate evidence:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

## 2. Final normal-CI artifacts

- firmware artifact ID `10070951566`, digest `13480473e4a76fed49a15fb05bed70a6294ad1148cd91ee246c07c2c898690b5`;
- Android artifact ID `10070801187`, digest `bf9f6eb606f4043cd5b32bc9a171fe674b5881d7567048ffec9569c6b737d129`;
- Windows artifact ID `10071096083`, digest `4c8ad2a07af51a7fe3d78e6135a848b4fad3128851d3a9fea92975e16c9b187a`.

Application image SHA-256:

`6be7c689ac1ef00446a7ed8c612d359f153150567d097ee77aa87320a4b44004`

Merged blank-device image SHA-256:

`4b0bd958b15a605a195b9aff2fd49bcbc28e51193b2ada462452daaafe9b3d5b`

Normal CI is intentionally unsigned. Do not use these artifacts as the production signed hardware-test package.

## 3. Production firmware architecture

There is one production firmware architecture:

- ESP-IDF 5.5.5, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 3.3.11, exact source `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- runtime source under `battery-monitor/firmware/BatteryMonitor/`;
- ESP-IDF wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- official build entrypoint `battery-monitor/firmware/idf/build.sh`.

Do not restore PlatformIO, Arduino-ESP32 3.3.7, or a second runtime.

## 4. Security posture

- Release-mode Flash Encryption ON;
- NVS Encryption ON;
- automatic application rollback ON;
- encrypted-NVS software release floor ON;
- Secure Boot OFF pending real encrypted-device testing;
- irreversible eFuse application anti-rollback OFF pending the later production gate.

Production trust-root SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

The 4 MiB merged image is blank/un-encrypted first install only, not post-encryption recovery.

## 5. Device Password / first-use result

The current candidate now has one coherent normal Device Password flow:

- Windows `USB Setup` can initialize or rotate an arbitrary Device Password over trusted USB;
- optional Windows DPAPI remembering is supported;
- serial credential commands are redacted in logs;
- arbitrary passwords remain literal/case-sensitive;
- only the exact historical restricted `XXXX-XXXX-XXXX-XXXX` factory-code pattern is canonicalized for compatibility;
- firmware, Windows, Android, and embedded WebUI share that rule;
- Advanced factory tools are explicitly the generated/printed-code + QR path, not normal administration;
- factory QR is generated only for a code verified against the currently read physical device;
- editing the code or changing COM ports invalidates QR/device authority;
- Write/Verify re-read Device ID immediately before credential action so a swapped board fails closed.

Focused test authority:

`battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`

## 6. Runtime behavior retained

The candidate also retains the previous `0.1.0.2` fixes:

- initial trusted-USB Device Password creation immediately enables the protected WPA2 + Security-2 setup AP when no home Wi-Fi exists;
- saved-Wi-Fi fallback retries on the established ~10-minute cadence;
- scheduled fallback waits for provisioning shutdown and defers while a setup client is associated;
- WebUI refresh is ~1 second independent of ADC sample cadence;
- firmware version comes from the ESP-IDF app descriptor;
- chemistry selection does not silently overwrite voltage thresholds;
- Advanced Tools gate remains preconfigured, PBKDF2-protected, fixed-time verified, and rate-limited.

## 7. Next concrete action — production signing

Use the existing protected manual workflow:

`Battery Monitor Signed Firmware Release`

Exact inputs:

- `source_sha`: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- `version`: `0.1.0.2`

Do not sign a later documentation-only branch head instead of the validated product SHA.

Operator procedure:

`battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`

The connected GitHub tool surface in chat does not expose `workflow_dispatch`, so the production signing run has not been launched from chat.

## 8. Hardware gate before Secure Boot

Use together:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
- `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

Where older hardware-test documents still contain `9f833f8e...` / Toolchain #156 metadata, the validated-candidate file supersedes only that source/run/artifact metadata. The substantive test requirements remain applicable.

Do not enable Secure Boot until blank install/encryption, encrypted NVS, secure provisioning, fallback recovery, signed OTA, wrong/tampered signature rejection, interrupted OTA, rollback, downgrade rejection, hostile-network checks, relay/freshness/ADC behavior, and power interruption have passed on real hardware.

## 9. Work still open

- protected production signing of exact candidate `d1d6c0ed...`;
- real encrypted-device hardware matrix;
- production Android signing/release packaging;
- Windows Authenticode/code signing;
- repository branch/ruleset protection;
- future `BATMON-MGMT-WRITE-V2` active-LAN privileged-write integrity;
- Secure Boot/eFuse production activation after physical validation.

## 10. Read first next session

At the exact live remote head, read in this order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`
4. `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
5. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
6. `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
7. `battery-monitor/firmware/README.md`
8. `battery-monitor/firmware/idf/README.md`
9. `.github/workflows/battery-monitor-ci.yml`
10. `.github/workflows/battery-monitor-signed-release.yml`
11. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
12. `battery-monitor/windows/BatteryMonitor.Client/UsbSetupForm.cs`
13. `battery-monitor/windows/BatteryMonitor.Client/ProvisioningAdminForm.cs`

Then resolve the latest applicable Battery Monitor Toolchain and signed-release history before changing product source.
