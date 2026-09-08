# Battery Monitor Protocol v1

## Stable public identity

Each unit derives a stable public ID from the low 24 bits of `ESP.getEfuseMac()`:

- device ID: `BM-A1B2C3`
- secure setup AP: `BatteryMonitor-A1B2C3`
- mDNS hostname: `battery-a1b2c3.local`

The human-readable name is stored separately and can change without changing Device ID.

**Device ID is an identifier, not an authentication secret.** P0-3 trust uses a separate random Monitoring Identity Key.

## User-facing Device Password / secure Wi-Fi provisioning

The initial generated 16-character / 80-bit provisioning code is the initial user-facing **Device Password**. The user may keep it or replace it. Custom Device Passwords are exact/case-sensitive; weak passwords are permitted by user choice after client warning/confirmation.

The old open-SoftAP/plaintext home-Wi-Fi provisioning path is retired.

### Temporary setup SoftAP

SSID:

```text
BatteryMonitor-XXXXXX
```

For the original generated credential, the WPA2 passphrase is derived from Device ID + credential using the project's domain-separated SHA-256 derivation. Password rotation regenerates the corresponding Security-2/AP credential material.

Possession of the WPA2 setup-network key alone is not sufficient to provision the monitor. Espressif Security 2 separately authenticates the Device Password.

### Security 2

- transport: Espressif SoftAP unified/network provisioning;
- security scheme: Security 2;
- authentication/key exchange: SRP6a;
- protected session: AES-GCM;
- default SRP username: `batmon`;
- SRP password/PoP: current Device Password.

Home Wi-Fi SSID/password are sent only after the Security-2 session is established.

A configured unit that merely loses its router does **not** automatically reopen setup mode. Use authenticated Change Wi-Fi while reachable or the approved 5-second BOOT physical-presence recovery action when the old LAN is unavailable.

## USB serial protocol

UART0 through the development-board USB-to-serial bridge operates at **115200 baud**.

Machine commands/responses use prefix:

```text
BATMON1
```

Ordinary debug output may coexist. Host software ignores lines that do not begin with `BATMON1 `.

Strings use percent encoding where required by command grammar. Visible logs must redact Wi-Fi passwords, Device Password values, and the Monitoring Identity Key.

### Core commands

```text
BATMON1 PING
BATMON1 STATUS
BATMON1 PROVSTATUS
BATMON1 MONITORKEY
BATMON1 VERIFYPROVCRED <percent-encoded-device-password>
BATMON1 CLEARWIFI
BATMON1 CLEARPROVCRED
BATMON1 REBOOT

BATMON1 SET NAME <percent-encoded-name>
BATMON1 SET BATTERY <lead_acid|lifepo4_4s> <lowV> <criticalV>
BATMON1 SET SAMPLE <seconds>
BATMON1 SET CAL <factor> <offsetV>
BATMON1 SET WIFI <percent-encoded-ssid> <percent-encoded-password>
BATMON1 SET PROVCRED <percent-encoded-username> <percent-encoded-device-password>
```

Success:

```text
BATMON1 OK ...
```

Error:

```text
BATMON1 ERR ...
```

`PROVCRED` is retained as the wire-protocol name for compatibility; it represents the current Device Password authority.

`VERIFYPROVCRED` returns MATCH / NO_MATCH and applies escalating cooldowns after repeated failures.

`MONITORKEY` is a **trusted physical-USB** command. A successful response contains the secret 32-byte Monitoring Identity Key as hex. Host software must never display or persist it in plaintext; Windows immediately protects it with DPAPI.

## P0-2 authenticated LAN management

Normal state-changing LAN operations use the Device Password without sending it as an ordinary HTTP parameter.

### Challenge/session flow

1. Client obtains `GET /api/auth/challenge`.
2. Device returns Device ID, challenge ID and fresh 128-bit nonce.
3. Client proves Device Password possession using the domain-separated management key and HMAC-SHA-256.
4. `POST /api/auth/session` creates a random 15-minute session and CSRF token on success.
5. State-changing requests send both `X-Batmon-Session` and `X-Batmon-CSRF`.

Challenges are single-use, short-lived and source-IP bound. Sessions are source-IP bound. Repeated failed authentication attempts receive escalating cooldowns.

### Authenticated state-changing routes

```text
POST /api/config
POST /api/password
POST /api/wifi/provisioning
POST /api/reset-wifi        # authenticated compatibility alias
POST /api/monitor-key       # P0-3 pairing
POST /api/auth/logout
```

Legacy plaintext:

```text
POST /api/wifi
```

is retired and returns HTTP 410.

Password rotation encrypts the replacement Device Password with AES-256-GCM under a session-derived wrapping key and invalidates existing management sessions after success.

## P0-3 Monitoring Identity Key

Each monitor generates and persists a separate random 256-bit Monitoring Identity Key.

Properties:

- independent of Device Password;
- not derivable from Device ID/MAC;
- survives Device Password rotation;
- survives normal application-only firmware update;
- destructive factory/recovery flash resets NVS and therefore produces a new monitoring identity on next boot;
- never exposed by unauthenticated LAN API.

Windows stores a paired Monitoring Identity Key under CurrentUser DPAPI, separate from ordinary device metadata and any optionally remembered Device Password.

### LAN Monitoring Identity Key export

`POST /api/monitor-key` requires a valid P0-2 management session + CSRF token.

Firmware derives the AES-256-GCM wrapping key as:

```text
HMAC-SHA256(
  managementKey,
  UTF8("BATMON-MONITOR-KEY-WRAP-V1|" + session + "|" + csrf)
)
```

AES-GCM AAD:

```text
BATMON-MONITOR-KEY-AAD-V1|<deviceId>|<session>
```

Response fields:

```json
{
  "ok": true,
  "version": 1,
  "deviceId": "BM-A1B2C3",
  "iv": "<12-byte hex>",
  "ciphertext": "<32-byte hex>",
  "tag": "<16-byte hex>"
}
```

## UDP discovery

UDP port: `4210`.

### Legacy V1 — untrusted compatibility only

Request:

```text
BATMON_DISCOVER_V1
```

V1 JSON may make a monitor visible as an **unpaired candidate**, but it is not accepted as cryptographic identity and cannot move an already-trusted saved monitor.

### Authenticated V2

Request:

```text
BATMON_DISCOVER_V2 <32-hex-client-nonce>
```

The nonce represents 128 random client bits and is fresh for the discovery attempt.

Response envelope:

```json
{
  "protocol": "BATMON_DISCOVERY_V2",
  "nonce": "<same nonce>",
  "payload": "<Base64 exact UTF-8 payload bytes>",
  "hmac": "<32-byte lower-hex HMAC-SHA-256>"
}
```

Decoded payload contains:

```json
{
  "apiVersion": 1,
  "deviceId": "BM-A1B2C3",
  "name": "GX 460",
  "hostname": "battery-a1b2c3",
  "ip": "192.168.1.84",
  "port": 80,
  "firmwareVersion": "0.1.0"
}
```

HMAC framing uses the **exact decoded payload bytes**:

```text
HMAC-SHA256(
  MonitoringIdentityKey,
  UTF8("BATMON-DISCOVERY-V2|" + nonce + "|") || payloadBytes
)
```

Windows accepts V2 as trusted only if:

- nonce belongs to a recent local discovery request;
- HMAC verifies with the locally paired Monitoring Identity Key for the payload Device ID;
- port/address fields are valid IPv4 shapes;
- signed payload `ip` exactly equals the UDP source IPv4 address.

The network address authority is the actual UDP source endpoint. Replaying a previously valid signed response from another host cannot redirect a trusted Device ID.

## mDNS

While connected to infrastructure Wi-Fi, monitor advertises:

- `_http._tcp` port 80
- `_battery-monitor._tcp` port 80

TXT metadata includes public ID/name/API information. This remains non-secret discovery metadata and is not proof of monitor identity.

## HTTP status/read API

### Legacy/plain status

`GET /api/status` returns current device/battery/runtime state. It is useful for local browser/manual diagnostics, but paired Windows monitoring does **not** treat it as authoritative identity.

`GET /api/config` returns non-secret persistent configuration and never returns stored home-Wi-Fi password.

`GET /api/ping` returns liveness only.

### Authenticated status

Paired Windows clients use:

```text
GET /api/status-auth?nonce=<32-hex-client-nonce>
```

Response:

```json
{
  "protocol": "BATMON_STATUS_V1",
  "nonce": "<same nonce>",
  "payload": "<Base64 exact UTF-8 status JSON bytes>",
  "hmac": "<32-byte lower-hex HMAC-SHA-256>"
}
```

HMAC framing:

```text
HMAC-SHA256(
  MonitoringIdentityKey,
  UTF8("BATMON-STATUS-V1|" + nonce + "|") || payloadBytes
)
```

Windows verifies protocol, nonce, HMAC and expected Device ID before applying voltage/state data. Automatic HTTP redirects are disabled for Battery Monitor traffic.

Fresh nonces provide replay resistance; modifying the exact payload bytes invalidates HMAC.

Battery states are `good`, `low`, or `critical`.

## Windows trust states

Windows distinguishes:

- **Unpaired candidate** — discovered but no local Monitoring Identity Key; battery state is not trusted;
- **Trusted** — paired key exists and current authenticated discovery/status verifies;
- **Identity failure** — known identity fails HMAC/nonce/address checks; voltage/state is discarded and a distinct security warning is shown.

A remembered DPAPI Device Password may be used once to auto-pair an existing saved unit. After Monitoring Identity pairing, Device Password need not be retained merely to monitor voltage.

Removing a monitor from Windows removes its local remembered Device Password and its DPAPI-protected Monitoring Identity Key.

## Windows Security-2 helper contract

Windows joins the protected setup AP and invokes the bundled pinned Espressif Security-2 helper.

Secrets are passed over redirected stdin as structured JSON, never as command-line arguments. The helper suppresses upstream diagnostic secret output and returns structured `BATMONPROV1` status/results.

Temporary Windows WLAN profile state is removed after the provisioning attempt, including failure paths.

## Deterministic P0-3 protocol self-test

The Windows executable supports internal mode:

```text
--protocol-self-test
```

CI executes it after the Release build and before publish. It validates fixed independent vectors for:

- discovery exact-byte HMAC framing;
- Monitoring Identity Key wrap-key derivation;
- AES-256-GCM Monitoring Identity Key envelope decryption/AAD.

A protocol-vector mismatch fails the Windows CI job and prevents packaging.

## Firmware flashing semantics

### Normal Update Firmware

- requires a running Battery Monitor USB protocol response;
- writes only the application image at `0x10000`;
- preserves NVS, Wi-Fi settings, calibration, Device Password material, and Monitoring Identity Key.

### Factory Flash / Recovery

- advanced/destructive path;
- writes Arduino merged image at `0x0`;
- merged image includes blank default NVS region;
- intentionally replaces configuration/security identity, including Monitoring Identity Key.

Firmware signing/verification is staged but not yet device-enforced. See `PROJECT_STATE_LATEST.md`.

## Security boundary

P0-2 authenticates normal management writes. P0-3 authenticates monitor discovery/status integrity and identity for paired Windows clients.

This is not TLS and does not hide non-secret voltage/device metadata from LAN observers. Physical flash extraction/reflashing protections, Secure Boot/Flash Encryption, the Arduino-ESP32 3.3.11 slow-header availability issue, code/release signing, and any future TLS/device-certificate design remain separate security work.
