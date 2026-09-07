# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

First resolve the live branch head. Do not assume the SHA in an older chat is current.

Read, at the live ref:

1. `battery-monitor/PROJECT_STATE_LATEST.md`
2. `battery-monitor/README.md`
3. `battery-monitor/PROTOCOL.md`
4. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
5. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
6. `battery-monitor/windows/BatteryMonitor.Client/`
7. `battery-monitor/android/`
8. `.github/workflows/battery-monitor-ci.yml`

Current target is V0.1.0: ESP32-WROOM-32 / GPIO34 with a 100k/22k divider, always-on local web server, Windows multi-monitor client with integrated USB flash/provisioning, and Android as an alternate Wi-Fi provisioning path.

Do not add an ADC capacitor by default. V0.1 intentionally uses trimmed multi-sample ADC filtering first; add the capacitor only if bench/vehicle data justifies it.

Do not introduce cloud/Firebase/user accounts into V0.1 unless explicitly requested. The current architecture is entirely local.

## Windows monitoring requirements

Windows offline detection is **elapsed-time based, never retry-count based**. Each unit has a PC-side `OfflineTimeoutSec` setting, default 300 seconds / 5 minutes. The Windows editor supports seconds, minutes, or hours. A failed request starts/continues the loss-of-contact interval using the last successful contact time when available. The UI shows `UNREACHABLE elapsed/timeout` during the grace interval and alerts only when the configured elapsed timeout expires. A successful response immediately clears the timer. Keep the offline timeout independent of ESP32 configuration because it is a client interpretation setting.

The Windows client lives in the system tray. `Start with Windows` is user-configurable. When enabled, the HKCU Run entry invokes the executable with `--startup`; startup launches should minimize directly to the tray rather than opening the main monitoring window.

## USB flash/provisioning authority

USB provisioning is a first-class V0.1 path and makes Android optional when a Windows PC is available.

Firmware exposes a UART0/USB serial protocol at 115200 baud. Machine lines are prefixed `BATMON1`; see `PROTOCOL.md` and `SerialProvisioning.ino`. Normal debug output can coexist and must be ignored by the host unless prefixed `BATMON1`. Names/SSID/password use percent encoding. Windows logs must redact the Wi-Fi password.

Windows `USB Setup / Flash` supports:

- refresh COM ports;
- detect an ESP32 using official Espressif esptool;
- read current Battery Monitor settings over USB;
- configure over USB without reflashing;
- flash firmware only;
- Flash + Configure as the new-board first-use flow.

USB configuration can set on-unit name, Wi-Fi SSID/password, battery chemistry, low/critical thresholds, sample interval, and ADC calibration.

CI packages the exact merged firmware image produced by the firmware job into the Windows artifact. It also downloads Espressif esptool 5.3.1 for Windows amd64 and verifies the official archive SHA-256 `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3` before packaging.

Factory/first flash writes the merged image at `0x0` and intentionally clears prior flash/NVS configuration. `Configure USB` does not reflash.

## Validation checkpoints

Previous fully validated product-source head:

`8b31f2efae44d78211c38ca48030c8846919c4f0`

Battery Monitor Toolchain run `34160750659` passed firmware, Windows, and Android before USB flash/provisioning was added.

Current USB-feature candidate product source is `df40ffb04b35bbe61e8e1b6fb832107fd182a4fd`, which includes the Arduino `HEX` macro collision fix. Its full dependent CI run must pass before treating USB flashing/provisioning as build-validated. The Windows job is intentionally dependent on firmware so it bundles the exact just-built merged image.

## Next physical validation

1. Connect one physical ESP32-WROOM-32 by USB and use Windows **Detect ESP32 -> Flash + Configure**.
2. Verify it reboots, joins Wi-Fi, and is auto-discovered by the main Windows monitor.
3. Reconnect by USB and verify **Read Current** and **Configure USB** work without reflashing.
4. Verify `Start with Windows` launches directly into the system tray and disabling it removes the startup behavior.
5. Bench-check ADC voltage against a multimeter at several input voltages and set calibration.
6. Verify Android provisioning as the alternate path, including wrong-password fallback and 10-minute retry behavior.
7. Verify Windows UDP auto-discovery across DHCP address changes.
8. Verify local/on-unit names remain independent.
9. Verify configurable elapsed offline timeout, temporary `UNREACHABLE`, offline alarm, and recovery behavior.
10. Verify low and critical voltage alerts.
11. Vehicle test for ADC jitter and Wi-Fi reach before deciding whether the optional 0.1 µF ADC capacitor or additional front-end changes are necessary.
