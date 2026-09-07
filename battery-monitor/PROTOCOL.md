# Battery Monitor Protocol v1

## Stable device identity

Each unit derives a stable public ID from the low 24 bits of `ESP.getEfuseMac()`:

- device ID: `BM-A1B2C3`
- secure setup AP: `BatteryMonitor-A1B2C3`
- mDNS hostname: `battery-a1b2c3.local`

The human-readable name is stored separately and can change without changing the device ID.

The public device ID is an identifier, **not an authentication secret**.

## Secure Wi-Fi provisioning

The old open-SoftAP/plaintext application provisioning path is retired for Windows/Android setup.

Each initialized unit has a random 16-character / 80-bit human setup code. QR and manual entry carry the same authority.

### Temporary SoftAP

SSID:

```text
BatteryMonitor-XXXXXX
```

The WPA2 passphrase is deterministically derived from the canonical setup code and Device ID:

```text
SHA256("BATMON-SOFTAP-V1|" + deviceId + "|" + canonicalSetupCode)
```

The first 16 digest bytes are rendered as 32 uppercase hexadecimal characters.

Possession of this derived WPA2 key alone is not sufficient to provision the device. Espressif Security 2 separately authenticates the root setup code.

### Security 2

- transport: Espressif SoftAP unified/network provisioning;
- security scheme: Security 2;
- authentication/key exchange: SRP6a;
- protected session: AES-GCM;
- default SRP username: `batmon`;
- SRP password/PoP: canonical 16-character setup code.

The home Wi-Fi SSID/password are sent only after the Security-2 session is established.

### QR payload

QR is a convenience format, not a separate credential authority. It contains enough information for Android/Windows to reproduce the same manual-code setup flow, including Device ID, service name, Security-2 metadata, setup code, and derived SoftAP key.

The receiving client must verify that the QR service name/key are consistent with the Device ID + setup code before using them.

## USB serial provisioning

UART0 through the development board USB-to-serial bridge operates at **115200 baud**.

Machine commands/responses use the prefix:

```text
BATMON1
```

Ordinary firmware debug output may coexist. Host software must ignore lines that do not begin with `BATMON1 `.

Names, SSIDs, passwords, and setup-code fields use percent encoding where required by the command grammar. Visible host logs must redact Wi-Fi passwords.

### Core commands

```text
BATMON1 PING
BATMON1 STATUS
BATMON1 PROVSTATUS
BATMON1 VERIFYPROVCRED <percent-encoded-candidate-code>
BATMON1 CLEARWIFI
BATMON1 CLEARPROVCRED
BATMON1 REBOOT

BATMON1 SET NAME <percent-encoded-name>
BATMON1 SET BATTERY <lead_acid|lifepo4_4s> <lowV> <criticalV>
BATMON1 SET SAMPLE <seconds>
BATMON1 SET CAL <factor> <offsetV>
BATMON1 SET WIFI <percent-encoded-ssid> <percent-encoded-password>
BATMON1 SET PROVCRED <percent-encoded-username> <percent-encoded-setup-code>
```

Success:

```text
BATMON1 OK ...
```

Error:

```text
BATMON1 ERR ...
```

### Setup-code administration

`SET PROVCRED` generates/stores the Security-2 SRP salt/verifier, setup-code check hash, and derived SoftAP key.

`PROVSTATUS` reports whether a provisioning identity is ready but never returns the root setup code.

`VERIFYPROVCRED` returns only:

```text
BATMON1 OK PROVCRED MATCH
```

or:

```text
BATMON1 OK PROVCRED NO_MATCH
```

Repeated wrong guesses produce escalating cooldown responses such as:

```text
BATMON1 ERR PROVCRED_VERIFY_COOLDOWN <seconds>
```

`CLEARPROVCRED` destroys the per-device provisioning identity. A unit without a provisioning identity cannot offer the secure wireless setup service until a new code is initialized over trusted USB.

## UDP discovery

- UDP port: `4210`
- Windows broadcast request: `BATMON_DISCOVER_V1\n`
- monitor response: UTF-8 JSON including protocol/version, public device ID, name, hostname, IP/port, and firmware version.

Example:

```json
{
  "protocol": "BATMON_DISCOVERY_V1",
  "apiVersion": 1,
  "deviceId": "BM-A1B2C3",
  "name": "GX 460",
  "hostname": "battery-a1b2c3",
  "ip": "192.168.1.84",
  "port": 80,
  "firmwareVersion": "0.1.0"
}
```

**Security status:** this discovery protocol is not cryptographically authenticated yet. P0-3 remains open; do not treat the device ID or discovery JSON as proof of identity on a hostile LAN.

## mDNS

While connected to infrastructure Wi-Fi, the monitor advertises:

- `_http._tcp` port 80
- `_battery-monitor._tcp` port 80

TXT metadata includes public ID/name/API information. Treat it as non-secret discovery metadata.

## HTTP API

### Read/status

`GET /api/status` returns device/battery/runtime state including:

- API/firmware version;
- public device ID/name/hostname/IP;
- Wi-Fi connection/RSSI;
- battery chemistry;
- voltage/state;
- ADC raw/millivolt values;
- thresholds;
- calibration factor/offset;
- sample interval;
- uptime/sample age.

States are `good`, `low`, or `critical`.

`GET /api/config` returns persistent device configuration but never returns the stored home Wi-Fi password.

`GET /api/ping` returns a simple liveness response.

### Existing state-changing LAN endpoints

The prototype still contains application HTTP endpoints such as:

```text
POST /api/config
POST /api/wifi
POST /api/reset-wifi
```

and Wi-Fi scanning support.

These endpoints are **not authenticated yet** and are the subject of security finding **P0-2**. They must not be treated as a secure management interface. Android/Windows secure wireless onboarding does not use `POST /api/wifi` for the user's home credential.

P0-2 is the next security item to resolve.

## Windows wireless provisioner helper contract

The Windows application joins the protected setup AP, then invokes the bundled Espressif Security-2 helper.

Secrets are passed to that helper via redirected stdin as a single JSON request. They are not supplied as command-line arguments.

Conceptual request:

```json
{
  "protocol": "BATMONPROV1",
  "username": "batmon",
  "setupCode": "<canonical setup code>",
  "homeSsid": "<home SSID>",
  "homePassword": "<home password>",
  "serviceName": "192.168.4.1:80"
}
```

Helper stdout contains only structured stage/result messages prefixed by protocol field `BATMONPROV1`; upstream provisioner diagnostic stdout/stderr is suppressed by the wrapper.

The temporary Windows WLAN profile contains only the derived WPA2 key and is removed after the attempt, including failure paths.

## Firmware flashing semantics

### Normal Update Firmware

- requires a running Battery Monitor to answer the USB protocol first;
- writes only the application partition;
- preserves NVS, Wi-Fi, calibration, and provisioning identity.

### Factory Flash / Recovery

- advanced/destructive path;
- writes the Arduino merged image at address `0x0`;
- intentionally replaces/wipes configuration and provisioning identity.

Firmware signing/verification is staged but not yet enforced; see `PROJECT_STATE_LATEST.md`.
