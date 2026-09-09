# Battery Monitor 0.1.0.5 — Signed Release Operator Checklist

## Do not sign branch HEAD

The release source is the exact validated product commit, not the later documentation/workflow head.

Use exactly:

- Workflow: `Battery Monitor Signed Firmware Release`
- `source_sha`: `606231952296e4df81dadfb61044aad6b5c2492b`
- `version`: `0.1.0.5`

The workflow must reject any source/version mismatch.

## Pre-sign validation already completed

Exact product source `606231952296e4df81dadfb61044aad6b5c2492b` passed Battery Monitor Toolchain run #282 / run ID `34313022921`:

- ESP-IDF authoritative firmware build — PASS
- Android provisioning APK — PASS
- Windows .NET build — PASS
- P0-3 protocol self-test — PASS
- self-contained Windows publish/package — PASS

Expected unsigned product hashes from that exact CI build:

- application: `92b03b9bf7a372b39894cbfa2c8070113f07ef2ac6a7f263cfd9cf64349bb8bf`
- merged image: `a8fc7f4f0cc7dbffb0ba3eb1ff127369aab74f1c0c5e81077a0b1f4b1152971f`

## Protected signing workflow expectations

Before signing, the workflow must verify:

- `version.txt` is exactly `0.1.0.5`;
- release sequence is `5`;
- `BUILD_AUTHORITY.txt` reports `http_server=esp_http_server`;
- `BUILD_AUTHORITY.txt` reports `http_transport=native-esp-idf`;
- `BUILD_AUTHORITY.txt` reports `http_max_client_sessions=10`;
- Flash Encryption / encrypted NVS / rollback authority remains intact;
- the signing private key corresponds to production SPKI SHA-256:
  `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`.

The workflow signs both:

- `BatteryMonitor.ino.bin`
- `BatteryMonitor.ino.merged.bin`

using RSA-3072-PSS-SHA256 and independently verifies the resulting signatures.

The signed manifest must no longer contain the obsolete Arduino-WebServer hardening field. It must record:

- `http_server=esp_http_server`
- `http_transport=native-esp-idf`
- `http_max_client_sessions=10`

## After workflow completion

Do not install immediately. First independently verify:

1. workflow conclusion is success;
2. signed firmware artifact exists;
3. signed Windows artifact exists;
4. `SIGNED_RELEASE.txt` says:
   - `source_sha=606231952296e4df81dadfb61044aad6b5c2492b`
   - `version=0.1.0.5`
   - `software_release_sequence=5`;
5. production public-key fingerprint matches;
6. application RSA-PSS signature verifies;
7. merged-image RSA-PSS signature verifies;
8. application/merged SHA-256 values are the expected product hashes above;
9. the Windows package contains byte-for-byte identical signed application, merged image, and signature files;
10. the Windows updater resolves available/package firmware as `0.1.0.5`, not `unknown`;
11. Advanced Tools contains `HTTP Diagnostics` with one-shot Source Timing and Live HTTP Trace.

## Hardware test after verification

On the existing encrypted hardware, install through the normal signed application-mediated USB or LAN OTA path. Do **not** plaintext-flash the merged first-install image onto an already encrypted unit.

For issue #104 hardware testing:

1. Open **Advanced Tools > HTTP Diagnostics** over USB.
2. Run **Source Timing Once** and save/copy the result.
3. Start **Live HTTP Trace**.
4. Load/reload the WebUI repeatedly by numeric IP first.
5. Reproduce the former shell-with-no-values / partial-framework behavior if possible.
6. Copy the trace log.
7. Repeat by `.local` name to distinguish HTTP behavior from mDNS/name-resolution behavior.
8. Keep Windows monitoring active during at least part of the test.

Trace interpretation should separate source acquisition, cached-read/JSON work, and actual socket-send/chunk behavior.