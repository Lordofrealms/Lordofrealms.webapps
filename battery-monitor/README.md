# Battery Monitor

Local-first ESP32 battery monitoring toolchain for 12 V lead-acid and 4S LiFePO4 batteries.

> **Current authority:** read `PROJECT_HANDOFF_LATEST.md` and `PROJECT_STATE_LATEST.md` at the live `battery-monitor-dev` head before changing production source. This README is an overview, not a substitute for those exact-state records.

## Hardware

- ESP32-WROOM-32 development board, continuously USB powered.
- Battery measurement on **P34 / GPIO34**.
- Divider: **100 kΩ** from battery+ to P34 and **22 kΩ** from P34 to ground.
- Common battery negative / ESP32 ground required.
- No ADC capacitor in the initial build; firmware performs trimmed multi-sample filtering first.
- Production/permanent vehicle use still needs a qualified automotive transient/load-dump front end.

```text
Battery + ---- 100 kΩ ----+---- P34 / GPIO34
                           |
                          22 kΩ
                           |
Battery - -----------------+---- ESP32 GND
```

Divider multiplier: `(100k + 22k) / 22k = 5.5454545`.

## Monitoring

- ESP32 sample interval: 10 seconds default, configurable 1–3600 seconds.
- Browser status refresh: 10 seconds.
- ADC calibration factor + offset are persistent/configurable.
- Lead-acid defaults: low 12.20 V, critical 11.90 V.
- 4S LiFePO4 defaults: low 12.80 V, critical 12.00 V.
- These are alarm presets, not exact state-of-charge estimates.

## Production firmware architecture

Battery Monitor has one production firmware architecture:

- ESP-IDF **5.5.5**, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32 target;
- Arduino-ESP32 stable base **3.3.11**;
- exact Arduino source pinned to upstream Git commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- that source includes Espressif's merged WebServer hardening PR #12794;
- authoritative build entrypoint: `firmware/idf/build.sh`;
- sole runtime behavior implementation: the existing Arduino-style source under `firmware/BatteryMonitor/`.

The retired Arduino-ESP32 3.3.7 pin must not be restored: versions through 3.3.7 include a critical multipart-boundary WebServer parser defect fixed in 3.3.8. The current immutable upstream source also includes the later PR #12794 request/parser hardening.

There is no production PlatformIO path and no second production firmware runtime.

## Secure setup

The original open-AP/plaintext provisioning prototype is retired.

Each initialized monitor has a Device Password. The original generated **16-character / 80-bit setup code** is the initial Device Password and may later be replaced by the user.

Wireless setup uses two independent layers:

1. temporary `BatteryMonitor-XXXXXX` WPA2 SoftAP with a per-device key derived from Device ID + Device Password;
2. Espressif Unified Provisioning **Security 2** using SRP6a authentication and AES-GCM protected provisioning traffic.

The home Wi-Fi password is sent only inside the authenticated Security-2 session. A configured monitor does not automatically expose provisioning merely because the home Wi-Fi network becomes unavailable; secure recovery provisioning requires the approved physical-presence flow.

See `SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md` and the P0-2 authority files for current Device Password behavior.

## LAN management and monitor identity

### P0-2 — management authentication

P0-2 is **source/build resolved; real-hardware validation remains**.

State-changing LAN management uses Device Password challenge/response authentication, a short-lived IP-bound management session, and a separate CSRF token. The plaintext legacy Wi-Fi POST path is retired. Windows and Android can remember Device Passwords using their platform-protected stores.

See `SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`.

### P0-3 — authenticated monitor identity/status

P0-3 is **source/build resolved; real-hardware / hostile-LAN validation remains**.

Each physical monitor has a separate random 256-bit Monitoring Identity Key. Windows stores trusted keys using DPAPI and requires authenticated HMAC-based discovery/status responses with fresh nonces before trusting a known monitor's address or battery reading. Unauthenticated discovery can expose an unpaired candidate but is not accepted as trusted identity.

The Windows `--protocol-self-test` validates the core P0-3 cryptographic framing in CI.

See `SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`.

## Flash and NVS encryption

The current production ESP-IDF configuration enables:

- **Flash Encryption in Release mode**;
- **NVS Encryption**, with NVS XTS keys protected by Flash Encryption;
- encrypted `nvs_keys` partition at `0x294000`, size `0x1000`;
- partition table at `0xF000`;
- `app0` at `0x10000` and `app1` at `0x150000`.

**Secure Boot is intentionally disabled until the encrypted-device hardware-validation gate is completed.** Do not enable/burn Secure Boot as incidental cleanup.

## Firmware installation and update

The two firmware images have intentionally different roles.

### Normal firmware update — signed USB OTA

`BatteryMonitor.ino.bin` is the application update payload.

Normal post-encryption updates use **`SIGNED_USB_OTA_V1`**:

1. Windows verifies the production RSA-3072-PSS-SHA256 detached signature before transfer.
2. Windows sends the image to the already-running monitor over trusted physical USB.
3. Firmware writes the inactive OTA slot with `esp_ota_write()`; ESP-IDF encrypts the flash write using that device's Flash Encryption key.
4. The ESP32 independently verifies the received image/hash and the same production signature using its compiled trust root.
5. Only after validation succeeds is the new partition selected for boot.

Existing encrypted NVS/settings are not overwritten by the normal update path.

### Blank ESP32 first install

`BatteryMonitor.ino.merged.bin` is a deterministic 4 MiB **blank, unencrypted ESP32 first-install image only**.

The Windows Advanced Tools entry is labeled **Blank ESP32 First Install**. It verifies the production signature and invokes bundled esptool without `--force`.

The merged image is **not a recovery image after Flash Encryption has activated**. Do not use plaintext `esptool write-flash` as the normal update/recovery path on an encrypted unit, and do not bypass esptool's encrypted-device protection with `--force`.

## Firmware signing and trust root

Production firmware uses RSA-3072-PSS-SHA256 detached signatures.

- public key: `signing/battery_monitor_secureboot_rsa3072_public.pem`;
- public-key DER-SPKI SHA-256 fingerprint: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- Windows verifies release images before transfer/first install;
- the ESP32 independently verifies signed USB OTA images before selecting them for boot;
- ordinary firmware CI verifies that the repository public key and the public key compiled into `FirmwareUpdate.ino` both match the expected production fingerprint.

`.github/workflows/battery-monitor-signed-release.yml` is the manual production signing gate. It builds through the same `firmware/idf/build.sh` authority, validates the production signing-key fingerprint, signs both release images, independently verifies them, exercises tampered/wrong-key rejection, and validates the production Windows verifier. It is run for an actual production release, not merely to produce a green development badge.

## Windows client

Project: `windows/BatteryMonitor.Client`

.NET 8 WinForms tray application with:

- automatic multi-unit LAN discovery;
- authenticated pairing/trust for monitor identity;
- local aliases plus independent names stored on devices;
- configurable poll interval and elapsed offline timeout;
- immediate unreachable state followed by configured offline alerting;
- low/critical battery audio + tray alerts;
- authenticated configuration and Change Wi-Fi operations;
- normal signed USB firmware update;
- advanced signed blank-device first install;
- configurable Start with Windows;
- Open Web Page and configuration actions.

### USB setup

USB configuration is a normal/default setup path and does not require Wi-Fi. It can manage device configuration, Wi-Fi credentials when explicitly selected, battery chemistry/thresholds, ADC calibration, Device Password setup/recovery, and trusted monitor pairing.

### Wireless setup on Windows

The Windows app can use the Device Password without USB:

1. derive the protected temporary-AP key;
2. join `BatteryMonitor-XXXXXX` through a unique temporary Windows WLAN profile;
3. run the bundled pinned Espressif Security-2 provisioner helper;
4. pass credentials to that helper through redirected stdin rather than process arguments;
5. delete the temporary WLAN profile during cleanup whether provisioning succeeds or fails.

## Android secure setup

Project: `android`

Native Java Android app, API 31+.

The Android flow uses the same protected temporary WPA2 setup network plus Espressif Security 2. It supports secure Wi-Fi provisioning and authenticated LAN management/password operations. Remembered Device Password material is protected using Android Keystore-backed encryption; the home Wi-Fi password is not persistently stored by the setup flow.

## USB serial protocol

UART0/USB serial uses 115200 baud and a line-oriented `BATMON1` protocol. Ordinary debug output can coexist; host software only treats `BATMON1 ` lines as machine responses.

See `PROTOCOL.md`.

## Current validated checkpoint

Latest fully green product-source authority at the time of this README update:

- source: `68926765874db20db034edef46ef3694a340c871` — `Pin upstream hardened Arduino WebServer`;
- Battery Monitor Toolchain run **#139**;
- run ID `34190803829`;
- result: **SUCCESS**.

That run passed ESP32 firmware, Android, Windows, exact firmware handoff, pinned esptool/Security-2 helper, **P0-3 protocol self-test**, Windows publish/bundle, and artifact upload. Its firmware artifact was inspected and confirmed the exact hardened Arduino Git source plus Flash/NVS Encryption and signed USB OTA build authority.

Later documentation/workflow/UI wording commits may move the live branch head; always resolve the live branch and latest applicable Toolchain run before treating a newer source head as validated.

## Next validation gate

Before Secure Boot activation or field closure, perform real encrypted-device tests covering at minimum:

- blank-device first install and first encrypted boot;
- encrypted NVS persistence;
- signed USB OTA success, interruption, replay/tamper/wrong-signature rejection, and repeated slot switching;
- normal monitoring and relay fail-safe behavior on encrypted hardware;
- P0-2 authenticated administration across Windows/Android/browser;
- P0-3 hostile-LAN impersonation/replay/address-change tests;
- physical Change Wi-Fi / recovery provisioning flows.

## Development state

Read these first at the exact live branch head:

1. `PROJECT_HANDOFF_LATEST.md`
2. `PROJECT_STATE_LATEST.md`
3. `firmware/idf/README.md`
4. `firmware/idf/build.sh`
5. `SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`
6. `SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

`SECURITY_REVIEW_2026-09-07.md` is a historical point-in-time audit and contains findings that were subsequently addressed or superseded. Do not treat it as current live authority without checking the newer resolution/state files.
