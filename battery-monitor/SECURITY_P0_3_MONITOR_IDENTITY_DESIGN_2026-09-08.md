# Battery Monitor Security P0-3 — Authenticated Discovery / Status Identity Design

Date: 2026-09-08
Branch: `battery-monitor-dev`
Status: **DESIGN DIRECTION — IMPLEMENTATION NOT YET CLOSED**

## Problem being solved

P0-2 protects normal management writes, but it intentionally does not authenticate ordinary UDP discovery or read-only battery status. A hostile LAN host can therefore still try to impersonate a Battery Monitor, claim an existing Device ID, redirect an address, or feed the Windows tray client false battery state.

No P0-3 design may treat the MAC-derived `BM-XXXXXX` Device ID as a secret. It is an identifier only.

## No-regrets hardening already started

Before full cryptographic identity, Windows should and now does move toward these minimum rules:

- ignore a discovery payload's claimed IP and bind the address to the actual UDP source address;
- reject invalid discovery ports;
- disable automatic HTTP redirects for Battery Monitor traffic;
- reject `/api/status` if the returned Device ID does not equal the monitor identity being polled.

These reduce spoofing/SSRF surface but do **not** authenticate the device.

## Recommended cryptographic model

Use a separate stable random **Monitoring Identity Key** per physical monitor.

Properties:

- 256 random bits generated on the ESP32;
- independent of the user-facing Device Password;
- persists across ordinary Device Password changes;
- not derivable from MAC address / Device ID;
- not broadcast or returned by an unauthenticated endpoint;
- copied to a trusted Windows installation only after authenticating with the Device Password or over trusted USB;
- stored on Windows under DPAPI, not plaintext `devices.json`.

### Why not simply use the Device Password for status HMAC?

Doing so would create two undesirable behaviors:

1. Windows would need to retain the full Device Password indefinitely just to monitor voltage; or
2. every Device Password rotation performed from another client would break trusted monitoring until Windows was given the new password again.

A stable separate monitoring key gives the tray client exactly the authority it needs—authenticate identity/status—without giving it the normal administrative password and without coupling monitoring trust to password rotation.

## Pairing / trust acquisition

### LAN pairing

For a monitor that is online but not yet trusted by this Windows PC:

1. Windows discovers the candidate using the UDP source address only.
2. User supplies the Device Password once, or Windows uses its already-DPAPI-remembered Device Password.
3. Windows performs the existing P0-2 challenge/HMAC authentication.
4. Through that authenticated management session, Windows requests the Monitoring Identity Key.
5. ESP wraps the 32-byte Monitoring Identity Key with AES-256-GCM under a session-specific key derived from the existing P0-2 management key/session/CSRF context.
6. Windows authenticates/decrypts the envelope and stores the Monitoring Identity Key under DPAPI.
7. If the user did not elect to remember the Device Password, Windows can discard the Device Password after pairing and still monitor/authenticate the unit later.

Suggested domain separation:

- key-wrap derivation: `BATMON-MONITOR-KEY-WRAP-V1`
- wrap AAD: `BATMON-MONITOR-KEY-AAD-V1|<deviceId>|<session>`

### USB pairing

Trusted USB Setup may install/read the Monitoring Identity Key directly or use an equivalent trusted command. This is acceptable because USB Setup is already a physical/trusted configuration authority.

The key must never be printed in routine logs.

## Authenticated discovery

Introduce a versioned discovery request with a fresh client nonce, for example conceptually:

`BATMON_DISCOVER_V2 <clientNonce>`

The device replies with:

- a versioned discovery payload containing Device ID, name, hostname, port, firmware version and any other non-secret discovery metadata;
- the request nonce or an unambiguous binding to it;
- HMAC-SHA-256 over the exact payload bytes and nonce using the Monitoring Identity Key.

### Exact-bytes rule

Avoid fragile JSON canonicalization rules. Prefer one of these equivalent formats:

- return a Base64-encoded payload blob plus HMAC over the decoded/raw payload bytes; or
- use a fixed versioned binary/TLV payload and HMAC that exact byte sequence.

Windows verifies the HMAC before accepting a discovery response as trusted.

### Address authority

Even after authentication, the network address comes from the **UDP source endpoint**, not from a claimed payload field. Authentication establishes *who sent the response*; the UDP source establishes *where that response came from now*.

## Authenticated status

The Windows tray client should stop treating unauthenticated `/api/status` as authoritative for paired devices.

Recommended flow:

1. Windows generates a fresh random request nonce for every status poll.
2. Windows calls an authenticated-read endpoint such as `/api/status-auth?nonce=<nonce>`.
3. ESP constructs the status payload bytes.
4. ESP HMACs a versioned domain + client nonce + exact payload bytes with the Monitoring Identity Key.
5. ESP returns payload + HMAC.
6. Windows verifies nonce binding and HMAC **before** parsing/applying voltage/state/threshold metadata.

Suggested HMAC domain:

`BATMON-STATUS-V1`

A nonce-bound response prevents replaying an old valid low/good status response as the answer to a fresh poll.

As with discovery, prefer Base64/raw payload bytes plus HMAC rather than relying on independent JSON floating-point canonicalization.

## Trust states in Windows

Each monitor known to Windows should have an explicit trust state:

- **Unpaired candidate** — discovered but has no Monitoring Identity Key on this PC; never treated as authenticated battery state.
- **Trusted** — Monitoring Identity Key exists and current discovery/status proof verifies.
- **Identity failure** — a known Device ID responded but HMAC/nonce verification failed; do not accept its battery state and surface a warning distinct from ordinary offline state.

### Existing user experience

To minimize friction:

- if Windows already has a DPAPI-remembered Device Password for a known monitor, it may pair automatically once after the P0-3 upgrade;
- otherwise prompt for the Device Password once on this PC;
- after the Monitoring Identity Key is stored, the Device Password does not need to be remembered merely for monitoring;
- changing the Device Password later does not invalidate the Monitoring Identity Key.

## Persistence

### ESP32

Store the Monitoring Identity Key in NVS as device security material.

The key should:

- survive normal configuration changes;
- survive Device Password rotation;
- survive application-only firmware updates;
- be destroyed by destructive factory/recovery reset along with other device identity material.

Longer-term Flash/NVS Encryption remains necessary for physical extraction resistance.

### Windows

Store the Monitoring Identity Key using Windows DPAPI, separate from ordinary `devices.json` metadata. A user deleting/removing a monitor from Windows should also have an option to delete the corresponding local trust key.

## Device Password rotation interaction

Normal Device Password rotation **must not** regenerate the Monitoring Identity Key. Monitoring identity represents the physical monitor, while Device Password represents current administrative authority.

If the user deliberately factory-resets/rekeys the physical monitor, a new Monitoring Identity Key is generated. Existing PCs will then report identity failure/unpaired until explicitly paired again. This is desirable because a factory identity reset should break old trust.

## Attack behavior after P0-3

### Rogue device claiming a known Device ID

It lacks the Monitoring Identity Key, so authenticated discovery/status fails.

### Attacker replays a previously observed status response

Fresh client nonce causes verification failure.

### Attacker modifies voltage/state fields in transit

HMAC over exact status payload bytes fails.

### Attacker sends a discovery payload claiming another IP

Windows ignores the claimed IP and uses UDP source address.

### HTTP redirect to another host

Windows does not follow Battery Monitor HTTP redirects.

### Attacker learns ordinary Device ID/name/firmware metadata

Still possible and acceptable; those are treated as non-secret discovery metadata, not authentication material.

## What P0-3 still does not provide

HMAC-authenticated discovery/status provides integrity, authenticity and replay resistance for those messages. It does not encrypt the battery status or hide metadata from LAN observers.

If confidentiality of status/metadata or general authenticated transport becomes a product requirement, evaluate TLS/device certificates separately. P0-3 should not be blocked on hiding non-secret voltage/status metadata.

Physical attackers who can dump unencrypted ESP32 flash/NVS remain a separate later threat until Flash/NVS Encryption and Secure Boot production posture is implemented.

## Implementation sequence

1. Complete/validate the no-regrets Windows hardening: source-IP binding, port validation, no redirects, Device ID match.
2. Add persistent random Monitoring Identity Key generation/storage to firmware.
3. Add authenticated encrypted LAN key-export/pairing endpoint using existing P0-2 session authority.
4. Add trusted USB pairing/key-transfer path.
5. Add DPAPI Monitoring Identity Key store in Windows.
6. Introduce nonce-bound authenticated discovery v2.
7. Introduce nonce-bound authenticated status endpoint.
8. Introduce Windows `Unpaired / Trusted / Identity failure` state handling.
9. Migrate existing saved devices: silently pair those with a remembered Device Password; prompt once for others.
10. Add deterministic protocol test vectors and CI tests for HMAC/key-wrap interoperability.
11. Perform hostile-LAN physical validation with rogue discovery/status responders and replay attempts.

## Closure criteria

P0-3 is not closed until, on real hardware:

- a trusted unit survives DHCP address changes and remains authenticated;
- a rogue host cannot redirect a known Device ID to another IP;
- a rogue host cannot impersonate a known unit's discovery response;
- a rogue host cannot feed a fake voltage/state accepted by Windows;
- replayed old discovery/status messages fail against fresh nonces;
- HTTP redirects are not followed;
- password rotation does not break trusted monitoring;
- destructive identity reset does break old monitoring trust;
- DPAPI trust storage survives Windows restart and is deleted when explicitly forgotten/removed.
