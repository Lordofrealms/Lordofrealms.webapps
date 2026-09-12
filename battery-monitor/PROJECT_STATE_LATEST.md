# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-11 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` head before modifying source. The branch may move after any authority document is written.

Live head immediately before this state refresh:

`5be4f8fa4aad0cf2e997a6957a62c3fea3b213bf` — documentation refresh following the previously validated product head `e47f1f2185847d4466958b111c43666fc0515ce2`.

## B. Normal production firmware authority

Current normal production firmware:

- version: `0.1.0.11`;
- release sequence: `11`;
- authoritative version file: `battery-monitor/firmware/idf/version.txt`;
- one production architecture: ESP-IDF;
- Secure Boot: **disabled by default** in normal provisioning;
- Flash Encryption: enabled, release mode;
- NVS Encryption: enabled;
- automatic application rollback: enabled;
- hardware application anti-rollback eFuse: disabled;
- software anti-downgrade floor: enforced in encrypted NVS;
- normal USB/LAN firmware update authorization: RSA-3072-PSS-SHA256 detached signature plus release-policy checks.

Latest fully green normal toolchain before the documentation-only refresh:

- source SHA: `e47f1f2185847d4466958b111c43666fc0515ce2`;
- workflow: `Battery Monitor Toolchain`;
- run: **#364**;
- run ID: `34661160639`;
- result: **SUCCESS**.

Run #364 artifacts:

- firmware: ID `10287422334`, digest `sha256:6d11c114ee49f04cb1fb13e6bbf1d03bf2daf881839e0f1f9339f6ccf14559b9`;
- Android setup: ID `10287088740`, digest `sha256:f62431a2044dff24680aa3217e5ae3121372da6317503c84289e3961eed3daa8`;
- customer Windows: ID `10286879881`, digest `sha256:cf831040c5149b8b6d796ce328ec57f07ce0429fe4f790c4bc9cab957b1711b5`;
- Factory Service: ID `10286739915`, digest `sha256:1bd0dd72cc2beffb87bde579e7470e0b4451d83046318bc6675a4b2ab8423da4`.

These normal-CI firmware outputs are intentionally unsigned and are not protected production release packages.

## C. Latest protected normal signed release

Latest confirmed successful protected normal signing workflow:

- version: `0.1.0.9`;
- workflow: `Battery Monitor Signed Firmware Release`;
- run: **#10**;
- run ID: `34382911129`;
- result: **SUCCESS**;
- workflow head SHA: `a4019353c13592e8e688ff268bb4c05c3a67d35f`;
- signed firmware artifact ID `10116819796`, digest `sha256:b6d457f30aafe84d619a15740c1bd276d99840e797861012a53e40da118d53e4`;
- signed Windows artifact ID `10116909013`, digest `sha256:ade82c02d3863f10b87702928d160615f1a6659b88c53935f4dc4f1a47b54c32`.

Do not describe 0.1.0.11 as protected-signed unless a later signing run is explicitly verified.

## D. Secure Boot migration candidate authority

A separate Factory-only migration build now exists for already release-encrypted classic ESP32 ECO3+ Battery Monitor units.

Current migration candidate:

- version: `0.1.0.12`;
- release sequence: `12`;
- version file: `battery-monitor/firmware/idf/version-secure-boot-migration.txt`;
- build script: `battery-monitor/firmware/idf/build_secure_boot_migration.sh`;
- config overlay: `battery-monitor/firmware/idf/sdkconfig.secure_boot_migration.defaults`;
- same production source tree and runtime as normal firmware;
- minimum chip revision: ESP32 ECO3 / revision 3.0;
- Secure Boot v2 RSA enabled in the migration build;
- CI builds unsigned Secure Boot-ready images for later remote/protected signing;
- Flash Encryption release mode remains enabled;
- NVS Encryption remains enabled;
- hardware application anti-rollback remains disabled during migration validation;
- normal production provisioning behavior remains unchanged.

Latest successful candidate CI:

- workflow: `Battery Monitor Secure Boot Migration Candidate`;
- run: **#15**;
- run ID: `34661039477`;
- source SHA: `925c71b51752ba354fbceaa63ace418468cf006d`;
- result: **SUCCESS**.

The later commits through `e47f1f...` hardened signer/Factory package enforcement without changing the migration firmware bytes validated by that candidate run.

## E. Secure Boot build constraints now enforced

Classic ESP32 Secure Boot v2 constraints are encoded in CI/signing/Factory validation:

- unsigned bootloader hard limit: `0xC000` (48 KiB);
- Secure Boot signature-sector growth: exactly `0x1000`;
- signed bootloader envelope: `0xD000` maximum;
- deployed primary bootloader region: `0xE000` bytes starting at `0x1000`;
- temporary staging partition: existing `coredump` at `0x3F0000`, size `0x10000`;
- deployed OTA app partition: `0x140000` bytes;
- unsigned app must leave one `0x1000` signature sector before signing.

Current migration build is below the bootloader limit (about `0xB000` unsigned).

The earlier migration CI failure was not a compile/link failure. Firmware built successfully; the failing assertion incorrectly expected `CONFIG_ESP32_REV_MIN=300`. Under pinned ESP-IDF 5.5.5, classic ESP32 uses:

- `CONFIG_ESP32_REV_MIN=3` for legacy major revision;
- `CONFIG_ESP32_REV_MIN_FULL=300` for revision 3.0.

That post-build assertion is corrected.

## F. Protected migration signing workflow

Workflow:

`.github/workflows/battery-monitor-secure-boot-migration-sign.yml`

Inputs/authorization:

- exact 40-character candidate `source_sha`;
- exact successful migration candidate `ci_run_id`;
- exact migration version;
- protected `battery-monitor-production-signing` environment;
- Secure Boot v2 RSA-3072 private key secret;
- existing Battery Monitor detached RSA-3072 private key secret.

Before signing, workflow validates:

- exact candidate CI source/run/workflow success;
- migration version and release sequence;
- migration scope/minimum chip revision;
- normal provisioning Secure Boot default unchanged;
- unsigned app/bootloader sizes and SHA-256 exactly match CI authority;
- unsigned app leaves signature-sector space;
- unsigned bootloader is `<= 0xC000`.

After Secure Boot v2 signing, workflow validates:

- Secure Boot signature verification succeeds;
- app and bootloader each grow by exactly `0x1000`;
- signed app is `<= 0x140000`;
- signed bootloader is `<= 0xD000`, `<= 0xE000`, and `<= 0x10000`;
- final signed app and bootloader are independently signed by the existing Battery Monitor detached RSA-3072-PSS-SHA256 key;
- `MIGRATION_RELEASE.txt` records source/run/version/release sequence, trust fingerprints, limits, sizes, hashes, and the final-copy power-loss risk.

No successful protected migration-signing run is asserted by this state file yet.

## G. Factory Service migration package contract

Factory Service validates the signed migration bundle before device transfer.

Key files:

- `battery-monitor/windows/BatteryMonitor.FactoryService/SecureBootMigrationWorkflow.cs`;
- `battery-monitor/windows/BatteryMonitor.FactoryService/UsbSecureBootMigrationProvisioner.cs`.

Current host-side requirements include:

- correct migration release schema and scope;
- minimum ESP32 revision authority;
- `secure_boot=ESP32-Secure-Boot-v2-RSA-PSS`;
- recorded `0xC000` unsigned and `0xD000` signed bootloader limits;
- signed app/bootloader sizes exactly equal metadata;
- signed app/bootloader SHA-256 exactly equal metadata;
- detached signatures verify using the pinned Battery Monitor trust root;
- signed bootloader transfer is rejected above `0xD000`.

## H. Device-side migration state machine

Implementation:

`battery-monitor/firmware/BatteryMonitor/SecureBootMigration.ino`

Normal 0.1.0.11 compiles fail-closed migration stubs. Migration 0.1.0.12 enables the Factory-only implementation.

Required preconditions include:

- classic ESP32 ECO3+;
- Flash Encryption enabled in release mode;
- Secure Boot not already enabled;
- migration app no longer in pending rollback probation;
- software release floor committed to the running migration sequence.

Transfer/commit behavior:

1. stage the final Secure Boot-signed bootloader in the existing coredump partition;
2. SHA-256 the incoming bytes;
3. verify the existing Battery Monitor detached RSA authorization;
4. read back staged flash and re-hash it;
5. check bootloader magic;
6. require explicit final SHA confirmation;
7. call `esp_ota_end()` on the staged image/final primary bootloader partition configuration;
8. reboot only after successful final commit.

Timeout/abort paths restore ESP-IDF's primary bootloader image offset after OTA abort so later image validation does not remain pointed at staging.

## I. Critical remaining hardware risk

The final primary bootloader erase/copy is not atomic.

Power loss during the final commit window can leave the unit without a valid second-stage bootloader. No software-only change can eliminate this risk on the existing flash layout.

Required operational controls:

- test first on one controlled/sacrificial ECO3+ encrypted unit;
- use highly stable external power during final commit;
- present explicit irreversible-action confirmation immediately before commit;
- do not reboot/remove power after a returned final-copy error while the migration application is still running;
- do not treat CI/signature success as proof of physical migration safety.

## J. Remaining validation sequence

1. Keep normal Battery Monitor Toolchain green after any source change.
2. Intentionally select the exact successful migration candidate source/run for protected signing.
3. Run the protected migration signing workflow only after the Secure Boot v2 key is configured.
4. Independently verify the signed migration bundle: metadata, source/run authority, both Secure Boot signatures, both detached signatures, hashes, and sizes.
5. Load the bundle through Factory Service and confirm package validation succeeds.
6. Install the 0.1.0.12 migration application through the existing signed application OTA path on one ECO3+ encrypted test unit.
7. Allow rollback probation and release-floor commit to finish.
8. Stage/verify the signed bootloader.
9. Perform final commit under stable power.
10. Reboot and verify Secure Boot is actually enabled.
11. Verify signed application OTA still works after Secure Boot activation.
12. Only then consider broader migration.

## K. Canonical architecture authority

Production architecture remains:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`;
- normal build entrypoint `battery-monitor/firmware/idf/build.sh`;
- migration build entrypoint `battery-monitor/firmware/idf/build_secure_boot_migration.sh`.

The migration build is an isolated configuration/version authority over the same implementation, not a second production firmware architecture.

Production detached signing public-key SPKI SHA-256 remains:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## L. Read-first authority

Resolve the live branch head, then read:

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

Key distinction: **0.1.0.11 is the normal production line with Secure Boot still off by default; 0.1.0.12 is the Factory-only Secure Boot retrofit candidate for already-encrypted ECO3+ units.**
