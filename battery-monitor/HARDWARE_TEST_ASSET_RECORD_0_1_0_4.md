# Battery Monitor — Hardware Test Asset Record 0.1.0.4

**Recorded:** 2026-09-08 (America/Chicago)

## Release authority

- Validated product source SHA: `cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`
- Firmware version: `0.1.0.4`
- Software release sequence: `4`
- Normal CI: Battery Monitor Toolchain run #261, run ID `34306473630`, conclusion `SUCCESS`
- Protected signing: Battery Monitor Signed Firmware Release run #4, run ID `34308056040`, conclusion `SUCCESS`
- Signature algorithm: `RSA-3072-PSS-SHA256`
- Production public-key SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

GitHub Actions run metadata records the branch head at dispatch, but release authority comes from the protected workflow input and generated `SIGNED_RELEASE.txt`. The signed artifact explicitly records:

- `source_sha=cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`
- `version=0.1.0.4`
- `software_release_sequence=4`

## Signed firmware artifact

- Artifact name: `Battery-Monitor-Signed-Firmware-0.1.0.4`
- Artifact ID: `10087509678`
- Artifact ZIP SHA-256: `41e11047f23e5bd9364ac199ea76a70863e7d5e1d6cee49d4bca7b38314ca337`
- Application image SHA-256: `2370ba985039506b24bf9b2d6a12a3ecb48540ee7fc5c3a9e8530f65aed2bf02`
- Application signature SHA-256: `0335e70ec59df93816dfa9fbe6aabd359886c20484bdba95dfcece435135e0b8`
- Merged blank-device image SHA-256: `532cb1a035d6ad7c6cec40ace38e99c5c26ac65503ce501d676d7198b759d823`
- Merged-image signature SHA-256: `8c85257835e1607106c4361a01f7d4402fd2d5d52c4a7cccae0187cb0c61844d`

Independent post-download verification using the public key embedded in exact source `cb96191f...`:

- Derived public-key SPKI SHA-256 matched the production trust-root fingerprint exactly.
- `BatteryMonitor.ino.bin` RSA-PSS signature: `Verified OK`.
- `BatteryMonitor.ino.merged.bin` RSA-PSS signature: `Verified OK`.

## Signed Windows artifact

- Artifact name: `Battery-Monitor-Windows-Signed-0.1.0.4`
- Artifact ID: `10087563110`
- Artifact ZIP SHA-256: `e09487dea95f809795f2c40d7f34484e4ee6a9b979feda3f704c4338ca5e8f7a`
- `BatteryMonitor.Client.exe` SHA-256: `63da8c5dde0c74cb2f50477bf4794d3bd27e118482ed1922b9be7dd79d092af5`

The signed Windows package contains byte-for-byte identical copies of:

- `BatteryMonitor.ino.bin`
- `BatteryMonitor.ino.bin.sig`
- `BatteryMonitor.ino.merged.bin`
- `BatteryMonitor.ino.merged.bin.sig`
- `SIGNED_RELEASE.txt`

from the standalone signed firmware artifact.

## Build/runtime authority verified from artifact

`BUILD_AUTHORITY.txt` records:

- `http_server=esp_http_server`
- `http_transport=native-esp-idf`
- `http_max_client_sessions=10`
- `app_version=0.1.0.4`
- `software_release_sequence=4`
- `signed_usb_ota=SIGNED_USB_OTA_V1`
- `signed_lan_ota=SIGNED_LAN_OTA_V1`
- Flash Encryption enabled in release mode
- NVS Encryption enabled
- post-boot OTA rollback enabled
- Secure Boot still deferred pending physical validation

## Known provenance-only manifest issue

`SIGNED_RELEASE.txt` still contains the stale line:

`arduino_esp32_webserver_hardening=upstream-pr-12794-merged`

This is metadata-only and does not reflect the production HTTP implementation. The actual build authority and compiled product use native ESP-IDF `esp_http_server`; Arduino `WebServer` has been removed from the production HTTP path and guarded against reintroduction in CI. The stale line does not participate in image signature verification, release-floor policy, or boot selection and does not require re-signing 0.1.0.4 solely for hardware testing. It should be removed from the signing workflow before the next production release.

## Hardware test use

### Already-encrypted Battery Monitor

Use `Battery-Monitor-Windows-Signed-0.1.0.4` and the application-mediated signed firmware updater. Do **not** direct-flash the merged image to an already-encrypted unit.

### Blank, unencrypted ESP32

The 4 MiB merged image remains blank-device first-install media only.

### Required responsiveness validation

Run `battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md` and use `battery-monitor/tools/Test-BatteryMonitorHttp.ps1` for repeatable direct-IP / `.local` / concurrency / soak measurements. Keep GitHub issue #104 open until real hardware confirms the tens-of-seconds WebUI stalls are resolved.
