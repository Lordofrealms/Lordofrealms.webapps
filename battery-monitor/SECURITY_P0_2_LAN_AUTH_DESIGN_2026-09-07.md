# Battery Monitor Security Design — P0-2 LAN Authentication

Date: 2026-09-07
Branch: `battery-monitor-dev`
Status: **USER-APPROVED DESIGN DIRECTION — implementation not yet complete**

## Problem being addressed

P0-2 is the current unauthenticated LAN management risk. Existing state-changing LAN endpoints can alter settings such as battery chemistry, thresholds, calibration, name, Wi-Fi, or reset behavior without proving the caller is authorized.

The approved design is to give the user **one normal Device Password per Battery Monitor** for all non-factory administration. Factory/recovery functions remain separate.

## One user-facing Device Password

A new/factory-initialized unit begins with the random 16-character / 80-bit setup code already used by secure provisioning. That code is the unit's initial **Device Password**.

The user may either:

- keep the printed/generated initial Device Password; or
- change it to a new Device Password during or after setup.

From the user's perspective, the same password authorizes all normal device management:

- secure wireless provisioning/re-provisioning;
- LAN management/configuration;
- device name;
- battery chemistry and thresholds;
- sample interval;
- ADC calibration;
- normal Wi-Fi changes;
- Windows/Android authenticated management.

Factory/recovery functions use a separate factory/admin authority and are not governed by the normal Device Password.

## Domain-separated derived credentials

Although the user sees one Device Password, the implementation must not reuse the exact same cryptographic key material across protocols.

The Device Password is the root human credential from which separate domain-separated values are derived, including at minimum:

- Security-2 SRP credential material for provisioning;
- temporary setup-SoftAP WPA2 key;
- LAN-management authentication key;
- trusted USB password-verification value.

Each derivation must include an explicit Battery Monitor protocol/version domain string and the stable device ID where appropriate.

Example conceptual domains:

- `BATMON-PROVISION-V1`
- `BATMON-SOFTAP-V1`
- `BATMON-LAN-MGMT-V1`
- `BATMON-USB-VERIFY-V1`

A compromise or implementation defect in one protocol must not mean another protocol is literally using the same cryptographic key bytes.

## LAN management authentication

Read-only battery/status data may remain available without entering a password, subject to the separate P0-3 identity/authenticity decision.

Any state-changing normal LAN management operation must require authentication using the Device Password-derived LAN-management key.

The approved direction is challenge/response rather than transmitting the Device Password over ordinary LAN HTTP.

Conceptual flow:

1. Client requests a fresh device-generated nonce/challenge.
2. Client derives/uses the LAN-management key associated with that device.
3. Client authenticates the challenge and requested operation/body using a MAC such as HMAC-SHA-256.
4. ESP verifies the proof before creating a short-lived authenticated management session or accepting the signed request.
5. Nonces must be fresh/single-use or otherwise replay-resistant.

The Device Password itself must not be sent in plaintext as an ordinary LAN API parameter.

## Authenticated management sessions

For browser usability, successful challenge/response may create a short-lived authenticated management session.

Target behavior:

- user enters Device Password once to unlock settings;
- session expires automatically after a short period, initially around 15 minutes;
- state-changing requests require the authenticated session;
- session cookies/tokens must be random and non-guessable;
- browser cookies should use `SameSite=Strict` where applicable;
- state-changing operations must not use GET;
- CSRF protection must be included for browser state-changing requests.

Exact session duration may remain configurable in implementation, but indefinite LAN-auth sessions are not the intended default.

## Windows and Android password storage

Both primary client applications may offer **Remember this Device Password**.

### Windows

The normal Windows client may store the Device Password or a credential sufficient to re-authenticate using Windows-protected credential storage. It must not be written in plaintext to `devices.json`, logs, command-line arguments, or ordinary configuration files.

### Android

The Android app may remember the Device Password using encrypted application storage whose encryption key is protected by Android Keystore. It must not store the password as plaintext SharedPreferences, logs, intent extras that can be observed by other apps, or command-line-like external artifacts.

Both clients must offer **Forget Saved Password**, which removes the local remembered credential without changing the password on the ESP32.

## Changing the Device Password

The user may change the Device Password through an authenticated management flow.

Expected UI:

- Current Device Password
- New Device Password
- Confirm New Device Password

A successful password rotation must atomically regenerate/update all device-side credential material derived from the password, including:

- Security-2 SRP salt/verifier;
- derived setup-SoftAP WPA2 key;
- LAN-management authentication key/verifier material;
- USB verification check value.

The old Device Password must stop working only after the full new credential set has been committed successfully.

Windows/Android may update their locally remembered password only after the device confirms successful rotation.

The original printed factory/setup code is **not** expected to remain a backdoor after a user changes the Device Password.

Any restore-to-original/factory credential behavior, if provided, is a factory/USB recovery function rather than normal LAN management.

## Changing Wi-Fi while the old network still works

If the device is reachable on its current LAN:

1. Windows/Android authenticates using the saved or entered Device Password.
2. User chooses **Change Wi-Fi**.
3. The authenticated command tells the ESP32 to enter secure provisioning mode.
4. ESP32 enables its `BatteryMonitor-XXXXXX` temporary WPA2 setup network using the key derived from the same Device Password.
5. Windows/Android connects to that temporary network.
6. Espressif Security 2 (SRP6a + AES-GCM) authenticates using the Device Password.
7. New home SSID/password are provisioned inside the protected Security-2 session.
8. ESP32 leaves provisioning mode and joins the new home network.

The normal LAN API should not create a second plaintext mechanism for transmitting a home Wi-Fi password.

## Wi-Fi recovery when the old network is unavailable

If the router/SSID is gone and the ESP32 is no longer reachable on the old LAN, a physical button action must be able to re-enable **secure provisioning without erasing the Device Password**.

Approved recovery behavior:

1. User physically holds/activates the designated provisioning button action.
2. ESP32 enables `BatteryMonitor-XXXXXX` using the existing derived WPA2 setup key.
3. Windows or Android uses the user's saved/entered Device Password.
4. Security 2 authenticates the session.
5. User configures the replacement home Wi-Fi.

This recovery path must not fall back to an open AP.

The exact button duration/action is still an implementation detail. A longer destructive/factory-reset gesture may be designed separately, but normal Wi-Fi recovery must preserve the Device Password and other normal configuration unless explicitly changed.

## USB behavior

Trusted USB remains a normal configuration/recovery path.

USB may:

- verify a suspected Device Password as MATCH / NO_MATCH without reading it back;
- change normal configuration;
- update Wi-Fi credentials;
- change/rotate the Device Password through an appropriate trusted flow.

USB verification remains rate-limited even though V0.1 treats physical USB possession as trusted administration.

## Factory functions remain separate

The normal Device Password must not be treated as authority for destructive factory functions.

Separate factory/admin authority covers actions such as:

- Factory Flash / Recovery;
- full credential/NVS destruction;
- forced factory identity reset;
- manufacturing/setup-code initialization;
- any future production Secure Boot/fuse administration.

The existing Windows Advanced password is currently a casual/UI gate only and is not a hard cryptographic boundary. Production factory-tool separation remains a later hardening decision.

## Expected user experience

### First setup

1. Scan QR or enter initial Device Password.
2. Optionally choose a replacement Device Password.
3. Check **Remember this device** if desired.
4. Provision Wi-Fi securely.
5. Subsequent normal management occurs without repeatedly asking for the password when the client has securely remembered it.

### Normal use

- Read battery status normally.
- Windows/Android silently authenticates normal management using the securely stored Device Password/derived credential.
- Browser users enter the Device Password to unlock settings for a short-lived session.

### Router replacement

- If still reachable: authenticated **Change Wi-Fi** enters Security-2 provisioning.
- If not reachable: physical provisioning-mode action re-enables the protected setup AP; same Device Password is used.

## Security boundary with P0-3

P0-2 authentication of management commands does **not** by itself make unauthenticated UDP discovery/status readings trustworthy.

P0-3 remains separate and must authenticate/pair device identity and status so a hostile LAN system cannot impersonate `BM-XXXXXX` or supply false battery readings.

The same per-device Device Password may be useful as the root from which a separate P0-3 identity/status authentication key is derived, but that design must be explicitly decided during P0-3 rather than assumed here.

## Implementation status

This document records the user-approved design direction only. Do not mark P0-2 closed until:

1. device-side LAN challenge/auth/session enforcement is implemented;
2. Windows authenticated management and secure credential storage are implemented;
3. Android authenticated management and Keystore-backed remembering are implemented;
4. browser authenticated sessions + CSRF protection are implemented if browser configuration remains supported;
5. old unauthenticated state-changing endpoints are removed or reject unauthenticated callers;
6. Wi-Fi change/recovery follows the Security-2 flow above;
7. password rotation is atomic and tested;
8. CI passes and real hardware tests cover wrong password, replay attempts, expired sessions, password rotation, Wi-Fi recovery, and saved-password behavior.
