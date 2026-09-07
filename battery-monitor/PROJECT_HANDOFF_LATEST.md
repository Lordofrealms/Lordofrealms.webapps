# Battery Monitor Handoff

Continue work in `Lordofrealms/Lordofrealms.webapps` on branch `battery-monitor-dev`.

First resolve the live branch head. Do not assume the SHA in an older chat is current.

Read, at the live ref:

1. `battery-monitor/PROJECT_STATE_LATEST.md`
2. `battery-monitor/README.md`
3. `battery-monitor/PROTOCOL.md`
4. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
5. `battery-monitor/windows/BatteryMonitor.Client/`
6. `battery-monitor/android/`
7. `.github/workflows/battery-monitor-ci.yml`

Current target is V0.1.0: ESP32-WROOM-32 / GPIO34 with a 100k/22k divider, always-on local web server, Windows multi-monitor client, and Android Wi-Fi provisioning APK.

Do not add an ADC capacitor by default. V0.1 intentionally uses trimmed multi-sample ADC filtering first; add the capacitor only if bench/vehicle data justifies it.

Do not introduce cloud/Firebase/user accounts into V0.1 unless explicitly requested. The current architecture is entirely local after Android provisioning.

Windows offline detection is **elapsed-time based, never retry-count based**. Each unit has a PC-side `OfflineTimeoutSec` setting, default 300 seconds / 5 minutes. The Windows editor supports seconds, minutes, or hours. A failed request starts/continues the loss-of-contact interval using the last successful contact time when available. The UI shows `UNREACHABLE elapsed/timeout` during the grace interval and alerts only when the configured elapsed timeout expires. A successful response immediately clears the timer. Keep the offline timeout independent of ESP32 configuration because it is a client interpretation setting.

## Validated product checkpoint

The exact product-source head:

`8b31f2efae44d78211c38ca48030c8846919c4f0`

passed Battery Monitor Toolchain run `34160750659` with all three jobs successful:

- ESP32 Arduino compile and artifact.
- Windows .NET 8 build/self-contained x64 publish and artifact.
- Android API 36 APK build and artifact.

Post-download artifact integrity checks also passed. See `PROJECT_STATE_LATEST.md` for artifact IDs and SHA-256 hashes.

CI maintenance commit `220d8c2718d382b4ee86ce960ff444fba361d959` narrows Battery Monitor CI triggers to product source/workflow changes so project-state documentation can be updated without rebuilding everything.

## Next physical validation

1. Flash one physical ESP32-WROOM-32.
2. Bench-check ADC voltage against a multimeter at several input voltages and set calibration.
3. Verify Android provisioning, including wrong-password fallback and 10-minute retry behavior.
4. Verify Windows UDP auto-discovery across DHCP address changes.
5. Verify local/on-unit names remain independent.
6. Verify configurable elapsed offline timeout, temporary `UNREACHABLE`, offline alarm, and recovery behavior.
7. Verify low and critical voltage alerts.
8. Vehicle test for ADC jitter and Wi-Fi reach before deciding whether the optional 0.1 µF ADC capacitor or additional front-end changes are necessary.
