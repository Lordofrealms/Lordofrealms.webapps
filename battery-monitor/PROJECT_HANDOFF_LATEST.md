# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

**FIRST resolve the live `battery-monitor-dev` branch head. Do not assume the SHA in this handoff is still current.**

At secure-provisioning closure the validated product-source head was:

`e4fa7fd5af46224e0c96fca1fe8090ba29dcee44`

Battery Monitor Toolchain run:

`34167794017` — **SUCCESS** across ESP32, Android, and Windows.

Read, at the live ref, in this order:

1. `battery-monitor/SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`
2. `battery-monitor/SECURITY_REVIEW_2026-09-07.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `battery-monitor/README.md`
5. `battery-monitor/PROTOCOL.md`
6. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
7. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
8. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
9. `battery-monitor/windows/BatteryMonitor.Client/`
10. `battery-monitor/android/`
11. `.github/workflows/battery-monitor-ci.yml`

## Current architecture

- ESP32-WROOM-32, GPIO34/P34 ADC, 100k/22k divider.
- USB-powered always-on local battery monitor.
- No ADC capacitor by default; trimmed multi-sample filtering first.
- Windows .NET 8 WinForms tray client for multiple units.
- USB Setup is a normal/default configuration path.
- Windows and Android both support secure wireless setup using the same printed per-device setup code.
- No cloud/Firebase/user-account dependency in V0.1.

## P0-1 SECURE PROVISIONING — SOURCE/BUILD CLOSED

Do **not** revert to the old open-SoftAP/plaintext `/api/wifi` design.

Current authority:

- unique per-device 16-character / 80-bit Crockford-style setup code;
- QR is convenience only; manual code works on both Windows and Android;
- temporary `BatteryMonitor-XXXXXX` AP is WPA2 protected using a separately derived per-device key;
- Espressif Unified Provisioning Security 2 (SRP6a + AES-GCM) protects/authenticates home-Wi-Fi provisioning;
- ESP stores SRP salt/verifier, setup-code check hash, and derived SoftAP key rather than exposing a plaintext setup-code readback;
- USB provides setup-code MATCH / NO_MATCH only, with escalating cooldowns for wrong guesses;
- an uninitialized unit does not substitute an open AP; USB admin initialization is required;
- Android secure setup no longer POSTs the home Wi-Fi password to the old application HTTP endpoint;
- Windows wireless setup sends root setup code/home password to the pinned provisioner helper over redirected stdin, not command-line args;
- Windows temporary WLAN profile contains only the derived AP key and is removed in a `finally` path.

P0-1 still needs real-hardware interoperability testing before being called field-validated.

## NEXT SECURITY ITEM — P0-2

The next vulnerability to decide/fix is **unauthenticated LAN management**.

Current state-changing LAN endpoints include configuration/Wi-Fi/reset operations without authorization. A hostile LAN client could alter ADC calibration or thresholds, rename/reconfigure the unit, or remove it from Wi-Fi. This can directly falsify/suppress the intended battery-warning function.

Do not conflate P0-2 with P0-3. Handle one at a time with the user.

P0-3 remains separate: Windows discovery/status identity is unauthenticated/spoofable and must eventually be cryptographically paired/authenticated before battery readings are treated as hostile-LAN trustworthy.

## Windows behavior authority

- Offline detection is elapsed-time based, never retry-count based.
- Default timeout 300 seconds / 5 minutes; editor supports seconds/minutes/hours.
- `UNREACHABLE elapsed/timeout` during grace period; `OFFLINE` alert only after elapsed timeout expires.
- successful response resets contact-loss timer immediately.
- Start with Windows is configurable; startup launches use `--startup` and go directly to tray.

### USB Setup

Normal/default configuration only; do not merge it back into a Flash + Configure workflow.

USB can read/configure:

- on-unit name;
- Wi-Fi SSID/password when explicitly selected;
- battery chemistry and thresholds;
- sample interval;
- ADC calibration.

The existing Wi-Fi password cannot be read back, so USB maintenance must preserve Wi-Fi unless the user explicitly chooses **Update Wi-Fi credentials**.

### Firmware functions

User decision:

- **Update Firmware** is a normal top-level feature and should preserve settings/provisioning identity by writing only the application partition.
- **Factory Flash / Recovery** is destructive and remains inside the regular app under Advanced **for now**. Do not compile it out unless the user changes that decision.
- The Advanced admin password is a UI/casual-use gate only, not a cryptographic security boundary.

Bundled esptool authority:

- Espressif esptool v5.3.1;
- official Windows archive SHA-256 pinned to `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3`.

## Firmware signing — staged, not active

User approved signed firmware releases and eventual Secure Boot.

- RSA-3072 public key: `battery-monitor/signing/battery_monitor_secureboot_rsa3072_public.pem`
- public-key SHA-256 fingerprint (DER SPKI): `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`
- encrypted private-key backup is stored in ChatGPT Library under `/Battery Monitor Signing/`.
- private key is not in GitHub/app binaries.
- CI signing and Windows signature enforcement are **not yet enabled**; GitHub Actions still needs a real secret/signing credential path.
- desired order: CI/release signing -> Windows rejects unsigned/invalid firmware -> later production ESP32 Secure Boot v2.
- do **not** burn Secure Boot fuses on development boards yet.

## Remaining security items after P0-2/P0-3

- Physical NVS/flash extraction and hostile physical reflashing: evaluate NVS encryption, Flash Encryption, Secure Boot, ROM-download restrictions for production mode.
- Arduino-ESP32 3.3.11 WebServer has a post-release slow-header DoS issue; move to a fixed core or incorporate the fix before product deployment.
- Browser CSRF/state-changing request hardening after LAN authentication is designed.
- Release signing/verification, Android release signing, Windows code signing, and CI supply-chain hardening.

## Physical validation queue

1. Initialize a real ESP32 over USB with a setup code.
2. Verify USB setup-code MATCH/NO_MATCH + cooldown.
3. Verify Android QR and manual-code Security-2 provisioning.
4. Verify Windows wireless Security-2 provisioning with the same code.
5. Test wrong setup code, wrong home password, re-provisioning, and Windows temporary-profile cleanup.
6. Verify monitoring/discovery/tray/offline/startup behavior.
7. Calibrate ADC against a trusted multimeter at multiple voltages.
8. Vehicle-test ADC jitter/Wi-Fi range and then decide on optional 0.1 µF ADC capacitor / automotive transient front end.
