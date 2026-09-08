# Battery Monitor Project State

Date: 2026-09-08  
Branch: `battery-monitor-dev`  
Version: V0.1.0 prototype

## Current validated product-source checkpoint

P0-3 source/build validated product source:

`83c678127671f8c570c488c63f878a57fcafdacf`

Battery Monitor Toolchain:

`34177651347` — run #107 — **SUCCESS**

At that exact source head all three product jobs passed:

- ESP32 Arduino firmware compile/image validation/artifact upload;
- Android APK build/artifact upload;
- Windows .NET 8 build, pinned Security-2 helper build/smoke test, explicit P0-3 HMAC + monitoring-key-wrap protocol self-test, self-contained publish, bundle, and artifact upload.

Controlling P0-3 source/build resolution:

`SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

The live branch may be ahead of the validated source SHA for documentation-only commits. Re-resolve the live branch before future work.

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

## P0-1 secure provisioning — source/build resolved, physical validation pending

Controlling resolution:

`SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`

Current posture:

- protected per-device WPA2 `BatteryMonitor-XXXXXX` setup network;
- Espressif Unified Provisioning Security 2 using SRP6a + AES-GCM;
- initial random 16-character / 80-bit per-device credential is the initial Device Password;
- QR is convenience only; manual entry works;
- uninitialized units never expose an open provisioning AP;
- old Android plaintext home-Wi-Fi provisioning path is retired;
- Windows secrets go to the pinned helper through redirected stdin, not command-line arguments.

P0-1 still requires physical Android/Windows/ESP32 interoperability testing before field closure.

## P0-2 LAN authentication — source/build resolved, hardware validation pending

Controlling implementation resolution:

`SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Original design authority:

`SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`

### Device Password authority

- One user-facing **Device Password** protects normal non-factory administration.
- The initial generated provisioning code is the initial Device Password.
- User may keep it or replace it.
- Custom passwords are exact and case-sensitive.
- **Weak passwords are allowed by user choice.** Windows/Android warn and require explicit confirmation but do not impose a strength floor.
- Firmware hard-validates only: non-empty, <=128 UTF-8 bytes, no control characters.
- The original printed code is not a backdoor after rotation.

### LAN management

- Device Password is not sent as an ordinary LAN HTTP parameter.
- Client obtains a fresh one-time 60-second challenge.
- Client proves possession with HMAC-SHA-256 using a domain-separated management key.
- Successful proof creates a random 15-minute management session plus CSRF token.
- Sessions are source-IP bound and refreshed by authenticated writes.
- Wrong authentication attempts receive escalating cooldowns.
- Browser state-changing requests require both session and `X-Batmon-CSRF`; session cookie is `HttpOnly; SameSite=Strict`.

State-changing routes include authenticated config, password rotation, secure Change Wi-Fi, and P0-3 monitoring-key pairing. Legacy plaintext `POST /api/wifi` is retired with HTTP 410.

### Password rotation

- Replacement password is AES-256-GCM encrypted under a session-derived wrapping key.
- ESP regenerates Security-2 SRP salt/verifier, setup-AP key, password-check material, and management authority.
- Complete credential set is persisted in a versioned v2 NVS blob.
- Successful rotation invalidates management sessions.
- v2 credential presence is authoritative/fail-closed; corrupted v2 data does not fall back to old split credential fields.
- Old split `user/apkey/codehash/salt/verifier` keys are retired after successful v2 commit.

### Wi-Fi recovery

- Reachable unit: authenticated **Change Wi-Fi** enters existing Security-2 provisioning.
- Unreachable old LAN: 5-second BOOT hold enters secure provisioning without clearing Device Password or normal settings.
- A configured device losing its router **does not automatically reopen provisioning**; it keeps retrying the saved network until physical BOOT recovery or authenticated Change Wi-Fi is requested.
- New home-Wi-Fi credentials continue to travel through Security 2.

## P0-3 authenticated monitor identity — source/build resolved, hostile-LAN hardware validation pending

Controlling source/build resolution:

`SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Original design authority:

`SECURITY_P0_3_MONITOR_IDENTITY_DESIGN_2026-09-08.md`

### Monitoring Identity Key

- Each ESP32 has a separate random 256-bit Monitoring Identity Key.
- Key is independent of Device Password and Device ID/MAC.
- Key persists across password rotation and normal application-only updates.
- Malformed stored identity fails closed.
- Destructive Factory Flash / Recovery resets NVS and therefore breaks the old monitoring identity.

### Pairing paths

**LAN pairing:** P0-2 Device Password authentication -> authenticated `POST /api/monitor-key` -> session-derived AES-256-GCM wrapped Monitoring Identity Key -> Windows DPAPI storage.

**USB pairing:** trusted physical USB `BATMON1 MONITORKEY`; Windows redacts clear key from UI/log and immediately DPAPI-protects it.

The Device Password does not need to remain saved merely for monitoring after pairing.

### Authenticated discovery

- V2 request: `BATMON_DISCOVER_V2 <fresh 128-bit nonce>`.
- Reply contains nonce + Base64 exact payload bytes + HMAC-SHA-256 under Monitoring Identity Key.
- HMAC domain: `BATMON-DISCOVERY-V2`.
- Signed payload includes Device ID, name, hostname, IPv4 address, port, API version and firmware version.
- Windows requires signed IP to exactly match the actual UDP source IPv4 address.
- Actual UDP source endpoint is network-address authority.
- Legacy V1 remains untrusted compatibility/candidate discovery only and cannot move a trusted monitor.

### Authenticated status

- Paired Windows polling uses `GET /api/status-auth?nonce=<fresh nonce>`.
- Reply contains `BATMON_STATUS_V1`, nonce, Base64 exact status payload bytes and HMAC.
- HMAC domain: `BATMON-STATUS-V1`.
- Windows verifies nonce, HMAC and expected Device ID before applying battery data.
- Automatic HTTP redirects are disabled.
- Replayed old status cannot satisfy a fresh nonce.

### Windows trust states

- **Unpaired candidate:** visible but no monitoring key; battery reading is not trusted.
- **Trusted:** local DPAPI key exists and authenticated discovery/status verifies.
- **Identity failure:** known identity fails proof; voltage/state is discarded and a distinct security alert is raised.

Existing saved monitors with a remembered Device Password can auto-pair once after upgrade. Removing a monitor removes local remembered Device Password and Monitoring Identity Key.

### P0-3 deterministic CI validation

Windows exposes `--protocol-self-test`, which CI runs after Release build and before publish.

Validated vectors cover:

- exact-byte discovery HMAC framing/domain separation;
- Monitoring Identity Key wrap-key derivation;
- AES-256-GCM monitoring-key envelope decryption and AAD.

Run #107 passed all vectors and the final Windows packaging chain.

### Factory/update identity semantics verified from generated image

The CI-generated 4 MiB merged image was inspected: its default NVS region `0x9000-0xDFFF` is blank (`0xFF`).

- Factory Flash writes merged image at `0x0` -> NVS/security identity reset.
- Normal Update Firmware writes app image at `0x10000` -> NVS/Monitoring Identity Key preserved.

Physical testing is still required to confirm full end-to-end behavior.

## Windows client

- .NET 8 WinForms tray app.
- Multi-unit UDP discovery plus mDNS advertisements.
- Stable Device-ID tracking with authenticated DHCP address refresh for paired units.
- Local alias plus independent on-unit name.
- Configurable ESP sample interval, PC poll interval, and elapsed offline timeout.
- Default offline timeout: 5 minutes; supports seconds/minutes/hours.
- `UNREACHABLE elapsed/timeout` during grace period; `OFFLINE` only after elapsed timeout.
- Successful authenticated response resets contact-loss timer immediately.
- Low/critical audible + tray alerts only from trusted authenticated status.
- Identity failures are distinct from network offline state.
- Start with Windows configurable; `--startup` launches directly to tray.
- `--protocol-self-test` is internal CI protocol validation mode.

### USB Setup

Normal/default configuration path; separate from firmware flashing.

USB can configure:

- unit name;
- Wi-Fi when explicitly selected;
- chemistry/thresholds;
- sample interval;
- ADC calibration;
- Device Password verification/rotation.

Existing Wi-Fi password is not read back; maintenance preserves Wi-Fi unless explicitly changed.

Trusted USB can separately pair the Monitoring Identity Key without Device Password.

### Firmware functions

- **Update Firmware** remains a normal top-level function and writes only application partition, preserving NVS/settings/identity.
- **Factory Flash / Recovery** remains under Advanced and is destructive.
- Advanced admin password is a UI/casual-use gate only, not a cryptographic boundary.
- Bundled Espressif esptool: v5.3.1.
- CI-pinned official Windows archive SHA-256: `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3`.

## Android app

- Native Java, minSdk 31, compile/target SDK 36.
- QR or manual Device ID + Device Password secure Wi-Fi setup.
- Espressif Security 2 over protected WPA2 SoftAP.
- LAN management dialog supports authenticated settings, password rotation, and Change Wi-Fi.
- Optional remembered Device Password is AES-GCM encrypted with key material held by Android Keystore.
- **Forget Saved Device Password** removes only local remembered credential.
- Weak-password warning is advisory with explicit override.
- Home Wi-Fi password is not persistently stored by the app.

P0-3 authenticated battery monitoring is currently a Windows tray-client function; Android remains primarily setup/management in V0.1.

## Firmware signing — staged, not yet enforced

- RSA-3072 public key: `signing/battery_monitor_secureboot_rsa3072_public.pem`
- DER-SPKI SHA-256 fingerprint: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`
- encrypted private-key backup is outside GitHub in ChatGPT Library under `/Battery Monitor Signing/`.
- CI signing and Windows signature enforcement are not yet active.
- Do not burn Secure Boot eFuses on development boards.

### Mandatory production Secure Boot checkpoint

Before a production/release candidate is security-complete:

1. verify exact ESP32-WROOM-32 revision compatibility with intended Secure Boot v2 mode;
2. prove signed update/recovery on physical development hardware;
3. maintain at least two independent encrypted signing-key backups, at least one outside ChatGPT Library;
4. document recovery consequences of signing-key loss;
5. only then decide whether to burn production Secure Boot eFuses.

## Remaining security priorities

1. Complete **real-hardware P0-1/P0-2/P0-3 interoperability and hostile-LAN/adversarial validation**.
2. Physical security: NVS Encryption, Flash Encryption, Secure Boot, ROM-download policy for production mode.
3. Move from Arduino-ESP32 3.3.11 or incorporate the upstream WebServer slow-header fix before hostile-LAN deployment.
4. Finish firmware release signing/verification plumbing.
5. Android release signing, Windows code signing, and CI supply-chain hardening.
6. Revisit authenticated TLS/device certificates if stronger LAN transport confidentiality/general identity becomes a product requirement.
7. Automotive electrical hardening: transient/load-dump front end and field ADC-noise/range validation.

## Next physical validation

1. Initialize a real ESP32 over USB with Device Password and normal configuration.
2. Verify USB Device Password MATCH / NO_MATCH and cooldown behavior.
3. Verify Android and Windows Security-2 provisioning with the same current Device Password.
4. Verify wrong Device Password and wrong home-Wi-Fi password behavior.
5. Verify browser correct-password unlock, wrong password, CSRF rejection, logout, session expiry, and replay rejection.
6. Rotate Device Password; verify new password works and old/original password fails over LAN, Security 2, and USB verification.
7. Pair monitoring identity over authenticated LAN; restart Windows and verify DPAPI trust persists.
8. Pair monitoring identity over trusted USB with no Device Password; verify clear key never appears in visible logs.
9. Verify authenticated V2 discovery follows legitimate DHCP address change and remains trusted.
10. Run a rogue discovery responder claiming the trusted Device ID from another address; verify it cannot move the monitor.
11. Replay old authenticated discovery; verify fresh nonce rejects it.
12. Run a rogue status responder / modify captured status; verify fake voltage/state is never accepted.
13. Replay old authenticated status; verify fresh nonce rejects it.
14. Verify HTTP redirect responses are not followed.
15. Verify authenticated Change Wi-Fi and 5-second BOOT recovery provisioning; verify router loss alone does not start provisioning.
16. Verify Device Password rotation preserves existing Monitoring Identity trust.
17. Perform destructive Factory Flash; verify old Windows trust reports identity failure/unpaired and requires explicit re-pairing.
18. Remove a monitor from Windows; verify remembered Device Password and DPAPI Monitoring Identity Key are deleted.
19. Power-cycle through credential/identity persistence and fault-test interruption around password rotation.
20. Calibrate ADC against a trusted multimeter at several voltages.
21. Vehicle-test ADC jitter/Wi-Fi range and decide on optional ADC capacitor / automotive transient front end.
