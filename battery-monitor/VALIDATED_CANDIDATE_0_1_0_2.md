# Battery Monitor 0.1.0.2 — Validated Candidate Authority

**Validated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Product-source SHA:** `d1d6c0ed782116d58f925543ae599939c0ec0191`  
**Firmware version:** `0.1.0.2`  
**Software release sequence:** `2`

## Normal CI authority

- Workflow: `Battery Monitor Toolchain`
- Run: **#167**
- Run ID: **`34263129626`**
- Conclusion: **SUCCESS**

All authoritative jobs passed at the exact product-source SHA above:

- ESP32 ESP-IDF + Arduino firmware — SUCCESS
- Android provisioning APK — SUCCESS
- Windows .NET 8 client — SUCCESS
- exact firmware-artifact handoff into Windows — SUCCESS
- pinned esptool verification — SUCCESS
- pinned Espressif Security-2 helper build — SUCCESS
- Windows build and self-contained publish — SUCCESS
- P0-3 / protocol self-test, including Device Password compatibility vectors — SUCCESS

## Final normal-CI artifacts

### ESP32 unsigned CI artifact

- Name: `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10070951566`
- GitHub artifact digest / downloaded ZIP SHA-256: `13480473e4a76fed49a15fb05bed70a6294ad1148cd91ee246c07c2c898690b5`
- `BatteryMonitor.ino.bin` SHA-256: `6be7c689ac1ef00446a7ed8c612d359f153150567d097ee77aa87320a4b44004`
- `BatteryMonitor.ino.merged.bin` SHA-256: `4b0bd958b15a605a195b9aff2fd49bcbc28e51193b2ada462452daaafe9b3d5b`

This artifact is unsigned CI validation material only. It is not the production signed hardware-test package.

### Android CI artifact

- Name: `Battery-Monitor-Setup-Android-v0.1.0`
- Artifact ID: `10070801187`
- GitHub artifact digest / downloaded ZIP SHA-256: `bf9f6eb606f4043cd5b32bc9a171fe674b5881d7567048ffec9569c6b737d129`
- `Battery-Monitor-Setup-v0.1.0.apk` SHA-256: `0d7562f07597cf6656716f3ec4b0181163adab76bf10ca0d4be44b83bb9c32c3`

The Android artifact remains a CI/debug distribution artifact; production Android signing is still open.

### Windows unsigned CI artifact

- Name: `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10071096083`
- GitHub artifact digest / downloaded ZIP SHA-256: `4c8ad2a07af51a7fe3d78e6135a848b4fad3128851d3a9fea92975e16c9b187a`
- `BatteryMonitor.Client.exe` SHA-256: `280a0d6f39250dbc3cafb4eea4756e4dea5f3d05047ee4ad172e4691f04afb06`
- bundled `BatteryMonitor.ino.bin` SHA-256: `6be7c689ac1ef00446a7ed8c612d359f153150567d097ee77aa87320a4b44004`
- bundled `BatteryMonitor.ino.merged.bin` SHA-256: `4b0bd958b15a605a195b9aff2fd49bcbc28e51193b2ada462452daaafe9b3d5b`
- `tools/esp-provisioner/BatteryMonitorEspProv.exe` SHA-256: `451af1214af402960ac848651827ad9eddd56542e5805320c4e9edda82e71f7f`
- bundled `esptool.exe` SHA-256: `a939e28fe2fbb53e65e46f0246a4d71b9fd6c052ef0e046182df4a4fe8bec946`

The firmware hashes inside the Windows bundle exactly match the firmware-job artifact.

## Product changes included in this candidate

In addition to the previously validated `0.1.0.2` security/runtime work, this candidate includes the completed Device Password and Windows first-use cleanup:

- trusted USB Setup can initialize or rotate an arbitrary normal Device Password;
- optional Windows DPAPI storage remains available for the Device Password;
- Device Password serial commands remain redacted from application logs;
- exact historical `XXXX-XXXX-XXXX-XXXX` setup-code compatibility is canonicalized consistently across firmware, Windows, Android, and embedded WebUI;
- arbitrary custom Device Passwords remain literal/case-sensitive and are not over-normalized;
- the factory/printed-code tool is explicitly separated from normal USB administration;
- factory QR output is available only for a code verified against the currently read device;
- changing code text or COM port invalidates QR/device authority;
- Write/Verify re-read Device ID immediately before touching credentials so a swapped board fails closed.

## Production signing authority

The next production-signed hardware-test release must use the existing protected manual workflow:

`Battery Monitor Signed Firmware Release`

Exact inputs:

- `source_sha`: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- `version`: `0.1.0.2`

Production public-key SPKI SHA-256 remains:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Do not sign a later documentation-only branch head as a substitute for this validated product SHA. The workflow's current UI default version is older; explicitly enter `0.1.0.2`.

## Hardware/security gate status

Still pending before Secure Boot/eFuse production activation:

- production signed `0.1.0.2` package from the exact source SHA above;
- encrypted-device physical hardware validation;
- signed USB OTA and rollback/downgrade tests;
- P0-1/P0-2/P0-3 real-network/adversarial checks;
- relay/freshness/ADC/power-interruption regression matrix.

Secure Boot remains intentionally OFF until that physical gate passes.

## Metadata supersession rule

This file supersedes **source SHA, normal-CI run, and normal-CI artifact metadata only** where older `0.1.0.2` documents still mention checkpoint `9f833f8e...` / Toolchain #156. Their substantive test procedures and security requirements remain applicable unless a newer authority explicitly changes them.

In particular, when using `HARDWARE_TEST_PLAN_0_1_0_2.md` or `HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`, substitute the product-source/run/artifact authority from this file.
