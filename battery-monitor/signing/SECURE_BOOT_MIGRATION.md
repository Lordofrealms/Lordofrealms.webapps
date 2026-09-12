# Battery Monitor Secure Boot Migration Signing Authority

This document covers the Factory-only retrofit path for existing Battery Monitor
units. It does **not** make Secure Boot the default for normal new-unit
provisioning.

Battery Monitor user-facing versions follow the repository-wide `AGENTS.md`
rule: exactly three single-digit numeric components (`X.Y.Z`). The internal
software anti-downgrade sequence is derived as `major*100 + minor*10 + patch`,
so normal `0.1.1` maps to sequence `11` and migration `0.1.2` maps to sequence
`12`.

## Two different RSA authorities are involved

Do not confuse these keys.

### 1. Existing detached firmware-authorization key

The repository contains only its public key:

`battery_monitor_secureboot_rsa3072_public.pem`

Despite the historical filename, this key is the Battery Monitor application
update / detached migration authorization trust root. Firmware already embeds
this public key and accepts only RSA-3072-PSS-SHA256 detached signatures made by
the corresponding protected private key.

Expected SPKI SHA-256 fingerprint:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

The existing protected signing secrets are:

- `BATMON_FIRMWARE_SIGNING_KEY_B64`
- `BATMON_FIRMWARE_SIGNING_KEY_PASSWORD`

The Secure Boot migration signer uses this authority to detached-sign the exact
Secure-Boot-signed application and bootloader bytes. Factory & Service verifies
those signatures before it will stage anything.

### 2. Hardware Secure Boot v2 signing key

This is a separate RSA-3072 private key used by Espressif Secure Boot v2. It is
not the detached firmware key above and its private or public key is not stored
in the repository.

The protected migration-signing workflow expects:

- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64`
- `BATMON_SECURE_BOOT_V2_SIGNING_KEY_PASSWORD`

`BATMON_SECURE_BOOT_V2_SIGNING_KEY_B64` must decode to the encrypted PEM private
key. The password secret decrypts it only inside the protected
`battery-monitor-production-signing` environment.

A one-time RSA-3072 key can be generated offline with OpenSSL, for example:

```text
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -aes-256-cbc -out battery-monitor-secure-boot-v2.pem
```

Store the original private key offline as the long-term recovery/signing
authority. Do not commit it, upload it as an ordinary workflow artifact, place
it in a Factory package, or copy it to a Battery Monitor unit.

Before storing the base64 secret, verify that the key is RSA-3072 and record its
public SPKI SHA-256 fingerprint offline:

```text
openssl pkey -in battery-monitor-secure-boot-v2.pem -text -noout
openssl pkey -in battery-monitor-secure-boot-v2.pem -pubout -outform DER | sha256sum
```

The protected migration workflow records that public fingerprint in
`MIGRATION_RELEASE.txt` for traceability. Hardware Secure Boot itself derives
and burns the target-specific Secure Boot digest during activation; the SPKI
fingerprint in release metadata is an operator/audit identifier, not a
replacement for the ESP32 eFuse digest.

## Required build/signing sequence

1. Build the exact migration candidate with
   `.github/workflows/battery-monitor-secure-boot-migration-ci.yml`.
2. Require that run to complete successfully and retain its exact source SHA and
   workflow run ID.
3. Invoke `.github/workflows/battery-monitor-secure-boot-migration-sign.yml`
   with that exact source SHA, CI run ID, and migration version.
4. The protected signer downloads the exact CI-tested unsigned application and
   bootloader bytes rather than rebuilding them.
5. It Secure-Boot-v2 signs both images with the protected hardware Secure Boot
   key.
6. It independently verifies those Secure Boot signatures.
7. It detached-signs the resulting exact bytes with the existing Battery Monitor
   firmware authorization key.
8. It emits only the signed migration bundle; unsigned migration images are
   deleted before artifact upload.

The resulting protected artifact is the only migration payload that should be
presented to Factory & Service.

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
