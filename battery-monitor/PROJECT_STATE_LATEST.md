# Battery Monitor Project State

Date: 2026-09-07
Branch: `battery-monitor-dev`
Version: V0.1.0 prototype

## Locked V0.1 hardware

- ESP32-WROOM-32 development board with USB power.
- Battery ADC: P34 / GPIO34 / ADC1.
- Divider: 100 kΩ high side, 22 kΩ low side.
- No ADC capacitor initially; firmware filtering is the first-line noise treatment.
- Common battery negative / ESP32 ground required.
- Automotive transient protection is not yet designed/qualified.

## Locked V0.1 behavior

- Always-on Wi-Fi/local web server.
- 10 second default ADC sample interval, configurable 1–3600 seconds.
- Browser status refresh: 10 seconds.
- Setup AP `BatteryMonitor-XXXXXX` when unconfigured or infrastructure Wi-Fi is unavailable.
- Initial infrastructure connection attempt: 30 seconds.
- Fallback retry cadence: 10 minutes.
- BOOT/GPIO0 hold for 5 seconds clears saved Wi-Fi.
- UDP discovery port 4210 plus mDNS advertisement.

## Battery presets

- Lead acid: low 12.20 V, critical 11.90 V.
- 4S LiFePO4: low 12.80 V, critical 12.00 V.
- Presets are user-configurable alarm thresholds, not exact SOC estimates.

## Clients

### Windows

- .NET 8 WinForms tray app.
- Multi-unit automatic UDP discovery.
- Stable device-ID tracking with DHCP IP refresh.
- Local alias and independent on-unit name.
- Configurable unit sample interval and PC poll interval.
- Low/critical audible + tray alerts.
- Offline after three consecutive failed polls.

### Android

- Native Java Android app consistent with the repository's Pad Grade Android style.
- minSdk 31, target/compile 36.
- Connects to temporary ESP32 setup AP using `WifiNetworkSpecifier`.
- ESP32 performs the home-network scan.
- Provisions SSID/password and initial device/battery configuration.

## CI

The battery monitor CI workflow builds firmware, Windows client, and Android APK and publishes build artifacts on the development branch.
