# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

**FIRST resolve the live `battery-monitor-dev` branch head. Do not assume the SHA in this handoff is still current.**

## Latest validated product-source checkpoint

P0-2 source/build validated source head:

`ca7aa75af8b11b182558f48170778b9d2d94f042`

Battery Monitor Toolchain:

`34173594292` — run #85 — **SUCCESS**

At that exact source head:

- ESP32 firmware compiled, expected images were verified, and firmware artifacts uploaded;
- Android APK built and uploaded;
- Windows .NET 8 client built, pinned Espressif Security-2 helper built/smoke-tested, self-contained package published/bundled, and artifact uploaded.

The live branch is expected to be ahead of `ca7aa75...` because the P0-2 resolution/state/handoff documentation was updated afterward. Treat `ca7aa75...` as the validated product-source SHA, not necessarily the live documentation head.

## Read at the LIVE branch ref, in this order

1. `battery-monitor/SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`
4. `battery-monitor/SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`
5. `battery-monitor/SECURITY_REVIEW_2026-09-07.md`
6. `battery-monitor/PROTOCOL.md`
7. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
8. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
9. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
10. `battery-monitor/firmware/BatteryMonitor/YManagementAuthPrototypes.ino`
11. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
12. `battery-monitor/windows/BatteryMonitor.Client/`
13. `battery-monitor/windows/esp_provision_helper.py`
14. `battery-monitor/android/`
15. `.github/workflows/battery-monitor-ci.yml`

## Current architecture

- ESP32-WROOM-32.
- GPIO34/P34 battery ADC, 100k/22k divider.
- USB-powered always-on local battery monitor.
- No ADC capacitor by default; trimmed multi-sample filtering first.
- Windows .NET 8 WinForms tray client for multiple units.
- Native Android setup/management app.
- USB Setup remains a normal/default configuration path.
- Secure wireless setup uses a protected `BatteryMonitor-XXXXXX` WPA2 SoftAP plus Espressif Unified Provisioning Security 2 (SRP6a + AES-GCM).
- No cloud/Firebase/user-account dependency in V0.1.

# P0-1 SECURE PROVISIONING — SOURCE/BUILD RESOLVED

Do **not** revert to an open setup AP or plaintext home-Wi-Fi POST flow.

Current posture:

- unique initial 16-character / 80-bit per-device credential;
- QR is convenience only; manual entry supported;
- protected per-device WPA2 setup AP;
- Security 2 protects/authenticates home-Wi-Fi provisioning;
- root password is not exposed by a readback API;
- Windows secrets go to the pinned helper through redirected stdin, not command-line args;
- old plaintext Android `/api/wifi` provisioning is retired.

P0-1 still needs real-hardware interoperability testing before field closure.

# P0-2 LAN AUTHENTICATION — SOURCE/BUILD RESOLVED, HARDWARE VALIDATION PENDING

Controlling implementation resolution:

`battery-monitor/SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Do not redesign P0-2 from scratch unless the user changes the authority.

## User Device Password decision — IMPORTANT

There is one user-facing **Device Password** per monitor for normal non-factory administration.

- Initial generated 16-character / 80-bit provisioning code is the initial Device Password.
- User can keep it or replace it.
- Custom passwords are exact and case-sensitive.
- **A weak password is allowed.** Warn the user and require explicit confirmation, then allow it.
- Do **not** impose a password-strength floor.
- Firmware only rejects empty passwords, >128 UTF-8 bytes, and control characters.
- Windows/Android weak-password checks are advisory only.

## P0-2 implemented behavior

- challenge/response LAN management auth using a domain-separated Device Password-derived key;
- HMAC-SHA-256 proof over one-time challenge ID + 128-bit nonce;
- 60-second, single-use challenges;
- 15-minute random management sessions bound to source IP;
- escalating cooldowns after repeated bad proofs;
- separate CSRF token required for state-changing browser/API requests;
- browser cookie uses `HttpOnly; SameSite=Strict`;
- `POST /api/config` requires management session + CSRF;
- `POST /api/password` requires auth and carries replacement password in an AES-256-GCM envelope under a session-derived wrapping key;
- `POST /api/wifi/provisioning` requires auth and enters existing Security-2 provisioning;
- legacy `POST /api/reset-wifi` is an authenticated alias for secure provisioning;
- legacy plaintext `POST /api/wifi` is retired and returns HTTP 410;
- Windows can remember Device Password with DPAPI, outside plaintext `devices.json`;
- Android can remember Device Password encrypted with a key held by Android Keystore;
- both clients provide **Forget Saved Password** without changing the ESP32 password;
- BOOT hold of 5 seconds enters secure provisioning without clearing Device Password or normal settings.

## Password rotation authority

The complete current credential set is stored as a versioned v2 NVS blob containing current SRP material, setup-AP key, and password verification material.

After successful v2 credential commit:

- legacy split `user/apkey/codehash/salt/verifier` keys are removed;
- v2 presence is authoritative;
- if the v2 blob exists but is invalid, `loadDeviceCredentialIdentity()` fails closed instead of falling back to the old credential fields;
- management sessions are invalidated;
- old/original Device Password must no longer work.

## P0-2 boundary

Do **not** call P0-2 field-validated yet.

P0-2 currently protects normal write authorization and avoids sending the Device Password as a normal LAN parameter. It does not make unauthenticated discovery/status trustworthy, and ordinary local HTTP is not authenticated TLS.

P0-3 remains separate and open for device/status identity authenticity.

# P0-3 — NEXT MAJOR SECURITY DESIGN ITEM

Current UDP discovery/status identity remains spoofable on a hostile LAN. Do not treat device ID/MAC-derived naming as authentication.

Future P0-3 should address at least:

- discovery reply source binding;
- pairing/trust of monitor identity;
- status response identity/authentication;
- redirect hardening;
- hostile-LAN attempts to impersonate an existing `BM-XXXXXX` monitor or feed false battery state.

The Device Password may be a root for a separately domain-separated P0-3 key, but that decision should be explicitly designed rather than assumed.

# Windows behavior authority

- Offline detection is elapsed-time based, never retry-count based.
- Default timeout is 300 seconds / 5 minutes; editor supports seconds/minutes/hours.
- `UNREACHABLE elapsed/timeout` during grace period; `OFFLINE` only after elapsed timeout.
- Successful contact resets loss timer immediately.
- Start with Windows remains configurable; startup uses `--startup` and goes directly to tray.

## USB Setup

Normal/default configuration path. Do not merge back into a Flash + Configure workflow.

USB can configure name, explicit Wi-Fi changes, chemistry/thresholds, sample interval, ADC calibration, and Device Password verification/rotation.

The existing Wi-Fi password cannot be read back, so USB maintenance preserves Wi-Fi unless the user explicitly chooses to update it.

## Firmware functions

- **Update Firmware** remains a normal top-level feature and writes only the application partition, preserving settings/NVS/identity.
- **Factory Flash / Recovery** remains destructive under Advanced for now.
- Advanced admin password is a UI/casual-use gate only, not a hard cryptographic boundary.

Bundled esptool authority:

- Espressif esptool v5.3.1;
- official Windows archive SHA-256: `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3`.

# Firmware signing — STAGED, NOT ACTIVE

- RSA-3072 public key: `battery-monitor/signing/battery_monitor_secureboot_rsa3072_public.pem`
- DER-SPKI SHA-256 fingerprint: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`
- encrypted private-key backup is outside GitHub in ChatGPT Library under `/Battery Monitor Signing/`.
- CI signing and Windows signature enforcement are not yet enabled.
- Do not burn Secure Boot eFuses on development boards yet.

## Mandatory production reminder — circle back to Secure Boot

Before a production/release candidate is security-complete:

1. verify exact ESP32-WROOM-32 revision compatibility;
2. prove signed firmware update/recovery on physical development hardware;
3. maintain at least two independent encrypted signing-key backups, at least one outside ChatGPT Library;
4. document recovery consequences of signing-key loss;
5. only then decide whether to burn Secure Boot v2 eFuses on production units.

Host-side signature checking is not a substitute for device-side Secure Boot enforcement.

# Known remaining hardening

- P0-3 discovery/status identity authenticity.
- Physical NVS/flash extraction and hostile reflashing: NVS encryption, Flash Encryption, Secure Boot, ROM-download policy.
- Arduino-ESP32 3.3.11 WebServer slow-header DoS issue: update to a fixed core or carry the fix before hostile-LAN deployment.
- Decide whether authenticated TLS/device certificates are appropriate for stronger LAN transport confidentiality/identity.
- Firmware release signing/verification, Android release signing, Windows code signing, CI supply-chain hardening.

# Physical validation queue — DO THIS BEFORE FIELD CLOSURE

1. Initialize a real ESP32 over USB with Device Password and normal settings.
2. Verify USB MATCH / NO_MATCH and cooldown.
3. Verify Android and Windows Security-2 provisioning with the same password.
4. Verify wrong Device Password and wrong home-Wi-Fi password behavior.
5. Verify Windows/Android LAN management with correct/incorrect passwords.
6. Verify browser unlock, authenticated write, CSRF rejection, logout, session expiry, and replay rejection.
7. Rotate Device Password; confirm new password works and old/original password fails over LAN, USB verify, and Security 2.
8. Verify DPAPI and Android Keystore remember/forget behavior across app restart.
9. Verify reachable **Change Wi-Fi** flow.
10. Verify 5-second BOOT secure recovery while preserving password/settings.
11. Power-cycle and fault-test around credential rotation/persistence.
12. Verify normal monitoring/discovery/tray/offline/startup behavior.
13. Calibrate ADC against trusted multimeter at multiple voltages.
14. Vehicle-test ADC jitter/Wi-Fi range; decide on optional ADC capacitor and automotive transient front end.
