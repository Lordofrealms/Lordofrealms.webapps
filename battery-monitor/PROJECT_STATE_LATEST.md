# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-15 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` head before modifying source. Read root `AGENTS.md` first; it contains repository-wide design criteria.

Do not assume a SHA in this file is the current branch head. The SHAs below identify exact validated source/artifact authorities. Later documentation or protected-workflow hardening commits do not invalidate an earlier exact CI artifact unless relevant build/runtime source changed.

## B. Mandatory version authority

Battery Monitor user-facing versions use exactly three single-digit numeric components: `MAJOR.MINOR.PATCH`.

- each component is `0` through `9`;
- never use a two-digit component;
- never append a fourth release component;
- carry on overflow, e.g. `0.1.9 -> 0.2.0`.

The internal software anti-downgrade sequence is separate from the displayed version and is deterministically derived as:

`major*100 + minor*10 + patch`

Current mappings:

- normal production candidate `0.1.1` -> internal sequence `11`;
- Secure Boot migration candidate `0.1.2` -> internal sequence `12`.

The old temporary four-component labels `0.1.0.11` and `0.1.0.12` are not current release identifiers and must not be reintroduced.

## C. Normal production firmware authority — VALIDATED CI CANDIDATE

Current normal production candidate:

- version: `0.1.1`;
- internal release sequence: `11`;
- authoritative version file: `battery-monitor/firmware/idf/version.txt`;
- architecture: ESP-IDF with Arduino component compatibility;
- Secure Boot: disabled in the normal build;
- Flash Encryption: enabled, release mode;
- NVS Encryption: enabled;
- application rollback: enabled;
- hardware application anti-rollback eFuse: disabled;
- software anti-downgrade floor: encrypted NVS, strictly-newer policy;
- signed USB/LAN application update authorization: RSA-3072-PSS-SHA256 detached signature plus release-policy checks.

Latest fully green normal Toolchain authority:

- workflow: `Battery Monitor Toolchain`;
- run number: `#393`;
- run ID: `35041162169`;
- result: `SUCCESS`;
- exact source SHA: `8b915af1e1e9f2e501eea92b4b51f78693d3293a`;
- source commit message: `Preserve pinned protobuf paths in frozen helper`.

All three jobs passed at that exact SHA:

- ESP32 ESP-IDF + Arduino firmware: success;
- Android provisioning APK: success;
- Windows customer + Factory Service apps: success.

The Windows job also passed the hardened standalone Security-2 provisioner smoke test described in section E.

Exact unsigned normal firmware artifact from run `35041162169`:

- artifact: `battery-monitor-esp32-CI-UNSIGNED-v0.1.1`;
- artifact ID: `10424564433`;
- artifact archive digest: `sha256:9298d29c7352ac11f3837ecfb5a57539de6597bc75c69406cccde5c84c253ae1`;
- `BatteryMonitor.ino.bin` size: `1,090,976` bytes;
- `BatteryMonitor.ino.bin` SHA-256: `732427546be458393a44efdbac5dc0cf5a7e35871c1c1cc30f2deb1f3fbee606`;
- `BatteryMonitor.ino.merged.bin` size: `4,194,304` bytes;
- `BatteryMonitor.ino.merged.bin` SHA-256: `01278706fbce36f0655d0beccb22db99b4edebf9798d53433d9990424f7d58be`;
- `bootloader.bin` size: `37,104` bytes;
- `bootloader.bin` SHA-256: `6896d2e053939e92015375e60de3ca98b5f21f33d6d998a51bd794acd2e2f0f6`.

Other run `35041162169` artifact authorities:

- Windows customer unsigned CI package: artifact ID `10425378044`, archive digest `sha256:e80de45455a49803f820cb68ce0cb16efd36c21d57977ad14998b1bb82e9f024`;
- Factory Service unsigned CI package: artifact ID `10425746266`, archive digest `sha256:195107f7615fb9324e9d61986b74e3051051ff10f88a763c79192ccfc4451e86`;
- Android setup APK: artifact ID `10424743293`, archive digest `sha256:130d645a8099f1ee6d0763e21f35028ad98c1c3d8a0dc1118daf5092de5b90d5`.

These are intentionally unsigned CI artifacts. Do not treat them as customer-production signed releases.

## D. Secure Boot migration candidate authority — VALIDATED CI CANDIDATE

A separate Factory-only migration build exists for already release-encrypted classic ESP32 ECO3+ units.

Current migration candidate:

- version: `0.1.2`;
- internal release sequence: `12`;
- version file: `battery-monitor/firmware/idf/version-secure-boot-migration.txt`;
- build script: `battery-monitor/firmware/idf/build_secure_boot_migration.sh`;
- config overlay: `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`;
- same production source tree/runtime as normal firmware;
- minimum chip revision: ESP32 ECO3 / revision 3.0;
- Secure Boot v2 RSA enabled only in the migration build;
- Flash Encryption must already be enabled in release mode;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration validation;
- normal production provisioning remains Secure-Boot-disabled.

Latest fully green migration candidate authority:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run number: `#40`;
- run ID: `35011782807`;
- result: `SUCCESS`;
- exact source SHA: `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- source commit message: `Bind migration guard to signed bootloader bytes`.

Exact unsigned migration artifact:

- artifact: `Battery-Monitor-Secure-Boot-Migration-CI-UNSIGNED-0.1.2`;
- artifact ID: `10413694223`;
- artifact archive digest: `sha256:d19730589841231d0128b2cdec7cfacb5514b6b45d7d283e00a4c24549634574`;
- `BatteryMonitor.secureboot.app.unsigned.bin` size: `1,114,112` bytes;
- app SHA-256: `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- `BatteryMonitor.secureboot.bootloader.unsigned.bin` size: `45,056` bytes (`0xB000`), below the unsigned `0xC000` limit;
- bootloader SHA-256: `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`.

Independent artifact inspection also confirmed the fail-closed bootloader guard text is physically embedded beginning at byte offset `473`:

`Battery Monitor migration requires pre-existing release-mode Flash Encryption; refusing before Secure Boot activation.`

This matters because the migration guard is therefore bound into the exact bootloader bytes that the protected Secure Boot signer would sign, rather than existing only as an external workflow assertion.

## E. Windows Security-2 helper packaging authority

A false-positive CI condition was discovered during final validation. The previously packaged `BatteryMonitorEspProv.exe` could terminate with a Python import traceback while the old smoke test accepted exit code `1` as if it were the expected invalid-protocol result.

The failure sequence found and corrected was:

1. packaged helper initially failed with `ModuleNotFoundError: No module named 'google'`;
2. CI and the protected normal signed-release workflow were hardened to bundle `google.protobuf` and to execute the helper as a separate process with redirected stdin/stdout/stderr;
3. the stricter test then correctly exposed Espressif's dynamic protobuf-loader source-tree path assumption (`../../python/...`) inside PyInstaller;
4. `battery-monitor/windows/esp_provision_helper.py` was updated so frozen builds preload the exact pinned generated protobuf modules into an in-memory `proto` shim from the bundled `_MEIPASS` data roots, preserving Espressif's load order without modifying the pinned vendor checkout or writing outside the extraction directory;
5. run `35041162169` at source `8b915af1e1e9f2e501eea92b4b51f78693d3293a` passed the hardened smoke test and then completed the Windows builds, protocol self-test, publishing, bundling and artifact uploads.

The hardened smoke gate now requires all of the following:

- helper process exit code exactly `1` for an intentionally invalid request;
- stderr empty;
- exactly one non-empty stdout line;
- valid JSON;
- `protocol == BATMONPROV1`;
- `kind == result`;
- `ok == false`;
- exact controlled message `Unsupported provisioning helper protocol.`

Do not weaken this gate back to exit-code-only validation.

The protected normal signed-release workflow contains the same helper packaging and strict smoke-test logic, but it has not yet been exercised in a new protected signed release after this fix. Do not infer protected-release success from normal CI alone.

## F. Version enforcement implementation

Current source enforces the version rule in multiple layers:

- `firmware/idf/CMakeLists.txt`: exact three single-digit components only;
- `firmware/idf/build.sh`: same validation and sequence derivation;
- `firmware/idf/build_secure_boot_migration.sh`: same validation/derivation;
- `firmware/BatteryMonitor/FirmwareReleasePolicy.ino`: same on-device parser/derivation for OTA anti-downgrade;
- `.github/workflows/battery-monitor-ci.yml`: asserts normal `0.1.1`, sequence `11` and derivation metadata;
- `.github/workflows/battery-monitor-signed-release.yml`: same protected release validation;
- `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`: asserts migration `0.1.2`, sequence `12` and derivation metadata;
- `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`: same protected migration validation;
- Factory `SecureBootMigrationWorkflow.cs`: validates three-component migration version against the separately recorded sequence;
- Android setup: `versionName 0.1.1`, separate `versionCode 11`.

## G. Secure Boot build constraints

Classic ESP32 Secure Boot v2 constraints remain:

- unsigned bootloader hard limit: `0xC000` (48 KiB);
- Secure Boot signature-sector growth: exactly `0x1000`;
- signed bootloader envelope: `0xD000` maximum;
- primary bootloader region: `0xE000` bytes starting at `0x1000`;
- temporary staging partition: existing `coredump` at `0x3F0000`, size `0x10000`;
- OTA app partition: `0x140000`;
- unsigned app must leave one `0x1000` signature-sector allowance.

The migration build uses remote/protected Secure Boot signing. CI must not require the Secure Boot private key. Retrofit requires Flash Encryption to pre-exist and explicitly forbids burning Secure Boot and Flash Encryption keys together.

## H. Protected signing status and key authority

Normal protected signer:

- workflow: `.github/workflows/battery-monitor-signed-release.yml`;
- intended next promotion inputs: source SHA `8b915af1e1e9f2e501eea92b4b51f78693d3293a`, CI run ID `35041162169`, version `0.1.1`;
- status: **not yet re-run/verified after the final helper packaging fix**.

Migration protected signer:

- workflow: `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`;
- intended candidate inputs: source SHA `ec4c7200debd2fb27a5e63e45670110cb7d9065d`, migration CI run ID `35011782807`, version `0.1.2`;
- status: **not yet protected-signed/verified as the final migration bundle**.

The migration signer was hardened after candidate CI without changing the candidate bytes. Protected signing now additionally requires:

- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`;
- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`;
- `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` containing the offline-recorded 64-hex SHA-256 fingerprint of the hardware Secure Boot key's DER SubjectPublicKeyInfo;
- existing detached firmware signing secrets.

Before signing any migration image, the workflow now:

- proves the Secure Boot key is RSA-3072;
- recomputes its SPKI SHA-256 fingerprint and requires exact match to `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256`;
- requires the hardware Secure Boot key fingerprint to differ from the detached firmware-authorization key fingerprint;
- accepts migration candidate CI only from successful `push` or `workflow_dispatch` runs;
- still verifies exact source SHA, workflow path, candidate bytes, authority metadata, guard marker, hashes and size limits.

This closes the accidental-key-substitution risk before irreversible hardware Secure Boot identity is established. See `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`.

No `0.1.1` or `0.1.2` production signed release should be claimed until the corresponding protected workflow succeeds and the resulting exact bytes/signatures are independently verified.

## I. Factory Service migration contract

Key files:

- `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`;
- `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`.

Host-side requirements include:

- valid migration release schema/scope/minimum revision;
- exact `0.1.2` three-component version/derived sequence relationship;
- `secure_boot=ESP32-Secure-Boot-v2-RSA-PSS`;
- `0xC000` unsigned and `0xD000` signed bootloader limits;
- exact signed app/bootloader sizes and SHA-256 values;
- detached signature verification using the pinned Battery Monitor trust root;
- signed bootloader transfer rejection above `0xD000`;
- stable device identity binding through preflight, staging, commit and post-reboot verification.

Factory verifies actual detached-signed image bytes before using release metadata, checks metadata hashes/sizes against those bytes, and later requires the device-reported installed version and release sequence to match the selected package before bootloader staging and irreversible commit.

## J. Device-side migration state machine

Implementation: `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`.

Normal `0.1.1` compiles fail-closed migration stubs. Migration `0.1.2` enables the Factory-only implementation.

Required preconditions include:

- classic ESP32 ECO3+;
- release-mode Flash Encryption already enabled;
- Secure Boot not already enabled;
- compatible Secure Boot v2 eFuse state;
- migration app no longer in pending rollback probation;
- encrypted software release floor committed to sequence `12`.

Migration behavior:

1. install signed migration application through the existing signed application OTA path;
2. stage the final Secure-Boot-signed bootloader in the existing coredump partition;
3. verify incoming hash, detached authorization, staged flash readback and image sanity;
4. require explicit final SHA confirmation and same-device checks;
5. perform final bootloader validation/copy to primary region;
6. reboot only after successful commit;
7. verify release-mode Flash Encryption and hardware Secure Boot after reboot.

## K. Critical physical risk

The final primary bootloader erase/copy is not atomic. Power loss during that final window can leave the unit without a valid second-stage bootloader.

Operational requirements:

- first test on one controlled/sacrificial ECO3+ encrypted unit;
- use stable external power during final commit;
- preserve the explicit irreversible-action warning;
- if final copy returns an error while the migration app remains alive, do not reboot/remove power until retry/recovery is resolved;
- do not treat CI/signing success as hardware proof.

## L. Remaining validation sequence

Software CI candidate validation is green for both normal `0.1.1` and migration `0.1.2` exact authorities listed above.

Remaining gates:

1. run protected normal signing for exact source `8b915af1e1e9f2e501eea92b4b51f78693d3293a` / CI run `35041162169` / version `0.1.1`;
2. independently verify signed normal firmware metadata, signatures, hashes and package separation, including the packaged Security-2 helper;
3. confirm the protected environment contains the correct offline-recorded `BATMON_SECURE_BOOT_V2_EXPECTED_SPKI_SHA256` value for the intended long-term hardware Secure Boot key;
4. run protected migration signing for exact source `ec4c7200debd2fb27a5e63e45670110cb7d9065d` / migration CI run `35011782807` / version `0.1.2`;
5. independently verify the signed migration bundle metadata, verified Secure Boot key fingerprint, Secure Boot signatures, detached signatures, hashes and sizes;
6. load the final migration bundle through Factory Service;
7. install `0.1.2` on one eligible already-encrypted ECO3+ unit under stable power;
8. allow rollback probation and sequence-12 floor commit to finish;
9. stage/verify/commit the signed bootloader;
10. reboot and verify Secure Boot is enabled while Flash Encryption remains release mode;
11. verify a later strictly newer normal signed application OTA still works with Secure Boot active;
12. only then consider broader migration or Secure Boot as a normal factory default.

## M. Canonical architecture authority

Production architecture remains:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility base release `3.3.11`;
- Arduino-ESP32 compatibility source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`;
- normal build entrypoint `battery-monitor/firmware/idf/build.sh`;
- migration build entrypoint `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

Production detached signing public-key SPKI SHA-256 remains:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## N. Read-first authority

Resolve the live branch head, then read:

1. `AGENTS.md`
2. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `battery-monitor/firmware/idf/README.md`
5. `.github/workflows/battery-monitor-ci.yml`
6. `.github/workflows/battery-monitor-signed-release.yml`
7. `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`
8. `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
9. `battery-monitor/windows/esp_provision_helper.py`
10. `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`
11. `battery-monitor/firmware/idf/build.sh`
12. `battery-monitor/firmware/idf/build_secure_boot_migration.sh`
13. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
14. `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`
15. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
16. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`
17. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
18. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`

Key distinction: **`0.1.1` is the validated normal CI candidate with Secure Boot off by default; `0.1.2` is the validated Factory-only Secure Boot retrofit CI candidate for eligible already-encrypted ECO3+ units. Neither is yet the final verified protected-signed production release.**
