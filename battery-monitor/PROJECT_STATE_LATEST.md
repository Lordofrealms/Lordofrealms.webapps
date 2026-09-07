# Battery Monitor Project State

Date: 2026-09-07
Branch: `battery-monitor-dev`
Version: V0.1.0 prototype

## Hardware baseline

- ESP32-WROOM-32 development board, USB powered continuously.
- Battery ADC: P34 / GPIO34 / ADC1.
- Divider: 100 kΩ high side, 22 kΩ low side.
- No ADC capacitor initially; firmware uses trimmed multi-sample filtering.
- Common battery negative / ESP32 ground required.
- Automotive transient/load-dump front-end protection is not yet designed/qualified.

## Battery monitoring behavior

- 10 second default ADC sample interval, configurable 1–3600 seconds.
- Browser status refresh: 10 seconds.
- Lead acid default alerts: low 12.20 V, critical 11.90 V.
- 4S LiFePO4 default alerts: low 12.80 V, critical 12.00 V.
- Presets are alarm defaults, not precise SOC estimates.
- ADC calibration factor/offset are persistent and configurable.

## Secure provisioning — P0-1 resolved at source/build level

Controlling resolution:

`SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`

Validated product-source head:

`e4fa7fd5af46224e0c96fca1fe8090ba29dcee44`

Battery Monitor Toolchain run:

`34167794017` — **SUCCESS**

All three jobs passed:

- ESP32 firmware compile/image validation/artifact upload;
- Android Security-2 setup APK build/artifact upload;
- Windows .NET build + pinned Espressif Security-2 helper build/smoke-test + self-contained package/artifact upload.

Provisioning design:

- unique 16-character / 80-bit per-device setup code;
- QR is convenience only; manual setup code works on Android and Windows;
- temporary `BatteryMonitor-XXXXXX` SoftAP is WPA2 protected with a separately derived per-device key;
- application-layer provisioning uses Espressif Unified Provisioning Security 2: SRP6a + AES-GCM;
- ESP stores SRP salt/verifier, setup-code check hash, and derived SoftAP key; the root setup code is not exposed through a readback API;
- USB can verify a suspected code as MATCH / NO_MATCH with escalating cooldowns;
- an uninitialized device does not fall back to an open provisioning AP;
- old Android plaintext `/api/wifi` provisioning is retired.

Physical interoperability testing is still required before calling P0-1 field-validated.

## P0-2 LAN authentication — approved design, implementation pending

Controlling design authority:

`SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`

User-approved normal-management model:

- one user-facing **Device Password** per monitor for all non-factory administration;
- initial random secure-provisioning setup code becomes the initial Device Password;
- user may keep it or replace it with a new Device Password;
- same user password authorizes secure provisioning/re-provisioning, LAN management, normal configuration, calibration/threshold changes, and normal Wi-Fi changes;
- implementation derives separate domain-separated cryptographic keys/values for Security-2 provisioning, setup-SoftAP WPA2, LAN management, and USB password verification;
- normal LAN state-changing operations require challenge/response authentication rather than transmitting the Device Password as a normal HTTP parameter;
- intended LAN design uses fresh nonces/replay resistance and short-lived authenticated management sessions;
- browser state-changing requests require CSRF hardening and must not use GET;
- Windows may remember the Device Password using Windows-protected credential storage, never plaintext `devices.json`, logs, or command-line args;
- Android may remember it using encrypted application storage backed by Android Keystore;
- both apps provide **Forget Saved Password**, affecting only local storage;
- Device Password rotation must atomically regenerate all derived credentials and invalidate the old password only after the replacement credential set is safely committed;
- original printed factory/setup code is not a permanent backdoor after the user changes the Device Password.

Wi-Fi change/recovery design:

- if the unit is reachable, authenticated **Change Wi-Fi** tells it to enter the existing Security-2 provisioning flow; the new home password is not sent through a second plaintext LAN API;
- if the old LAN is unavailable, a physical provisioning-mode action re-enables the existing WPA2-protected `BatteryMonitor-XXXXXX` setup AP while preserving the Device Password;
- Windows/Android then use the same saved/entered Device Password to Security-2 provision replacement Wi-Fi;
- exact non-destructive button timing/gesture is still an implementation detail;
- destructive factory/reset behavior remains separate.

Factory/recovery functions use separate factory/admin authority, not the normal Device Password.

P0-2 is **not yet closed**. Implementation and hardware tests must cover authenticated device-side management, Windows/Android secure credential storage, browser session/CSRF behavior if web configuration remains enabled, password rotation, Wi-Fi recovery, replay attempts, expired sessions, wrong password behavior, and removal/locking of old unauthenticated state-changing endpoints.

## Windows client

- .NET 8 WinForms tray app.
- Multi-unit UDP discovery plus mDNS advertisement on devices.
- Stable device-ID tracking with DHCP address refresh.
- Local alias plus independent on-unit name.
- Configurable ESP sample interval and PC poll interval.
- Offline detection is elapsed-time based, not retry-count based.
- Default offline timeout: 5 minutes; editor supports seconds/minutes/hours.
- Failed contact shows `UNREACHABLE elapsed/timeout`; offline alert occurs only after timeout expires.
- Successful contact resets the timeout immediately and produces recovery notification if applicable.
- Low/critical audible + tray alerts.
- Configurable Start with Windows; `--startup` launches directly into tray.

### Windows setup paths

- **USB Setup** is a normal/default configuration path.
- USB can read/configure name, Wi-Fi, chemistry, thresholds, sample interval, and ADC calibration without reflashing.
- Existing Wi-Fi password is not readable over USB, so normal configuration preserves Wi-Fi unless the user explicitly selects Update Wi-Fi credentials.
- **Wireless Setup** accepts the same printed setup code/Device Password and performs Security-2 provisioning over the protected temporary SoftAP.
- Root setup code/Device Password and home Wi-Fi password are passed to the pinned helper through redirected stdin, never command-line arguments.
- Temporary Windows WLAN profiles are unique per attempt and removed in a `finally` path.

### Firmware functions

- **Update Firmware** is a normal top-level feature.
  - verifies the selected USB device is already running Battery Monitor firmware;
  - writes only the application partition;
  - preserves NVS/configuration/provisioning identity.
- **Factory Flash / Recovery** remains in the regular app under Advanced for now, per user decision.
  - destructive merged-image flash at `0x0`;
  - wipes configuration/NVS/provisioning identity;
  - admin password is only a UI/casual-use gate, not a cryptographic security boundary.
- Bundled Espressif esptool: v5.3.1.
- CI verifies esptool Windows archive SHA-256: `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3`.

## Android setup app

- Native Java, minSdk 31, compile/target SDK 36.
- QR scan or manual Device ID + setup code/Device Password.
- Espressif Security 2 provisioning over WPA2 SoftAP.
- Home Wi-Fi scan occurs through the ESP32 after secure-session establishment.
- Android currently configures Wi-Fi only; authenticated normal management is part of pending P0-2 implementation.
- App does not persist setup code or home Wi-Fi password in the current provisioning flow and clears those input fields after success.
- Future remembered Device Password storage must use Android Keystore-backed encrypted storage per P0-2 authority.

## Firmware signing authority — staged, not yet enforced

- RSA-3072 firmware signing keypair generated for future signed-release enforcement.
- Public key committed at:
  `battery-monitor/signing/battery_monitor_secureboot_rsa3072_public.pem`
- Public-key SHA-256 fingerprint (DER SPKI):
  `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`
- Encrypted private-key backup stored in ChatGPT Library under `/Battery Monitor Signing/`.
- Private key is not in GitHub or the Windows/Android apps.
- CI signing and Windows signature enforcement are **not yet active** because the signing credential still needs to be placed in a proper CI secret/signing environment.
- Planned sequence: signed release artifact -> Windows verification -> later ESP32 Secure Boot v2 for production hardware.
- Do not burn Secure Boot fuses on development devices yet.

### Mandatory production Secure Boot checkpoint

Before a production/release candidate is considered security-complete, **circle back to ESP32 Secure Boot v2**. This is an explicit production gate, not an optional cleanup item.

At that checkpoint:

1. verify actual ESP32-WROOM-32 chip revision compatibility;
2. prove signed firmware update/recovery on physical development hardware first;
3. maintain at least two independent encrypted private-key backups, including one outside ChatGPT Library;
4. document that loss of the signing private key after burning the Secure Boot trust eFuse can prevent future trusted firmware updates;
5. decide and document whether/when Secure Boot eFuses are burned on production units.

Host-side firmware signature checking is useful but is not a substitute for device-side Secure Boot enforcement.

## Remaining security priorities

1. **Implement P0-2** according to `SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`.
2. **P0-3:** authenticate Windows discovery/status identity so a hostile LAN host cannot impersonate a monitor or falsify battery state.
3. Physical security: NVS/Flash Encryption, Secure Boot, ROM-download policy for production mode.
4. Move from Arduino-ESP32 3.3.11 or incorporate the upstream WebServer slow-header hardening.
5. Finish firmware release signing/verification plumbing.
6. Android release signing, Windows code signing, and CI supply-chain hardening.

## Next physical validation

1. Initialize a real ESP32 over USB with a Device Password/setup code and device configuration.
2. Verify USB password MATCH / NO_MATCH behavior and cooldown.
3. Verify Android QR provisioning and manual-password provisioning.
4. Verify Windows wireless provisioning with the same Device Password.
5. Verify wrong-password and wrong-home-password behavior and recovery/re-provisioning.
6. Confirm Windows temporary WLAN profile cleanup after success and failure.
7. After P0-2 implementation, test remembered-password behavior, password rotation, authenticated LAN management, replay/session expiry, browser CSRF behavior, and physical non-destructive Wi-Fi recovery.
8. Verify LAN auto-discovery, normal monitoring, tray alerts, elapsed offline timeout, and Start with Windows.
9. Compare ADC reading against a trusted multimeter at several input voltages and set calibration.
10. Vehicle-test ADC jitter/Wi-Fi range before deciding whether to add the optional 0.1 µF P34-to-GND capacitor or further analog front-end protection.
