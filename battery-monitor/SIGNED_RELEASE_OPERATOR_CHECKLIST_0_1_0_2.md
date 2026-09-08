# Battery Monitor 0.1.0.2 — Signed Release Operator Checklist

**Purpose:** produce the production-signed package needed for the encrypted-device hardware test gate without changing or bypassing the signing policy.

**Validated product source:** `9f833f8e6ebd596b6f8b7906b478858492d116cf`  
**Authoritative version:** `0.1.0.2`  
**Software release sequence:** `2`  
**Normal CI authority:** Battery Monitor Toolchain #156 / run `34257017954` — SUCCESS

## 1. Do not sign the current documentation head

The live `battery-monitor-dev` branch contains documentation/test-plan commits after the validated product checkpoint.

For this release, the signed-release workflow must build the exact validated product SHA below, not the later branch head:

`9f833f8e6ebd596b6f8b7906b478858492d116cf`

The signing workflow accepts an exact `source_sha` specifically for this reason.

## 2. Open the protected manual workflow

In GitHub Actions, select:

`Battery Monitor Signed Firmware Release`

This workflow is manual `workflow_dispatch` only and uses the protected `battery-monitor-production-signing` environment.

Do not:

- add a push trigger;
- copy the production private key into repository files;
- bypass environment approval/protection;
- change the expected production public-key fingerprint merely to make a run pass;
- sign a different branch head as a substitute for the validated product SHA.

## 3. Enter these exact inputs

`source_sha`

`9f833f8e6ebd596b6f8b7906b478858492d116cf`

`version`

`0.1.0.2`

Important: the workflow UI currently has an older default version value. Replace it explicitly with `0.1.0.2` before dispatching.

The workflow itself independently verifies the requested version against `battery-monitor/firmware/idf/version.txt` at the requested source SHA.

## 4. Expected security gates during the run

Do not use artifacts unless the entire workflow is green.

The signed firmware job must validate at least:

- exact 40-character source SHA;
- authoritative source version `0.1.0.2`;
- release sequence `2`;
- authoritative ESP-IDF build path;
- expected Flash/NVS encryption and rollback build authorities;
- production RSA-3072 private-key availability through the protected environment;
- production public-key SPKI SHA-256:
  `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- RSA-PSS signatures for both application and merged first-install images;
- independent verification of those signatures;
- tampered-image rejection;
- wrong-key rejection.

The Windows signed-package job must then:

- consume the exact signed firmware artifact from the first job;
- build the Windows client from the same requested source SHA;
- use the pinned esptool package;
- build the pinned Espressif Security-2 provisioning helper;
- run the Windows build and P0-3 protocol self-test;
- exercise the Windows production firmware verifier against the signed images;
- reject a deliberately tampered test image;
- bundle the signed firmware and tools into the final Windows package.

## 5. Expected signed artifacts

After a successful `0.1.0.2` run, expect:

- `Battery-Monitor-Signed-Firmware-0.1.0.2`
- `Battery-Monitor-Windows-Signed-0.1.0.2`

Do not substitute the normal-CI artifacts for these. Toolchain #156 intentionally produced unsigned CI packages:

- `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`

The #156 Windows CI bundle explicitly states that its firmware images are unsigned and that the Windows firmware-update/first-install functions reject them.

## 6. Record release evidence before hardware use

Record, without recording secrets:

- signed-release workflow run ID;
- run attempt number;
- conclusion `success`;
- requested `source_sha`;
- requested `version`;
- signed firmware artifact ID and artifact digest;
- signed Windows artifact ID and artifact digest;
- SHA-256 of downloaded `BatteryMonitor.ino.bin`;
- SHA-256 of downloaded `BatteryMonitor.ino.bin.sig`;
- SHA-256 of downloaded `BatteryMonitor.ino.merged.bin`;
- SHA-256 of downloaded `BatteryMonitor.ino.merged.bin.sig`;
- SHA-256 of the downloaded Windows signed-package ZIP.

Also retain `SIGNED_RELEASE.txt` from the signed firmware package with the hardware-test evidence.

Never record the production private signing key, its password, Device Password, Advanced Tools plaintext credential, home Wi-Fi password, or Monitoring Identity Key in the release record.

## 7. Choose the correct Windows operation

### Existing encrypted Battery Monitor

Use:

**Firmware Update -> Update Firmware**

This is the normal post-encryption path.

The Windows client is expected to:

1. detect the running Battery Monitor over physical USB;
2. verify the bundled production RSA signature before transfer;
3. send the application image to the running firmware using signed USB OTA;
4. let the ESP32 independently verify the image/signature/release sequence;
5. write the inactive OTA partition through ESP-IDF so device Flash Encryption is applied;
6. preserve the existing encrypted NVS/settings;
7. reboot into the candidate image for its rollback probation.

Use `BatteryMonitor.ino.bin` + its matching `.sig` through the bundled application. Do not directly write the plaintext application image with esptool.

### Blank, unencrypted ESP32

Use Advanced Tools:

**Advanced First Install -> First Install (Blank ESP32)**

This path is only for a genuinely blank/un-encrypted unit. It verifies the production signature before allowing esptool to write the merged first-install image at `0x0`.

After writing it, allow first boot to complete without removing power so Release Flash Encryption and encrypted NVS can initialize.

### Already-encrypted ESP32 — prohibited first-install use

Do **not** use `First Install (Blank ESP32)` as recovery after Flash Encryption is active.

Do not use `--force` to defeat esptool encrypted-flash protection.

The plaintext merged image is not a post-encryption recovery image.

## 8. Immediate post-update checks on the encrypted test unit

After signed USB OTA:

- confirm USB PING/status reports firmware `0.1.0.2`;
- confirm the device boots normally;
- keep power stable for at least the 60-second candidate probation;
- confirm the candidate becomes valid rather than rolling back;
- confirm Device Password still works;
- confirm Monitoring Identity pairing still works;
- confirm encrypted settings/NVS remain intact;
- confirm home Wi-Fi reconnects or protected fallback behaves as expected;
- confirm WebUI reports `0.1.0.2` and refreshes about once per second;
- confirm ADC sampling remains at its configured sample interval;
- continue with `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`.

## 9. Stop conditions

Stop hardware use of the release package if any of the following occurs:

- signed-release workflow is not completely green;
- source SHA differs from `9f833f8e6ebd596b6f8b7906b478858492d116cf`;
- version differs from `0.1.0.2`;
- production key fingerprint differs from the frozen fingerprint;
- signed image or signature is missing;
- Windows package does not report bundled production signatures;
- host verifier rejects the signed package;
- ESP32 verifier rejects the package;
- the monitor attempts to require a plaintext direct-flash recovery path;
- rollback/freshness/relay safety behaves unexpectedly.

Do not work around a stop condition. Capture the failure, fix product source or release tooling as appropriate, re-run the complete normal Battery Monitor Toolchain on the resulting product SHA, and then create a new signed-release candidate from that exact validated SHA.
