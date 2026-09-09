# Battery Monitor 0.1.0.4 — HTTP Responsiveness Hardware Test

**Purpose:** close GitHub issue #104 only after proving the native ESP-IDF HTTP implementation fixes the tens-of-seconds stalls seen on signed firmware 0.1.0.3.

## Exact candidate authority

Normal-CI validated product source:

`cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`

Firmware/version authority:

- version: `0.1.0.4`
- software release sequence: `4`
- normal toolchain: run #261 / run ID `34306473630` — SUCCESS
- detailed normal-CI evidence: `battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`

Hardware testing on an already-encrypted unit must use a **signed** 0.1.0.4 application package produced from the exact source SHA above. Do not install the normal-CI unsigned image through the production updater.

## Test tooling

Use:

`battery-monitor/tools/Test-BatteryMonitorHttp.ps1`

The probe uses one reusable .NET `HttpClient`, launches a configurable number of simultaneous `/api/status` requests per batch, records per-request latency, writes optional CSV, and captures `/api/runtime` at the start and end.

Default failure rule:

- any HTTP/request failure => FAIL;
- any successful status request taking 2,000 ms or more => FAIL.

The script also reports counts at 250 ms and 1,000 ms so smaller regressions remain visible.

## Before testing

1. Install the signed 0.1.0.4 application image through the normal signed application-mediated updater.
2. Confirm the device reports firmware `0.1.0.4`.
3. Record:
   - numeric IPv4 address;
   - `.local` hostname;
   - Wi-Fi RSSI from `/api/runtime`;
   - CPU MHz, free heap, and minimum free heap from `/api/runtime`.
4. Start the normal Windows Battery Monitor client and leave monitoring active.
5. Open one browser to the embedded WebUI and leave its normal ~1-second refresh running.

Do not close issue #104 merely because the page initially loads quickly. The original failure was intermittent and must be tested over time and under concurrent load.

## A. Direct-IP baseline

Run for 5 minutes with one probe request per second while Windows monitoring and one browser are active:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-BatteryMonitorHttp.ps1 `
  -BaseUrl http://192.168.x.x `
  -DurationSec 300 `
  -Concurrency 1 `
  -IntervalMs 1000 `
  -CsvPath .\batmon-direct-baseline.csv
```

Pass expectations:

- zero failed requests;
- zero requests >= 2,000 ms;
- no repeating multi-second stalls;
- p95/p99 should remain comfortably below the failure threshold on a healthy LAN;
- WebUI remains visibly responsive throughout;
- Windows monitor continues updating normally.

Record the full summary plus START/END `/api/runtime` output.

## B. `.local` baseline

Repeat the same 5-minute test through mDNS:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-BatteryMonitorHttp.ps1 `
  -BaseUrl http://BATMON-XXXXXX.local `
  -DurationSec 300 `
  -Concurrency 1 `
  -IntervalMs 1000 `
  -CsvPath .\batmon-mdns-baseline.csv
```

This separates HTTP-server behavior from name-resolution behavior. If numeric IP is clean but `.local` is not, do not attribute the difference to the HTTP scheduler without further mDNS/DNS investigation.

## C. Concurrent-client stress

Keep Windows monitoring active and the browser WebUI open. Run batches of simultaneous requests:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-BatteryMonitorHttp.ps1 `
  -BaseUrl http://192.168.x.x `
  -DurationSec 300 `
  -Concurrency 5 `
  -IntervalMs 1000 `
  -CsvPath .\batmon-concurrency-5.csv
```

Then repeat at 10 simultaneous requests per batch:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-BatteryMonitorHttp.ps1 `
  -BaseUrl http://192.168.x.x `
  -DurationSec 300 `
  -Concurrency 10 `
  -IntervalMs 1000 `
  -CsvPath .\batmon-concurrency-10.csv
```

The 10-request pass is intentionally aggressive and exercises the configured 10-session design in addition to the browser and Windows client. Record errors and latency distribution rather than judging only by page appearance.

## D. ADC sampling interaction

During a direct-IP baseline run:

1. leave the device at its normal sample interval;
2. confirm `lastSampleAgeMs` repeatedly resets in `/api/status`;
3. verify there is no periodic latency spike correlated with ADC samples;
4. if practical, temporarily set a short sample interval through normal authenticated configuration and repeat for at least 2 minutes;
5. restore the desired sample interval afterward.

Expected result: HTTP reads continue to use the last published snapshot; ADC conversion/delays must not stall status servicing.

## E. Configuration interaction

While a 1-request-per-second probe is running:

1. open configuration in the Windows client or WebUI;
2. read config repeatedly;
3. make a benign setting change and apply it;
4. change it back;
5. verify status polling continues without a multi-second stall;
6. verify settings remain coherent and the device does not reboot unexpectedly.

## F. Wi-Fi range/reconnect/fallback recovery

Exercise issue #103 behavior while also watching issue #104 responsiveness:

1. start a probe and confirm healthy baseline;
2. make the configured AP unavailable or move the monitor out of range;
3. observe expected request failures while the network is genuinely unreachable;
4. restore the AP;
5. verify saved Wi-Fi reconnects without credential loss;
6. after connectivity returns, immediately rerun a 5-minute direct-IP probe;
7. repeat a protected-fallback/retry cycle where practical;
8. confirm native HTTP, discovery, mDNS, Windows monitoring, and WebUI all recover.

Network-unreachable time is not an HTTP-server latency failure. The acceptance question is whether service becomes responsive promptly and stays responsive after network recovery.

## G. Signed LAN OTA interaction

With 0.1.0.4 installed and a later valid signed test candidate available, exercise signed LAN OTA while observing the device before and after the update. Do not upload unsigned/generic BIN files.

Verify:

- update transfer does not corrupt currently running firmware;
- interrupted transfer leaves the current image bootable;
- successful verified update reboots as expected;
- after reboot/probation, HTTP returns to the same responsiveness standard;
- `/api/runtime` remains sane for heap/RSSI/request diagnostics.

If no later signed candidate is available during the first 0.1.0.4 responsiveness test, record signed LAN OTA as a separate pending hardware gate rather than simulating it with an unsigned image.

## H. Prolonged idle / soak

Run at least one longer probe after the short tests. Recommended minimum:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-BatteryMonitorHttp.ps1 `
  -BaseUrl http://192.168.x.x `
  -DurationSec 3600 `
  -Concurrency 1 `
  -IntervalMs 1000 `
  -CsvPath .\batmon-soak-1h.csv
```

Keep Windows monitoring and the browser WebUI active for as much of the soak as practical.

Watch for:

- latency drift;
- repeated >250 ms or >1,000 ms outliers;
- any >=2,000 ms request;
- request failures;
- falling free/minimum heap;
- Wi-Fi RSSI degradation;
- device resets;
- stale WebUI/Windows readings.

## Required evidence for issue #104 closure

Attach or summarize:

- exact signed 0.1.0.4 source/package authority;
- direct-IP baseline summary and CSV;
- `.local` baseline summary and CSV;
- concurrency-5 and concurrency-10 summaries;
- START/END `/api/runtime` snapshots for the major runs;
- ADC/config interaction result;
- Wi-Fi recovery result;
- soak result;
- any observed reset/reconnect events;
- signed LAN OTA result, or an explicit note that this remains a separate hardware gate.

### Closure criterion

Close #104 only when ordinary `/api/status` is effectively immediate on a healthy LAN and the 0.1.0.3 pattern of recurring multi-second/tens-of-seconds stalls is absent under normal browser + Windows monitoring + ADC activity.

A single fast page load is not sufficient evidence.
