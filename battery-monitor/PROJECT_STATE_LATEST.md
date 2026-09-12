# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-11 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` head before modifying source. Read root `AGENTS.md` first; it contains repository-wide design criteria.

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

This preserves the previously established encrypted-NVS release-floor sequence values while removing the invalid four-component display version.

## C. Normal production firmware authority

Current normal production candidate:

- version: `0.1.1`;
- internal release sequence: `11`;
- authoritative version file: `battery-monitor/firmware/idf/version.txt`;
- one production architecture: ESP-IDF;
- Secure Boot: disabled by default;
- Flash Encryption: enabled, release mode;
- NVS Encryption: enabled;
- automatic application rollback: enabled;
- hardware application anti-rollback eFuse: disabled;
- software anti-downgrade floor: encrypted NVS, strictly-newer policy;
- normal USB/LAN update authorization: RSA-3072-PSS-SHA256 detached signature plus release-policy checks.

The source previously called `0.1.0.11` is now correctly named `0.1.1`. Do not reintroduce `0.1.0.11` as a current release identifier.

Latest fully green normal Toolchain known before the renumbering pass:

- source SHA: `e47f1f2185847d4466958b111c43666fc0515ce2`;
- workflow: `Battery Monitor Toolchain`;
- run: #364;
- run ID: `34661160639`;
- result: SUCCESS.

That green result predates the version-format conversion. A new green Toolchain run is required for the corrected `0.1.1` source before it is treated as validated.

Normal-CI firmware remains intentionally unsigned. The latest previously confirmed protected normal signed release was historical `0.1.0.9`; do not claim `0.1.1` is protected-signed until a new protected signing run succeeds and is verified.

## D. Secure Boot migration candidate authority

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

The migration source previously called `0.1.0.12` is now correctly named `0.1.2`. Its design scope remains narrowly focused on creating a path to enable Secure Boot on eligible existing encrypted units.

The last successful migration candidate CI known before the later hardening/renumbering work was run #15, run ID `34661039477`, at source `925c71b51752ba354fbceaa63ace418468cf006d`. A new green migration CI run is required for `0.1.2` before protected signing.

## E. Version enforcement implementation

Current source enforces the rule in multiple layers:

- `firmware/idf/CMakeLists.txt`: exact three single-digit components only;
- `firmware/idf/build.sh`: same validation, derives sequence `major*100+minor*10+patch`;
- `firmware/idf/build_secure_boot_migration.sh`: same validation/derivation;
- `firmware/BatteryMonitor/FirmwareReleasePolicy.ino`: same on-device parser/derivation for OTA anti-downgrade;
- `.github/workflows/battery-monitor-ci.yml`: asserts normal `0.1.1`, sequence `11` and derivation metadata;
- `.github/workflows/battery-monitor-signed-release.yml`: same protected release validation;
- `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`: asserts migration `0.1.2`, sequence `12` and derivation metadata;
- `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`: same protected migration validation;
- Factory `SecureBootMigrationWorkflow.cs`: validates three-component migration version against the separately recorded sequence;
- Android setup: `versionName 0.1.1`, separate `versionCode 11`.

## F. Secure Boot build constraints

Classic ESP32 Secure Boot v2 constraints remain:

- unsigned bootloader hard limit: `0xC000` (48 KiB);
- Secure Boot signature-sector growth: exactly `0x1000`;
- signed bootloader envelope: `0xD000` maximum;
- primary bootloader region: `0xE000` bytes starting at `0x1000`;
- temporary staging partition: existing `coredump` at `0x3F0000`, size `0x10000`;
- OTA app partition: `0x140000`;
- unsigned app must leave one `0x1000` signature-sector allowance.

The migration build uses remote/protected Secure Boot signing. CI must not require the Secure Boot private key. Retrofit requires Flash Encryption to pre-exist and explicitly forbids burning Secure Boot and Flash Encryption keys together.

## G. Protected migration signing

Workflow: `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`.

Inputs/authorization:

- exact candidate source SHA;
- exact successful migration candidate CI run ID;
- exact migration version `0.1.2`;
- protected `battery-monitor-production-signing` environment;
- separate Secure Boot v2 RSA-3072 private key secret;
- existing Battery Monitor detached RSA-3072 private key secret.

The workflow promotes exact CI-tested unsigned bytes, verifies source/run/version/sequence/scope/configuration/size/hash authorities, Secure-Boot-signs the app and bootloader, independently verifies those Secure Boot signatures, then detached-signs the final exact bytes with the existing Battery Monitor authorization key.

No protected `0.1.2` migration bundle should be claimed until this workflow succeeds for an intentionally selected new green candidate run.

## H. Factory Service migration contract

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

## I. Device-side migration state machine

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

## J. Critical physical risk

The final primary bootloader erase/copy is not atomic. Power loss during that final window can leave the unit without a valid second-stage bootloader.

Operational requirements:

- first test on one controlled/sacrificial ECO3+ encrypted unit;
- use stable external power during final commit;
- preserve the explicit irreversible-action warning;
- if final copy returns an error while the migration app remains alive, do not reboot/remove power until retry/recovery is resolved;
- do not treat CI/signing success as hardware proof.

## K. Remaining validation sequence

1. Resolve live branch and inspect the newest normal Toolchain result for `0.1.1`.
2. Inspect the newest Secure Boot Migration Candidate result for `0.1.2`.
3. Diagnose any failure from the first real failing log/artifact rather than guessing.
4. Protected-sign exact green CI bytes only after both relevant source authorities are validated.
5. Independently verify the signed migration bundle metadata, both Secure Boot signatures, both detached signatures, hashes and sizes.
6. Load the bundle through Factory Service.
7. Install `0.1.2` on one eligible encrypted ECO3+ unit.
8. Allow rollback probation and sequence-12 floor commit to finish.
9. Stage/verify/commit the signed bootloader under stable power.
10. Reboot and verify Secure Boot is enabled.
11. Verify a later strictly newer normal signed application OTA still works with Secure Boot active.
12. Only then consider broader migration or Secure Boot as a normal factory default.

## L. Canonical architecture authority

Production architecture remains:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`;
- normal build entrypoint `battery-monitor/firmware/idf/build.sh`;
- migration build entrypoint `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

Production detached signing public-key SPKI SHA-256 remains:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## M. Read-first authority

Resolve the live branch head, then read:

1. `AGENTS.md`
2. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `battery-monitor/firmware/idf/README.md`
5. `.github/workflows/battery-monitor-ci.yml`
6. `.github/workflows/battery-monitor-signed-release.yml`
7. `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`
8. `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
9. `battery-monitor/firmware/idf/build.sh`
10. `battery-monitor/firmware/idf/build_secure_boot_migration.sh`
11. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
12. `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`
13. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
14. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`
15. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
16. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`
17. `battery-monitor/signing/SECURE_BOOT_MIGRATION.md`

Key distinction: **`0.1.1` is the normal production candidate with Secure Boot off by default; `0.1.2` is the Factory-only Secure Boot retrofit candidate for eligible already-encrypted ECO3+ units.**
