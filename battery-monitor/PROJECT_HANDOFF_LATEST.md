# Battery Monitor — Session Handoff

**Updated:** 2026-09-15 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA written in this handoff remains current.**

## 1. Read repository-wide authority first

Read root `AGENTS.md` before project files, then read `battery-monitor/PROJECT_STATE_LATEST.md` for the exact current validation authority.

Mandatory version rule:

- user-facing versions use exactly three single-digit numeric components: `MAJOR.MINOR.PATCH`;
- never create a two-digit component or fourth component;
- carry on overflow, e.g. `0.1.9 -> 0.2.0`;
- monotonic security/release counters remain separate from displayed versions.

Internal software anti-downgrade sequence:

`major*100 + minor*10 + patch`

Current mapping:

- normal `0.1.1` -> sequence `11`;
- Secure Boot migration `0.1.2` -> sequence `12`.

Do not restore the retired temporary labels `0.1.0.11` or `0.1.0.12`.

## 2. Normal `0.1.1` is now a validated CI candidate

Normal production candidate properties:

- version `0.1.1`;
- internal sequence `11`;
- ESP-IDF production architecture;
- normal Secure Boot disabled;
- Flash Encryption enabled in release mode;
- NVS Encryption enabled;
- application rollback enabled;
- hardware application anti-rollback eFuse disabled;
- encrypted-NVS strictly-newer software floor;
- signed USB/LAN application OTA authorization uses RSA-3072-PSS-SHA256 detached signatures.

Final green normal Toolchain authority:

- workflow: `Battery Monitor Toolchain`;
- run `#393`;
- run ID `35041162169`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- result: **SUCCESS**.

All three jobs passed:

- ESP32 firmware;
- Android setup APK;
- Windows customer + Factory Service applications.

Exact normal firmware bytes from that run:

- app size `1,090,976` bytes;
- app SHA-256 `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- merged image size `4,194,304` bytes;
- merged SHA-256 `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`.

Artifact authorities:

- firmware artifact ID `10424564433`;
- Windows customer artifact ID `10425378044`;
- Factory Service artifact ID `10425746266`;
- Android artifact ID `10424743293`.

These are deliberately unsigned CI outputs, not final production signed releases.

## 3. Security-2 helper packaging issue was found and fixed

Important history so it is not rediscovered incorrectly:

The old Windows CI smoke test accepted helper exit code `1`, but a Python import crash also exits `1`. That allowed a broken `BatteryMonitorEspProv.exe` to appear green.

The final investigation exposed two packaging problems:

1. missing packaged `google.protobuf`;
2. Espressif's pinned generated-protobuf loader assumes its source-tree `../../python` layout, which PyInstaller does not preserve for imported modules.

Final correction:

- CI and protected normal signing explicitly bundle `google.protobuf`;
- `battery-monitor/windows/esp_provision_helper.py` detects frozen mode and preloads the exact pinned generated protobuf modules from the bundled `_MEIPASS` IDF/network-provisioning trees into an in-memory `proto` module before importing `esp_prov`;
- pinned vendor source is not modified;
- no files are written outside PyInstaller's extraction directory;
- non-frozen behavior remains vendor-compatible.

The hardened standalone helper smoke test now requires:

- exit code exactly `1` for an intentionally invalid protocol request;
- empty stderr;
- exactly one non-empty stdout line;
- parseable JSON;
- protocol `BATMONPROV1`;
- kind `result`;
- `ok=false`;
- exact message `Unsupported provisioning helper protocol.`

Run `35041162169` passed this strict gate and then completed Windows builds, protocol self-test, publishing, package separation and artifact uploads. Do not weaken this test back to exit-code-only checking.

## 4. Migration `0.1.2` is now a validated CI candidate

Factory-only Secure Boot retrofit candidate:

- version `0.1.2`;
- internal sequence `12`;
- intended only for existing release-encrypted classic ESP32 ECO3+ units;
- minimum revision 3.0 / ECO3;
- Secure Boot v2 RSA enabled in migration build only;
- Flash Encryption must already exist in release mode;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration validation;
- normal production provisioning remains Secure-Boot-disabled.

Final green migration CI authority:

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
- bootloader size `45,056` bytes (`0xB000`), below unsigned limit `0xC000`;
- bootloader SHA-256 `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

Independent byte inspection confirmed this fail-closed guard string begins at bootloader byte offset `473`:

`Battery Monitor migration requires pre-existing release-mode Flash Encryption; refusing before Secure Boot activation.`

That guard is therefore physically inside the exact bootloader bytes intended for protected Secure Boot signing.

## 5. Migration architecture and safety authority

High-level migration path:

1. Factory verifies ECO3+, release-mode Flash Encryption, Secure Boot off and compatible Secure-Boot-v2 eFuse state.
2. Factory installs the signed `0.1.2` migration application through the existing signed application-mediated OTA path.
3. The migration app passes rollback probation and commits sequence `12` to the encrypted software floor.
4. Factory stages the final Secure-Boot-signed bootloader in the existing coredump partition at `0x3F0000`, size `0x10000`.
5. Host/device verify detached authorization, SHA-256, staged flash readback, image sanity and exact device identity.
6. Explicit final commit copies the signed bootloader into the primary bootloader region.
7. Device reboots and Factory verifies Flash Encryption remains release mode and hardware Secure Boot reports enabled.
8. A later strictly newer normal signed application OTA must still succeed with Secure Boot active.

Fixed build limits:

- unsigned Secure Boot v2 bootloader <= `0xC000`;
- signing adds exactly `0x1000` signature sector;
- signed bootloader <= `0xD000`;
- primary bootloader region = `0xE000` bytes from `0x1000`;
- OTA application slot = `0x140000`;
- migration staging partition = `coredump@0x3F0000+0x10000`.

Critical physical risk remains: final primary bootloader erase/copy is not atomic. Power loss in that window can brick the device. First migration must be on one controlled/sacrificial eligible unit with stable external power.

If final bootloader copy returns an error while the migration app is still alive, do not reboot or remove power until retry/recovery is resolved.

## 6. Protected signing is the next software gate

Neither candidate is yet the final verified protected-signed production release.

Normal protected signing should promote exactly:

- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- CI run ID `35041162169`;
- version `0.1.1`;
- workflow `.github/workflows/battery-monitor-signed-release.yml`.

Migration protected signing should promote exactly:

- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- migration CI run ID `35011782807`;
- version `0.1.2`;
- workflow `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`.

Do not claim either release is protected-signed until the corresponding workflow succeeds and the resulting artifacts are independently verified.

The protected normal signed-release workflow already contains the corrected PyInstaller protobuf packaging and strict helper smoke gate, but that protected path has not yet been executed after the fix.

## 7. Next work in order

1. Resolve the live branch head and confirm no relevant source changed after this handoff.
2. Run protected normal signing using the exact `0.1.1` source/run inputs above.
3. Independently verify the signed normal firmware signatures, hashes, release metadata, package separation and packaged Security-2 helper.
4. Run protected migration signing using the exact `0.1.2` source/run inputs above.
5. Independently verify the migration Secure Boot signatures, detached authorization signatures, signed sizes/hashes and release manifest.
6. Load the signed migration bundle through Factory Service.
7. Test one controlled ECO3+ already-encrypted unit under stable power.
8. Confirm post-reboot Secure Boot + release-mode Flash Encryption.
9. Prove a later strictly-newer normal signed OTA still works with Secure Boot active.
10. Only then consider broader migration or changing normal factory Secure Boot defaults.

## 8. Canonical architecture

Production authority remains:

- ESP-IDF 5.5.5;
- ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility base `3.3.11`;
- Arduino-ESP32 commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime `battery-monitor/firmware/BatteryMonitor/`;
- normal build `battery-monitor/firmware/idf/build.sh`;
- migration build `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

Detached firmware authorization public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Do not restore PlatformIO/Arduino-CLI as a second production architecture or fork the runtime into a second Secure Boot implementation.

## 9. Read first next session

At the exact live branch head, read in this order:

1. `AGENTS.md`
2. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `battery-monitor/firmware/idf/README.md`
5. `.github/workflows/battery-monitor-ci.yml`
6. `.github/workflows/battery-monitor-signed-release.yml`
7. `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`
8. `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
9. `battery-monitor/windows/esp_provision_helper.py`
10. `battery-monitor/firmware/idf/build.sh`
11. `battery-monitor/firmware/idf/build_secure_boot_migration.sh`
12. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
13. `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`
14. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`
15. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
16. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`
17. `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`

Key distinction: **normal `0.1.1` and migration `0.1.2` are both green exact CI candidates now. The remaining software gate is protected signing + independent verification; the remaining system gate is controlled hardware migration testing.**
