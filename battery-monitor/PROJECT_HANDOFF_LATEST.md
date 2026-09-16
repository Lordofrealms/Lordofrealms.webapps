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
8. `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`
9. `battery-monitor/windows/esp_provision_helper.py`
10. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
11. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`
12. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`

Mandatory version rule: exactly three single-digit `MAJOR.MINOR.PATCH` components. Internal sequence is `major*100 + minor*10 + patch`.

- normal `0.1.1` -> sequence `11`;
- migration `0.1.2` -> sequence `12`.

Do not restore `0.1.0.11` or `0.1.0.12`.

## 2. Normal `0.1.1` exact CI authority is green

Validated normal candidate:

- Toolchain run `#393`;
- run ID `35041162169`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- result **SUCCESS**.

Exact firmware:

- app size `1,090,976` bytes;
- app SHA-256 `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- merged size `4,194,304` bytes;
- merged SHA-256 `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`.

Firmware artifact ID `10424564433`.

Normal build remains Flash-Encrypted release mode + NVS encrypted, Secure Boot disabled by default, sequence 11.

This same run also proves the corrected standalone Windows Security-2 helper packaging and strict stderr-free JSON smoke test.

## 3. Migration `0.1.2` exact CI authority is green

Validated migration candidate:

- migration CI run `#40`;
- run ID `35011782807`;
- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- result **SUCCESS**.

Exact unsigned migration artifact:

- artifact ID `10413694223`;
- archive digest `sha256:d19730589841231d0128b2cdec7cfacb5514b6b45d7d283e00a4c24549634574`;
- app size `1,114,112` bytes;
- app SHA-256 `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- bootloader size `45,056` bytes (`0xB000`);
- bootloader SHA-256 `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

The bootloader contains the fail-closed pre-existing release-mode Flash Encryption guard marker beginning at byte offset `473`.

## 4. IMPORTANT — one shared Battery Monitor RSA-3072 signing authority

The current project design intentionally uses the **existing Battery Monitor RSA-3072 key for both signing roles**:

1. Espressif Secure Boot v2 signing of the migration application and bootloader;
2. existing Battery Monitor RSA-3072-PSS-SHA256 detached `.sig` authorization of those exact signed bytes.

There is **no separate Secure Boot private key** in the current design.

Existing protected secrets only:

- `BATMON_FIRMWARE_SIGNING_KEY_B64`;
- `BATMON_FIRMWARE_SIGNING_KEY_PASSWORD`.

Pinned SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Repository public key:

`battery-monitor/signing/battery_monitor_secureboot_rsa3072_public.pem`

Migration signing now decrypts that existing key once, proves RSA-3072 + exact pinned fingerprint, verifies the repository public key has the same fingerprint, uses the same key for Secure Boot v2 and detached signatures, verifies both mechanisms, and records:

`signing_key_authority=shared-existing-battery-monitor-rsa3072`

in `MIGRATION_RELEASE.txt`.

Do **not** reintroduce these retired separate-key requirements:

- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`;
- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`;
- `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256`.

See `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`.

## 5. Protected signer workflows are on `main`

GitHub `workflow_dispatch` requires the workflow definition on the default branch. Both protected Battery Monitor signer workflows are therefore intentionally mirrored onto `main` without merging application/firmware source.

Current protected workflow intent:

- normal signer promotes/signs exact successful normal CI bytes; it does not rebuild arbitrary source;
- migration signer promotes/signs exact successful migration CI bytes; it does not rebuild the candidate;
- migration signer uses the shared existing Battery Monitor RSA-3072 authority described above.

Keep the signer files on `main` and `battery-monitor-dev` byte-identical when changing signing policy.

## 6. Exact next protected signing inputs

Normal `0.1.1`:

- workflow `Battery Monitor Signed Firmware Release`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- CI run ID `35041162169`;
- version `0.1.1`.

Migration `0.1.2`:

- workflow `Battery Monitor Secure Boot Migration Signing`;
- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- migration CI run ID `35011782807`;
- version `0.1.2`.

No new Secure Boot key or fingerprint secret needs to be created. Migration signing uses the same existing production signing secrets as normal signing.

The connected GitHub tool in the prior session could inspect/re-run Actions but could not launch a fresh `workflow_dispatch`, so protected signing had not yet been executed from chat.

Neither `0.1.1` nor `0.1.2` is final until the corresponding protected run succeeds and artifacts are independently verified.

## 7. After protected signing

For normal `0.1.1` verify:

- source/run/version metadata;
- exact CI app/merged hashes;
- detached signatures against the pinned public key;
- customer package excludes esptool + merged blank-device image;
- Factory package includes the intended manufacturing payload;
- packaged `BatteryMonitorEspProv.exe` still passes the strict runtime smoke test.

For migration `0.1.2` verify:

- `MIGRATION_RELEASE.txt` source/run/version/sequence;
- `signing_key_authority=shared-existing-battery-monitor-rsa3072`;
- Secure Boot fingerprint and detached fingerprint both equal `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- Espressif Secure Boot v2 signatures on app and bootloader;
- detached signatures on those exact signed bytes;
- signed sizes are exactly unsigned + `0x1000` and within limits;
- fail-closed Flash Encryption guard marker remains in signed bootloader bytes;
- Factory Service loads and verifies the final bundle.

## 8. Hardware qualification remains mandatory

The final primary bootloader erase/copy is not atomic. Power loss in that window can brick the unit.

First qualification must use one controlled/sacrificial eligible ECO3+ unit that is already release-encrypted, with stable external power.

Required chain:

1. start from normal `0.1.1`, sequence `11`, Secure Boot off;
2. install signed migration `0.1.2`, sequence `12`;
3. allow rollback probation and encrypted release-floor commit;
4. stage/verify signed bootloader;
5. perform explicit irreversible commit under stable power;
6. reboot and prove Flash Encryption remains release mode and Secure Boot is enabled;
7. prove a strictly newer normal signed application OTA still works with Secure Boot active.

If final bootloader copy returns an error while the migration app remains alive, do not reboot or remove power until retry/recovery is resolved.

## 9. Canonical architecture remains unchanged

- ESP-IDF 5.5.5;
- ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility base `3.3.11`;
- Arduino-ESP32 commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- one production runtime under `battery-monitor/firmware/BatteryMonitor/`;
- normal build `battery-monitor/firmware/idf/build.sh`;
- migration build `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

Key distinction: **normal `0.1.1` and migration `0.1.2` are green exact CI candidates. Both signing mechanisms intentionally use the same existing Battery Monitor RSA-3072 authority. Protected signing + artifact verification is the next software gate; controlled hardware migration is the next system gate.**
