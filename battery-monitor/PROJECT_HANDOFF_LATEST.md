# Battery Monitor — Session Handoff

**Updated:** 2026-09-11 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume the handoff SHA remains current.**

## 1. Current live authority

Live head immediately before this handoff refresh:

`e47f1f2185847d4466958b111c43666fc0515ce2` — `Enforce signed Secure Boot bootloader staging limit`

Normal production firmware authority:

- architecture: ESP-IDF only;
- version: `0.1.0.11`;
- release sequence: `11`;
- version file: `battery-monitor/firmware/idf/version.txt`;
- Secure Boot remains disabled in the normal provisioning build;
- Flash Encryption release mode and NVS Encryption remain enabled.

Normal Battery Monitor Toolchain authority at the live head:

- workflow run: **#364**;
- run ID: `34661160639`;
- source SHA: `e47f1f2185847d4466958b111c43666fc0515ce2`;
- conclusion: **SUCCESS**.

Run #364 produced:

- firmware artifact ID `10287422334`, digest `sha256:6d11c114ee49f04cb1fb13e6bbf1d03bf2daf881839e0f1f9339f6ccf14559b9`;
- Android artifact ID `10287088740`, digest `sha256:f62431a2044dff24680aa3217e5ae3121372da6317503c84289e3961eed3daa8`;
- customer Windows artifact ID `10286879881`, digest `sha256:cf831040c5149b8b6d796ce328ec57f07ce0429fe4f790c4bc9cab957b1711b5`;
- Factory Service artifact ID `10286739915`, digest `sha256:1bd0dd72cc2beffb87bde579e7470e0b4451d83046318bc6675a4b2ab8423da4`.

Normal-CI firmware remains intentionally unsigned and is not a substitute for a protected signed release artifact.

## 2. Latest protected normal signed release

Latest protected `Battery Monitor Signed Firmware Release` success:

- version: `0.1.0.9`;
- workflow run: **#10**;
- run ID: `34382911129`;
- conclusion: **SUCCESS**;
- workflow head SHA: `a4019353c13592e8e688ff268bb4c05c3a67d35f`;
- signed firmware artifact ID `10116819796`, digest `sha256:b6d457f30aafe84d619a15740c1bd276d99840e797861012a53e40da118d53e4`;
- signed Windows artifact ID `10116909013`, digest `sha256:ade82c02d3863f10b87702928d160615f1a6659b88c53935f4dc4f1a47b54c32`.

Do not infer that 0.1.0.11 has been protected-signed merely because normal CI is green.

## 3. Secure Boot migration architecture

There is now a separate Factory-only migration candidate for already release-encrypted classic ESP32 ECO3+ Battery Monitor units.

Migration authority:

- migration version: `0.1.0.12`;
- migration release sequence: `12`;
- version file: `battery-monitor/firmware/idf/version-secure-boot-migration.txt`;
- same authoritative firmware source tree as normal production;
- additional defaults overlay: `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`;
- build entrypoint: `battery-monitor/firmware/idf/build_secure_boot_migration.sh`;
- minimum silicon: classic ESP32 revision 3.0 / ECO3;
- Secure Boot v2 RSA enabled in the migration candidate;
- CI deliberately builds unsigned Secure Boot-padded images for remote/protected signing;
- Flash Encryption remains release mode;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration validation;
- normal provisioning default Secure Boot remains unchanged/disabled.

The normal 0.1.0.11 firmware and migration 0.1.0.12 candidate are intentionally different release authorities without creating a second firmware implementation.

## 4. Migration candidate CI authority

Latest successful migration candidate build:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run: **#15**;
- run ID: `34661039477`;
- source SHA: `925c71b51752ba354fbceaa63ace418468cf006d`;
- conclusion: **SUCCESS**.

The later live commits through `e47f1f...` changed protected-signing/Factory-host contract enforcement, not the migration firmware bytes that were validated at `925c71b...`.

Important build findings already resolved:

- the migration firmware compiles and links successfully under pinned ESP-IDF 5.5.5;
- classic ESP32 generated config uses `CONFIG_ESP32_REV_MIN=3` and `CONFIG_ESP32_REV_MIN_FULL=300` for ECO3; the old post-build `CONFIG_ESP32_REV_MIN=300` assertion was wrong and has been fixed;
- current unsigned migration bootloader is about `0xB000` (44 KiB);
- classic ESP32 Secure Boot v2 unsigned bootloader limit is enforced as `0xC000` (48 KiB);
- protected signing must add exactly one `0x1000` signature sector;
- signed bootloader envelope is therefore enforced as `0xD000` maximum;
- deployed primary bootloader region remains `0x1000..0xEFFF` (`0xE000` bytes);
- temporary staging remains the existing `coredump` partition at `0x3F0000 + 0x10000`.

## 5. Protected migration signing workflow

Workflow:

`.github/workflows/battery-monitor-secure-boot-migration-sign.yml`

It is manual/protected and requires:

- exact `source_sha`;
- exact successful migration `ci_run_id`;
- exact migration version (`0.1.0.12` currently);
- `battery-monitor-production-signing` environment;
- Secure Boot v2 RSA-3072 signing key secret;
- normal Battery Monitor detached RSA-3072 signing key secret.

The signer now verifies before signing:

- CI run success, expected workflow, and exact source SHA;
- migration version/release sequence authority;
- migration scope and minimum ECO3 revision;
- normal provisioning remains Secure-Boot-disabled;
- unsigned app and bootloader sizes exactly match CI authority;
- unsigned hashes exactly match CI authority;
- unsigned app retains a 4 KiB signature sector allowance;
- unsigned bootloader is `<= 0xC000`.

After Secure Boot signing it verifies:

- signature verification succeeds for app and bootloader;
- signed size growth is exactly `0x1000` per image;
- signed app fits the deployed `0x140000` OTA slot;
- signed bootloader is `<= 0xD000`, `<= 0xE000` primary region, and `<= 0x10000` staging partition;
- each final Secure Boot-signed image receives the existing independent detached RSA-3072-PSS-SHA256 Battery Monitor authorization signature.

The produced `MIGRATION_RELEASE.txt` carries signed image sizes/hashes and both unsigned/signed Secure Boot bootloader limits.

A protected migration-signing run has **not yet been recorded as successful in this handoff**. Do not claim the signed migration bundle exists until that workflow succeeds.

## 6. Factory migration host contract

Factory Service implements the migration transport and package validation.

Relevant files:

- `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`;
- `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`.

Current host-side gates include:

- migration release schema/scope/minimum revision validation;
- `secure_boot=ESP32-Secure-Boot-v2-RSA-PSS` authority;
- unsigned/signed bootloader limit authority (`0xC000` / `0xD000`);
- exact signed app and bootloader size match against release metadata;
- exact SHA-256 match against release metadata;
- detached signature verification before transfer;
- host refusal to transfer a signed bootloader larger than `0xD000`.

## 7. Device-side migration behavior

Migration implementation:

`battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`

Normal builds compile fail-closed stubs. The isolated Secure Boot migration build enables the Factory-only implementation.

High-level flow:

1. run migration application 0.1.0.12 through the existing signed application OTA path;
2. allow normal rollback probation and software release-floor commit to complete;
3. require classic ESP32 ECO3+, Flash Encryption release mode, Secure Boot not yet enabled, and committed migration release floor;
4. stage the signed Secure Boot bootloader in the existing 64 KiB coredump partition;
5. verify transfer SHA-256, Battery Monitor detached RSA signature, flash readback SHA, and bootloader image sanity;
6. require a final explicit SHA confirmation;
7. `esp_ota_end()` performs the final bootloader validation/copy to the encrypted primary bootloader region;
8. reboot is required only after a successful commit.

## 8. Critical unresolved physical risk

The final primary bootloader replacement is inherently power-loss-sensitive.

Once final commit begins, a power loss during erase/copy can leave the ESP32 without a bootable second-stage bootloader. Software checks reduce the probability of writing bad bytes but cannot make that physical operation atomic.

Therefore:

- do not treat migration CI success as hardware validation;
- do not mass-deploy before one sacrificial/bench ECO3 encrypted unit completes the full migration successfully;
- use stable external power during final commit;
- Factory UI must continue to present the irreversible-action warning immediately before commit;
- if final copy returns an error while the running migration app remains alive, do not reboot/remove power until recovery/retry is resolved.

## 9. Immediate next work

1. Keep the current normal Toolchain green.
2. Review/validate the protected migration-signing workflow against the successful candidate run.
3. Produce a protected signed migration bundle only when the Secure Boot v2 production key is configured and the exact candidate SHA/run are intentionally selected.
4. Verify the resulting `MIGRATION_RELEASE.txt`, Secure Boot signatures, detached signatures, hashes, and sizes independently.
5. Exercise the Factory Service package loader against that exact signed bundle.
6. Perform the migration on one controlled ECO3+ encrypted hardware unit with stable power.
7. Verify after reboot that Secure Boot is actually enabled and normal signed application OTA still works.
8. Only after physical validation should this path be considered for broader migration.

## 10. Architecture authority

Canonical production architecture remains:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- application wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`.

Do not restore PlatformIO/Arduino-CLI as a second production architecture or fork the runtime into a separate Secure Boot firmware implementation.

## 11. Read first next session

At the exact live branch head, read in order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/README.md`
4. `battery-monitor/firmware/idf/README.md`
5. `.github/workflows/battery-monitor-ci.yml`
6. `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`
7. `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
8. `.github/workflows/battery-monitor-signed-release.yml`
9. `battery-monitor/firmware/idf/build_secure_boot_migration.sh`
10. `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`
11. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
12. `battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`
13. `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`
14. `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`

The key distinction is: **normal production remains 0.1.0.11 with Secure Boot off by default; 0.1.0.12 is a separately authorized Factory-only Secure Boot retrofit candidate for already-encrypted ECO3+ units.**
