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
- **Wireless Setup** accepts the same printed setup code and performs Security-2 provisioning over the protected temporary SoftAP.
- Root setup code and home Wi-Fi password are passed to the pinned helper through redirected stdin, never command-line arguments.
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
- QR scan or manual Device ID + setup code.
- Espressif Security 2 provisioning over WPA2 SoftAP.
- Home Wi-Fi scan occurs through the ESP32 after secure-session establishment.
- Android currently configures Wi-Fi only; battery/name/threshold/calibration management remains USB-side until LAN management authentication (P0-2) is resolved.
- App does not persist setup code or home Wi-Fi password and clears those input fields after success.

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

1. **P0-2:** authenticate/authorize state-changing LAN management endpoints; until then treat LAN configuration as untrusted.
2. **P0-3:** authenticate Windows discovery/status identity so a hostile LAN host cannot impersonate a monitor or falsify battery state.
3. Physical security: NVS/Flash Encryption, Secure Boot, ROM-download policy for production mode.
4. Move from Arduino-ESP32 3.3.11 or incorporate the upstream WebServer slow-header hardening.
5. CSRF/browser hardening after LAN authentication design is chosen.
6. Finish firmware release signing/verification plumbing.

## Next physical validation

1. Initialize a real ESP32 over USB with a setup code and device configuration.
2. Verify USB setup-code MATCH / NO_MATCH behavior and cooldown.
3. Verify Android QR provisioning and manual-code provisioning.
4. Verify Windows wireless provisioning with the same code.
5. Verify wrong-code and wrong-home-password behavior and recovery/re-provisioning.
6. Confirm Windows temporary WLAN profile cleanup after success and failure.
7. Verify LAN auto-discovery, normal monitoring, tray alerts, elapsed offline timeout, and Start with Windows.
8. Compare ADC reading against a trusted multimeter at several input voltages and set calibration.
9. Vehicle-test ADC jitter/Wi-Fi range before deciding whether to add the optional 0.1 µF P34-to-GND capacitor or further analog front-end protection.
