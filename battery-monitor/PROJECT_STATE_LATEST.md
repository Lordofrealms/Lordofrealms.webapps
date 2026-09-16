# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-15 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Development branch:** `battery-monitor-dev`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` and `main` heads before modifying source. Read root `AGENTS.md` first.

Do not assume a SHA in this file is the current branch head. The SHAs below identify exact validated source/artifact authorities. Later documentation or signing-workflow-only commits do not invalidate an earlier exact CI artifact unless build/runtime source changed.

## B. Mandatory version authority

User-facing versions use exactly three single-digit numeric components: `MAJOR.MINOR.PATCH`.

- every component is `0` through `9`;
- never use a two-digit component;
- never append a fourth release component;
- carry on overflow, e.g. `0.1.9 -> 0.2.0`.

Internal software anti-downgrade sequence is separate and derived as:

`major*100 + minor*10 + patch`

Current mappings:

- normal `0.1.1` -> sequence `11`;
- Secure Boot migration `0.1.2` -> sequence `12`.

Do not restore `0.1.0.11` or `0.1.0.12`.

## C. Normal `0.1.1` — validated exact CI candidate

Normal production behavior:

- version `0.1.1`, sequence `11`;
- ESP-IDF 5.5.5 production architecture;
- Flash Encryption enabled in release mode;
- NVS Encryption enabled;
- application rollback enabled;
- software anti-downgrade floor in encrypted NVS;
- hardware application anti-rollback eFuse still disabled;
- Secure Boot remains disabled in the normal build;
- signed USB/LAN OTA uses RSA-3072-PSS-SHA256 detached authorization.

Exact green CI authority:

- workflow: `Battery Monitor Toolchain`;
- run `#393`, run ID `35041162169`;
- exact source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- result: **SUCCESS**.

Exact unsigned firmware artifact:

- artifact `battery-monitor-esp32-CI-UNSIGNED-v0.1.1`;
- artifact ID `10424564433`;
- archive digest `sha256:9298d29c7352ac11f3837ecfb5a57539de6597bc75c69406cccde5c84c253ae1`;
- app size `1,090,976` bytes;
- app SHA-256 `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- merged image size `4,194,304` bytes;
- merged SHA-256 `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`;
- bootloader size `37,104` bytes;
- bootloader SHA-256 `6896d2e053939e92015375e60de3ca98b5f21f33d6d998a51bd794acd2e2f0f6`.

Other run artifacts:

- Windows customer unsigned package ID `10425378044`;
- Factory Service unsigned package ID `10425746266`;
- Android setup APK ID `10424743293`.

These are intentionally unsigned CI artifacts, not final production releases.

## D. Windows Security-2 helper packaging authority

Final normal CI also proves the standalone `BatteryMonitorEspProv.exe` packaging fix.

The old smoke test accepted exit code `1` and could therefore mistake a Python startup traceback for a successful negative test. The stricter path exposed and fixed:

1. missing `google.protobuf` in PyInstaller;
2. Espressif's source-tree-relative generated-protobuf loading assumption;
3. frozen-runtime module geometry via an in-memory `proto` shim using the exact pinned generated protobuf modules from bundled `_MEIPASS` roots.

The hardened smoke gate requires:

- process exit exactly `1` for the intentionally invalid request;
- stderr empty;
- exactly one non-empty stdout line;
- valid JSON;
- `protocol == BATMONPROV1`;
- `kind == result`;
- `ok == false`;
- exact message `Unsupported provisioning helper protocol.`

Do not weaken this gate.

## E. Secure Boot migration `0.1.2` — validated exact CI candidate

This is a Factory-only retrofit candidate for existing classic ESP32 ECO3+ units that are already release-encrypted.

Migration properties:

- version `0.1.2`, sequence `12`;
- same production runtime/source tree as normal firmware;
- minimum ESP32 ECO3/revision 3.0;
- Secure Boot v2 RSA enabled only in the migration build;
- Flash Encryption must already be enabled in release mode;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration qualification;
- normal production provisioning remains Secure-Boot-disabled.

Exact green migration CI authority:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run `#40`, run ID `35011782807`;
- exact source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- result: **SUCCESS**.

Exact unsigned migration artifact:

- artifact `Battery-Monitor-Secure-Boot-Migration-CI-UNSIGNED-0.1.2`;
- artifact ID `10413694223`;
- archive digest `sha256:d19730589841231d0128b2cdec7cfacb5514b6b45d7d283e00a4c24549634574`;
- app size `1,114,112` bytes;
- app SHA-256 `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- unsigned bootloader size `45,056` bytes (`0xB000`), below the `0xC000` limit;
- bootloader SHA-256 `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

Independent inspection confirmed the fail-closed Flash Encryption guard text is physically embedded at bootloader byte offset `473`:

`Battery Monitor migration requires pre-existing release-mode Flash Encryption; refusing before Secure Boot activation.`

## F. Shared production RSA signing authority

**Design authority:** Secure Boot v2 and existing Battery Monitor detached firmware authorization use the **same existing protected RSA-3072 key**.

There is not a second Secure Boot private-key authority.

Protected secrets:

- `BATMON_FIRMWARE_SIGNING_KEY_B64`;
- `BATMON_FIRMWARE_SIGNING_KEY_PASSWORD`.

Pinned public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Repository public key:

`battery-monitor/signing/battery_monitor_secureboot_rsa3072_public.pem`

For migration signing, the protected workflow:

1. downloads the exact green `0.1.2` CI artifact;
2. validates source/run/workflow/event/version/sequence/authority/hashes/sizes/guard marker;
3. decrypts the existing Battery Monitor signing key;
4. proves it is RSA-3072;
5. requires its SPKI fingerprint to equal the pinned value above;
6. independently requires the repository public key to have the same fingerprint;
7. uses that same key with Espressif `espsecure.py` to Secure-Boot-v2-sign app and bootloader;
8. verifies the Secure Boot signatures;
9. uses the same key to generate the existing RSA-3072-PSS-SHA256 detached `.sig` files over those exact signed bytes;
10. verifies the detached signatures with the repository public key;
11. records the same fingerprint for both signing roles in `MIGRATION_RELEASE.txt` and records `signing_key_authority=shared-existing-battery-monitor-rsa3072`;
12. deletes unsigned migration images before protected artifact upload.

This intentionally makes one production signing key authoritative for both mechanisms. A compromise of that key would therefore affect both normal firmware authorization and Secure Boot, which is an accepted project tradeoff.

The retired separate-key secrets `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`, `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`, and `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` are **not required by the current design** and must not be reintroduced as release prerequisites.

See `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`.

## G. Protected signing workflow authority

Both protected signer definitions are intentionally present on the default branch `main`, because GitHub manual `workflow_dispatch` requires the workflow to exist on the default branch.

The hardened workflow definitions on `main` and `battery-monitor-dev` must remain byte-identical when promoted.

Normal signing next inputs:

- workflow `.github/workflows/battery-monitor-signed-release.yml`;
- source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- CI run ID `35041162169`;
- version `0.1.1`.

Migration signing next inputs:

- workflow `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`;
- source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- migration CI run ID `35011782807`;
- version `0.1.2`.

Neither release is final until the corresponding protected workflow succeeds and the resulting artifact is independently verified.

## H. Secure Boot build constraints

Classic ESP32 Secure Boot v2 constraints:

- unsigned bootloader hard limit `0xC000`;
- Secure Boot signature-sector growth exactly `0x1000`;
- signed bootloader maximum `0xD000`;
- primary bootloader region `0xE000` bytes starting at `0x1000`;
- staging partition existing `coredump` at `0x3F0000`, size `0x10000`;
- OTA app partition `0x140000`;
- unsigned app must leave one `0x1000` signature-sector allowance.

Migration CI remains remote-signing only; CI contains no private key.

## I. Factory migration contract

Factory verifies:

- exact migration schema/scope/version/derived sequence;
- ECO3+ eligibility and compatible Secure Boot eFuse state;
- pre-existing release-mode Flash Encryption;
- detached signatures on signed app and bootloader;
- metadata sizes/hashes against those verified bytes;
- fail-closed Flash Encryption guard marker in the signed bootloader;
- stable `BM-...` device identity through preflight/staging/commit/post-reboot;
- migration app probation and sequence-12 floor commit before bootloader staging;
- staged flash readback/hash and final SHA confirmation;
- post-reboot Flash Encryption release mode and Secure Boot enabled.

Normal `0.1.1` exposes fail-closed migration stubs. Migration `0.1.2` enables the Factory-only implementation.

## J. Critical physical risk

The final primary bootloader erase/copy is not atomic. Power loss in that window can leave the unit without a valid second-stage bootloader.

Requirements:

- first hardware qualification on one controlled/sacrificial eligible ECO3+ unit;
- stable external power during final commit;
- preserve explicit irreversible-action warning;
- if final copy returns an error while the migration app remains alive, do not reboot/remove power until retry/recovery is resolved;
- CI/signing success is not hardware proof.

## K. Remaining validation sequence

1. Run protected normal signing using exact `0.1.1` authority above.
2. Independently verify normal signed metadata, hashes, signatures, customer/factory package separation, and packaged Security-2 helper.
3. Run protected migration signing using exact `0.1.2` authority above and the **existing** Battery Monitor signing secrets.
4. Independently verify migration manifest, same pinned signing-key fingerprint in both roles, Secure Boot signatures, detached signatures, hashes, guard marker, and signed sizes.
5. Load the final signed migration bundle through Factory Service.
6. On one eligible already-encrypted ECO3+ unit under stable power, install `0.1.2`, allow probation/floor commit, stage/verify/commit bootloader, and verify Secure Boot enabled while Flash Encryption remains release mode.
7. Prove a later strictly newer normal signed application OTA still works with Secure Boot active.
8. Only then consider broader migration or Secure Boot as a normal factory default.

## L. Canonical architecture

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility base `3.3.11`;
- Arduino-ESP32 commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- production runtime `battery-monitor/firmware/BatteryMonitor/`;
- normal build `battery-monitor/firmware/idf/build.sh`;
- migration build `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

## M. Read-first authority

Resolve both live branch heads, then read:

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

Key distinction: **`0.1.1` and `0.1.2` are green exact CI candidates. Secure Boot v2 and detached authorization intentionally use the same existing Battery Monitor RSA-3072 authority. Protected signing is the next software gate; controlled hardware migration is the next system gate.**
