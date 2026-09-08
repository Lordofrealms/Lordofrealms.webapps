# Battery Monitor Project State

Date: 2026-09-08
Branch: `battery-monitor-dev`
Version: V0.1.0 prototype

## Current validated product-source checkpoint

P0-2 source/build validated head:

`ca7aa75af8b11b182558f48170778b9d2d94f042`

Battery Monitor Toolchain:

`34173594292` — run #85 — **SUCCESS**

At that exact source head all three product jobs passed:

- ESP32 Arduino firmware compile/image validation/artifact upload;
- Android APK build/artifact upload;
- Windows .NET 8 build, pinned Security-2 helper build/smoke test, self-contained publish, bundle, and artifact upload.

The current branch may be ahead of that SHA for documentation-only commits. Re-resolve the live branch before doing more work.

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

## P0-1 secure provisioning — source/build resolved

Controlling resolution:

`SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`

Core posture:

- protected per-device WPA2 `BatteryMonitor-XXXXXX` setup network;
- Espressif Unified Provisioning Security 2 using SRP6a + AES-GCM;
- initial random 16-character / 80-bit per-device code;
- QR is convenience only; manual entry works;
- uninitialized units never expose an open provisioning AP;
- old Android plaintext home-Wi-Fi provisioning path is retired;
- Windows helper receives secrets over redirected stdin rather than command-line arguments.

P0-1 still requires physical interoperability testing before field closure.

## P0-2 LAN authentication — source/build resolved, hardware validation pending

Controlling implementation resolution:

`SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Original design authority:

`SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`

### Device Password authority

- One user-facing **Device Password** protects normal non-factory administration.
- The original generated provisioning code is the initial Device Password.
- User may keep it or replace it.
- Custom passwords are exact and case-sensitive.
- **Weak passwords are allowed by user choice.** Windows/Android warn and require explicit confirmation, but do not impose a strength floor.
- Firmware hard-validates only: non-empty, <=128 UTF-8 bytes, and no control characters.
- The original printed code is not intended to remain a backdoor after rotation.

### LAN management

- Device Password is not sent as an ordinary LAN HTTP parameter.
- Client obtains a fresh one-time 60-second challenge.
- Client proves possession with HMAC-SHA-256 using a domain-separated management key.
- Successful proof creates a random 15-minute management session plus CSRF token.
- Sessions are source-IP bound and refreshed by authenticated writes.
- Wrong authentication attempts receive escalating cooldowns.
- Browser state-changing requests require both session and `X-Batmon-CSRF`; session cookie is `HttpOnly; SameSite=Strict`.

State-changing routes:

- `POST /api/config` — authenticated;
- `POST /api/password` — authenticated encrypted password rotation;
- `POST /api/wifi/provisioning` — authenticated transition into Security-2 setup;
- legacy `POST /api/reset-wifi` — authenticated alias for secure provisioning;
- legacy plaintext `POST /api/wifi` — retired, HTTP 410.

Read-only status/configuration remains unauthenticated pending the separate P0-3 identity/authenticity work.

### Password rotation

- Replacement password is encrypted client-side with AES-256-GCM under a session-derived wrapping key.
- ESP regenerates Security-2 SRP salt/verifier, setup-AP key, password check material, and management authority.
- Complete credential set is persisted in a versioned v2 NVS blob.
- Successful rotation invalidates existing management sessions.
- v2 credential presence is authoritative/fail-closed; corrupted v2 data does not fall back to old split credential fields.
- After successful v2 commit, old split `user/apkey/codehash/salt/verifier` keys are retired.

### Wi-Fi recovery

- Reachable unit: authenticated **Change Wi-Fi** enters existing Security-2 provisioning.
- Unreachable old LAN: 5-second BOOT hold enters secure provisioning without clearing Device Password or normal settings.
- New home-Wi-Fi credentials continue to travel through Security 2, not a second plaintext LAN API.
- Destructive factory/reset functions remain separate.

### Security boundary not claimed by P0-2

P0-2 authorizes writes and protects the Device Password from ordinary LAN parameter transmission. It does not make unauthenticated discovery/status trustworthy and it does not turn HTTP into authenticated TLS. P0-3 and later hostile-LAN/transport hardening remain separate.

## Windows client

- .NET 8 WinForms tray app.
- Multi-unit UDP discovery plus mDNS device advertisements.
- Stable device-ID tracking with DHCP address refresh.
- Local alias plus independent on-unit name.
- Configurable ESP sample interval, PC poll interval, and elapsed offline timeout.
- Default offline timeout: 5 minutes; supports seconds/minutes/hours.
- `UNREACHABLE elapsed/timeout` during grace period; `OFFLINE` only after elapsed timeout expires.
- Successful response resets contact-loss timer immediately.
- Low/critical audible + tray alerts.
- Configurable Start with Windows; `--startup` launches directly to tray.

### Windows P0-2 behavior

- Authenticated configuration writes.
- Authenticated **Change Wi-Fi**.
- Device Password rotation.
- Optional remembered Device Password stored separately using Windows DPAPI, not plaintext `devices.json`.
- **Forget Saved Password** removes only the local remembered credential.
- Weak-password warning is advisory with explicit override.

### USB Setup

Normal/default configuration path; not merged into firmware flashing.

USB can configure:

- unit name;
- Wi-Fi when explicitly selected;
- chemistry/thresholds;
- sample interval;
- ADC calibration;
- Device Password verification/rotation.

Existing Wi-Fi password is not read back; maintenance preserves Wi-Fi unless explicitly changed.

### Firmware functions

- **Update Firmware** remains a normal top-level function and writes only the application partition, preserving NVS/settings/identity.
- **Factory Flash / Recovery** remains under Advanced and is destructive.
- Advanced admin password is a UI/casual-use gate only, not a cryptographic boundary.
- Bundled Espressif esptool: v5.3.1.
- CI-pinned official Windows archive SHA-256: `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3`.

## Android app

- Native Java, minSdk 31, compile/target SDK 36.
- QR or manual Device ID + Device Password secure Wi-Fi setup.
- Espressif Security 2 over protected WPA2 SoftAP.
- LAN management dialog supports authenticated settings, password rotation, and Change Wi-Fi.
- Optional remembered Device Password is AES-GCM encrypted with key material held in Android Keystore.
- **Forget Saved Device Password** removes only local remembered credential.
- Weak-password warning is advisory with explicit override.
- Home Wi-Fi password is not persistently stored by the app.

## Firmware signing — staged, not yet enforced

- RSA-3072 public key: `signing/battery_monitor_secureboot_rsa3072_public.pem`
- DER-SPKI SHA-256 fingerprint: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`
- encrypted private-key backup is stored outside GitHub in ChatGPT Library under `/Battery Monitor Signing/`.
- CI signing and Windows signature enforcement are not yet active.
- Do not burn Secure Boot eFuses on development boards.

### Mandatory production Secure Boot checkpoint

Before a production/release candidate is considered security-complete:

1. verify exact ESP32-WROOM-32 revision compatibility with intended Secure Boot v2 mode;
2. prove signed update/recovery on physical development hardware;
3. maintain at least two independent encrypted signing-key backups, at least one outside ChatGPT Library;
4. document recovery consequences of signing-key loss;
5. only then decide whether to burn production Secure Boot eFuses.

## Remaining security priorities

1. **P0-3:** authenticate discovery/status identity so hostile LAN devices cannot impersonate a monitor or falsify battery state.
2. Complete P0-1/P0-2 real-hardware interoperability and adversarial validation.
3. Physical security: NVS/Flash Encryption, Secure Boot, ROM-download policy for production mode.
4. Move from Arduino-ESP32 3.3.11 or incorporate the upstream WebServer slow-header fix before hostile-LAN deployment.
5. Finish firmware release signing/verification plumbing.
6. Android release signing, Windows code signing, and CI supply-chain hardening.
7. Revisit whether authenticated TLS/device certificates are appropriate for stronger LAN transport confidentiality/identity.

## Next physical validation

1. Initialize a real ESP32 over USB with a Device Password and normal configuration.
2. Verify USB MATCH / NO_MATCH and cooldown behavior.
3. Verify Android and Windows Security-2 provisioning with the same Device Password.
4. Verify wrong Device Password and wrong home-Wi-Fi password behavior.
5. Verify browser correct-password unlock, wrong password, CSRF rejection, logout, session expiry, and replay rejection.
6. Rotate Device Password; verify new password works and old/original password fails over LAN, Security 2, and USB verification.
7. Verify Windows DPAPI remember/forget across restart.
8. Verify Android Keystore remember/forget across restart.
9. Verify authenticated Change Wi-Fi and 5-second BOOT recovery provisioning.
10. Power-cycle through normal credential persistence; fault-test interruption around password rotation.
11. Verify monitoring/discovery/tray/offline/startup behavior.
12. Calibrate ADC against a trusted multimeter at several voltages.
13. Vehicle-test ADC jitter/Wi-Fi range and decide on optional ADC capacitor / automotive transient front end.
