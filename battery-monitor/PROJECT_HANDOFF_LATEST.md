# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

**FIRST resolve the live `battery-monitor-dev` branch head. Do not assume the SHA in this handoff is still current.**

At secure-provisioning closure the validated product-source head was:

`e4fa7fd5af46224e0c96fca1fe8090ba29dcee44`

Battery Monitor Toolchain run:

`34167794017` — **SUCCESS** across ESP32, Android, and Windows.

Read, at the live ref, in this order:

1. `battery-monitor/SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`
2. `battery-monitor/SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`
3. `battery-monitor/SECURITY_REVIEW_2026-09-07.md`
4. `battery-monitor/PROJECT_STATE_LATEST.md`
5. `battery-monitor/README.md`
6. `battery-monitor/PROTOCOL.md`
7. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
8. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
9. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
10. `battery-monitor/windows/BatteryMonitor.Client/`
11. `battery-monitor/android/`
12. `.github/workflows/battery-monitor-ci.yml`

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

## P0-2 LAN AUTHENTICATION — USER-APPROVED DESIGN

Controlling design note:

`battery-monitor/SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`

Do not redesign P0-2 from scratch unless the user changes this authority.

Approved normal-user security model:

- every device has **one user-facing Device Password** for all non-factory administration;
- the initial random 16-character / 80-bit secure-provisioning setup code is the initial Device Password;
- user may keep that code or replace it with a new Device Password;
- Windows and Android may securely remember the Device Password;
- Windows storage must use Windows-protected credential storage, not plaintext `devices.json`/logs/args;
- Android storage must be encrypted with key material protected by Android Keystore;
- both clients must support **Forget Saved Password** without changing the ESP32 password;
- browser configuration, if retained, requires authenticated short-lived sessions rather than sending the Device Password as a normal HTTP parameter;
- normal state-changing LAN management requires challenge/response authentication using a domain-separated LAN-management key derived from the Device Password;
- fresh nonce/replay protection and browser CSRF protection are required;
- user-facing one-password simplicity must still use separate domain-separated cryptographic keys underneath for provisioning, setup AP, LAN management, and USB verification;
- Device Password rotation must atomically regenerate all derived credential material and invalidate the old password only after the new set is safely committed;
- the original printed code is not a permanent backdoor after password change.

Wi-Fi change/recovery authority:

- if the device is reachable, Windows/Android authenticates with the Device Password and **Change Wi-Fi** tells the ESP to enter the existing secure Security-2 provisioning mode;
- new home Wi-Fi credentials continue to travel through Espressif Security 2, not a second plaintext LAN API;
- if the old LAN is unavailable, a physical provisioning-mode button action re-enables the existing WPA2-protected `BatteryMonitor-XXXXXX` setup AP **without clearing the Device Password**;
- Windows/Android then use the same saved/entered Device Password to Security-2 provision replacement Wi-Fi;
- exact button duration/gesture for non-destructive provisioning recovery is still an implementation detail;
- destructive factory/reset gestures remain separate.

Factory functions remain under separate factory/admin authority, not the normal Device Password. This includes factory/recovery flashing, full identity/NVS destruction, manufacturing initialization, and future production Secure Boot/fuse administration.

P0-2 is **design-approved but not implemented/closed yet**. Do not call it resolved until device, Windows, Android, browser/CSRF behavior, password rotation, and hardware tests are complete.

## P0-3 remains separate

Windows discovery/status identity is unauthenticated/spoofable and must eventually be cryptographically paired/authenticated before battery readings are treated as hostile-LAN trustworthy.

Do not conflate P0-2 management authorization with P0-3 status/identity authenticity. The Device Password may later be used as the root for a separately domain-separated P0-3 status-authentication key, but that decision belongs to the P0-3 design discussion.

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

### EXPLICIT PRODUCTION REMINDER — CIRCLE BACK TO SECURE BOOT

Before any production/release candidate is considered security-complete, **stop and revisit ESP32 Secure Boot v2**.

At that checkpoint:

1. confirm the exact ESP32-WROOM-32 chip revisions support the intended Secure Boot v2 mode;
2. confirm normal signed firmware update/recovery is already proven on physical hardware;
3. make at least two independent encrypted backups of the signing private key, with at least one backup outside ChatGPT Library;
4. document the recovery consequences of losing the private key after eFuse trust is burned;
5. only then decide whether to burn Secure Boot eFuses on production units.

Do not let host-side signature verification be mistaken for final device-side enforcement. **Secure Boot remains a mandatory production-hardening decision to revisit.**

## Remaining security items after P0-2/P0-3

- Physical NVS/flash extraction and hostile physical reflashing: evaluate NVS encryption, Flash Encryption, Secure Boot, ROM-download restrictions for production mode.
- Arduino-ESP32 3.3.11 WebServer has a post-release slow-header DoS issue; move to a fixed core or incorporate the fix before product deployment.
- Browser CSRF/state-changing request hardening is part of P0-2 implementation.
- Release signing/verification, Android release signing, Windows code signing, and CI supply-chain hardening.

## Physical validation queue

1. Initialize a real ESP32 over USB with a Device Password/setup code.
2. Verify USB setup-code MATCH/NO_MATCH + cooldown.
3. Verify Android QR and manual-code Security-2 provisioning.
4. Verify Windows wireless Security-2 provisioning with the same Device Password.
5. Test wrong password, wrong home password, re-provisioning, and Windows temporary-profile cleanup.
6. After P0-2 implementation, verify remembered-password behavior, password rotation, authenticated LAN management, replay/session expiry, and non-destructive physical Wi-Fi recovery.
7. Verify monitoring/discovery/tray/offline/startup behavior.
8. Calibrate ADC against a trusted multimeter at multiple voltages.
9. Vehicle-test ADC jitter/Wi-Fi range and then decide on optional 0.1 µF ADC capacitor / automotive transient front end.
