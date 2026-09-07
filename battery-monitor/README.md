# Battery Monitor

Local-first ESP32 battery monitoring toolchain for 12 V lead-acid and 4S LiFePO4 batteries.

## Hardware

- ESP32-WROOM-32 development board, continuously USB powered.
- Battery measurement on **P34 / GPIO34**.
- Divider: **100 kΩ** from battery+ to P34 and **22 kΩ** from P34 to ground.
- Common battery negative / ESP32 ground required.
- No ADC capacitor in the initial build; firmware performs trimmed multi-sample filtering first.
- Production/permanent vehicle use still needs a qualified automotive transient/load-dump front end.

```text
Battery + ---- 100 kΩ ----+---- P34 / GPIO34
                           |
                          22 kΩ
                           |
Battery - -----------------+---- ESP32 GND
```

Divider multiplier: `(100k + 22k) / 22k = 5.5454545`.

## Monitoring

- ESP32 sample interval: 10 seconds default, configurable 1–3600 seconds.
- Browser status refresh: 10 seconds.
- ADC calibration factor + offset are persistent/configurable.
- Lead-acid defaults: low 12.20 V, critical 11.90 V.
- 4S LiFePO4 defaults: low 12.80 V, critical 12.00 V.
- These are alarm presets, not exact state-of-charge estimates.

## Secure setup

The original open-AP/plaintext provisioning prototype is retired.

Each initialized monitor has a unique **16-character / 80-bit setup code**. The code can be typed manually on Windows or Android; QR is only a convenience representation.

Wireless setup uses two independent layers:

1. temporary `BatteryMonitor-XXXXXX` WPA2 SoftAP with a per-device key derived from Device ID + setup code;
2. Espressif Unified Provisioning **Security 2** using SRP6a authentication and AES-GCM protected provisioning traffic.

The home Wi-Fi password is sent only inside the authenticated Security-2 session.

The ESP32 stores the SRP salt/verifier, a setup-code check hash used for trusted USB verification, and the derived SoftAP key. It does not expose a plaintext setup-code readback command.

If a board has not yet had a per-device setup credential initialized, it does **not** substitute an open provisioning AP; initialize it through trusted USB first.

See `SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`.

## Windows client

Project: `windows/BatteryMonitor.Client`

.NET 8 WinForms tray application with:

- automatic multi-unit LAN discovery;
- local aliases plus independent names stored on devices;
- configurable poll interval and per-device elapsed offline timeout;
- default offline timeout 5 minutes, editable in seconds/minutes/hours;
- immediate `UNREACHABLE elapsed/timeout` state when contact is lost;
- offline beep/tray notification only after the configured elapsed timeout;
- low/critical battery audio + tray alerts;
- configurable Start with Windows; startup launches directly into tray;
- Open Web Page and configuration actions.

### USB Setup

USB configuration is a normal/default setup path and does not require Wi-Fi.

It can manage:

- device name;
- Wi-Fi credentials when explicitly selected;
- battery chemistry and thresholds;
- sample interval;
- ADC calibration;
- provisioning setup identity/code through the Advanced provisioning-admin screen.

Because the ESP32 does not return its stored Wi-Fi password, normal USB maintenance preserves existing Wi-Fi unless **Update Wi-Fi credentials** is explicitly selected.

### Wireless Setup on Windows

The Windows app can use the same printed setup code without USB:

1. derive the protected temporary-AP key;
2. join `BatteryMonitor-XXXXXX` through a unique temporary Windows WLAN profile;
3. run a bundled, pinned Espressif Security-2 provisioner helper;
4. pass setup code + home credentials to that helper through redirected stdin, not process arguments;
5. delete the temporary WLAN profile in cleanup whether provisioning succeeds or fails.

### Firmware Update

**Update Firmware** is a normal top-level function. It verifies that the selected USB device is already running Battery Monitor firmware, then writes only the application partition so Wi-Fi/settings/provisioning identity remain intact.

### Factory Flash / Recovery

A destructive merged-image flash remains in **Advanced** in the regular app for the current prototype. It writes the merged image at `0x0` and wipes prior NVS/configuration/provisioning identity.

The Advanced password is only a UI/casual-use gate; it is not considered a hard security boundary.

## Android secure setup

Project: `android`

Native Java Android app, API 31+.

Setup flow:

1. scan the Battery Monitor QR or manually enter Device ID + setup code;
2. derive/connect to the monitor's WPA2 temporary setup AP;
3. establish Espressif Security 2;
4. scan home Wi-Fi through the monitor;
5. select/type home SSID and password;
6. provision those credentials inside the protected session.

The app does not persist the setup code or home Wi-Fi password and clears those input fields after successful provisioning.

For now Android secure setup changes Wi-Fi only. Name/battery/threshold/calibration management remains USB-side while LAN management authentication is addressed separately.

## USB serial protocol

UART0/USB serial uses 115200 baud and a line-oriented `BATMON1` protocol. Ordinary debug output can coexist; host software only treats `BATMON1 ` lines as machine responses.

See `PROTOCOL.md`.

## LAN security status

Secure provisioning is resolved at source/build level, but two separate release-blocking LAN issues remain:

- **P0-2:** state-changing LAN HTTP management endpoints are not authenticated yet;
- **P0-3:** LAN discovery/status identity is not cryptographically authenticated yet.

Do not treat current LAN configuration or hostile-LAN battery identity as secured until those are closed.

## Firmware signing

An RSA-3072 signing authority has been staged:

- public key: `signing/battery_monitor_secureboot_rsa3072_public.pem`;
- public-key SHA-256 fingerprint (DER SPKI): `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- encrypted private-key backup is stored separately in ChatGPT Library.

CI signing and updater signature enforcement are **not active yet**. Planned sequence is signed release image -> Windows signature verification -> later ESP32 Secure Boot v2 on production hardware. Do not enable/burn Secure Boot fuses on development boards yet.

## Builds

GitHub Actions: `.github/workflows/battery-monitor-ci.yml`

Current secure-provisioning acceptance checkpoint:

- source: `e4fa7fd5af46224e0c96fca1fe8090ba29dcee44`;
- run: `34167794017` — **SUCCESS**;
- ESP32, Android, and Windows all green;
- Windows build includes pinned Espressif Security-2 helper, exact same-run firmware artifacts, and SHA-256-verified Espressif esptool v5.3.1.

## Development state

Read:

1. `SECURITY_P0_1_SECURE_PROVISIONING_RESOLUTION_2026-09-07.md`
2. `SECURITY_REVIEW_2026-09-07.md`
3. `PROJECT_STATE_LATEST.md`
4. `PROJECT_HANDOFF_LATEST.md`
