# Battery Monitor 0.1.0.4 — Signed Release Operator Checklist

**Purpose:** produce the hardware-test signed package for the exact normal-CI validated 0.1.0.4 product source without accidentally signing a later documentation-only branch head.

## Frozen input authority

Normal-CI validated product source:

`cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`

Authoritative version:

`0.1.0.4`

Software release sequence:

`4`

Normal validation:

- workflow: `Battery Monitor Toolchain`
- run #261
- run ID `34306473630`
- conclusion `SUCCESS`
- evidence: `battery-monitor/VALIDATED_CANDIDATE_0_1_0_4.md`

Do **not** substitute the later documentation/test-tool branch head for the frozen product SHA.

## 1. Dispatch protected signing workflow

In GitHub Actions, run:

`Battery Monitor Signed Firmware Release`

Provide exactly:

- `source_sha`: `cb96191f8e3c8c99771b044e7a0b2260e5f56b2f`
- `version`: `0.1.0.4`

The workflow must run in the existing `battery-monitor-production-signing` environment using the configured production signing key.

## 2. Required workflow gates

The signed workflow must successfully:

1. validate the exact 40-character source SHA;
2. check out that exact source;
3. confirm `battery-monitor/firmware/idf/version.txt` is exactly `0.1.0.4`;
4. derive software release sequence `4`;
5. install the pinned ESP-IDF 5.5.5 commit;
6. build through the one authoritative `battery-monitor/firmware/idf/build.sh` entrypoint;
7. verify the production signing-key SPKI fingerprint;
8. sign the application and merged first-install images using RSA-3072-PSS-SHA256;
9. independently verify both signatures;
10. create `SIGNED_RELEASE.txt`;
11. build the signed Windows package from the same exact source;
12. bundle the signed firmware/signatures/manifest into Windows;
13. upload both signed artifacts.

Any failure means no hardware-test release authority exists.

## 3. Expected artifact names

The successful run should create:

- `Battery-Monitor-Signed-Firmware-0.1.0.4`
- `Battery-Monitor-Windows-Signed-0.1.0.4`

Record artifact IDs and GitHub artifact digests in `battery-monitor/HARDWARE_TEST_ASSET_RECORD_0_1_0_4.md`.

## 4. Verify `SIGNED_RELEASE.txt`

Extract the signed firmware artifact and require these exact fields:

```text
schema=BATMON_SIGNED_RELEASE_V1
source_sha=cb96191f8e3c8c99771b044e7a0b2260e5f56b2f
version=0.1.0.4
software_release_sequence=4
software_signed_release_floor=encrypted-nvs-strictly-newer
post_boot_ota_rollback=enabled
signed_usb_ota=SIGNED_USB_OTA_V1
architecture=ESP-IDF+Arduino-component
esp_idf_version=5.5.5
esp_idf_commit=b774170ff46c393eeb5e495ea37936038d3f4f4f
arduino_esp32_base_release=3.3.11
arduino_esp32_component_source=upstream-git
arduino_esp32_commit=5cdf8975ae8d9e35888b724b01a444d22406424e
algorithm=RSA-3072-PSS-SHA256
public_key_spki_sha256=69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e
```

Additional existing release-policy fields may be present. A mismatch in any field above is a release blocker.

## 5. Verify signed artifact contents

The signed firmware artifact must contain at minimum:

- `BatteryMonitor.ino.bin`
- `BatteryMonitor.ino.bin.sig`
- `BatteryMonitor.ino.merged.bin`
- `BatteryMonitor.ino.merged.bin.sig`
- `SIGNED_RELEASE.txt`
- `BUILD_AUTHORITY.txt`
- `version.txt`
- partition/bootloader/build-authority support files.

Require:

- application signature size = 384 bytes;
- merged-image signature size = 384 bytes;
- `version.txt` = `0.1.0.4`;
- `BUILD_AUTHORITY.txt` release sequence = `4`;
- `BUILD_AUTHORITY.txt` HTTP server = `esp_http_server`;
- `BUILD_AUTHORITY.txt` HTTP transport = `native-esp-idf`;
- production trust-root fingerprint matches the frozen value above.

Do not require the newly rebuilt signed-release application image hash to equal the normal-CI image hash: ESP-IDF build metadata may make independently rebuilt binaries differ even from the same source. Trust the exact source/version/toolchain authority plus signature verification.

## 6. Independent signature verification

Using the production public key embedded/frozen in source, independently verify both signatures with RSA-PSS/SHA-256.

Example OpenSSL shape:

```bash
openssl dgst -sha256 \
  -verify battery_monitor_secureboot_rsa3072_public.pem \
  -signature BatteryMonitor.ino.bin.sig \
  -sigopt rsa_padding_mode:pss \
  -sigopt rsa_pss_saltlen:-1 \
  BatteryMonitor.ino.bin
```

Repeat for `BatteryMonitor.ino.merged.bin`.

Expected result for each:

`Verified OK`

Derive the public-key SPKI SHA-256 and require:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

## 7. Verify signed Windows bundle consistency

Extract `Battery-Monitor-Windows-Signed-0.1.0.4` and confirm its bundled signed firmware files are byte-for-byte identical to the corresponding files in the signed firmware artifact:

- application image;
- application signature;
- merged image;
- merged signature;
- `SIGNED_RELEASE.txt`.

Record SHA-256 values for:

- signed application image;
- application signature;
- signed merged image;
- merged signature;
- `BatteryMonitor.Client.exe`;
- both artifact ZIP/digests.

## 8. Installation authority

For the existing already-encrypted Battery Monitor used to reproduce issue #104:

- use `Battery-Monitor-Windows-Signed-0.1.0.4`;
- use the normal application-mediated **Firmware Update -> Update Firmware** path;
- do not use the merged first-install image;
- do not direct-flash plaintext firmware with esptool.

The merged first-install image remains only for a genuinely blank, unencrypted ESP32.

## 9. Post-install checks before latency testing

After update/reboot:

1. confirm runtime firmware version reports `0.1.0.4`;
2. confirm device returns to Wi-Fi/discovery/mDNS/Windows monitoring;
3. allow the signed candidate's normal probation/rollback-health path to complete;
4. verify saved settings, Device Password, Monitoring Identity, battery config, and calibration remain intact;
5. read `/api/runtime` and record CPU MHz, free/min heap, RSSI, server type, max clients, request count, and max handler time.

Then execute:

`battery-monitor/HARDWARE_TEST_PLAN_0_1_0_4_HTTP_RESPONSIVENESS.md`

with:

`battery-monitor/tools/Test-BatteryMonitorHttp.ps1`

## 10. Do not close #104 early

A successfully signed/installable 0.1.0.4 release is not itself proof that the responsiveness bug is fixed.

GitHub issue #104 remains open until real hardware testing shows the recurring multi-second/tens-of-seconds stalls are absent under browser refresh, Windows monitoring, ADC sampling, configuration activity, reconnect/recovery, concurrent clients, and soak conditions.
