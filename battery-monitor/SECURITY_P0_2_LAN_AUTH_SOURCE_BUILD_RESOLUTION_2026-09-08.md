# Battery Monitor Security P0-2 — LAN Authentication Source/Build Resolution

Date: 2026-09-08
Branch: `battery-monitor-dev`
Status: **SOURCE/BUILD RESOLVED — REAL-HARDWARE VALIDATION REMAINS**

## Validated product-source checkpoint

Validated source head:

`ca7aa75af8b11b182558f48170778b9d2d94f042`

Battery Monitor Toolchain:

`34173594292` — run #85 — **SUCCESS**

All three product jobs passed at that exact source head:

- ESP32 Arduino firmware compile, image verification, and firmware artifact upload;
- Android provisioning/management APK build and artifact upload;
- Windows .NET 8 build, pinned Espressif Security-2 helper build/smoke test, self-contained publish, bundle, and artifact upload.

This resolves P0-2 at the source/build level only. It does **not** replace the required physical-device interoperability and adversarial behavior tests listed below.

## User-facing Device Password authority

Every monitor has one normal user-facing **Device Password** for non-factory administration.

- The original generated 16-character / 80-bit provisioning code is the initial Device Password.
- The user may keep it or replace it.
- A custom password is exact and case-sensitive.
- **Password strength is advisory, not mandatory.** Windows and Android warn when a selected replacement looks weak and require an explicit confirmation, but deliberately permit the user to continue.
- Firmware hard-rejects only protocol-invalid passwords: empty values, values longer than 128 UTF-8 bytes, or values containing control characters.
- There is no complexity, character-class, or minimum-strength floor.
- After a successful password change, the original printed code is not a normal-management backdoor.

## Domain-separated credential model

The one Device Password is never reused directly as every protocol key. The implementation derives separate values for different purposes.

Current derivation domains include:

- password/check root: `BATMON-CODECHECK-V1`
- setup SoftAP key: `BATMON-SOFTAP-V1`
- LAN management key: `BATMON-LAN-MGMT-V1`
- authentication proof: `BATMON-AUTH-V1`
- password-rotation wrapping key: `BATMON-PASSWORD-WRAP-V1`
- password-rotation AES-GCM AAD: `BATMON-PASSWORD-ROTATE-V1`

The Security-2 SRP salt/verifier is regenerated from the Device Password when the password changes.

## Normal LAN management authentication

Read-only status/configuration discovery remains available without entering the Device Password. State-changing normal-management operations require authentication.

Authentication flow:

1. Client requests `GET /api/auth/challenge`.
2. ESP generates a fresh one-time challenge ID and 128-bit nonce.
3. Client derives the per-device management key locally from the Device Password.
4. Client proves possession with HMAC-SHA-256 over the versioned challenge message.
5. A successful proof creates a random short-lived management session plus a separate CSRF token.

Current timing/limits:

- challenge lifetime: 60 seconds;
- challenges are single-use on success or failure;
- management session lifetime: 15 minutes, refreshed by authenticated writes;
- sessions are bound to the requesting source IP;
- repeated failed authentication is rate-limited with escalating cooldowns.

The Device Password itself is not sent as an ordinary LAN HTTP field.

## Browser management and CSRF

The retained browser UI now locks state-changing controls until the Device Password challenge/response succeeds.

State-changing browser/API requests require both:

- the authenticated management session; and
- the unpredictable CSRF token in `X-Batmon-CSRF`.

The browser session cookie is `HttpOnly` and `SameSite=Strict`. State changes use POST, not GET.

This is authorization protection, not a claim that cleartext HTTP provides full hostile-LAN confidentiality. A future TLS/device-identity decision may provide stronger protection against active LAN interception. P0-3 remains separately responsible for authenticating device identity/status.

## State-changing endpoint closure

Current normal LAN behavior:

- `POST /api/config` — authenticated session + CSRF required;
- `POST /api/password` — authenticated session + CSRF required;
- `POST /api/wifi/provisioning` — authenticated session + CSRF required;
- legacy `POST /api/reset-wifi` — authenticated alias for entering secure provisioning;
- legacy plaintext `POST /api/wifi` — retired and returns HTTP 410; it cannot change Wi-Fi credentials.

The home Wi-Fi password therefore does not travel through a normal plaintext LAN configuration endpoint.

## Device Password rotation

Password rotation is an authenticated operation.

The client:

1. authenticates with the current Device Password;
2. derives a session-specific wrapping key from the management key, session token, and CSRF token;
3. encrypts the replacement Device Password with AES-256-GCM;
4. sends IV, ciphertext, and tag to `POST /api/password`.

The ESP authenticates/decrypts the envelope, validates only protocol constraints, regenerates the complete credential set, commits a versioned v2 NVS credential blob, reloads the committed credential set, and invalidates active management sessions.

The v2 blob carries the current:

- Security-2 username;
- setup SoftAP key;
- password verification/check material;
- SRP salt;
- SRP verifier.

After a successful v2 commit the legacy split credential keys are removed. If a v2 credential blob exists but is invalid, `loadDeviceCredentialIdentity()` fails closed instead of falling back to the old credential fields. This prevents the original printed credential from remaining a dormant normal fallback after rotation.

## Windows client

Implemented behavior:

- authenticated configuration writes;
- authenticated **Change Wi-Fi**;
- Device Password rotation;
- optional remembered Device Password;
- **Forget Saved Password** without changing the ESP32 password;
- weak-password warning/explicit override rather than strength enforcement.

Remembered credentials are stored separately from `devices.json` using Windows DPAPI under the current Windows user context. The Device Password is not written to ordinary logs or command-line arguments.

Wireless provisioning still uses the existing protected `BatteryMonitor-XXXXXX` temporary WPA2 network and Espressif Security 2. The Device Password and home Wi-Fi password are passed to the pinned helper over redirected stdin, not command-line arguments.

## Android app

Implemented behavior:

- secure Wi-Fi provisioning using the Device Password;
- LAN management dialog with authenticated configuration writes;
- authenticated **Change Wi-Fi** transition into Security-2 provisioning;
- Device Password rotation;
- optional remembered Device Password;
- **Forget Saved Device Password**;
- weak-password warning/explicit override rather than strength enforcement.

Remembered Device Password ciphertext is stored in application preferences, but encryption/decryption uses an AES-GCM key generated and retained in Android Keystore. The home Wi-Fi password is not persistently stored by this flow.

## Wi-Fi recovery behavior

When the monitor is reachable, Windows/Android can authenticate and request secure provisioning mode. New home Wi-Fi credentials are then supplied through Espressif Security 2.

When the old LAN is unavailable, holding BOOT for 5 seconds starts the protected secure provisioning mode **without clearing**:

- the Device Password;
- normal device settings; or
- the stored home Wi-Fi credential before replacement provisioning succeeds.

A destructive factory/reset operation remains a separate factory/admin function.

## USB behavior

The legacy wire name `PROVCRED` is retained for compatibility, but it now represents the normal Device Password.

Trusted USB supports:

- Device Password MATCH / NO_MATCH verification with escalating cooldowns;
- setting/replacing the Device Password;
- normal device configuration;
- explicit Wi-Fi credential changes.

Custom Device Passwords sent through USB follow the same firmware validity rules and are not subject to a strength floor.

## What this does not close

### P0-3 remains open

P0-2 authenticates management writes. It does not authenticate UDP discovery or ordinary status identity. A hostile LAN host can still attempt device/status impersonation until P0-3 is implemented.

### Full LAN confidentiality is not claimed

The management password is challenge/response protected, but the current local web/API transport is still HTTP. Random management sessions are IP-bound and CSRF-protected; nevertheless this is not equivalent to authenticated TLS against a capable active LAN interceptor.

### Physical flash/NVS security remains later hardening

Flash/NVS encryption, Secure Boot, ROM-download policy, and the production hardware-security mode remain separate work.

### Arduino-ESP32 WebServer availability hardening remains

The current 3.3.11 core still has the previously recorded slow-header availability concern. Move to a fixed core or incorporate the upstream fix before hostile-LAN product deployment.

## Required real-hardware validation before field closure

P0-2 must remain **hardware validation pending** until a real monitor passes at least:

1. initial USB Device Password initialization;
2. USB MATCH / NO_MATCH verification and cooldown behavior;
3. Windows LAN authentication with correct and incorrect Device Passwords;
4. Android LAN authentication with correct and incorrect Device Passwords;
5. browser unlock, authenticated write, CSRF rejection, logout, and session expiry;
6. one-time challenge/replay rejection;
7. Device Password rotation, including confirmation that the old/original password no longer works;
8. Windows DPAPI remember/forget behavior across app restart;
9. Android Keystore-backed remember/forget behavior across app restart;
10. reachable **Change Wi-Fi** followed by successful Security-2 reprovisioning;
11. 5-second BOOT secure-recovery provisioning while preserving the Device Password/settings;
12. wrong home-Wi-Fi password failure and subsequent recovery;
13. credential persistence across ESP32 reboot/power loss;
14. interruption/fault testing around password rotation to confirm the v2 authority fails safely.

Until those tests pass, use **source/build resolved** rather than **field-validated** or **fully closed** for P0-2.
