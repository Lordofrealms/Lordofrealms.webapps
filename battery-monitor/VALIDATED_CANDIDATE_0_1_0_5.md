# Battery Monitor 0.1.0.5 — Validated Candidate

## Product authority

- Version: `0.1.0.5`
- Software release sequence: `5`
- Exact product source SHA: `606231952296e4df81dadfb61044aad6b5c2492b`
- Branch used for development: `battery-monitor-dev`
- This product SHA is frozen for signing. Later workflow/documentation commits are not part of the product source.

## Normal CI validation

Battery Monitor Toolchain run:

- Run number: `282`
- Run ID: `34313022921`
- Head SHA: `606231952296e4df81dadfb61044aad6b5c2492b`
- ESP32 ESP-IDF firmware: **SUCCESS**
- Android provisioning APK: **SUCCESS**
- Windows .NET 8 client: **SUCCESS**
- Windows P0-3 protocol self-test: **SUCCESS**
- Self-contained win-x64 publish/package: **SUCCESS**

CI artifacts:

- Firmware artifact ID: `10089220277`
- Firmware artifact digest: `sha256:4e732c2321bb2afa29a0dc4de8e67e879ba643b2c5dd19acaa4068f240de668c`
- Windows artifact ID: `10089286069`
- Windows artifact digest: `sha256:8865d1b50010a752620d00bc1f7f6653618af7889eeea11f81e203171cb33d52`
- Android artifact ID: `10089116874`
- Android artifact digest: `sha256:01c26adbce47683c177d9ced214b29731d415efbaa856716acb48bbce7f09073`

## Independently inspected firmware artifact

`version.txt`:

`0.1.0.5`

`BUILD_AUTHORITY.txt` confirms:

- `architecture=ESP-IDF+Arduino-component`
- `http_server=esp_http_server`
- `http_transport=native-esp-idf`
- `http_max_client_sessions=10`
- `app_version=0.1.0.5`
- `software_release_sequence=5`
- release-mode Flash Encryption enabled
- encrypted NVS enabled
- signed USB OTA enabled
- signed LAN OTA enabled
- post-boot OTA rollback enabled
- production firmware trust-root fingerprint `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Firmware SHA-256 values:

- `BatteryMonitor.ino.bin`: `92b03b9bf7a372b39894cbfa2c8070113f07ef2ac6a7f263cfd9cf64349bb8bf`
- `BatteryMonitor.ino.merged.bin`: `a8fc7f4f0cc7dbffb0ba3eb1ff127369aab74f1c0c5e81077a0b1f4b1152971f`

The Windows CI package contains firmware files with those exact same SHA-256 values.

## 0.1.0.5 responsiveness/diagnostic changes

Compared with signed 0.1.0.4, this candidate specifically addresses the remaining hardware WebUI symptoms:

- configuration is published as a coherent RAM read snapshot; HTTP reads do not wait for NVS persistence;
- network status is sampled/published by the main task; `/api/status` does not call `WiFi.status()`, RSSI, local IP, or soft-AP IP directly;
- battery voltage remains producer-sampled/cached; HTTP never triggers ADC conversion;
- WebUI status polling starts immediately and no longer waits for `/api/config` first;
- configuration is loaded into the form only after management unlock;
- browser read responses use short-lived connections and a 1-second socket-send ceiling;
- the large self-contained `/` page is sent in 1024-byte chunks rather than one monolithic response;
- root-page tracing records body bytes, chunks sent, maximum chunk send time, failed chunk index, send time/result, total handler time, and heap;
- `/api/status` tracing separates config snapshot copy, battery snapshot copy, network snapshot copy, JSON build, socket send, and total handler time;
- periodic producer tracing separately measures Wi-Fi getter and ADC/cache-publication timing;
- trusted-USB one-shot source timing deliberately bypasses caches and times each NVS setting read, Wi-Fi status/RSSI/IP getter, and a real ADC-equivalent sampling workload;
- HTTP diagnostics are engineering-only under Windows **Advanced Tools > HTTP Diagnostics**;
- live tracing defaults OFF and automatically returns OFF after reboot.

## Windows package-version correction

The Windows updater now resolves the available firmware version from:

1. `firmware/SIGNED_RELEASE.txt`;
2. legacy `RELEASE.txt`;
3. `version.txt` fallback.

This fixes the signed 0.1.0.4 package behavior where `Package version` / update target displayed `unknown` despite the signed release metadata containing the version.

## Signing infrastructure authority

The signing workflow was corrected after the product SHA freeze. This is intentional: the protected workflow definition is release infrastructure, while `source_sha` remains the exact frozen product commit above.

Before 0.1.0.5 signing, issue #106 was completed:

- obsolete `arduino_esp32_webserver_hardening=...` signed-manifest provenance was removed;
- signed provenance now records native `esp_http_server`, native ESP-IDF transport, and 10 client sessions;
- the signing workflow fails closed unless `BUILD_AUTHORITY.txt` contains those native HTTP authority values.

## Remaining release gate

Normal CI is complete. The next gate is the protected `Battery Monitor Signed Firmware Release` workflow using exactly:

- `source_sha = 606231952296e4df81dadfb61044aad6b5c2492b`
- `version = 0.1.0.5`

After signing, independently verify the signatures, manifest/source/version, hashes, and Windows-bundled signed firmware before hardware installation.

Issue #104 remains open until signed 0.1.0.5 is installed and the real hardware WebUI behavior is measured with the new Advanced Tools diagnostics.