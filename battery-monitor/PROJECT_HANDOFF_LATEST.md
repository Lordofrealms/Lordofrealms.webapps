# Battery Monitor — Session Handoff

**Updated:** 2026-09-11 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA written in this handoff remains current.**

## 1. Read repository-wide authority first

Read root `AGENTS.md` before project files.

Mandatory version rule:

- user-facing software versions use exactly three numeric components: `MAJOR.MINOR.PATCH`;
- every component is one decimal digit `0` through `9`;
- never create a two-digit component or fourth component;
- carry on overflow, e.g. `0.1.9 -> 0.2.0`;
- platform/security monotonic counters stay separate from the displayed version.

Battery Monitor derives its internal software anti-downgrade sequence as:

`major*100 + minor*10 + patch`

Therefore:

- normal `0.1.1` => internal sequence `11`;
- Secure Boot migration `0.1.2` => internal sequence `12`.

This preserves the existing encrypted-NVS release-floor values without exposing a fourth version field.

## 2. Current normal firmware authority

Normal production candidate:

- version: `0.1.1`;
- internal release sequence: `11`;
- version file: `battery-monitor/firmware/idf/version.txt`;
- architecture: ESP-IDF only;
- Secure Boot: disabled in the normal build;
- Flash Encryption: enabled, release mode;
- NVS Encryption: enabled;
- application rollback: enabled;
- hardware application anti-rollback eFuse: disabled;
- software anti-downgrade floor: encrypted NVS, strictly newer release sequence required;
- signed USB/LAN application OTA: RSA-3072-PSS-SHA256 detached authorization.

`0.1.1` is the corrected name for the work that had temporarily been labeled `0.1.0.11`. Do not restore the four-component name.

The latest fully green normal Toolchain known before this renumbering pass was run #364 at source `e47f1f2185847d4466958b111c43666fc0515ce2`. The renumbered `0.1.1` source must obtain a new green Toolchain run before being treated as validated or promoted. Normal CI firmware remains intentionally unsigned.

The latest previously confirmed protected normal signed release was historical `0.1.0.9`. Do not infer that `0.1.1` has been protected-signed until a new successful protected signing run is explicitly verified.

## 3. Secure Boot migration authority

The Factory-only Secure Boot retrofit candidate is now:

- migration version: `0.1.2`;
- internal release sequence: `12`;
- version file: `battery-monitor/firmware/idf/version-secure-boot-migration.txt`;
- same authoritative firmware source tree as normal production;
- overlay: `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`;
- build entrypoint: `battery-monitor/firmware/idf/build_secure_boot_migration.sh`;
- minimum silicon: classic ESP32 revision 3.0 / ECO3;
- Secure Boot v2 RSA enabled in the migration candidate;
- Flash Encryption must already exist and be in release mode;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration validation;
- normal provisioning remains Secure-Boot-disabled.

`0.1.2` is the corrected name for the migration candidate that had temporarily been labeled `0.1.0.12`. The only new design goal for this migration release is to provide a controlled path to enable Secure Boot on eligible already-encrypted units; do not expand it into an unrelated feature release.

## 4. Version/anti-downgrade implementation

Current implementation authority:

- `battery-monitor/firmware/idf/CMakeLists.txt` rejects anything except exact single-digit `X.Y.Z`;
- `battery-monitor/firmware/idf/build.sh` derives the internal sequence from `X.Y.Z`;
- `battery-monitor/firmware/idf/build_secure_boot_migration.sh` uses the same derivation;
- `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino` parses the same format on-device and derives the same sequence;
- normal CI/signed-release workflows assert `0.1.1 -> 11`;
- migration CI/signing workflows assert `0.1.2 -> 12`;
- Factory migration package parsing uses the same derivation;
- Android setup uses `versionName 0.1.1` and separate `versionCode 11`.

Do not append the anti-downgrade sequence as a fourth version component.

## 5. Secure Boot migration architecture

The migration path remains intentionally separate from normal production provisioning while reusing the same runtime implementation.

High-level flow:

1. Factory verifies the current unit is classic ESP32 ECO3+, release-mode Flash Encrypted, Secure Boot off, and Secure-Boot-v2 eFuse eligible.
2. Factory installs the signed `0.1.2` migration application through the existing application-mediated signed OTA path.
3. The migration app boots, passes rollback probation, and commits internal release sequence `12` to the encrypted software floor.
4. Factory stages the final Secure-Boot-signed bootloader in the existing `coredump` partition at `0x3F0000 + 0x10000`.
5. Device/host verify detached authorization, SHA-256, flash readback, image sanity, migration state, and exact device identity.
6. A final explicit commit copies the staged bootloader into the primary bootloader region.
7. After reboot, Factory verifies Flash Encryption remains release mode and hardware Secure Boot reports enabled.
8. A later strictly newer normal signed application OTA must then be demonstrated while Secure Boot is active.

## 6. Secure Boot build/signing constraints

Keep these fail-closed constraints:

- unsigned classic ESP32 Secure Boot v2 bootloader <= `0xC000`;
- Secure Boot signing adds exactly one `0x1000` signature sector;
- signed bootloader <= `0xD000`;
- deployed primary bootloader region = `0xE000` bytes starting at `0x1000`;
- temporary staging partition = existing `coredump` at `0x3F0000`, size `0x10000`;
- deployed OTA application slot = `0x140000`;
- migration CI builds unsigned Secure-Boot-ready bytes;
- protected signer signs the exact CI-tested bytes with the separate Secure Boot v2 RSA-3072 key;
- the resulting app and bootloader also receive the existing Battery Monitor detached RSA-3072-PSS-SHA256 authorization signature;
- Secure Boot and Flash Encryption keys must not be burned together during retrofit;
- Flash Encryption must already be enabled before migration.

## 7. Factory/device safety gates

Keep the existing protections:

- exact `BM-...` device identity binding throughout migration;
- eFuse eligibility preflight before advancing to migration release sequence 12;
- migration application probation/release-floor completion before bootloader staging;
- detached-signature, hash, size and metadata verification before transfer;
- staged-flash readback verification before primary bootloader copy;
- dangerous-write guard restored during staging/verification and opened only around the final copy operation;
- no reboot/removal of power after a final-copy error while the migration app remains alive.

The final primary bootloader replacement is inherently power-loss-sensitive. A power failure during erase/copy can brick the device. Software validation cannot make the existing flash layout atomic.

## 8. Validation state / next work

The version-renumbering pass changed build, runtime release parsing, Factory migration parsing, CI/signing workflow assertions, artifact names, Android version metadata, and migration signing documentation.

Do not treat `0.1.1` or `0.1.2` as validated merely because the source was renamed. Required next gates are:

1. obtain a fully green normal Battery Monitor Toolchain run for the corrected `0.1.1` source;
2. obtain a fully green Secure Boot Migration Candidate run for corrected `0.1.2`;
3. inspect any failing job/artifact rather than guessing;
4. protected-sign exact green CI bytes only after those runs succeed;
5. independently verify the signed migration bundle metadata/signatures/hashes/sizes;
6. exercise Factory package loading;
7. migrate one controlled ECO3+ encrypted unit under stable power;
8. verify Secure Boot after reboot;
9. verify a later normal signed OTA still works with Secure Boot active.

## 9. Canonical architecture

Production architecture remains:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`.

Do not restore PlatformIO/Arduino-CLI as a second production architecture or fork the runtime into a second Secure Boot implementation.

## 10. Read first next session

At the exact live branch head, read in order:

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

Key distinction: **normal production candidate is `0.1.1` with Secure Boot off; `0.1.2` is the Factory-only Secure Boot retrofit candidate for eligible already-encrypted ECO3+ units.**
