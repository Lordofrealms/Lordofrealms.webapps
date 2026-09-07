# Battery Monitor Protocol v1

## Stable identity

Each unit derives a stable ID from the low 24 bits of `ESP.getEfuseMac()`:

- device ID: `BM-A1B2C3`
- setup AP: `BatteryMonitor-A1B2C3`
- mDNS hostname: `battery-a1b2c3.local`

The human-readable device name is stored separately and can change without changing identity.

## UDP discovery

- UDP port: `4210`
- Client broadcasts ASCII: `BATMON_DISCOVER_V1\n`
- Each unit responds directly to the sender's source IP/port with UTF-8 JSON.

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

## mDNS

When connected to infrastructure Wi-Fi, the unit advertises:

- `_http._tcp` on port 80
- `_battery-monitor._tcp` on port 80

TXT fields:

- `id`
- `name`
- `api`

UDP discovery remains the Windows client's primary discovery mechanism for V0.1 because it also directly returns the current IP address.

## HTTP API

### GET `/api/status`

Example:

```json
{
  "apiVersion": 1,
  "firmwareVersion": "0.1.0",
  "deviceId": "BM-A1B2C3",
  "name": "GX 460",
  "hostname": "battery-a1b2c3",
  "ip": "192.168.1.84",
  "wifiConnected": true,
  "setupApActive": false,
  "rssi": -57,
  "batteryType": "lead_acid",
  "voltage": 12.487,
  "state": "good",
  "adcRaw": 2812,
  "adcMillivolts": 2252,
  "lowVoltage": 12.200,
  "criticalVoltage": 11.900,
  "calibrationFactor": 1.000000,
  "calibrationOffset": 0.0000,
  "sampleIntervalSec": 10,
  "uptimeSec": 3600,
  "lastSampleAgeMs": 3180
}
```

States: `good`, `low`, `critical`.

### GET `/api/config`

Returns persistent device configuration. The Wi-Fi password is never returned.

### POST `/api/config`

Content type: `application/x-www-form-urlencoded`

Supported fields:

- `name`
- `batteryType`: `lead_acid` or `lifepo4_4s`
- `lowVoltage`
- `criticalVoltage`
- `sampleIntervalSec`: 1–3600
- `calibrationFactor`: 0.5–1.5
- `calibrationOffset`: -5.0–5.0 V

Fields not supplied are left unchanged.

### GET `/api/wifi/scan`

Returns Wi-Fi networks observed by the ESP32:

```json
{"networks":[{"ssid":"HomeWiFi","rssi":-45,"secure":true}]}
```

### POST `/api/wifi`

Content type: `application/x-www-form-urlencoded`

Fields:

- `ssid` (required)
- `password` (may be blank for open Wi-Fi)

Credentials are saved in ESP32 Preferences/NVS. The unit immediately starts a connection attempt.

### POST `/api/reset-wifi`

Clears only saved SSID/password and restarts into setup mode.

### GET `/api/ping`

Returns `{"ok":true}`.

## Setup AP

The provisioning HTTP API uses `192.168.4.1` while the temporary setup AP is active. V0.1 uses plain local HTTP and an open setup AP. It is intended for prototype/local use only.
