# Battery Monitor Validated Candidate — 0.1.0.4

**Validation date:** 2026-09-08/09 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Firmware version:** `0.1.0.4`  
**Software release sequence:** `4`

## Exact product source authority

The exact product source validated by the normal toolchain is:

`cb96191f8e3c8c99771b044e7a0b2260e5f56b2f` — `Make monitoring identity mutex initialization race-free`

Documentation commits made after this checkpoint do **not** change the validated product SHA. Any signed 0.1.0.4 candidate must use the exact SHA above unless product source changes and the full normal toolchain is rerun.

## Normal-CI authority

- Workflow: `Battery Monitor Toolchain`
- Run: **#261**
- Run ID: **`34306473630`**
- Result: **SUCCESS**
- Exact head SHA: `cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`

Run #261 passed:

- authoritative ESP32 ESP-IDF 5.5.5 + pinned Arduino component firmware build;
- native-HTTP architecture guard / production build checks;
- Android provisioning APK build and artifact upload;
- exact firmware-artifact handoff to Windows;
- pinned esptool 5.3.1 verification;
- pinned Espressif Security-2 provisioner-helper build;
- Windows .NET 8 build;
- P0-3 / monitoring-protocol self-test;
- self-contained win-x64 publish;
- Windows bundle creation and artifact upload.

## Normal-CI artifacts

### Firmware

- artifact: `battery-monitor-esp32-CI-UNSIGNED-v0.1.0`
- artifact ID: `10086957353`
- artifact digest: `sha256:737522aed36567fe9466da8b0d9a1bf4130cdeca81e6ad1e156b90fe15019397`
- application image SHA-256: `d330f96c328882b237c9a0e1c19417ea10188943bb1893966ef4d181bad0a2bf`
- merged 4 MiB first-install image SHA-256: `f76404d33def7b2a4bd0ad45000ab9f2c0320867fb0fa237819ddec63f4fea93`

Independent artifact inspection confirmed:

- `version.txt` = `0.1.0.4`;
- `software_release_sequence=4`;
- `http_server=esp_http_server`;
- `http_transport=native-esp-idf`;
- `http_max_client_sessions=10`;
- ESP-IDF version/commit = `5.5.5` / `b774170ff46c393eeb5e495ea37936038d3f4f4f`;
- Arduino-ESP32 base/source = `3.3.11` / `5cdf8975ae8d9e35888b724b01a444d22406424e`;
- Flash Encryption and NVS Encryption enabled;
- signed USB and LAN OTA enabled;
- automatic OTA rollback enabled;
- production firmware-signing SPKI SHA-256 = `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`.

The built application binary contains the expected `0.1.0.4` and native `esp_http_server` runtime markers; no Battery Monitor Arduino `WebServer` runtime marker was found.

### Android

- artifact: `Battery-Monitor-Setup-Android-v0.1.0`
- artifact ID: `10086874559`
- artifact digest: `sha256:f461633ef69746541cbd9327ae82e4591e37a2000a1c33f9a8db49f601d81bc8`

### Windows

- artifact: `Battery-Monitor-Windows-CI-UNSIGNED-v0.1.0`
- artifact ID: `10087014995`
- artifact digest: `sha256:53bc9563d847659e4b2ded8207d1b016259c223fca37eea1973b956f61d1c2df`
- `BatteryMonitor.Client.exe` SHA-256: `63da8c5dde0c74cb2f50477bf4794d3bd27e118482ed1922b9be7dd79d092af5`

Independent extraction of the Windows artifact confirmed its bundled firmware is byte-for-byte the exact firmware-job output:

- bundled application SHA-256: `d330f96c328882b237c9a0e1c19417ea10188943bb1893966ef4d181bad0a2bf`;
- bundled merged-image SHA-256: `f76404d33def7b2a4bd0ad45000ab9f2c0320867fb0fa237819ddec63f4fea93`.

The normal-CI firmware and Windows package are intentionally unsigned. They are validation artifacts, not post-encryption production-update packages.

## 0.1.0.4 responsiveness architecture validated in source/build

The candidate replaces the 0.1.0.3 HTTP servicing model responsible for tens-of-seconds stalls:

- Arduino `WebServer` is removed from the production include chain;
- production HTTP uses ESP-IDF `esp_http_server` on a dedicated Core-0 task;
- up to 10 client sessions are allowed, with LRU purge, bounded socket waits, keepalive, and `CONFIG_LWIP_MAX_SOCKETS=20`;
- WebUI status refresh is completion-based/single-flight rather than overlapping timer requests;
- normal HTTP status reads consume a coherent cached `BatterySnapshot` and never perform ADC conversions;
- ADC conversion and sampling delays occur outside HTTP/config/snapshot locks;
- mutable device configuration is serialized across HTTP, USB, provisioning callbacks, discovery, and sampling;
- configured-Wi-Fi presence and sample interval use atomic hot-path publication rather than a mutex every application-loop pass;
- discovery copies mutable configuration once and performs UDP/HMAC work after releasing the config lock;
- USB and LAN signed OTA share one serialized verifier/writer state;
- secure-provisioning lifecycle state is atomically published across the Espressif event task and application task;
- monitoring-identity key initialization is serialized with race-free first-mutex publication so HTTP and discovery cannot initialize NVS/key state concurrently;
- native-server stop terminates the HTTP task before invalidating management challenges/sessions, preventing authenticated state from surviving a server restart into the handler-replacement phase;
- `/api/runtime` exposes firmware version, HTTP implementation, max clients, CPU MHz, free/minimum heap, RSSI, request count, and worst handler duration.

Windows monitoring was also audited for request pressure:

- one shared `HttpClient` is used;
- HTTP timeout is 5 seconds;
- each monitor has a `PollInProgress` guard;
- the 1-second UI timer cannot stack status polls for the same device.

## Remaining gate before issue #104 can close

**Hardware validation is still required.** Normal CI proves source/build/protocol/package consistency, not real LAN latency.

The exact 0.1.0.4 source above should be signed through the protected `Battery Monitor Signed Firmware Release` workflow before installing on an already-encrypted test unit. Then verify at minimum:

1. direct numeric-IP WebUI and `/api/status` responsiveness;
2. `.local` WebUI and `/api/status` responsiveness;
3. Windows monitoring active concurrently;
4. at least one browser running normal ~1-second WebUI refresh;
5. multiple simultaneous clients, including a practical stress pass toward the 10-session design;
6. normal ADC sampling throughout;
7. configuration reads/writes;
8. signed LAN OTA;
9. Wi-Fi disconnect, retry, protected fallback, and recovery;
10. prolonged idle operation;
11. `/api/runtime` inspection for CPU MHz, heap/min-heap, RSSI, request count, and maximum handler duration.

Target: ordinary `/api/status` requests should be effectively immediate on a healthy LAN, with no recurring multi-second or tens-of-seconds stalls under normal operation.

Do **not** close GitHub issue #104 until this hardware test passes.
