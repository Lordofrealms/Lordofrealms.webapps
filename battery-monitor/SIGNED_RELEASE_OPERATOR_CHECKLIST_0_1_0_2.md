# Battery Monitor 0.1.0.2 — Signed Release Operator Checklist

**Purpose:** produce the production-signed package needed for the encrypted-device hardware test gate without changing or bypassing the signing policy.

**Validated product source:** `d1d6c0ed782116d58f925543ae599939c0ec0191`  
**Authoritative version:** `0.1.0.2`  
**Software release sequence:** `2`  
**Normal CI authority:** Battery Monitor Toolchain **#167** / run **`34263129626`** — **SUCCESS**

Full candidate evidence:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_2.md`

## 1. Sign the exact validated product SHA

The live `battery-monitor-dev` branch may contain documentation-only commits after the validated product checkpoint.

For this release, the signed-release workflow must build exactly:

`d1d6c0ed782116d58f925543ae599939c0ec0191`

Do not substitute the later branch head merely because it is newer.

## 2. Open the protected manual workflow

In GitHub Actions select:

`Battery Monitor Signed Firmware Release`

The workflow is manual `workflow_dispatch` only and uses the protected `battery-monitor-production-signing` environment.

Do not:

- add a push trigger;
- copy the production private key into repository files;
- bypass environment approval/protection;
- change the expected production public-key fingerprint merely to make a run pass;
- sign a different source SHA as a substitute for the validated candidate.

## 3. Enter these exact inputs

`source_sha`

`d1d6c0ed782116d58f925543ae599939c0ec0191`

`version`

`0.1.0.2`

The workflow UI currently has an older default version. Replace it explicitly with `0.1.0.2` before dispatching.

The workflow independently checks `battery-monitor/firmware/idf/version.txt` at the requested source SHA.

## 4. Required security gates

Do not use artifacts unless the entire signed-release workflow is green.

The signed firmware job must validate at least:

- exact 40-character source SHA;
- authoritative source version `0.1.0.2`;
- release sequence `2`;
- authoritative ESP-IDF build path;
- expected Flash/NVS encryption and rollback authorities;
- production RSA-3072 private-key availability only through the protected environment;
- production public-key SPKI SHA-256:
  `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- RSA-PSS signatures for application and merged first-install images;
- independent signature verification;
- tampered-image rejection;
- wrong-key rejection.

The Windows signed-package job must:

- consume the exact signed firmware artifact produced by the signed firmware job;
- build Windows from the same requested source SHA;
- use the pinned esptool package;
- build the pinned Espressif Security-2 helper;
- run the Windows build and protocol self-test;
- exercise the Windows production firmware verifier against the signed images;
- reject a deliberately tampered image;
- bundle the signed firmware and tools into the final Windows package.

## 5. Expected signed artifacts

After a successful `0.1.0.2` run, expect:

- `Battery-Monitor-Signed-Firmware-0.1.0.2`
- `Battery-Monitor-Windows-Signed-0.1.0.2`

Do not substitute the normal-CI #167 artifacts. They are intentionally unsigned validation packages.

Normal-CI reference only:

- firmware artifact ID `10070951566`;
- Android artifact ID `10070801187`;
- Windows artifact ID `10071096083`.

## 6. Record release evidence before hardware use

Record, without recording secrets:

- signed-release workflow run ID and run number;
- run attempt;
- conclusion `success`;
- requested `source_sha`;
- requested `version`;
- signed firmware artifact ID and digest;
- signed Windows artifact ID and digest;
- downloaded signed firmware ZIP SHA-256;
- downloaded signed Windows ZIP SHA-256;
- `BatteryMonitor.ino.bin` SHA-256;
- `BatteryMonitor.ino.bin.sig` SHA-256;
- `BatteryMonitor.ino.merged.bin` SHA-256;
- `BatteryMonitor.ino.merged.bin.sig` SHA-256;
- `SIGNED_RELEASE.txt` SHA-256 and its recorded source/version/fingerprint.

Never record the production private key, key password, Device Password, Advanced Tools plaintext credential, home Wi-Fi password, or Monitoring Identity Key.

## 7. Correct Windows operation

### Existing encrypted Battery Monitor

Use:

**Firmware Update -> Update Firmware**

Expected path:

1. detect the running Battery Monitor over trusted physical USB;
2. verify the bundled production signature before transfer;
3. transfer the signed application image through signed USB OTA;
4. ESP32 independently verifies image/signature/release sequence;
5. firmware writes the inactive OTA slot through ESP-IDF, applying device Flash Encryption;
6. existing encrypted NVS/settings are preserved;
7. device reboots into the candidate for rollback probation.

Do not directly write the plaintext application image with esptool.

### Blank, unencrypted ESP32

Use Advanced Tools:

**Advanced First Install -> First Install (Blank ESP32)**

This is only for a genuinely blank/un-encrypted device. It verifies the production signature before writing the merged first-install image at `0x0`.

Allow first boot to complete without removing power so Release Flash Encryption and encrypted NVS can initialize.

### Already encrypted ESP32

Do **not** use the blank-device first-install function as recovery.

Do not use `--force` to bypass encrypted-flash protection.

## 8. Immediate post-install/update checks

After the signed package is installed on the hardware-test unit:

- confirm firmware reports `0.1.0.2`;
- keep power stable through the 60-second candidate probation;
- confirm the candidate becomes valid rather than rolling back;
- confirm Device Password behavior;
- confirm Monitoring Identity pairing;
- confirm encrypted NVS/settings persistence;
- confirm home Wi-Fi or protected fallback behavior;
- confirm WebUI reports `0.1.0.2` and refreshes at ~1 second;
- confirm ADC sampling remains at its configured cadence;
- continue with `HARDWARE_TEST_PLAN_0_1_0_2.md` and `DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`.

Where the hardware plan still contains older #156 source/run metadata, use `VALIDATED_CANDIDATE_0_1_0_2.md` as the metadata authority while retaining the plan's substantive test steps.

## 9. Stop conditions

Stop hardware use of the release package if any of the following occurs:

- signed-release workflow is not completely green;
- source SHA differs from `d1d6c0ed782116d58f925543ae599939c0ec0191`;
- version differs from `0.1.0.2`;
- production key fingerprint differs from the frozen fingerprint;
- signed image or signature is missing;
- Windows package does not report bundled production signatures;
- host verifier rejects the signed package;
- ESP32 verifier rejects the package;
- the monitor requires a plaintext direct-flash recovery bypass;
- rollback/freshness/relay safety behaves unexpectedly.

Do not work around a stop condition. Fix the source or release tooling, run the complete normal Battery Monitor Toolchain on the resulting product SHA, and create a new signed-release candidate from that exact validated SHA.
