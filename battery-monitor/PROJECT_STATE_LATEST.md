# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-08/09 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Prototype family:** `0.1.0`

## A. Resolve live state first

Always resolve the live `battery-monitor-dev` remote head before modifying source. Documentation/test-tool commits may be newer than the exact product source that passed CI or was signed.

### Latest normal-CI validated product source

`cb96191f8e3c8c99771b044e7a0b2260e5f56b2f` — `Make monitoring identity mutex initialization race-free`

- firmware version: `0.1.0.4`
- software release sequence: `4`
- workflow: `Battery Monitor Toolchain`
- run: **#261**
- run ID: **`34306473630`**
- result: **SUCCESS**

Exact evidence:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`

Run #261 passed authoritative ESP-IDF firmware, Android, exact firmware handoff to Windows, pinned esptool, pinned Espressif Security-2 helper, Windows .NET build, P0-3 protocol self-test, self-contained publish, bundle, and artifact upload.

### Current protected signed hardware release

The latest signed release already produced before the 0.1.0.4 responsiveness work is **0.1.0.3**:

- workflow: `Battery Monitor Signed Firmware Release`
- run: **#3**
- run ID: **`34289366368`**
- result: **SUCCESS**
- exact signed source: `80c62dfe27b3b6f32fe8ce6fa2e30e79caea6b09`
- version / release sequence: `0.1.0.3` / `3`
- signed firmware artifact: `Battery-Monitor-Signed-Firmware-0.1.0.3`, ID `10080941336`, artifact digest `sha256:4ea8d004af478459632b46a094947a9b84600f378191a0cbd1592048aad3176f`
- signed Windows artifact: `Battery-Monitor-Windows-Signed-0.1.0.3`, ID `10081008987`, artifact digest `sha256:b10981ba9d967ed18671d57ac5072123ac86df2168d6d9568589a5caa5e8ec69`
- signed application image SHA-256: `3aeffa17c76158d28a10a6773556510b5e62cffe25ba5638eda2e274bf06aecc`
- application signature SHA-256: `70aa68044a056005dd78bff3b2584696529d282725dd3b483308fb29bedc8315`
- signed merged image SHA-256: `cfc1237388d5c11a988711e58219b08f7fae4d85a80a27822421562eb4677791`
- merged signature SHA-256: `19ea86f176c0ab3d68cd9bb9a1cc4610a91559216b1345126171021fefa407fd`

`SIGNED_RELEASE.txt` in that artifact independently identifies source `80c62dfe...`, version `0.1.0.3`, release sequence `3`, RSA-3072-PSS-SHA256, the pinned ESP-IDF/Arduino toolchain, and production trust-root fingerprint.

0.1.0.3 is the hardware release on which issue #104's roughly 30-second intermittent WebUI/status stalls were observed.

## B. 0.1.0.4 normal-CI artifact authority

Run #261 artifacts:

### Firmware

- `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- artifact ID `10086957353`
- digest `sha256:737522aed36567fe9466da8b0d9a1bf4130cdeca81e6ad1e156b90fe15019397`
- application SHA-256 `d330f96c328882b237c9a0e1c19417ea10188943bb1893966ef4d181bad0a2bf`
- merged-image SHA-256 `f76404d33def7b2a4bd0ad45000ab9f2c0320867fb0fa237819ddec63f4fea93`

### Android

- `Battery-Monitor-Setup-Android-v0.1.0`
- artifact ID `10086874559`
- digest `sha256:f461633ef69746541cbd9327ae82e4591e37a2000a1c33f9a8db49f601d81bc8`

### Windows

- `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`
- artifact ID `10087014995`
- digest `sha256:53bc9563d847659e4b2ded8207d1b016259c223fca37eea1973b956f61d1c2df`
- `BatteryMonitor.Client.exe` SHA-256 `63da8c5dde0c74cb2f50477bf4794d3bd27e118482ed1922b9be7dd79d092af5`

Independent extraction confirmed the Windows bundle contains the exact firmware-job application and merged images above.

Normal-CI images are intentionally **unsigned**. Do not use them as a production/post-encryption OTA package.

## C. Issue #104 — native HTTP responsiveness fix

Open GitHub issue:

`#104 Battery Monitor: WebUI intermittently stalls for tens of seconds`

Root cause in 0.1.0.3 was not low CPU frequency. The ESP32 was already at 240 MHz. The important problems were the old synchronous Arduino WebServer model, main-loop/WebServer mutex coupling, long request waits, and overlapping browser status requests.

0.1.0.4 changes:

- production Arduino `WebServer` dependency removed;
- native ESP-IDF `esp_http_server` owns HTTP;
- dedicated Core-0 HTTP task;
- 10 client sessions, backlog 10, LRU purge, keepalive, 3-second socket receive/send waits;
- `CONFIG_LWIP_MAX_SOCKETS=20` for HTTP plus networking headroom;
- WebUI completion-based/single-flight polling;
- `/api/runtime` CPU/heap/RSSI/request diagnostics;
- coherent cached `BatterySnapshot` for all HTTP/monitoring reads;
- ADC conversion/delays happen outside HTTP and synchronization locks;
- configuration Strings/Preferences serialized across HTTP, USB, provisioning callbacks, discovery, and sampling;
- hot-path configured-Wi-Fi presence and sampling interval atomically published;
- discovery copies config once and does network/HMAC work after releasing config synchronization;
- USB and LAN signed OTA serialized through one verifier/writer state;
- secure-provisioning lifecycle atomically published across tasks;
- Monitoring Identity first initialization uses race-free mutex publication and serialized NVS/key initialization;
- trusted USB quiesces HTTP around credential operations that can replace shared credential material;
- native HTTP stop terminates the HTTP task before invalidating management challenges/sessions;
- native-HTTP CI guard prevents Arduino WebServer/obsolete modules from silently returning.

Windows monitoring was audited too:

- one shared `HttpClient`;
- 5-second timeout;
- per-device `PollInProgress` guard;
- the 1-second UI timer does not stack polls for the same monitor.

Normal CI is complete. **Hardware responsiveness validation is still required; issue #104 remains open.**

Hardware authority:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md`
- `battery-monitor/tools/Test-BatteryMonitorHttp.ps1`

## D. Issue #103 — saved Wi-Fi recovery

Open issue #103 retains the agreed recovery policy:

- saved credentials remain authoritative;
- boot attempts saved Wi-Fi for the normal connection window;
- configured radio policy is applied before join attempts;
- stale STA association state is cleared without erasing Battery Monitor's separately persisted credentials;
- protected Security-2 setup is used when home Wi-Fi remains unavailable;
- unattended fallback retries saved home Wi-Fi periodically;
- an associated setup client defers retry rather than being interrupted;
- successful retry restores normal HTTP, discovery, mDNS, monitoring, and radio policy.

0.1.0.4 must exercise this during the hardware responsiveness test because reconnect transitions are a likely place for lifecycle regressions.

## E. Issue #102 — signed LAN OTA

Signed LAN OTA remains part of the source authority:

- same OTA partitions and production RSA-3072-PSS-SHA256 trust root as signed USB OTA;
- firmware independently verifies image hash, signature, app identity, and release sequence;
- interrupted candidate transfer never selects an incomplete image;
- LAN and trusted-USB OTA share synchronized verifier/writer state;
- normal unsigned/generic HTTP BIN upload is not permitted.

Hardware signed-LAN-OTA testing remains required.

## F. Deferred management-auth review

Issue #105 records a later review of offline-guess resistance / HTTP management confidentiality. Per user direction this is **deferred** and is not a blocker for the current native-HTTP responsiveness release.

Current management auth does not send the Device Password in plaintext; password rotation uses an authenticated encrypted envelope; plaintext LAN Wi-Fi credential writes remain removed in favor of Security-2 provisioning.

Do not redesign this during the 0.1.0.4 responsiveness validation unless a new concrete defect directly affects correctness or safety.

## G. Canonical production firmware architecture

There is one production firmware build architecture:

- ESP-IDF 5.5.5;
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility component based on 3.3.11;
- exact Arduino source commit `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- application wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime implementation under `battery-monitor/firmware/BatteryMonitor/`;
- sole build entrypoint `battery-monitor/firmware/idf/build.sh`.

Do not restore PlatformIO, Arduino-CLI as a second production build, Arduino WebServer, or a second firmware runtime.

## H. Device-at-rest and release security

Production configuration retains:

- Flash Encryption release mode enabled;
- NVS Encryption enabled;
- encrypted `nvs_keys` partition;
- automatic application rollback enabled;
- encrypted-NVS software release floor requiring strictly newer accepted releases;
- Secure Boot intentionally OFF pending the full physical encrypted-device program;
- irreversible eFuse application anti-rollback OFF pending the later production gate.

Production signing public-key SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

The 4 MiB merged image is for genuinely blank, unencrypted first install only. Existing encrypted devices must use application-mediated signed OTA.

## I. Immediate next action

The next production action is **not another source edit** unless hardware testing exposes a defect.

1. Run the protected `Battery Monitor Signed Firmware Release` workflow with:
   - `source_sha = cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`
   - `version = 0.1.0.4`
2. Verify the produced `SIGNED_RELEASE.txt`, signatures, source SHA, version, release sequence 4, and trust-root fingerprint.
3. Install signed 0.1.0.4 on the already-encrypted test unit through the application-mediated updater.
4. Execute `HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md` with the latency probe.
5. Keep #104 open until hardware evidence shows the recurring multi-second/tens-of-seconds stalls are gone.
6. Keep Secure Boot/eFuse anti-rollback activation deferred until the broader encrypted-device hardware matrix is complete.

## J. Read-first authority for the next session

Resolve the live branch head, then read:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`
4. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md`
5. `battery-monitor/tools/Test-BatteryMonitorHttp.ps1`
6. GitHub issue #104
7. GitHub issue #103
8. GitHub issue #102
9. GitHub issue #105
10. `battery-monitor/firmware/README.md`
11. `battery-monitor/firmware/idf/README.md`
12. `.github/workflows/battery-monitor-ci.yml`
13. `.github/workflows/battery-monitor-signed-release.yml`
14. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
15. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
16. `battery-monitor/firmware/BatteryMonitor/NativeHttpServer.ino`
17. `battery-monitor/firmware/BatteryMonitor/NativeHttpSynchronization.ino`
18. `battery-monitor/firmware/BatteryMonitor/ConfigurationSynchronization.ino`
19. `battery-monitor/firmware/BatteryMonitor/BatterySnapshot.ino`
20. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdateSynchronization.ino`
21. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
22. `battery-monitor/firmware/BatteryMonitor/MonitoringIdentityCore.ino`
23. `battery-monitor/windows/BatteryMonitor.Client/DeviceClient.cs`
24. `battery-monitor/windows/BatteryMonitor.Client/MainForm.cs`

The exact normal-CI validated 0.1.0.4 product source remains `cb96191f8e3c8c99771b044e7a0b2260e5f56b2f` even when the live branch is later due only to documentation/test tooling.
