# Battery Monitor 0.1.0.2 — Hardware Test Asset Record

This file records package identity for the `0.1.0.2` encrypted-device hardware validation gate. It is an evidence sheet, not a source/release authority.

## A. Frozen product authority

- Validated product-source SHA: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- Authoritative firmware version: `0.1.0.2`
- Software release sequence: `2`
- Normal CI workflow: `Battery Monitor Toolchain`
- Normal CI run: `#167`
- Normal CI run ID: `34263129626`
- Normal CI conclusion: `success`
- Production public-key SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## B. Validated normal-CI artifacts

### ESP32 unsigned CI artifact

- Artifact name: `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10070951566`
- GitHub artifact digest: `sha256:13480473e4a76fed49a15fb05bed70a6294ad1148cd91ee246c07c2c898690b5`
- Artifact role: build validation only; do not use as production-signed firmware.

### Windows unsigned CI artifact

- Artifact name: `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10071096083`
- GitHub artifact digest: `sha256:4c8ad2a07af51a7fe3d78e6135a848b4fad3128851d3a9fea92975e16c9b187a`
- Artifact role: CI application/package validation only; bundled firmware is intentionally unsigned and rejected for first install/update.

### Android setup artifact

- Artifact name: `Battery-Monitor-Setup-Android-v0.1.0`
- Artifact ID: `10070801187`
- GitHub artifact digest: `sha256:bf9f6eb606f4043cd5b32bc9a171fe674b5881d7567048ffec9569c6b737d129`
- Contained APK: `Battery-Monitor-Setup-v0.1.0.apk`
- APK SHA-256: `0d7562f07597cf6656716f3ec4b0181163adab76bf10ca0d4be44b83bb9c32c3`
- APK role: current CI-built Android provisioning client for the hardware test matrix.
- Production Android signing remains a separate distribution item; do not mislabel this CI/debug APK as a production-signed Android release.

## C. Production signed-release evidence — VERIFIED

### Signed workflow run

- Workflow: `Battery Monitor Signed Firmware Release`
- Workflow run number: `#2`
- Workflow run ID: `34267079480`
- Workflow event: `workflow_dispatch`
- Conclusion: `success`
- Requested/source product SHA verified from signed release manifest: `d1d6c0ed782116d58f925543ae599939c0ec0191`
- Requested/source version verified from signed release manifest: `0.1.0.2`
- Software release sequence: `2`
- Signature algorithm: `RSA-3072-PSS-SHA256`
- Signed manifest production SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

The workflow was dispatched from a later documentation-only branch head, but `SIGNED_RELEASE.txt` proves the signed build source was the exact validated product SHA above.

### Signed firmware artifact

- Artifact name: `Battery-Monitor-Signed-Firmware-0.1.0.2`
- Artifact ID: `10072544011`
- GitHub artifact digest: `sha256:b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`
- Downloaded ZIP SHA-256: `b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`
- `BatteryMonitor.ino.bin` SHA-256: `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`
- `BatteryMonitor.ino.bin.sig` SHA-256: `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`
- `BatteryMonitor.ino.merged.bin` SHA-256: `0a964fd57bc055ab88c31accc8d4162462e865bc4f3e63d22198aa26435affd1`
- `BatteryMonitor.ino.merged.bin.sig` SHA-256: `2550dfd3bf8c8096148eee7fbabc4dddc744076efe4fd2d21017ac2759a415a0`
- `SIGNED_RELEASE.txt` SHA-256: `afbe64087ba02af43d70cbb74c8bdfa2ca54f929149c9105c97af931c83ab9f1`
- `SIGNED_RELEASE.txt` source SHA verified: `yes`
- `SIGNED_RELEASE.txt` version verified: `yes`
- `SIGNED_RELEASE.txt` trust-root fingerprint verified: `yes`
- Independent OpenSSL verification of application RSA-PSS signature using the public key embedded in validated firmware source: `Verified OK`
- Independent OpenSSL verification of merged-image RSA-PSS signature using the same embedded public key: `Verified OK`
- Independently derived embedded-key SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

### Signed Windows artifact

- Artifact name: `Battery-Monitor-Windows-Signed-0.1.0.2`
- Artifact ID: `10072631425`
- GitHub artifact digest: `sha256:42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`
- Downloaded ZIP SHA-256: `42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`
- `BatteryMonitor.Client.exe` SHA-256: `280a0d6f39250dbc3cafb4eea4756e4dea5f3d05047ee4ad172e4691f04afb06`
- bundled application firmware SHA-256: `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`
- bundled application signature SHA-256: `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`
- bundled application image matches signed firmware artifact byte-for-byte: `yes`
- bundled application signature matches signed firmware artifact byte-for-byte: `yes`
- bundled merged image/signature match signed firmware artifact byte-for-byte: `yes`
- bundled `SIGNED_RELEASE.txt` matches signed firmware artifact byte-for-byte: `yes`
- Windows production verifier gate passed in workflow: `yes`
- workflow tamper-rejection gate passed: `yes`
- workflow wrong-key rejection gate passed: `yes`

## D. Physical test unit record — PENDING

Do not put secret credentials in this file.

- Test unit label: `PENDING`
- ESP32 board/module revision: `PENDING`
- Initial device ID (`BM-xxxxxx`): `PENDING`
- Test date: `PENDING`
- Tester: `PENDING`
- Starting firmware version: `PENDING`
- Starting encrypted-device state: `PENDING`
- Hardware test plan result: `PENDING`

## E. Hardware-use authority

The production-signed `0.1.0.2` package above is verified and may now be used for the physical hardware validation gate.

For an existing already-encrypted Battery Monitor:

- use the signed Windows package;
- use `Firmware Update -> Update Firmware`;
- use the application image/signature through the running application-mediated signed USB OTA path;
- do not directly flash the plaintext application or merged image with esptool.

For a genuinely blank, unencrypted ESP32:

- use `Advanced First Install -> First Install (Blank ESP32)`;
- use the signed merged first-install image through the Windows tool;
- allow first encrypted boot to complete without power interruption.

The merged plaintext first-install image is never post-encryption recovery.

Secure Boot remains intentionally OFF until the complete physical encrypted-device validation matrix passes.

## F. Test documents

Use together:

- `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
- `battery-monitor/PROJECT_STATE_LATEST.md`
- `battery-monitor/PROJECT_HANDOFF_LATEST.md`
