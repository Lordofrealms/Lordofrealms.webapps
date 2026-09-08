# Battery Monitor — Session Handoff

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume the documentation head equals the validated product SHA.**

## 1. Validated product/security checkpoint

`d1d6c0ed782116d58f925543ae599939c0ec0191` — `Invalidate factory QR on code or port changes`

Normal-CI authority:

- Workflow: `Battery Monitor Toolchain`
- Run: **#167**
- Run ID: **`34263129626`**
- Result: **SUCCESS**

Run #167 passed firmware, Android, exact firmware handoff to Windows, pinned esptool/Security-2 helper, Windows build, protocol/P0-3 self-test, self-contained publish, bundle, and artifact upload.

Exact candidate evidence:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

## 2. Production signed release — COMPLETE AND VERIFIED

Protected release authority:

- Workflow: `Battery Monitor Signed Firmware Release`
- Run: **#2**
- Run ID: **`34267079480`**
- Event: `workflow_dispatch`
- Conclusion: **SUCCESS**
- Signed source SHA: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- Version: `0.1.0.2`
- Software release sequence: `2`
- Algorithm: `RSA-3072-PSS-SHA256`

Signed artifacts:

### Firmware

- `Battery-Monitor-Signed-Firmware-0.1.0.2`
- artifact ID `10072544011`
- artifact/ZIP SHA-256 `b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`
- application image SHA-256 `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`
- application signature SHA-256 `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`
- merged blank-first-install image SHA-256 `0a964fd57bc055ab88c31accc8d4162462e865bc4f3e63d22198aa26435affd1`
- merged signature SHA-256 `2550dfd3bf8c8096148eee7fbabc4dddc744076efe4fd2d21017ac2759a415a0`

### Windows

- `Battery-Monitor-Windows-Signed-0.1.0.2`
- artifact ID `10072631425`
- artifact/ZIP SHA-256 `42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`
- `BatteryMonitor.Client.exe` SHA-256 `280a0d6f39250dbc3cafb4eea4756e4dea5f3d05047ee4ad172e4691f04afb06`

`SIGNED_RELEASE.txt` verifies exact source SHA/version/release sequence and production trust-root fingerprint.

Independent post-download OpenSSL verification was also completed against the public key embedded in the exact validated firmware source:

- derived SPKI SHA-256 `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e` — exact match;
- application signature — `Verified OK`;
- merged-image signature — `Verified OK`.

The signed Windows package contains byte-for-byte identical signed application/merged images, signatures, and release manifest as the signed firmware artifact.

Full evidence:

`battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

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

## 5. Device Password / first-use authority

The signed candidate has one coherent normal Device Password flow:

- Windows `USB Setup` can initialize or rotate an arbitrary Device Password over trusted USB;
- optional Windows DPAPI remembering is supported;
- serial credential commands are redacted in logs;
- arbitrary passwords remain literal/case-sensitive;
- only the exact historical restricted `XXXX-XXXX-XXXX-XXXX` factory-code pattern is canonicalized for compatibility;
- firmware, Windows, Android, and embedded WebUI share that rule;
- Advanced factory tools are the generated/printed-code + QR path, not normal administration;
- factory QR is generated only for a code verified against the currently read physical device;
- editing the code or changing COM ports invalidates QR/device authority;
- Write/Verify re-read Device ID immediately before credential action so a swapped board fails closed.

Focused test authority:

`battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`

## 6. Runtime behavior retained

- first trusted-USB Device Password creation immediately enables protected WPA2 + Security-2 setup when no home Wi-Fi exists;
- saved-Wi-Fi fallback retries on the ~10-minute cadence;
- scheduled fallback waits for provisioning shutdown and defers while a setup client is associated;
- WebUI refresh is ~1 second independent of ADC sample cadence;
- firmware version comes from the ESP-IDF app descriptor;
- chemistry selection does not silently overwrite voltage thresholds;
- calibration factor/offset persist in NVS through reboot, power loss, and normal application-mediated signed OTA;
- Advanced Tools gate remains preconfigured, PBKDF2-protected, fixed-time verified, and rate-limited.

## 7. NEXT ACTION — physical hardware validation

Production signing is complete. Do not re-sign just to begin testing.

Use the signed package recorded in:

`battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

### Existing already-encrypted unit

Use:

**Firmware Update -> Update Firmware**

from `Battery-Monitor-Windows-Signed-0.1.0.2`.

Do not use the merged blank-first-install image and do not direct-flash plaintext firmware with esptool.

### Genuinely blank/un-encrypted unit

Use:

**Advanced First Install -> First Install (Blank ESP32)**

from the signed Windows package, then allow the first encrypted boot to finish without removing power.

### Physical validation

Run:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`

Do not enable Secure Boot until blank install/encryption, encrypted NVS, secure provisioning, fallback recovery, signed OTA, wrong/tampered signature rejection, interrupted OTA, rollback, downgrade rejection, hostile-network checks, relay/freshness/ADC behavior, and controlled power interruption have passed on real hardware.

## 8. Work still open

- real encrypted-device hardware matrix;
- production Android signing/release packaging;
- Windows Authenticode/code signing;
- repository branch/ruleset protection;
- future `BATMON-MGMT-WRITE-V2` active-LAN privileged-write integrity;
- Secure Boot/eFuse production activation after physical validation.

## 9. Read first next session

At the exact live remote head, read in this order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`
4. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`
5. `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
6. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
7. `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
8. `battery-monitor/firmware/README.md`
9. `battery-monitor/firmware/idf/README.md`
10. `.github/workflows/battery-monitor-ci.yml`
11. `.github/workflows/battery-monitor-signed-release.yml`
12. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
13. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
14. `battery-monitor/windows/BatteryMonitor.Client/UsbSetupForm.cs`
15. `battery-monitor/windows/BatteryMonitor.Client/ProvisioningAdminForm.cs`

Then resolve the latest applicable Battery Monitor Toolchain and signed-release history before changing product source.
