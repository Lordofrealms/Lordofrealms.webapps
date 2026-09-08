# Battery Monitor 0.1.0.2 — Hardware Test Asset Record

This file records package identity for the `0.1.0.2` encrypted-device hardware validation gate. It is an evidence sheet, not a source/release authority.

## A. Frozen product authority

- Validated product-source SHA: `9f833f8e6ebd596b6f8b7906b478858492d116cf`
- Authoritative firmware version: `0.1.0.2`
- Software release sequence: `2`
- Normal CI workflow: `Battery Monitor Toolchain`
- Normal CI run: `#156`
- Normal CI run ID: `34257017954`
- Normal CI conclusion: `success`
- Production public-key SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## B. Validated normal-CI artifacts

### ESP32 unsigned CI artifact

- Artifact name: `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10068644852`
- GitHub artifact digest: `sha256:24b75e56677971752c80e993f17d01df2a5a5d88704759cd25afc13f4380febf`
- Artifact role: build validation only; do not use as production-signed firmware.

### Windows unsigned CI artifact

- Artifact name: `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`
- Artifact ID: `10068718875`
- GitHub artifact digest: `sha256:19bb41171ae7e04f861e1744c93393adc086fd68ca7d4ef4460088b5e2a34d5c`
- Artifact role: CI application/package validation only; bundled firmware is intentionally unsigned and rejected for first install/update.

Inspected contents from the downloaded #156 artifact:

- `BatteryMonitor.Client.exe`
  - SHA-256: `fb9544c67bfc9ba649d5140de0c7921aab4f57509e55ccf2839ca90deb90a12a`
- `firmware/BatteryMonitor.ino.bin`
  - SHA-256: `a11873da95a5e0011d50adb5f2869cdabdb34e2e02bb5cc88ad2b3b3fe4a1389`
- `firmware/BatteryMonitor.ino.merged.bin`
  - SHA-256: `89ad92cec766f6e2be7c0342854053ef4cff80c83d3ad0c8731d53a8fc84514d`
- `firmware/UNSIGNED_CI_BUILD.txt`
  - SHA-256: `eeb7b6275e021cfe3d0fc66b46e1a45bdaee44d382f531960446a6067d839352`
- `tools/esp-provisioner/BatteryMonitorEspProv.exe`
  - SHA-256: `17630c896f4f3b24b1e158ef2561e836e884951adcd29c3b133cc7733daa3885`
- bundled `esptool.exe`
  - SHA-256: `a939e28fe2fbb53e65e46f0246a4d71b9fd6c052ef0e046182df4a4fe8bec946`

These hashes identify the inspected unsigned CI package only. Do not assume a separately rebuilt signed-release firmware image must have the same binary hash unless the signed workflow evidence itself proves that equality.

### Android setup artifact

- Artifact name: `Battery-Monitor-Setup-Android-v0.1.0`
- Artifact ID: `10068418517`
- GitHub artifact digest: `sha256:5932392822b7b1c4f24e6b5b6ab7a652221e47044316a08932e0fcb75ef23522`
- Contained APK: `Battery-Monitor-Setup-v0.1.0.apk`
- APK SHA-256: `6447cae3ad37364d385897b01dac9ffb59f8db5cfc33e2834572e95034a36d32`
- APK role: current CI-built Android provisioning client for the hardware test matrix.
- Production Android signing remains a separate open distribution item; do not mislabel this debug/CI artifact as a production-signed Android release.

## C. Production signed-release evidence — PENDING

The only signed-release workflow run currently found on `battery-monitor-dev` is older run #1 / run ID `34239873501` at SHA `f846e2c628b96e5a7ddccc8413701fa832864b3d`. It predates the validated `0.1.0.2` product checkpoint and is not usable as the `0.1.0.2` hardware-test release.

Dispatch the protected manual workflow using:

- `source_sha`: `9f833f8e6ebd596b6f8b7906b478858492d116cf`
- `version`: `0.1.0.2`

After the run succeeds, fill in all fields below before flashing hardware.

### Signed workflow run

- Workflow run ID: `PENDING`
- Workflow run number: `PENDING`
- Workflow run attempt: `PENDING`
- Conclusion: `PENDING`
- Requested source SHA: `PENDING`
- Requested version: `PENDING`

Required acceptance values:

- source SHA must equal `9f833f8e6ebd596b6f8b7906b478858492d116cf`;
- version must equal `0.1.0.2`;
- conclusion must be `success`.

### Signed firmware artifact

Expected artifact name:

`Battery-Monitor-Signed-Firmware-0.1.0.2`

- Artifact ID: `PENDING`
- GitHub artifact digest: `PENDING`
- Downloaded ZIP SHA-256: `PENDING`
- `BatteryMonitor.ino.bin` SHA-256: `PENDING`
- `BatteryMonitor.ino.bin.sig` SHA-256: `PENDING`
- `BatteryMonitor.ino.merged.bin` SHA-256: `PENDING`
- `BatteryMonitor.ino.merged.bin.sig` SHA-256: `PENDING`
- `SIGNED_RELEASE.txt` SHA-256: `PENDING`
- `SIGNED_RELEASE.txt` source SHA verified: `PENDING`
- `SIGNED_RELEASE.txt` version verified: `PENDING`
- `SIGNED_RELEASE.txt` trust-root fingerprint verified: `PENDING`

### Signed Windows artifact

Expected artifact name:

`Battery-Monitor-Windows-Signed-0.1.0.2`

- Artifact ID: `PENDING`
- GitHub artifact digest: `PENDING`
- Downloaded ZIP SHA-256: `PENDING`
- `BatteryMonitor.Client.exe` SHA-256: `PENDING`
- bundled application firmware SHA-256: `PENDING`
- bundled application signature SHA-256: `PENDING`
- bundle reports production signature present: `PENDING`
- Windows production verifier gate passed in workflow: `PENDING`

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

## E. Test documents

Use together:

- `battery-monitor/SIGNED_RELEASE_OPERATOR_CHECKLIST_0_1_0_2.md`
- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/PROJECT_STATE_LATEST.md`
- `battery-monitor/PROJECT_HANDOFF_LATEST.md`

The production-signed evidence in section C must be filled before any signed OTA/first-install test is treated as authoritative hardware validation.
