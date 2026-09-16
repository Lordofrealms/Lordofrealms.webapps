# Battery Monitor — Session Handoff

**Updated:** 2026-09-15 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Development branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` and `main` heads. Do not assume any SHA written here is the current branch head.**

## 1. Read first

At the exact live development head, read:

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

Also verify that the two protected signing workflow files on `main` still match the corresponding `battery-monitor-dev` blobs before release promotion.

Mandatory version authority remains exact single-digit `MAJOR.MINOR.PATCH` components only. Internal software sequence is `major*100 + minor*10 + patch`.

- normal `0.1.1` -> sequence `11`;
- migration `0.1.2` -> sequence `12`.

Do not restore retired labels `0.1.0.11` or `0.1.0.12`.

## 2. Normal `0.1.1` exact CI authority is green

Validated normal candidate:

- workflow: `Battery Monitor Toolchain`;
- run `#393`;
- run ID `35041162169`;
- exact source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- result: **SUCCESS**.

All firmware, Android, and Windows jobs passed.

Exact normal firmware:

- app size `1,090,976` bytes;
- app SHA-256 `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- merged image size `4,194,304` bytes;
- merged SHA-256 `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`;
- firmware artifact ID `10424564433`.

This run also proves the corrected packaged Windows Security-2 helper starts cleanly under the strict standalone smoke test.

## 3. Security-2 helper false-green is fixed

The former helper smoke test accepted exit code `1`, which also masked Python startup crashes.

The stricter test first exposed missing `google.protobuf`, then exposed Espressif's source-tree-relative `../../python` generated-protobuf lookup inside PyInstaller.

Final fix at the validated normal source SHA:

- bundle `google.protobuf`;
- frozen helper preloads the exact pinned generated protobuf modules from bundled `_MEIPASS` data into an in-memory `proto` shim before importing `esp_prov`;
- pinned vendor source is not modified;
- no files are written outside PyInstaller extraction;
- smoke test requires exit `1`, empty stderr, exactly one JSON line, `BATMONPROV1`, `kind=result`, `ok=false`, and exact message `Unsupported provisioning helper protocol.`

Do not weaken that gate.

## 4. Migration `0.1.2` exact CI authority is green

Validated migration candidate:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run `#40`;
- run ID `35011782807`;
- exact source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- result: **SUCCESS**.

Exact unsigned migration artifact:

- artifact ID `10413694223`;
- artifact digest `sha256:d19730589841231d0128b2cdec7cfacb5514b6b45d7d283e00a4c24549634574`;
- app size `1,114,112` bytes;
- app SHA-256 `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- bootloader size `45,056` bytes (`0xB000`);
- bootloader SHA-256 `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

Independent byte inspection confirmed the exact unsigned bootloader contains the fail-closed pre-existing release-mode Flash Encryption refusal marker beginning at byte offset `473`.

## 5. Migration signer is fail-closed on hardware key identity

The migration candidate above remains the exact artifact to sign. Later commits hardened the protected promotion workflow and documentation only; they do **not** require rebuilding the candidate.

Required protected-environment secrets:

- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`;
- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`;
- `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256`;
- existing detached firmware signing secrets.

`BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` must be the offline-recorded 64-hex SHA-256 of the DER SubjectPublicKeyInfo for the intended long-term Secure Boot v2 RSA-3072 key.

Before signing, the protected workflow proves:

- exact candidate source SHA, run ID, workflow path, success result, and accepted event (`push` or `workflow_dispatch`);
- exact unsigned app/bootloader sizes and hashes;
- Flash Encryption guard marker in the exact bootloader;
- Secure Boot key is RSA-3072;
- computed Secure Boot SPKI fingerprint exactly matches the protected expected fingerprint;
- Secure Boot key is distinct from the detached firmware authorization key.

See `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`.

## 6. Protected signer workflows are now on the default branch

GitHub requires a `workflow_dispatch` workflow file to exist on the repository default branch before it can be manually dispatched. The migration signer previously existed only on `battery-monitor-dev`, while `main` still carried an obsolete normal signer that rebuilt source and defaulted to retired version `0.1.0.1`.

That release-control surface has been corrected without merging firmware/application code to `main`:

- `main` normal signer commit: `3bb6020159a9b76820f741c8dd848995f928f6db`;
- `main` migration signer commit: `8c713a02f4a64bbd3b8cea186a22b238c175a621`;
- normal signer blob on both branches: `5a5d2ade48bd15f491888408e887ce83de4faf79`;
- migration signer blob on both branches: `4ad4864de5bd4ae92c8a42e2eb571c97dc0368ca`.

Only the protected workflow definitions were copied to `main`. The workflows themselves checkout and validate the exact candidate source SHA and exact CI run, so this does not move or rebuild either validated candidate.

No signing job auto-ran from those `main` commits. GitHub Pages checks were green. The repository also emitted zero-job failure records for the unrelated `publish-current-apks.yml` workflow on the workflow-only pushes; that workflow is path-filtered to `.github/release-trigger.txt`, no APK job executed, and this is not a Battery Monitor signing result.

## 7. Protected signing is the next software gate

The connected GitHub capability in this chat can inspect and re-run existing Actions jobs, but it does not expose creation of a new `workflow_dispatch`, so neither protected signer was launched from this session.

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

Before launching migration signing, confirm the protected `battery-monitor-production-signing` environment has the intended offline-recorded `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256`.

Neither `0.1.1` nor `0.1.2` is yet the final verified protected-signed production release.

## 8. After protected signing

Normal `0.1.1` verification:

1. download signed firmware/customer/factory artifacts;
2. verify exact source/run/version metadata;
3. verify detached signatures with the pinned public key;
4. verify signed images are byte-identical to the validated CI firmware bytes (signatures are detached);
5. verify customer package excludes esptool and merged blank-device image;
6. exercise packaged `BatteryMonitorEspProv.exe` again.

Migration `0.1.2` verification:

1. verify `MIGRATION_RELEASE.txt` source/run/version/sequence;
2. verify recorded Secure Boot SPKI fingerprint equals the offline authority;
3. verify Secure Boot v2 signatures on app and bootloader;
4. verify detached signatures on those exact signed bytes;
5. verify signed sizes are exactly unsigned size + `0x1000` and within app/bootloader envelopes;
6. verify the Flash Encryption refusal marker remains in signed bootloader bytes;
7. load the final bundle through Factory Service.

## 9. Hardware qualification remains mandatory

Final primary bootloader erase/copy is not atomic. Power loss in that window can brick the device.

First qualification must use one controlled/sacrificial eligible ECO3+ unit that is already release-encrypted, with stable external power.

Required chain:

1. start from normal `0.1.1`, sequence `11`, Secure Boot off;
2. install signed migration `0.1.2`, sequence `12`;
3. allow rollback probation and encrypted release-floor commit;
4. stage and verify signed bootloader;
5. perform explicit irreversible commit under stable power;
6. reboot and prove release-mode Flash Encryption remains enabled and hardware Secure Boot is enabled;
7. prove a strictly newer normal signed application OTA still works with Secure Boot active.

If final bootloader copy returns an error while the migration app remains alive, do not reboot or remove power until recovery/retry is resolved.

## 10. Canonical architecture remains unchanged

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

Key distinction: **normal `0.1.1` and migration `0.1.2` are both green exact CI candidates. Both hardened protected signers are now present on the default branch. Protected signing + independent artifact verification is the next software gate; controlled hardware migration is the next system gate.**
