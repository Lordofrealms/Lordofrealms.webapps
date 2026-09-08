# Battery Monitor 0.1.0.2 — Signed Release Operator Record

**Status:** **COMPLETE / VERIFIED**  
**Validated product source:** `d1d6c0ed782116d58f925543ae599939c0ec0191`  
**Authoritative version:** `0.1.0.2`  
**Software release sequence:** `2`  
**Normal CI authority:** Battery Monitor Toolchain **#167** / run **`34263129626`** — **SUCCESS**  
**Signed release authority:** Battery Monitor Signed Firmware Release **#2** / run **`34267079480`** — **SUCCESS**

This file records the completed protected production-signing operation for the `0.1.0.2` hardware-test release. Do not dispatch another signing run merely to begin physical testing.

## 1. Exact signed source

The signed build source was:

`d1d6c0ed782116d58f925543ae599939c0ec0191`

Version:

`0.1.0.2`

The workflow was manually dispatched through the protected `battery-monitor-production-signing` environment. The later branch/documentation head was not substituted for the validated product source.

`SIGNED_RELEASE.txt` in the resulting artifact independently records:

- source SHA `d1d6c0ed782116d58f925543ae599939c0ec0191`;
- version `0.1.0.2`;
- software release sequence `2`;
- `SIGNED_USB_OTA_V1`;
- `RSA-3072-PSS-SHA256`;
- production SPKI SHA-256 `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`.

## 2. Signed artifacts

### Firmware

`Battery-Monitor-Signed-Firmware-0.1.0.2`

- artifact ID `10072544011`
- GitHub artifact digest / downloaded ZIP SHA-256:
  `b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`
- application image SHA-256:
  `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`
- application signature SHA-256:
  `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`
- merged blank-first-install image SHA-256:
  `0a964fd57bc055ab88c31accc8d4162462e865bc4f3e63d22198aa26435affd1`
- merged signature SHA-256:
  `2550dfd3bf8c8096148eee7fbabc4dddc744076efe4fd2d21017ac2759a415a0`
- `SIGNED_RELEASE.txt` SHA-256:
  `afbe64087ba02af43d70cbb74c8bdfa2ca54f929149c9105c97af931c83ab9f1`

### Windows

`Battery-Monitor-Windows-Signed-0.1.0.2`

- artifact ID `10072631425`
- GitHub artifact digest / downloaded ZIP SHA-256:
  `42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`
- `BatteryMonitor.Client.exe` SHA-256:
  `280a0d6f39250dbc3cafb4eea4756e4dea5f3d05047ee4ad172e4691f04afb06`

The Windows bundle contains byte-for-byte identical signed application and merged images/signatures and the same release manifest as the signed firmware artifact.

## 3. Signature verification evidence

The protected workflow completed its signature/tamper/wrong-key verification gates successfully.

A separate post-download verification was also performed using the public key embedded in the exact validated firmware source:

- independently derived SPKI SHA-256:
  `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e` — exact match;
- `BatteryMonitor.ino.bin` RSA-PSS verification: `Verified OK`;
- `BatteryMonitor.ino.merged.bin` RSA-PSS verification: `Verified OK`.

Full evidence sheet:

`battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

## 4. Correct hardware operation

### Existing already-encrypted Battery Monitor

Use the signed Windows package and:

**Firmware Update -> Update Firmware**

The Windows client transfers the signed application image through the running firmware's application-mediated USB OTA path. Do not directly flash the plaintext application image with esptool.

### Genuinely blank, unencrypted ESP32

Use the signed Windows package and:

**Advanced First Install -> First Install (Blank ESP32)**

The signed merged image is only for this blank-device first installation. Let the first encrypted boot complete without removing power.

### Already-encrypted unit — prohibited

Do **not** use the merged first-install image as recovery after Flash Encryption is active. Do not use `--force` to defeat esptool encrypted-flash protection.

## 5. Next gate

Production signing is complete. The next gate is physical validation using:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_2.md`
- `battery-monitor/DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`
- `battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

Secure Boot remains intentionally OFF until the real encrypted-device test matrix passes.

Do not re-sign or modify product source to begin hardware testing. Any product-source change after this point requires a new complete normal toolchain validation and a new signed-release candidate.
