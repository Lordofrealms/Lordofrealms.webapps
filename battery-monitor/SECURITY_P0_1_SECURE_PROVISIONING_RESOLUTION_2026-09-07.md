# Battery Monitor Security Resolution — P0-1 Secure Provisioning

Date: 2026-09-07
Branch: `battery-monitor-dev`
Validated product-source head: `e4fa7fd5af46224e0c96fca1fe8090ba29dcee44`
Battery Monitor Toolchain run: `34167794017` — **SUCCESS**

## Finding resolved in source/build

Original P0-1 finding: the prototype exposed an open `BatteryMonitor-*` SoftAP and Android sent the user's home Wi-Fi password over an unauthenticated plaintext HTTP endpoint. A nearby passive observer or rogue AP could capture the home-network credential.

That design is no longer the active provisioning implementation.

## Current provisioning authority

Every initialized unit has a random per-device human setup code:

- 16 Crockford-style Base32 characters / 80 bits of randomness;
- displayed as four groups of four characters;
- QR is optional convenience; the same code is manually typable on Windows or Android.

Example format only: `K7M4-P9RQ-X2HD-W6CF`.

The Windows advanced provisioning-admin UI generates/rotates the code over trusted USB, can save a QR, and can verify a suspected code over USB. The app does not persist generated setup codes.

## Device-side credential storage

The plaintext setup code is not retained as the Security-2 password on the ESP32. The unit stores:

- Security-2 SRP username;
- SRP salt and verifier;
- SHA-256 setup-code check value used only for trusted USB match/no-match verification;
- a separate derived WPA2 SoftAP key.

The temporary WPA2 key is derived as SHA-256 over a domain-separated string containing device ID + canonical setup code. Security-2 authentication still independently requires the root setup code.

## Wireless provisioning

Temporary setup network:

- SSID: `BatteryMonitor-XXXXXX`;
- WPA2 protected with the per-device derived SoftAP key;
- provisioning protocol: Espressif Unified Provisioning **Security 2**;
- authentication/key exchange: SRP6a;
- protected provisioning session: AES-GCM.

The home Wi-Fi password is supplied only inside the authenticated Security-2 provisioning session. The old application `POST /api/wifi` flow is not used by Android or Windows wireless setup.

If a unit has never had a provisioning identity initialized, firmware will not substitute an open setup AP; trusted USB administration is required first.

## Android

The Android app supports:

- scan Battery Monitor setup QR, or manually enter Device ID + setup code;
- derive the temporary WPA2 setup-network key locally;
- connect using Espressif's Android provisioning library;
- authenticate with the printed setup code using Security 2;
- scan nearby home networks through the provisioned device;
- send the selected home Wi-Fi credential through the protected session.

The app clears the entered setup code and home Wi-Fi password fields after successful provisioning and does not persist them.

## Windows wireless setup

The Windows client supports the same printed setup code without USB:

1. derive the temporary WPA2 key;
2. create a unique temporary Windows WLAN profile;
3. connect to `BatteryMonitor-XXXXXX`;
4. invoke a bundled, pinned Espressif Security-2 provisioner helper;
5. send the root setup code and home Wi-Fi credential to the helper via redirected stdin only;
6. remove the temporary Windows WLAN profile in a `finally` path, including failed provisioning attempts.

Neither root setup code nor home Wi-Fi password is placed in process command-line arguments. The temporary WLAN profile contains only the derived WPA2 key.

The helper is built from pinned source revisions:

- Espressif `idf-extra-components`: `3ba4a43776a737054b43ead300ea0377787cad4a`;
- ESP-IDF protocomm Python support: `fcae32885b0296b32044cb99ecbdc50d98dddb83` (v5.5.1 source).

CI smoke-tests the packaged standalone helper before building the Windows deliverable.

## USB code verification

Trusted USB exposes only match/no-match verification of a candidate setup code. It never reads the actual code back.

Wrong guesses receive escalating cooldowns. Successful verification resets the local failure/cooldown counter.

This USB path assumes physical USB access is trusted for the V0.1 prototype; physical-device hardening is a separate security finding.

## Validation result

Exact source head `e4fa7fd5af46224e0c96fca1fe8090ba29dcee44` passed all three CI jobs in run `34167794017`:

- ESP32 Arduino firmware compile + image verification + artifact upload;
- Android secure provisioning APK compile + artifact upload;
- Windows .NET 8 client build + pinned Security-2 helper build/smoke test + self-contained publish + exact firmware/esptool/helper bundle + artifact upload.

## Remaining validation

P0-1 is **resolved at source/build level** but still requires physical interoperability testing on a real ESP32-WROOM-32 before calling the provisioning implementation field-validated. Test both manual setup-code and QR paths, wrong-code behavior, wrong-home-password behavior, re-provisioning, and Windows temporary-profile cleanup.

## Not resolved by this work

This resolution does not close:

- P0-2: unauthenticated state-changing LAN management endpoints;
- P0-3: unauthenticated/spoofable Windows LAN discovery/device status identity;
- physical flash/NVS extraction or hostile reflashing;
- Arduino-ESP32 3.3.11 WebServer slow-header availability issue;
- LAN CSRF/authentication hardening.

Those remain separate security work items.
