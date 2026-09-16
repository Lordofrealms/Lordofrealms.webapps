# Battery Monitor Secure Boot Migration Signing Authority

This document covers the Factory-only retrofit path for existing Battery Monitor
units. It does **not** make Secure Boot the default for normal new-unit
provisioning.

Battery Monitor user-facing versions follow the repository-wide `AGENTS.md`
rule: exactly three single-digit numeric components (`X.Y.Z`). The internal
software anti-downgrade sequence is derived as `major*100 + minor*10 + patch`,
so normal `0.1.1` maps to sequence `11` and migration `0.1.2` maps to sequence
`12`.

## One existing RSA authority is used in two signing roles

Battery Monitor intentionally uses the existing protected RSA-3072 signing key
for both:

1. Espressif Secure Boot v2 signatures on the migration application and
   bootloader; and
2. the existing Battery Monitor RSA-3072-PSS-SHA256 detached `.sig`
   authorization on those exact Secure-Boot-signed bytes.

This is a deliberate project design choice. ESP32 Secure Boot v2 does not
require a separate RSA key from the application/update authorization key.
Using one authority keeps the product on the already established and protected
Battery Monitor signing root instead of introducing a second long-term key.

The repository contains only the corresponding public key:

`battery_monitor_secureboot_rsa3072_public.pem`

Expected DER SubjectPublicKeyInfo SHA-256 fingerprint:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

The protected signing environment uses the existing secrets only:

- `BATMON_FIRMWARE_SIGNING_KEY_B64`
- `BATMON_FIRMWARE_SIGNING_KEY_PASSWORD`

The protected migration workflow decrypts that key only inside the protected
`battery-monitor-production-signing` environment, proves it is RSA-3072, and
requires its SPKI SHA-256 fingerprint to equal the pinned value above before
any Secure Boot or detached signature is produced. It also recomputes the
repository public-key fingerprint and requires the same value.

The same verified private key is then passed to Espressif `espsecure.py` for
Secure Boot v2 signing and to OpenSSL for the detached Battery Monitor
signatures. `MIGRATION_RELEASE.txt` records the same fingerprint for both roles
and records:

`signing_key_authority=shared-existing-battery-monitor-rsa3072`

The security tradeoff is intentional: compromise of this one protected key
would affect both normal firmware authorization and Secure Boot signing. The
project accepts that tradeoff in exchange for one established production
signing authority rather than maintaining two independent long-term private
keys.

## Required build/signing sequence

1. Build the exact migration candidate with
   `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`.
2. Require that run to complete successfully and retain its exact source SHA and
   workflow run ID. Protected promotion accepts only successful push or manual
   workflow-dispatch candidate runs.
3. Invoke `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
   with that exact source SHA, CI run ID, and migration version.
4. The protected signer downloads the exact CI-tested unsigned application and
   bootloader bytes rather than rebuilding them.
5. Before signing, it proves the existing Battery Monitor key is RSA-3072 and
   its SPKI fingerprint matches the pinned production fingerprint.
6. It Secure-Boot-v2 signs both images with that existing Battery Monitor key.
7. It independently verifies those Secure Boot signatures.
8. It detached-signs the resulting exact bytes with the same existing Battery
   Monitor key and verifies those signatures using the repository public key.
9. It emits only the signed migration bundle; unsigned migration images are
   deleted before artifact upload.

The resulting protected artifact is the only migration payload that should be
presented to Factory & Service.

## Current exact validated migration CI authority

The current unsigned migration candidate that is eligible for protected
promotion is:

- source SHA: `ec4c7200debd2fb27a5e63e45670110cb7d9065d`;
- migration CI run ID: `35011782807`;
- migration version: `0.1.2`;
- app SHA-256: `3b981369d0ecd0c2ca4cf9d340eb93193e1c8b82908d06a650fa3c0000bbc7d4`;
- bootloader SHA-256: `edf4824614315152b92a608d52586dbabc71ec9a91768915dd7207acd69510df`;
- unsigned bootloader size: `45,056` bytes (`0xB000`).

Do not substitute a different CI run merely because it has the same displayed
version. Protected signing must remain bound to an exact successful run and
exact source SHA.

## Pre-existing Flash Encryption guard

The migration build must remain Flash Encryption **release mode** and is valid
only for units that are already permanently release-encrypted. ESP-IDF 5.5.5's
`CONFIG_SECURE_FLASH_REQUIRE_ALREADY_ENABLED` option is exposed only for Flash
Encryption development mode, so it cannot be used as the retrofit guard without
weakening the required release-mode configuration.

Instead, the migration bootloader contains a project `bootloader_after_init`
hook. After bootloader/eFuse initialization, but before partition/application
loading and before Secure Boot v2 can permanently activate, the hook reads the
existing Flash Encryption eFuse state. If it is not already RELEASE mode, the
bootloader refuses migration and resets rather than proceeding toward Secure
Boot activation.

Migration CI proves this guard is linked into the exact unsigned bootloader and
records:

`flash_encryption_preexist_guard=bootloader-after-init-release-mode-efuse-check`

in `MIGRATION_BUILD_AUTHORITY.txt`. Protected signing must require that exact
authority before signing the candidate, propagate it into
`MIGRATION_RELEASE.txt`, and Factory & Service must require the same field when
loading the signed bundle. The protected signer also searches the exact
unsigned bootloader for the guard's refusal marker before signing, and Factory
repeats that byte-level marker check on the detached-signature-verified signed
bootloader. This binds the requirement to the actual bootloader bytes instead
of trusting editable metadata alone. These checks are defense in depth; Factory
still independently verifies release-mode Flash Encryption before staging and
again before irreversible commit.

The current validated unsigned bootloader contains the refusal marker beginning
at byte offset `473`.

## Factory migration bundle

Factory expects these exact files together:

- `BatteryMonitor.secureboot.app.bin`
- `BatteryMonitor.secureboot.app.bin.sig`
- `BatteryMonitor.secureboot.bootloader.bin`
- `BatteryMonitor.secureboot.bootloader.bin.sig`
- `MIGRATION_RELEASE.txt`

Factory verifies detached signatures, exact metadata hashes, the three-component
version/derived release sequence, hardware eligibility, release-mode Flash
Encryption, device identity, staging readback, and post-reboot Secure Boot state
before reporting success.

## First hardware qualification gate

Do not enable Secure Boot by default for new production units merely because the
migration software builds successfully. Qualify the complete chain on an
existing ECO3 unit first:

1. Start with a normal release-encrypted `0.1.1` unit (internal release sequence
   `11`) with Secure Boot off.
2. Migrate it to Secure Boot migration release `0.1.2` (internal release
   sequence `12`) using Factory & Service.
3. Verify the unit itself reports Flash Encryption release mode and hardware
   Secure Boot enabled after reboot.
4. Produce a strictly newer normal signed application release using the same
   three-component/single-digit version rule.
5. Install that release through the ordinary signed application OTA path.
6. Verify the newer application boots, passes rollback probation, advances the
   encrypted release floor, and still reports hardware Secure Boot enabled.

Only after that full chain is proven should normal factory provisioning be
considered for Secure Boot by default.
