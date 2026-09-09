# Battery Monitor — Session Handoff

**Updated:** 2026-09-08/09 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume the documentation head equals the validated product SHA.**

## 1. Current validated product checkpoint

Exact 0.1.0.4 product source:

`cb96191f8e3c8c99771b044e7a0b2260e5f56b2f` — `Make monitoring identity mutex initialization race-free`

Version / release sequence:

- `0.1.0.4`
- `4`

Normal-CI authority:

- workflow: `Battery Monitor Toolchain`
- run: **#261**
- run ID: **`34306473630`**
- conclusion: **SUCCESS**

Run #261 passed:

- authoritative ESP-IDF firmware build;
- Android build/package;
- exact firmware handoff to Windows;
- pinned esptool verification;
- pinned Espressif Security-2 helper build;
- Windows .NET 8 build;
- P0-3 protocol self-test;
- self-contained win-x64 publish;
- Windows bundle/artifact upload.

Frozen evidence:

`battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`

### Normal-CI artifacts

Firmware:

- artifact ID `10086957353`
- digest `sha256:737522aed36567fe9466da8b0d9a1bf4130cdeca81e6ad1e156b90fe15019397`
- application SHA-256 `d330f96c328882b237c9a0e1c19417ea10188943bb1893966ef4d181bad0a2bf`
- merged image SHA-256 `f76404d33def7b2a4bd0ad45000ab9f2c0320867fb0fa237819ddec63f4fea93`

Android:

- artifact ID `10086874559`
- digest `sha256:f461633ef69746541cbd9327ae82e4591e37a2000a1c33f9a8db49f601d81bc8`

Windows:

- artifact ID `10087014995`
- digest `sha256:53bc9563d847659e4b2ded8207d1b016259c223fca37eea1973b956f61d1c2df`
- `BatteryMonitor.Client.exe` SHA-256 `63da8c5dde0c74cb2f50477bf4794d3bd27e118482ed1922b9be7dd79d092af5`

Independent extraction verified that the Windows bundle contains the exact firmware-job application and merged images.

Normal-CI firmware is intentionally unsigned and must not be installed as a production/post-encryption OTA package.

## 2. Current signed release / problem reproduction authority

Latest protected signed package already produced is **0.1.0.3**:

- signed workflow run #3
- run ID `34289366368`
- conclusion `SUCCESS`
- exact source `80c62dfe27b3b6f32fe8ce6fa2e30e79caea6b09`
- signed firmware artifact ID `10080941336`
- signed Windows artifact ID `10081008987`

Signed artifact `SIGNED_RELEASE.txt` confirms source `80c62dfe...`, version `0.1.0.3`, release sequence `3`, RSA-3072-PSS-SHA256, and production trust-root fingerprint.

Issue #104's recurring roughly-30-second embedded WebUI/status stalls were observed on signed 0.1.0.3 hardware.

## 3. 0.1.0.4 responsiveness fix

GitHub issue #104 remains open until hardware validation.

The 0.1.0.4 source replaces the old HTTP servicing architecture:

- Arduino `WebServer` removed from production;
- native ESP-IDF `esp_http_server` on a dedicated Core-0 task;
- 10 client sessions, backlog 10, LRU purge, keepalive, bounded 3-second socket waits;
- `CONFIG_LWIP_MAX_SOCKETS=20`;
- completion-based/single-flight embedded WebUI polling;
- `/api/runtime` diagnostics for CPU MHz, free/min heap, RSSI, request count, and max handler duration;
- coherent cached `BatterySnapshot`; HTTP never performs ADC conversion;
- ADC conversion/delays remain outside locks;
- cross-task config synchronization with atomic hot-path mirrors;
- discovery copies config then releases the config lock before UDP/HMAC work;
- USB/LAN signed OTA serialized through one verifier/writer state;
- secure-provisioning lifecycle atomically published;
- trusted-USB credential operations quiesce HTTP where necessary;
- Monitoring Identity one-time key initialization is race-free across HTTP/discovery first callers;
- native server restart stops HTTP before invalidating sessions/challenges;
- CI guard prevents legacy Arduino HTTP modules from returning.

Windows monitoring is also single-flight per device:

- shared `HttpClient`;
- 5-second timeout;
- `PollInProgress` guard.

## 4. Hardware validation tooling

Use:

- `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md`
- `battery-monitor/tools/Test-BatteryMonitorHttp.ps1`

The test covers:

- direct numeric IP;
- `.local`;
- normal browser ~1-second refresh;
- Windows monitoring concurrently;
- 1/5/10-request concurrency passes;
- ADC interaction;
- config interaction;
- Wi-Fi reconnect/protected fallback recovery;
- signed LAN OTA gate;
- prolonged soak;
- `/api/runtime` evidence.

Do not close #104 on a single fast page load.

## 5. Exact next release action

0.1.0.4 normal CI is green, but **a signed 0.1.0.4 package has not yet been produced**.

The protected signed workflow must be dispatched with:

- `source_sha = cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`
- `version = 0.1.0.4`

Do not sign the later documentation/test-tool branch head as a substitute for the validated product SHA.

After the signed workflow succeeds:

1. verify `SIGNED_RELEASE.txt` exact source/version/release sequence/trust-root;
2. verify signatures/hashes and signed Windows bundle consistency;
3. install signed 0.1.0.4 through the application-mediated updater on the already-encrypted unit;
4. execute the 0.1.0.4 HTTP responsiveness hardware plan;
5. update/close #104 only if the real hardware stalls are gone.

## 6. Related open work

- #103 saved Wi-Fi recovery must be exercised during the hardware test.
- #102 signed LAN OTA remains a hardware gate.
- #101 app icon worst-status coloring remains open.
- #99 custom battery types remains open.
- #98 notification snooze UI remains open.
- #97 consistent firmware-version visibility remains open.
- #105 management-auth offline-guess/confidentiality review is **deferred** per user direction and must not block this release.

## 7. Architecture/security authority

One production firmware architecture only:

- ESP-IDF 5.5.5 / commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- classic ESP32 / ESP32-WROOM-32;
- Arduino-ESP32 compatibility source `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- ESP-IDF wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`;
- runtime under `battery-monitor/firmware/BatteryMonitor/`;
- build entrypoint `battery-monitor/firmware/idf/build.sh`.

Retained security:

- Flash Encryption release mode;
- NVS Encryption;
- automatic OTA rollback;
- encrypted-NVS strictly-newer software release floor;
- RSA-3072-PSS-SHA256 signed USB/LAN OTA;
- production public-key SPKI SHA-256 `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`;
- Secure Boot and irreversible eFuse anti-rollback still deferred pending physical validation.

## 8. Read first next session

At the exact live branch head, read in order:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`
4. `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md`
5. `battery-monitor/tools/Test-BatteryMonitorHttp.ps1`
6. GitHub issues #104, #103, #102, #105
7. `.github/workflows/battery-monitor-ci.yml`
8. `.github/workflows/battery-monitor-signed-release.yml`
9. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
10. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
11. `battery-monitor/firmware/BatteryMonitor/NativeHttpServer.ino`
12. `battery-monitor/firmware/BatteryMonitor/NativeHttpSynchronization.ino`
13. `battery-monitor/firmware/BatteryMonitor/ConfigurationSynchronization.ino`
14. `battery-monitor/firmware/BatteryMonitor/BatterySnapshot.ino`
15. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdateSynchronization.ino`
16. `battery-monitor/firmware/BatteryMonitor/SecureProvisioning.ino`
17. `battery-monitor/firmware/BatteryMonitor/MonitoringIdentityCore.ino`
18. `battery-monitor/windows/BatteryMonitor.Client/DeviceClient.cs`
19. `battery-monitor/windows/BatteryMonitor.Client/MainForm.cs`

The key distinction is: **live branch head may be documentation-only newer; validated 0.1.0.4 product source is `cb96191f...`.**
