# Battery Monitor 0.1.0.5 Signed Release Verification

Date: 2026-09-09

## Exact product authority

Frozen product source SHA:

`606231952296e4df81dadfb61044aad6b5c2492b`

Firmware version / release sequence:

`0.1.0.5` / `5`

Normal validation before signing:

- Battery Monitor Toolchain run #282
- run ID `34313022921`
- authoritative ESP-IDF firmware: PASS
- Android: PASS
- Windows .NET build: PASS
- P0-3 protocol self-test: PASS
- self-contained Windows publish/package: PASS

## Protected signing run

Battery Monitor Signed Firmware Release:

- run #6
- run ID `34314257036`
- overall conclusion: SUCCESS
- exact source recorded by `SIGNED_RELEASE.txt`: `606231952296e4df81dadfb61044aad6b5c2492b`
- version recorded by `SIGNED_RELEASE.txt`: `0.1.0.5`
- release sequence: `5`

Both the signed-firmware job and the signed-Windows-package job completed successfully. The Windows job also exercised the production firmware verifier and tamper rejection.

## Independent cryptographic verification

Repository production public key read at the frozen product SHA:

- SPKI SHA-256: `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

Signed firmware artifact:

- `BatteryMonitor.ino.bin`
  - SHA-256: `7c30b6685b873949b8693db50f7fefc70b2787e5310deb1cbf61a7ed496f6148`
  - signature size: 384 bytes
  - independent OpenSSL RSA-3072-PSS-SHA256 verification: PASS
- `BatteryMonitor.ino.merged.bin`
  - SHA-256: `1ed5b2069e918d7e0986ec340d7edf1c3f9237c8d25bc7b1539b90436abb06d7`
  - signature size: 384 bytes
  - independent OpenSSL RSA-3072-PSS-SHA256 verification: PASS

`BUILD_AUTHORITY.txt` and `SIGNED_RELEASE.txt` agree on the signed hashes and the release authority.

## HTTP/build provenance

The signed manifest correctly records:

- `architecture=ESP-IDF+Arduino-component`
- `esp_idf_version=5.5.5`
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- exact Arduino compatibility component commit `5cdf8975ae8d9e35888b724b01a444d22406424e`
- `http_server=esp_http_server`
- `http_transport=native-esp-idf`
- `http_max_client_sessions=10`

The obsolete Arduino-WebServer hardening provenance field is absent.

## Signed Windows bundle identity

The signed Windows artifact contains:

- the exact same `BatteryMonitor.ino.bin` bytes as the signed firmware artifact;
- the exact same `BatteryMonitor.ino.merged.bin` bytes;
- the exact same two signature files;
- the exact same `SIGNED_RELEASE.txt`.

`cmp` checks for all five files passed. The Windows single-file executable also contains the expected `HTTP Diagnostics`, `Battery Monitor - HTTP Diagnostics`, and `Run Source Timing Once` UI strings.

## Clean-build reproducibility finding

The protected signing workflow rebuilds the frozen source instead of signing the already-built normal-CI firmware artifact. The two clean builds are not currently bit reproducible.

Normal CI run #282 hashes:

- app: `92b03b9bf7a372b39894cbfa2c8070113f07ef2ac6a7f263cfd9cf64349bb8bf`
- merged: `a8fc7f4f0cc7dbffb0ba3eb1ff127369aab74f1c0c5e81077a0b1f4b1152971f`

Signed rebuild hashes:

- app: `7c30b6685b873949b8693db50f7fefc70b2787e5310deb1cbf61a7ed496f6148`
- merged: `1ed5b2069e918d7e0986ec340d7edf1c3f9237c8d25bc7b1539b90436abb06d7`

Byte-level localization:

- app images are both 1,078,384 bytes;
- only 72 bytes differ (~0.0067%);
- differences are the embedded clean-build time (`05:04:21` vs `05:21:45`), a second compile-time string (`05:05:04` vs `05:22:19`), the resulting internal image/hash field, and the final appended image digest;
- both builds carry the same date (`Sep 9 2026`), version (`0.1.0.5`), ESP-IDF authority, and product strings;
- merged images are both exactly 4 MiB and differ in only 106 bytes (~0.0025%);
- merged differences consist of analogous bootloader clean-build metadata/digest differences plus the same application regions at the expected `0x10000` application offset.

Conclusion: this is a build-reproducibility/provenance-process gap, not evidence that a different firmware source tree was signed. Tracked separately in issue #107.

## Installation disposition

**CLEARED FOR HARDWARE DIAGNOSTIC INSTALLATION.**

Install on an existing Flash-Encryption-enabled unit only through the signed application-mediated USB OTA or authenticated signed LAN OTA path. Do not ROM/esptool-flash the plaintext merged first-install image onto an already encrypted unit.

After update:

1. Confirm the running firmware reports `0.1.0.5`.
2. Windows -> Advanced Tools -> HTTP Diagnostics -> Run Source Timing Once; save the complete report.
3. Start Live HTTP Trace.
4. Keep normal Windows monitoring active and repeatedly load the WebUI by numeric IP first.
5. Reproduce any blank-values, slow-load, partial-page, or timeout behavior.
6. Stop the trace and preserve the complete diagnostic log.
7. If numeric-IP behavior is healthy, repeat by `.local` to isolate mDNS/name-resolution behavior.

Issue #104 remains open until hardware responsiveness is confirmed resolved or the trace identifies the remaining cause.
