# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

**FIRST resolve the live `battery-monitor-dev` branch head. Do not assume the documentation-head SHA or validated product-source SHA is still current.**

## Latest validated product-source checkpoint

P0-3 source/build validated source:

`83c678127671f8c570c488c63f878a57fcafdacf`

Battery Monitor Toolchain:

`34177651347` — run #107 — **SUCCESS**

At that exact product-source SHA:

- ESP32 firmware compiled, expected images were verified, and firmware artifacts uploaded;
- Android APK built and uploaded;
- Windows .NET 8 client built;
- pinned Espressif Security-2 helper built and smoke-tested;
- explicit P0-3 HMAC + Monitoring Identity Key AES-GCM wrap protocol self-test passed;
- self-contained Windows package published, bundled, and uploaded.

The live branch is expected to be ahead because the P0-3 resolution/protocol/state/handoff documentation was committed after the successful product build. Treat `83c678...` as the validated product-source SHA unless a later source checkpoint explicitly supersedes it.

## Read at the LIVE branch ref, in this order

1. `battery-monitor/SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/PROTOCOL.md`
4. `battery-monitor/SECURITY_P0_3_MONITOR_IDENTITY_DESIGN_2026-09-08.md`
5. `battery-monitor/SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`
6. `battery-monitor/SECURITY_P0_2_LAN_AUTH_DESIGN_2026-09-07.md`
7. `battery-monitor/SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`
8. `battery-monitor/SECURITY_REVIEW_2026-09-07.md` — historical review; later P0 resolutions supersede its implementation-status statements
9. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
10. `battery-monitor/firmware/BatteryMonitor/BatteryMonitorLegacy.inc`
11. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
12. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
13. `battery-monitor/firmware/BatteryMonitor/YManagementAuthPrototypes.ino`
14. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
15. `battery-monitor/firmware/BatteryMonitor/ZZMonitorIdentity.ino`
16. `battery-monitor/firmware/BatteryMonitor/ZZZTrustedUsbIdentity.ino`
17. `battery-monitor/windows/BatteryMonitor.Client/`
18. `battery-monitor/windows/esp_provision_helper.py`
19. `battery-monitor/android/`
20. `.github/workflows/battery-monitor-ci.yml`

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

# P0-1 SECURE PROVISIONING — SOURCE/BUILD RESOLVED, HARDWARE VALIDATION PENDING

Do **not** revert to an open setup AP or plaintext home-Wi-Fi POST flow.

Current posture:

- unique initial 16-character / 80-bit per-device credential;
- QR is convenience only; manual entry supported;
- protected per-device WPA2 setup AP;
- Security 2 protects/authenticates home-Wi-Fi provisioning;
- Windows secrets go to pinned helper through redirected stdin, not command-line args;
- old plaintext Android `/api/wifi` provisioning is retired.

A configured unit that merely loses its router must **not** automatically enter provisioning. It retries saved infrastructure Wi-Fi. Use authenticated Change Wi-Fi while reachable or the approved 5-second BOOT physical action when the old LAN is unavailable.

# P0-2 LAN AUTHENTICATION — SOURCE/BUILD RESOLVED, HARDWARE VALIDATION PENDING

Controlling implementation resolution:

`battery-monitor/SECURITY_P0_2_LAN_AUTH_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Do not redesign P0-2 from scratch unless the user changes authority.

## User Device Password authority

There is one user-facing **Device Password** per monitor for normal non-factory administration.

- Initial generated 16-character / 80-bit provisioning code is the initial Device Password.
- User can keep or replace it.
- Custom passwords are exact and case-sensitive.
- **Weak passwords are allowed.** Warn and require explicit confirmation; do not impose a strength floor.
- Firmware only rejects empty, >128 UTF-8 bytes, or control characters.
- The original printed password is not intended to remain a backdoor after rotation.

## P0-2 behavior

- challenge/response LAN management authentication;
- HMAC-SHA-256 proof over one-time challenge ID + 128-bit nonce;
- 60-second single-use challenges;
- 15-minute random sessions bound to source IP;
- escalating cooldowns after repeated bad proofs;
- separate CSRF token for state-changing browser/API requests;
- browser cookie `HttpOnly; SameSite=Strict`;
- authenticated config/password/Change Wi-Fi operations;
- password rotation carried in AES-256-GCM session envelope;
- legacy plaintext `POST /api/wifi` is HTTP 410;
- Windows optional remembered Device Password uses DPAPI;
- Android optional remembered Device Password uses Android Keystore-backed encryption.

Password rotation uses the versioned v2 credential blob as authoritative state and retires old split credential fields.

# P0-3 AUTHENTICATED MONITOR IDENTITY — SOURCE/BUILD RESOLVED, HOSTILE-LAN HARDWARE VALIDATION PENDING

Controlling resolution:

`battery-monitor/SECURITY_P0_3_MONITOR_IDENTITY_SOURCE_BUILD_RESOLUTION_2026-09-08.md`

Do **not** revert paired Windows monitoring to trusting legacy discovery, MAC-derived Device ID, claimed discovery IP, ordinary `/api/status`, or HTTP redirects.

## Separate Monitoring Identity Key — IMPORTANT

Each physical monitor has a separate random 256-bit **Monitoring Identity Key**.

- independent of Device Password;
- independent of Device ID/MAC;
- stored in ESP32 NVS as security material;
- persists across normal Device Password rotation;
- persists across application-only Update Firmware;
- destructive Factory Flash / Recovery resets NVS and therefore breaks old monitoring trust;
- malformed stored key fails closed.

The Monitoring Identity Key is monitoring/authenticity authority only. It is not the normal administrative password.

## Pairing authority

### Authenticated LAN pairing

Windows may acquire monitoring trust after successful P0-2 Device Password authentication:

- authenticated `POST /api/monitor-key`;
- session-derived HMAC wrap key, domain `BATMON-MONITOR-KEY-WRAP-V1`;
- AES-256-GCM encrypted 32-byte Monitoring Identity Key;
- AAD `BATMON-MONITOR-KEY-AAD-V1|<deviceId>|<session>`;
- decrypted key stored under Windows CurrentUser DPAPI.

If the user did not choose to remember Device Password, Windows can discard it after pairing and still authenticate monitoring later.

### Trusted physical USB pairing

`BATMON1 MONITORKEY` is a trusted USB authority. Windows has a USB Pair / Trust path that:

- needs physical USB but no Device Password;
- redacts the returned key from visible log output;
- immediately DPAPI-protects the key;
- zeroes clear key buffers where practical.

## Authenticated discovery v2

Request:

`BATMON_DISCOVER_V2 <fresh 128-bit nonce>`

Response carries nonce + Base64 exact payload bytes + HMAC-SHA-256 under Monitoring Identity Key.

Domain:

`BATMON-DISCOVERY-V2`

The signed payload includes Device ID/name/hostname/current IPv4/port/API/firmware metadata.

For a trusted discovery Windows requires:

- recent nonce generated by this PC;
- valid HMAC for exact payload bytes;
- valid address/port shape;
- **signed payload IP exactly equals actual UDP source IPv4**.

Actual UDP source is address authority. This is intentional redirect/replay hardening.

Legacy V1 remains candidate visibility only. It must never move an already trusted monitor.

## Authenticated status

Paired Windows clients use:

`GET /api/status-auth?nonce=<fresh 128-bit nonce>`

Domain:

`BATMON-STATUS-V1`

Windows verifies protocol + nonce + exact-payload HMAC + expected Device ID **before** applying voltage/state.

Old/captured status does not satisfy a fresh nonce. Modified battery fields fail HMAC.

## Windows trust states

- **Unpaired candidate** — visible, but no trusted battery state.
- **Trusted** — local DPAPI Monitoring Identity Key and current cryptographic proof verify.
- **Identity failure** — known identity fails cryptographic proof/address binding; discard voltage/state and show a security-specific warning rather than ordinary offline state.

Removing a monitor from Windows also removes its local DPAPI Device Password and Monitoring Identity Key.

Existing saved devices with remembered Device Password may auto-pair once after upgrade.

## P0-3 CI authority

The Windows executable has internal `--protocol-self-test` mode. CI runs it after Release build and before publish.

Run #107 passed fixed vectors for:

- exact discovery HMAC byte framing/domain;
- monitoring-key wrap-key derivation;
- AES-256-GCM monitoring-key decrypt/AAD.

Production pairing uses the same wrap-key/AAD helper exercised by the self-test.

## Factory/update identity persistence authority

The CI-generated merged firmware was inspected:

- 4 MiB merged image;
- default NVS region `0x9000-0xDFFF` is blank (`0xFF`);
- Factory Flash writes merged image from `0x0` -> destructive NVS/security reset;
- normal Update Firmware writes app image at `0x10000` -> NVS/Monitoring Identity Key preserved.

This is source/artifact evidence. Still verify on real hardware before field closure.

# Windows behavior authority

- Offline detection is elapsed-time based, never retry-count based.
- Default timeout is 300 seconds / 5 minutes; editor supports seconds/minutes/hours.
- `UNREACHABLE elapsed/timeout` during grace period; `OFFLINE` only after elapsed timeout.
- Successful authenticated contact resets loss timer immediately.
- Low/critical alerts only use trusted authenticated status.
- Identity failure is distinct from unreachable/offline.
- Start with Windows remains configurable; `--startup` launches directly to tray.

## USB Setup

Normal/default configuration path. Do not merge back into a Flash + Configure workflow.

USB can configure name, explicit Wi-Fi changes, chemistry/thresholds, sample interval, ADC calibration, and Device Password verification/rotation.

The existing Wi-Fi password cannot be read back, so USB maintenance preserves Wi-Fi unless explicitly updated.

Monitoring trust is a separate USB Pair / Trust operation.

## Firmware functions

- **Update Firmware** remains normal top-level feature and writes only application partition, preserving settings/NVS/security identity.
- **Factory Flash / Recovery** remains destructive under Advanced.
- Advanced admin password is UI/casual-use gate only, not cryptographic boundary.

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

Before production/release candidate is security-complete:

1. verify exact ESP32-WROOM-32 revision compatibility;
2. prove signed update/recovery on physical development hardware;
3. maintain at least two independent encrypted signing-key backups, at least one outside ChatGPT Library;
4. document recovery consequences of signing-key loss;
5. only then decide whether to burn Secure Boot v2 eFuses on production units.

Host-side signature checking is not a substitute for device-side Secure Boot enforcement.

# Remaining security/hardening priorities

- Complete P0-1/P0-2/P0-3 **real-hardware interoperability and hostile-LAN adversarial validation**.
- Physical NVS/flash extraction and hostile reflashing: NVS Encryption, Flash Encryption, Secure Boot, ROM-download policy.
- Arduino-ESP32 3.3.11 WebServer slow-header DoS issue: update to fixed core or carry fix before hostile-LAN deployment.
- Firmware release signing/verification, Android release signing, Windows code signing, CI supply-chain hardening.
- Decide later whether authenticated TLS/device certificates are warranted for stronger general LAN transport confidentiality/identity.
- Automotive transient/load-dump front-end design and field electrical/noise qualification.

# Physical validation queue — REQUIRED BEFORE FIELD CLOSURE

1. Initialize a real ESP32 over USB with Device Password and normal settings.
2. Verify USB Device Password MATCH / NO_MATCH and cooldown.
3. Verify Android and Windows Security-2 provisioning with same current Device Password.
4. Verify wrong Device Password and wrong home-Wi-Fi behavior.
5. Verify browser correct/wrong password, authenticated writes, CSRF rejection, logout, session expiry, replay rejection.
6. Rotate Device Password; verify old/original password fails and new password works across LAN, Security 2 and USB verify.
7. Pair Monitoring Identity over authenticated LAN; verify DPAPI trust survives Windows restart.
8. Pair Monitoring Identity over trusted USB without Device Password; verify no clear key in logs.
9. Verify legitimate DHCP address change is accepted only through valid authenticated V2 discovery.
10. Run rogue discovery claiming trusted Device ID from another address; verify it cannot move trusted monitor.
11. Replay captured authenticated discovery against fresh nonce; verify rejection.
12. Run rogue/falsified status responder; verify fake voltage/state is never accepted.
13. Replay captured authenticated status against fresh nonce; verify rejection.
14. Verify HTTP redirects are not followed.
15. Verify authenticated Change Wi-Fi and 5-second BOOT recovery; verify ordinary router loss alone does not start provisioning.
16. Verify Device Password rotation preserves Monitoring Identity trust.
17. Perform destructive Factory Flash; verify old Windows monitoring trust breaks and explicit re-pair is required.
18. Remove monitor from Windows; verify local DPAPI Device Password + Monitoring Identity Key deletion.
19. Power-cycle/fault-test credential and identity persistence.
20. Calibrate ADC at multiple voltages and vehicle-test ADC jitter/Wi-Fi range.
21. Decide optional ADC capacitor and automotive transient front-end after field data.

Do not describe P0-3 as field-closed until these physical/adversarial checks are completed.
