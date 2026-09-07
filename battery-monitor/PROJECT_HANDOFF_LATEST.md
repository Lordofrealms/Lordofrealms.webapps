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

Windows offline detection is **elapsed-time based, never retry-count based**. Each unit has a PC-side `OfflineTimeoutSec` setting, default 300 seconds. A failed request starts/continues the loss-of-contact interval using the last successful contact time when available. The UI shows `UNREACHABLE elapsed/timeout` during the grace interval and alerts only when the configured elapsed timeout expires. A successful response immediately clears the timer. Keep the offline timeout independent of the ESP32 configuration because it is a client interpretation setting.

Next validation order after CI passes:

1. Flash one physical ESP32-WROOM-32.
2. Bench-check ADC voltage against a multimeter at several input voltages and set calibration.
3. Verify Android provisioning, including wrong-password fallback and 10-minute retry behavior.
4. Verify Windows UDP auto-discovery across DHCP address changes.
5. Verify local/on-unit names remain independent.
6. Verify configurable elapsed offline timeout, temporary `UNREACHABLE`, offline alarm, and recovery behavior.
7. Verify low and critical voltage alerts.
8. Vehicle test for ADC jitter and Wi-Fi reach before deciding whether the optional 0.1 µF ADC capacitor or additional front-end changes are necessary.
