# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Prototype version:** `0.1.0`  
**Signed firmware app version / software release sequence:** `0.1.0.1` / `1`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before making changes. Do not assume the SHA in this document is still the branch head.

Latest fully validated **product/security-source** checkpoint:

`d47215c7c5a157094af2803002e8b94f6af6631f` — `Pin Battery Monitor GitHub Actions`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#146**
- Run ID: **`34229449081`**
- Result: **SUCCESS**

Run #146 passed the complete normal toolchain:

- authoritative ESP32 ESP-IDF firmware build;
- Android provisioning APK build/package;
- exact firmware-artifact handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build/smoke test;
- Windows .NET 8 client build;
- **P0-3 protocol self-test**;
- self-contained Windows publish/bundle/artifact upload.

All GitHub Actions used by the Battery Monitor normal-CI and manual signed-release workflows are now pinned to immutable commit SHAs. Android application backup is disabled.

## B. Canonical production firmware architecture

Battery Monitor has **one production firmware architecture**:

- ESP-IDF **v5.5.5**;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- target: classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 stable base **3.3.11**;
- authoritative Arduino source: immutable upstream commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- that source includes Espressif's merged WebServer hardening PR #12794;
- project root: `battery-monitor/firmware/idf/`;
- wrapper: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- sole runtime behavior implementation: Arduino-style source under `battery-monitor/firmware/BatteryMonitor/`;
- sole authoritative build entrypoint: `battery-monitor/firmware/idf/build.sh`.

There is no production PlatformIO path and no second firmware runtime.

**Do not restore Arduino-ESP32 3.3.7.** Versions through 3.3.7 are affected by the critical pre-handler multipart WebServer overflow fixed in 3.3.8. Route authentication cannot protect a parser vulnerability reached before the route handler.

## C. Active device-at-rest security

Current production ESP-IDF configuration:

- **Flash Encryption: Release mode enabled**;
- **NVS Encryption: enabled** with XTS keys protected by Flash Encryption;
- partition table: `0xF000`;
- `app0`: `0x10000`;
- `app1`: `0x150000`;
- encrypted `nvs_keys`: `0x294000`, size `0x1000`;
- **Secure Boot: intentionally disabled pending encrypted-device hardware validation**;
- irreversible eFuse application anti-rollback: **disabled** pending the later Secure Boot/eFuse production gate.

`build.sh` fails closed if these security/layout authorities drift.

## D. Firmware image roles

- `BatteryMonitor.ino.bin` — plaintext application payload for the running application's signed OTA writer. Device-specific Flash Encryption occurs during OTA writes.
- `BatteryMonitor.ino.merged.bin` — deterministic 4 MiB **blank, unencrypted ESP32 first-install image only**.

The merged image is **not** a post-encryption recovery image. After first encrypted boot, plaintext direct UART/esptool flashing is not the supported application-update path and the Windows tool does not use `--force` to bypass encrypted-device protection.

## E. Signed USB OTA and trust authority

Post-encryption application updates use **`SIGNED_USB_OTA_V1`**:

1. Windows validates the detached production RSA-3072-PSS-SHA256 signature.
2. The image is transferred over physical USB in bounded chunks.
3. The running ESP32 writes the inactive OTA slot with `esp_ota_write()`; ESP-IDF encrypts the flash writes.
4. The ESP32 independently checks the image hash, application identity, and production RSA-PSS signature.
5. Only a fully validated candidate may be selected as the next boot partition.

Production firmware public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Ordinary CI fails if the repository key or firmware-embedded key drifts from this trust root.

## F. Post-boot rollback probation

ESP-IDF automatic application rollback is enabled with `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`.

A newly selected signed OTA candidate receives a **60-second local health probation**. It is marked valid only after setup succeeds, the Monitoring Identity Key is available, and the main loop executes repeatedly. Wi-Fi availability is intentionally not a health requirement.

If the candidate resets, watchdogs, loses power, or explicitly fails required local identity initialization before confirmation, the bootloader can return to the previous valid OTA slot.

This is distinct from irreversible eFuse anti-rollback.

## G. Monotonic software anti-downgrade floor

The signed application descriptor now carries app version **`0.1.0.1`**. The fourth numeric component is the monotonic software release sequence; current sequence is **1**.

Before boot selection, firmware compares the candidate signed-image sequence against the effective release floor. Equal or older signed images are rejected.

The highest accepted sequence is persisted as `batmon/fwseq` in **encrypted NVS**. Supported Wi-Fi/password/admin recovery paths do not erase that floor.

`build.sh` verifies and records:

- embedded app version;
- software release sequence;
- encrypted-NVS floor authority;
- rollback configuration;
- Secure Boot/eFuse anti-rollback state.

The manual production signer also rejects an operator-supplied release version that differs from authoritative `version.txt`.

## H. Current supply-chain/distribution posture

Completed:

- ESP-IDF pinned to an immutable commit;
- hardened Arduino source pinned to an immutable commit;
- esptool download SHA-256 verified;
- Security-2 helper source pinned to exact upstream commits;
- Python provisioning-helper dependencies pinned;
- normal CI and manual signed-release GitHub Actions pinned to immutable commits;
- firmware release artifact signing and independent verifier/tamper/wrong-key gates implemented.

Still open:

- production Android APK signing/release packaging;
- Windows Authenticode/code signing for distributed executables;
- repository branch/ruleset protection. The live branch is currently not protected and the repository exposes no rulesets. The connected GitHub authority in this session does not have administration/write access for rulesets, so this cannot be enforced from chat.

## I. LAN management residual risk

P0-2 management authentication is implemented and source/build resolved: Device Password proof uses a one-time HMAC challenge; sessions are source-IP-bound, short-lived, CSRF-protected, rate-limited, and password rotation/Monitoring Identity Key export add cryptographic protection of their sensitive payloads.

However, normal LAN management currently uses HTTP on dynamically addressed local devices. Session and CSRF bearer values therefore cross the LAN in cleartext. An **active on-path LAN attacker** may be able to observe a valid session and interfere with management traffic. Source-IP binding and CSRF prevent many off-path attacks but do not provide end-to-end request integrity against an active MITM.

A proposed `BATMON-MGMT-WRITE-V2` hardening should require a management-key HMAC and monotonic per-session write counter over canonical semantic request fields for every privileged write. It must be implemented atomically across:

- embedded WebUI;
- Windows client;
- Android client;
- firmware verifier/replay state.

Do not disable Android cleartext globally before that transport/protocol decision; doing so would break current dynamic-IP LAN management.

## J. P0 security status

Source/build status:

- **P0-1 secure provisioning:** resolved in source/build; hardware/adversarial matrix pending.
- **P0-2 administrator security/recovery:** resolved in source/build; hardware/adversarial matrix pending; active-LAN request-integrity hardening remains as section I.
- **P0-3 monitoring identity / spoof resistance:** resolved in source/build; P0-3 protocol self-test green; real-network adversarial matrix pending.

The historical `battery-monitor/SECURITY_REVIEW_2026-09-07.md` predates most of these changes and is not live authority.

## K. Next hardware security gate

Before enabling Secure Boot, validate real encrypted devices through at minimum:

1. blank-device first install;
2. first-boot Release Flash Encryption activation;
3. encrypted NVS persistence through reboot/power interruption;
4. secure Wi-Fi provisioning and administrator recovery;
5. signed USB OTA in both OTA-slot directions;
6. Windows and ESP32 wrong/tampered signature rejection;
7. interrupted/timeout OTA retaining the old application;
8. 60-second probation success and deliberate candidate-failure rollback;
9. software downgrade rejection with an older legitimately signed image;
10. confirmation that plaintext UART flashing is not treated as post-encryption recovery;
11. P0-1/P0-2/P0-3 hostile-network tests;
12. normal monitoring, relay fail-safe, freshness checks, WebUI/SerialUI, and audit behavior while encrypted.

Only after this test gate should Secure Boot/eFuse production policy be activated.

**Important migration caveat:** post-boot rollback support is a bootloader feature. A blank unit installed with the current merged image gets the rollback-capable bootloader. An already encrypted device installed with an older bootloader cannot retrofit that bootloader through the current application-only signed OTA path.

## L. Manual signed-release workflow

`.github/workflows/battery-monitor-signed-release.yml` remains a manual `workflow_dispatch` production release gate. Do not dispatch it merely to create a green security badge.

It builds through the same `firmware/idf/build.sh` authority and enforces exact source SHA, authoritative version, signing-key fingerprint, RSA-PSS signing, independent verification, tamper rejection, wrong-key rejection, and Windows production verifier checks.

No production release was requested during this security-hardening session.

## M. Frozen expectations

Do not weaken or bypass established behavior, including relay safety/fail-safe behavior, sensor/state freshness checks, secure provisioning/recovery, paired monitoring identity, signed OTA/release policy, rollback/downgrade protections, WebUI/SerialUI administrator controls, lockout/challenge behavior, audit persistence/export, trust-root verification, or P0-3 protocol behavior.

## N. Read-first authorities

At the exact live branch head, read:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/idf/README.md`
4. `battery-monitor/firmware/idf/build.sh`
5. `battery-monitor/firmware/idf/main/idf_component.yml`
6. `battery-monitor/firmware/idf/sdkconfig.defaults`
7. `battery-monitor/firmware/idf/partitions.csv`
8. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
9. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
10. `.github/workflows/battery-monitor-ci.yml`
11. `.github/workflows/battery-monitor-signed-release.yml`
12. `battery-monitor/signing/firmware_signatures_v0_1_0.json`

Then resolve the latest applicable `Battery Monitor Toolchain` run before changing production source.

## O. Remote/local warning

This state is based on the GitHub remote branch. Any local checkout must fetch and compare against the live `battery-monitor-dev` remote head before further work.
