# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

First resolve the live branch head. Do not assume the SHA in an older chat is current.

Read, at the live ref, in this order:

1. `battery-monitor/SECURITY_REVIEW_2026-09-07.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/README.md`
4. `battery-monitor/PROTOCOL.md`
5. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
6. `battery-monitor/firmware/BatteryMonitor/SerialProvisioning.ino`
7. `battery-monitor/windows/BatteryMonitor.Client/`
8. `battery-monitor/android/`
9. `.github/workflows/battery-monitor-ci.yml`

Current target is V0.1.0: ESP32-WROOM-32 / GPIO34 with a 100k/22k divider, always-on local web server, Windows multi-monitor client, USB configuration as a primary/default path, Android as an alternate provisioning concept, and firmware flashing as a separate advanced/recovery feature.

Do not add an ADC capacitor by default. V0.1 intentionally uses trimmed multi-sample ADC filtering first; add the capacitor only if bench/vehicle data justifies it.

Do not introduce cloud/Firebase/user accounts into V0.1 unless explicitly requested. The current architecture is entirely local.

## SECURITY RELEASE GATE — IMPORTANT

`SECURITY_REVIEW_2026-09-07.md` is controlling security guidance until superseded by a later explicit review.

Do **not** treat the current Android/open-SoftAP provisioning path as safe for a real home Wi-Fi password. Current firmware creates an open `BatteryMonitor-*` SoftAP and Android sends the home Wi-Fi password over plaintext HTTP without device authentication. A rogue nearby AP can impersonate a Battery Monitor and capture credentials.

Do **not** treat current LAN configuration or monitor identity as authenticated. Current HTTP state-changing endpoints have no authorization, and Windows UDP discovery/status identity can be spoofed by a hostile LAN device. These are release-blocking for anything beyond a trusted private prototype.

Preferred secure V0.1 direction:

- USB is the normal configuration path.
- Firmware flashing is separate and hidden/advanced/recovery-oriented, not part of ordinary USB setup.
- Normal LAN web/API should be read-only until authenticated control exists.
- Do not automatically expose an open setup AP on ordinary Wi-Fi failure; secure provisioning should require physical/setup-mode activation and proof-of-possession or equivalent per-device authentication.
- Windows should pair/authenticate a device identity (preferably via a per-device secret learned over USB) before trusting battery readings.
- Move off Arduino-ESP32 3.3.11 WebServer once an upstream release includes the post-3.3.11 slow-header hardening, or explicitly incorporate that fix.
- Product/physical-theft mode should evaluate NVS encryption, Flash Encryption, Secure Boot, and ROM download restrictions. Keep development/recovery flashing behavior separate from production security mode.

## Windows monitoring requirements

Windows offline detection is **elapsed-time based, never retry-count based**. Each unit has a PC-side `OfflineTimeoutSec` setting, default 300 seconds / 5 minutes. The Windows editor supports seconds, minutes, or hours. A failed request starts/continues the loss-of-contact interval using the last successful contact time when available. The UI shows `UNREACHABLE elapsed/timeout` during the grace interval and alerts only when the configured elapsed timeout expires. A successful response immediately clears the timer. Keep the offline timeout independent of ESP32 configuration because it is a client interpretation setting.

The Windows client lives in the system tray. `Start with Windows` is user-configurable. When enabled, the HKCU Run entry invokes the executable with `--startup`; startup launches should minimize directly to the tray rather than opening the main monitoring window.

## USB configuration authority

USB configuration is a first-class/default V0.1 path and can make Android unnecessary when a Windows PC is available.

Firmware exposes a UART0/USB serial protocol at 115200 baud. Machine lines are prefixed `BATMON1`; see `PROTOCOL.md` and `SerialProvisioning.ino`. Normal debug output can coexist and must be ignored by the host unless prefixed `BATMON1`. Names/SSID/password use percent encoding. Windows logs must redact the Wi-Fi password.

USB configuration can set on-unit name, Wi-Fi SSID/password, battery chemistry, low/critical thresholds, sample interval, and ADC calibration.

Important: the Wi-Fi password is not readable back from the ESP32 through the normal USB status command. Existing Wi-Fi credentials must therefore be preserved unless the user explicitly chooses to update Wi-Fi. Commit `f2b74a21e778093d1f7a320427fe3d24b24125e8` added this host-side safeguard.

## Firmware flashing authority

The user explicitly prefers flashing to be **separate from ordinary USB configuration** and eventually hidden/advanced. Do not present `Flash + Configure` as the normal user path.

The existing CI can package the exact merged firmware image produced by the firmware job and Espressif esptool 5.3.1. The esptool Windows archive is SHA-256 checked against `2b4a73c45db27426685896f64ce3e557f63a64f43cc100cb65c0cc3486af96d3` before packaging.

Factory/recovery flashing writes the merged image at `0x0` and intentionally clears prior flash/NVS configuration. Keep this behavior behind an advanced/recovery UI with a clear destructive warning.

## Validation checkpoints

Previous fully validated product-source head:

`8b31f2efae44d78211c38ca48030c8846919c4f0`

Battery Monitor Toolchain run `34160750659` passed firmware, Windows, and Android before USB flash/provisioning was added.

USB-capable product source `df40ffb04b35bbe61e8e1b6fb832107fd182a4fd` passed Battery Monitor Toolchain run `34161985567` with firmware, Android, and the dependent Windows package successful. Windows successfully downloaded the exact firmware artifact, verified the pinned esptool archive, built, published, bundled, and uploaded the package.

Security review started from live source head `f2b74a21e778093d1f7a320427fe3d24b24125e8`; the review itself is committed in `SECURITY_REVIEW_2026-09-07.md`.

## Next engineering order

1. Complete the UI split: ordinary **USB Setup** should read/configure the device only; firmware flash moves to **Advanced Firmware**.
2. Implement the P0 security fixes from `SECURITY_REVIEW_2026-09-07.md` before using the Android path with a real Wi-Fi password or treating LAN data as authenticated.
3. Connect one physical ESP32-WROOM-32 by USB and validate USB read/configuration.
4. Verify the unit joins Wi-Fi and is discovered by the Windows client after secure identity/pairing behavior is in place.
5. Verify `Start with Windows` launches directly into the system tray and disabling it removes startup behavior.
6. Bench-check ADC voltage against a multimeter at several input voltages and set calibration.
7. Verify elapsed-time `UNREACHABLE` -> `OFFLINE` -> recovery behavior.
8. Verify low and critical voltage alerts.
9. Vehicle-test ADC jitter and Wi-Fi reach before deciding whether the optional 0.1 µF ADC capacitor or additional front-end changes are necessary.
