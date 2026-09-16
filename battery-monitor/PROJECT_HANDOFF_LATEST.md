# Battery Monitor — Session Handoff

**Updated:** 2026-09-15 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA written here is the current branch head.**

## 1. Read first

Read in this order at the exact live head:

1. `AGENTS.md`
2. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `.github/workflows/battery-monitor-ci.yml`
5. `.github/workflows/battery-monitor-signed-release.yml`
6. `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`
7. `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
8. `battery-monitor/windows/esp_provision_helper.py`
9. `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`
10. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
11. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`
12. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`

Mandatory version rule remains exact single-digit `MAJOR.MINOR.PATCH` components only. Internal sequence is `major*100 + minor*10 + patch`.

- normal `0.1.1` -> sequence `11`;
- migration `0.1.2` -> sequence `12`.

Do not restore `0.1.0.11` or `0.1.0.12`.

## 2. Normal `0.1.1` exact CI authority is green

Validated normal candidate:

- workflow: `Battery Monitor Toolchain`;
- run `#393`;
- run ID `35041162169`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- result: **SUCCESS**.

All firmware, Android and Windows jobs passed.

Exact normal firmware:

- app size `1,090,976` bytes;
- app SHA-256 `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- merged image size `4,194,304` bytes;
- merged SHA-256 `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`.

Firmware artifact ID: `10424564433`.

This run also proves the corrected packaged Windows Security-2 helper starts cleanly under the strict smoke test.

## 3. Security-2 helper false-green is fixed

The old helper smoke test accepted exit code `1`, which also masked Python startup crashes.

The stricter test first exposed missing `google.protobuf`, then exposed Espressif's source-tree-relative `../../python` generated-protobuf lookup inside PyInstaller.

Final fix at the validated normal source SHA:

- bundle `google.protobuf`;
- frozen helper preloads the exact pinned generated protobuf modules from bundled `_MEIPASS` data into an in-memory `proto` shim before importing `esp_prov`;
- do not alter pinned vendor source;
- do not write outside PyInstaller extraction;
- require exit `1`, empty stderr, exactly one JSON line and exact controlled `BATMONPROV1` invalid-protocol response.

Do not weaken that gate.

## 4. Migration `0.1.2` exact CI authority is green

Validated migration candidate:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run `#40`;
- run ID `35011782807`;
- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- result: **SUCCESS**.

Exact unsigned migration artifact:

- artifact ID `10413694223`;
- artifact digest `sha256:d19730589841231d0128b2cdec7cfacb5514b6b45d7d283e00a4c24549634574`;
- app size `1,114,112` bytes;
- app SHA-256 `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- bootloader size `45,056` bytes (`0xB000`);
- bootloader SHA-256 `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

The exact unsigned bootloader physically contains the fail-closed pre-existing release-mode Flash Encryption refusal marker beginning at byte offset `473`.

## 5. Migration signer was hardened after candidate CI

The migration CI candidate above remains the exact artifact to sign. Later branch commits hardened only the protected promotion workflow/documentation and do **not** require rebuilding the migration candidate.

The protected migration signer now fails closed on hardware Secure Boot key identity.

Required protected-environment secrets:

- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`;
- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`;
- `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256`;
- existing detached firmware signing secrets.

`BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` must be the offline-recorded 64-hex SHA-256 of the DER SubjectPublicKeyInfo for the intended long-term Secure Boot v2 RSA-3072 key.

Before signing, workflow now proves:

- candidate source/run/path/result are exact;
- candidate event is `push` or `workflow_dispatch`;
- unsigned app/bootloader sizes and hashes match CI authority;
- Flash Encryption guard marker is present in the exact bootloader;
- Secure Boot key is RSA-3072;
- computed Secure Boot SPKI fingerprint exactly matches the protected expected fingerprint;
- Secure Boot key is distinct from the detached firmware authorization key.

This closes accidental substitution of a different valid-size RSA key before irreversible hardware Secure Boot identity is established.

See `battery-monitor/signing/SECURE_BOOT_MIGRATION.md` for operator setup.

## 6. Protected signing is now the next software gate

The connected GitHub tool used in this session can inspect/re-run Actions but cannot start a new `workflow_dispatch`, so protected signing was not launched here.

Normal signing inputs:

- workflow `.github/workflows/battery-monitor-signed-release.yml`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- CI run ID `35041162169`;
- version `0.1.1`.

Migration signing inputs:

- workflow `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`;
- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- CI run ID `35011782807`;
- version `0.1.2`.

Before launching migration signing, confirm the protected environment has the intended offline-recorded `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` value.

Neither `0.1.1` nor `0.1.2` is yet the final verified protected-signed production release.

## 7. After protected signing

For normal `0.1.1`:

1. download the signed firmware/customer/factory artifacts;
2. independently verify exact source/run/version metadata;
3. verify both detached signatures with the pinned public key;
4. verify image hashes match the already-validated CI bytes;
5. verify customer package still excludes esptool and merged blank-device image;
6. exercise packaged `BatteryMonitorEspProv.exe` again.

For migration `0.1.2`:

1. independently verify `MIGRATION_RELEASE.txt` source/run/version/sequence;
2. verify reported Secure Boot SPKI fingerprint equals the offline authority;
3. verify Secure Boot v2 signatures on app and bootloader;
4. verify detached signatures on those exact signed bytes;
5. verify signed sizes are exactly unsigned size + `0x1000` and within app/bootloader envelopes;
6. verify the Flash Encryption refusal marker remains in signed bootloader bytes;
7. load the final bundle through Factory Service.

## 8. Hardware qualification remains mandatory

The final primary bootloader erase/copy is not atomic. Power loss in that window can brick the device.

First qualification must use one controlled/sacrificial eligible ECO3+ unit that is already release-encrypted, with stable external power.

Required chain:

1. start from normal `0.1.1`, sequence `11`, Secure Boot off;
2. install signed migration `0.1.2`, sequence `12`;
3. allow rollback probation and encrypted release-floor commit;
4. stage and verify signed bootloader;
5. perform explicit irreversible commit under stable power;
6. reboot and prove release-mode Flash Encryption remains enabled and hardware Secure Boot is enabled;
7. then prove a strictly newer normal signed application OTA still works with Secure Boot active.

If final bootloader copy returns an error while the migration app remains alive, do not reboot or remove power until recovery/retry is resolved.

## 9. Canonical architecture remains unchanged

- ESP-IDF 5.5.5;
- ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility base `3.3.11`;
- Arduino-ESP32 commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- one production runtime under `battery-monitor/firmware/BatteryMonitor/`;
- normal build `battery-monitor/firmware/idf/build.sh`;
- migration build `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

Detached firmware authorization public-key SPKI SHA-256 remains:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Do not restore PlatformIO/Arduino-CLI as a second production architecture.

Key distinction: **normal `0.1.1` and migration `0.1.2` are both green exact CI candidates. Protected signing + independent artifact verification is the next software gate; controlled hardware migration is the next system gate.**
