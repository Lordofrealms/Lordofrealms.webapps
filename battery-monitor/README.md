# Battery Monitor

Local-first ESP32 battery monitoring toolchain for 12 V batteries.

## V0.1 architecture

- **ESP32-WROOM-32** is always powered from USB and remains on the local Wi-Fi network.
- **GPIO34 / P34** measures battery voltage through a **100 kΩ / 22 kΩ** divider.
- The ESP32 hosts a small status/configuration page and JSON API.
- A **Windows .NET 8 WinForms tray client** automatically discovers and monitors multiple units.
- A **native Android Java setup APK** provisions the initial Wi-Fi connection.
- No cloud account, user signup, remote server, Firebase, or always-on home server is required for V0.1.

## Wiring

```text
Battery + ---- 100 kΩ ----+---- P34 / GPIO34
                           |
                          22 kΩ
                           |
Battery - -----------------+---- ESP32 GND

ESP32 power: USB-C / USB power to the development board
```

The divider multiplier is `(100k + 22k) / 22k = 5.5454545`.

### Why there is no ADC capacitor in V0.1

The initial hardware intentionally omits the 0.1 µF ADC capacitor. The firmware performs four throw-away ADC reads followed by 20 calibrated millivolt reads, sorts them, and averages the middle 12. This is intended to determine whether software filtering is sufficient with the 100 kΩ / 22 kΩ divider before adding hardware. If real vehicle testing shows excessive jitter or source-impedance error, a 0.1 µF capacitor from P34 to GND can be added later without changing the firmware/API.

The ESP32 ADC is not a precision voltmeter. Final installation should be calibrated against a trusted multimeter using the configurable calibration factor/offset.

### Automotive protection

This is a prototype measurement input, not yet a qualified automotive front end. A production/permanent vehicle design should add appropriate transient/load-dump protection before relying on it long term.

## Default battery alarm presets

These are alarm thresholds, not precise state-of-charge gauges, and are fully configurable on the ESP32 web page and from the Windows client.

| Battery type | Low | Critical |
|---|---:|---:|
| 12 V lead-acid | 12.20 V | 11.90 V |
| 4S LiFePO4 | 12.80 V | 12.00 V |

LiFePO4 has a relatively flat discharge curve, so voltage alone is especially poor as an SOC gauge. Tune the thresholds to the actual pack/BMS and desired reserve.

## ESP32 behavior

### Normal

1. Samples battery voltage every 10 seconds by default.
2. Hosts `http://<device-ip>/`.
3. Advertises mDNS services and listens for Battery Monitor UDP discovery on port 4210.
4. Responds to Windows client polling through `/api/status`.

### Initial Wi-Fi setup / failed Wi-Fi

The setup SSID is `BatteryMonitor-XXXXXX`, where the suffix comes from the ESP32's unique MAC/eFuse identity.

- With no saved Wi-Fi, the setup AP starts immediately.
- With saved Wi-Fi, the ESP32 tries it for 30 seconds.
- If it cannot connect, it enables the setup AP.
- While in fallback setup mode, it retries the saved Wi-Fi every 10 minutes.
- Once Wi-Fi connects, the setup AP shuts down.
- Holding the common **BOOT / GPIO0** button for 5 seconds clears only the saved Wi-Fi credentials and restarts setup mode. The firmware waits for GPIO0 to be released before rebooting so the board does not intentionally reboot into its serial bootloader.

The ESP32 setup AP is intentionally open for this first prototype. A product version should add proof-of-possession/setup authentication.

## Local web page

The page shows:

- current voltage and state;
- device ID and name;
- Wi-Fi status/RSSI;
- lead-acid/LiFePO4 preset selection;
- low and critical thresholds;
- unit sample interval;
- calibration factor and offset;
- Wi-Fi reset/setup control.

The browser status view refreshes every 10 seconds. The ESP32 sample interval is configurable from 1–3600 seconds.

## Windows client

Project: `windows/BatteryMonitor.Client`

The .NET 8 WinForms client:

- automatically broadcasts `BATMON_DISCOVER_V1` and finds all monitors on the LAN;
- remembers units by stable device ID, not IP address;
- updates addresses when DHCP changes them;
- supports a **local alias** plus a separate **name stored on the ESP32**;
- polls each device independently (10 seconds default, configurable per device);
- displays voltage, state, battery type, last seen, RSSI, IP, and ID;
- beeps and shows a Windows tray balloon on low/critical transitions;
- repeats an active low/critical alert every 30 minutes;
- declares a monitor offline after 3 consecutive failed polls;
- provides Configure and Open Web Page actions.

Local settings are stored under `%LOCALAPPDATA%/BatteryMonitor/devices.json`.

## Android setup app

Project: `android`

The Android app uses the same native Java + Gradle style used by the existing Pad Grade Android project in this repository.

Setup flow:

1. Scan for `BatteryMonitor-XXXXXX` setup APs.
2. Select/connect to a monitor. Android may show its system approval dialog for the temporary Wi-Fi connection.
3. Ask the ESP32 itself to scan nearby home Wi-Fi networks.
4. Select/type the home SSID and enter its password.
5. Give the unit a name, select battery chemistry/thresholds, and choose sample interval.
6. Submit configuration.
7. The ESP32 joins the home network. If it fails, its setup AP remains/returns and it retries every 10 minutes.

The phone does not retain or send the Wi-Fi password anywhere except directly to the ESP32 over the temporary local setup network.

## API / discovery

See `PROTOCOL.md`.

## Builds

GitHub Actions workflow: `.github/workflows/battery-monitor-ci.yml`

It builds:

- ESP32 sketch against Espressif Arduino core **3.3.11**;
- Windows x64 self-contained single-file publish;
- Android debug APK using the same Android toolchain family as Pad Grade (compile/target SDK 36, AGP 9.3.0, Gradle 9.5.0).

## Development state

See `PROJECT_STATE_LATEST.md` and `PROJECT_HANDOFF_LATEST.md`.
