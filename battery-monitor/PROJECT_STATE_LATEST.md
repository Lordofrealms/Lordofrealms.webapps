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
- Configurable elapsed-time offline timeout per device; default 5 minutes.
- Timeout editor supports seconds, minutes, or hours and stores canonical seconds locally.
- A failed contact immediately displays `UNREACHABLE elapsed/timeout`.
- `OFFLINE` alert occurs only after the configured elapsed time expires; retry count does not control offline state.
- A successful response immediately clears the loss-of-contact timer and produces a recovery notification if the unit had gone offline.
- Low/critical audible + tray alerts.

### Android

- Native Java Android app consistent with the repository's Pad Grade Android style.
- minSdk 31, target/compile 36.
- Connects to temporary ESP32 setup AP using `WifiNetworkSpecifier` and an SSID-prefix system picker.
- ESP32 performs the home-network scan.
- Provisions SSID/password and initial device/battery configuration.

## Validated build checkpoint

Product-source head:

`8b31f2efae44d78211c38ca48030c8846919c4f0`

GitHub Actions Battery Monitor Toolchain run:

`34160750659` — **SUCCESS**

All three jobs completed successfully:

- ESP32 Arduino firmware compile + artifact upload.
- Windows .NET 8 compile + self-contained win-x64 publish + artifact upload.
- Android API 36 debug APK compile + artifact upload.

Artifact IDs from that exact source head:

- Android: `10032540049` — `Battery-Monitor-Setup-Android-v0.1.0`
- ESP32: `10032538335` — `battery-monitor-esp32-v0.1.0`
- Windows: `10032533322` — `Battery-Monitor-Windows-v0.1.0`

Extracted deliverable SHA-256 values checked after download:

- `Battery-Monitor-Setup-v0.1.0.apk`: `e2bcc3d75d227450e31c00d28f3253f7d29a3fdd50481be35523b8f3e51aa358`
- `BatteryMonitor.Client.exe`: `8702d01385060251bf99cc031993f788156dd2e0a02fdb240bab8a77b23e31ce`
- `Battery-Monitor-ESP32-v0.1.0-merged.bin`: `b69861ed239df2bca64ba05fa9e4bb121f1baf5f346326e01e3dff1cf67abd7d`

Artifact archive integrity was also checked after download. The APK contains an APK signing block and expected Android package entries; the Windows deliverable identifies as an x86-64 GUI PE executable.

## CI maintenance

Commit `220d8c2718d382b4ee86ce960ff444fba361d959` narrows Battery Monitor CI path triggers to firmware/Windows/Android source plus the workflow itself, so README/state/handoff-only edits do not rebuild all three targets.

## Next physical validation

1. Flash one ESP32-WROOM-32.
2. Compare the ADC-derived voltage against a trusted multimeter at several battery/input voltages and set calibration.
3. Verify Android provisioning and wrong-password/fallback behavior.
4. Verify Windows UDP discovery through a DHCP address change.
5. Verify elapsed-time `UNREACHABLE` → `OFFLINE` → recovery behavior.
6. Vehicle-test ADC jitter and Wi-Fi reach before deciding whether to add the optional 0.1 µF P34-to-GND capacitor or other front-end changes.
