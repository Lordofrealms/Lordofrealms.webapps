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
- UART0/USB serial provisioning at 115200 baud using the line-oriented `BATMON1` protocol.

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
- Configurable **Start with Windows** option. Startup registration is per-user and startup launches immediately minimize into the tray.
- **USB Setup / Flash** wizard supports COM-port refresh, ESP32 detection, reading current Battery Monitor settings, USB-only configuration, firmware-only flash, and Flash + Configure.
- USB configuration can set on-unit name, Wi-Fi, chemistry, thresholds, sample interval, and ADC calibration without requiring the device to be reachable by Wi-Fi.
- Windows USB logs redact the Wi-Fi password.

### Windows flash packaging

- CI-generated Windows package contains the exact merged ESP32 factory image built by the same workflow run.
- The package also contains Espressif `esptool` 5.3.1 for Windows amd64.
- CI verifies the official esptool archive SHA-256: `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3` before packaging.
- First/factory flash writes the merged image at address `0x0` and intentionally clears existing NVS/Wi-Fi configuration.
- `Configure USB` does not reflash and therefore preserves settings that are not explicitly changed.

### Android

- Native Java Android app consistent with the repository's Pad Grade Android style.
- minSdk 31, target/compile 36.
- Connects to temporary ESP32 setup AP using `WifiNetworkSpecifier` and an SSID-prefix system picker.
- ESP32 performs the home-network scan.
- Provisions SSID/password and initial device/battery configuration.
- Android is an alternate provisioning path; it is not required when the Windows USB setup path is available.

## Previous validated build checkpoint

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

## Current USB-feature validation

USB flashing/provisioning/startup changes are on the current development line. Candidate product source after the Arduino `HEX` macro fix is `df40ffb04b35bbe61e8e1b6fb832107fd182a4fd`.

The current CI cycle must pass firmware first; the Windows job then consumes that exact firmware artifact and verifies the bundled esptool archive before compiling/publishing the USB-capable Windows package. Do not replace the previous validated checkpoint above until this full dependent build is successful and its artifacts are inspected.

## CI maintenance

Commit `220d8c2718d382b4ee86ce960ff444fba361d959` narrows Battery Monitor CI path triggers to firmware/Windows/Android source plus the workflow itself, so README/state/handoff-only edits do not rebuild all three targets.

## Next physical validation

1. Use the Windows USB wizard on one physical ESP32-WROOM-32: Detect ESP32 -> Flash + Configure.
2. Confirm the unit joins Wi-Fi and is auto-discovered by the same Windows client.
3. Reconnect by USB and verify Read Current / Configure USB without reflashing.
4. Compare the ADC-derived voltage against a trusted multimeter at several battery/input voltages and set calibration.
5. Verify Android provisioning as the alternate setup path, including wrong-password/fallback behavior.
6. Verify Windows UDP discovery through a DHCP address change.
7. Verify elapsed-time `UNREACHABLE` -> `OFFLINE` -> recovery behavior.
8. Verify Start with Windows launches directly to the tray and can be disabled again.
9. Vehicle-test ADC jitter and Wi-Fi reach before deciding whether to add the optional 0.1 µF P34-to-GND capacitor or other front-end changes.
