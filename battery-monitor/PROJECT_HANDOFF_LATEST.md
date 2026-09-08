# Battery Monitor — Session Handoff

**Updated:** 2026-09-08 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA below is still current.**

## 1. Latest validated product/security checkpoint

`d47215c7c5a157094af2803002e8b94f6af6631f` — `Pin Battery Monitor GitHub Actions`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#146**
- Run ID: **`34229449081`**
- Result: **SUCCESS**

Run #146 passed firmware, Android, exact firmware handoff to Windows, pinned esptool/Security-2 helper, Windows build, **P0-3 protocol self-test**, publish, bundle, and artifact upload using immutable GitHub Action commit pins.

Later `PROJECT_STATE_LATEST.md` / `PROJECT_HANDOFF_LATEST.md` updates are documentation-only and do not supersede `d47215c7...` as the validated product-source checkpoint.

## 2. One production firmware architecture

- ESP-IDF **5.5.5**, exact commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- target `esp32` / classic ESP32-WROOM-32
- Arduino-ESP32 base **3.3.11**
- exact hardened Arduino source `5cdf8975ae8d9e35888b724b01a444d22406424e`
- that source includes upstream WebServer hardening PR #12794
- ESP-IDF root `battery-monitor/firmware/idf/`
- wrapper `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- sole runtime implementation under `battery-monitor/firmware/BatteryMonitor/`
- sole official build entrypoint `battery-monitor/firmware/idf/build.sh`

Do not restore Arduino-ESP32 3.3.7, PlatformIO, or a second firmware runtime.

## 3. Active encryption posture

Production configuration has:

- **Release-mode Flash Encryption ON**
- **NVS Encryption ON**
- encrypted `nvs_keys @ 0x294000`
- partition table `0xF000`
- `app0 @ 0x10000`
- `app1 @ 0x150000`
- **Secure Boot OFF pending real encrypted-device testing**
- irreversible eFuse application anti-rollback OFF pending the later Secure Boot/eFuse gate

The merged 4 MiB image is **blank/un-encrypted first install only**, not post-encryption recovery.

## 4. Signed USB OTA

Normal post-encryption updates use `SIGNED_USB_OTA_V1` over physical USB:

1. Windows verifies RSA-3072-PSS-SHA256 release signature.
2. Windows transfers the plaintext application image in bounded chunks.
3. Running firmware writes the inactive OTA slot through `esp_ota_write()`; device Flash Encryption is applied on write.
4. ESP32 independently verifies hash/application identity/production signature.
5. Only a valid candidate can be selected for next boot.

Production trust-root SPKI SHA-256:

`69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`

CI verifies repository and embedded trust roots against this value.

## 5. Post-boot rollback and software anti-downgrade

ESP-IDF app rollback is enabled. A newly selected OTA candidate receives a **60-second local probation**. It is only marked valid after setup succeeds, Monitoring Identity is available, and the loop runs repeatedly. Wi-Fi is not required. Reset/watchdog/power loss before validation can roll back to the previous valid OTA slot.

Signed application version is currently **`0.1.0.1`**. The fourth numeric component is monotonic software release sequence **1**.

Firmware rejects an equal/older signed sequence and stores the highest accepted sequence as `batmon/fwseq` in encrypted NVS. Supported Wi-Fi/password/admin recovery does not erase this floor.

The manual signer rejects a requested version that differs from authoritative `version.txt`.

Do not turn on irreversible eFuse anti-rollback until the later Secure Boot/eFuse production-policy gate.

## 6. Supply-chain hardening now active

- exact ESP-IDF commit pin
- exact hardened Arduino commit pin
- esptool ZIP SHA-256 verification
- exact Espressif Security-2 helper source commits
- pinned helper Python dependencies
- normal-CI and signed-release GitHub Actions pinned to immutable commits
- firmware release RSA-PSS signing, tamper rejection, wrong-key rejection, and Windows verifier tests
- Android application backup disabled

Still open:

- production Android APK signing
- Windows Authenticode/code signing
- repository branch/ruleset protection; live branch is not protected, repo has no rulesets, and the current connected GitHub authority cannot administer them

## 7. P0 status

- **P0-1 secure provisioning:** source/build resolved; real hardware/adversarial matrix pending.
- **P0-2 administrator security/recovery:** source/build resolved; real hardware/adversarial matrix pending.
- **P0-3 monitoring identity/spoof resistance:** source/build resolved; protocol self-test green; real hostile-LAN matrix pending.

`battery-monitor/SECURITY_REVIEW_2026-09-07.md` is historical and must not be treated as current authority.

## 8. Residual LAN-management hardening item

LAN management currently operates over HTTP to dynamic local addresses. Password proof never sends the Device Password directly, sessions are source-IP-bound/short-lived/CSRF-protected/rate-limited, password rotation is AES-GCM protected, and Monitoring Identity Key export is encrypted under a session-derived key.

Residual issue: session + CSRF bearer values themselves cross the LAN in cleartext. An active on-path LAN attacker may be able to observe a valid session and interfere with privileged management traffic.

Proposed next software protocol: **`BATMON-MGMT-WRITE-V2`** using the existing management key to HMAC each privileged write, with a monotonic per-session counter and a canonical semantic-field digest. This must be changed atomically across firmware, embedded WebUI, Windows, and Android. Do not implement only one client and do not disable Android cleartext before the replacement management transport/protocol is ready.

## 9. Real-device test gate before Secure Boot

Test at minimum:

1. blank-device first install;
2. first boot / Release Flash Encryption activation;
3. NVS Encryption persistence and power-loss behavior;
4. secure provisioning and admin recovery;
5. signed USB OTA in both slot directions;
6. tampered/wrong signature rejection at Windows and ESP32;
7. interrupted OTA retaining old app;
8. successful probation and forced candidate-failure rollback;
9. older legitimately signed image rejected by software release floor;
10. direct plaintext UART flashing not treated as post-encryption recovery;
11. P0-1/P0-2/P0-3 adversarial network tests;
12. normal monitoring, relay safety/freshness behavior, WebUI/SerialUI, and audit persistence while encrypted.

**Do not enable Secure Boot until this hardware gate is complete.**

Important: rollback-capable bootloader behavior is installed with the current blank-device first-install image. An already encrypted unit created with an older bootloader cannot retrofit that bootloader using the current application-only signed OTA path.

## 10. Manual production release

`.github/workflows/battery-monitor-signed-release.yml` remains manual `workflow_dispatch`. Do not dispatch it merely to obtain a green CI badge. It must only be used for a real production release with the production private key available.

No production release was requested in this session.

## 11. Frozen behavior/security expectations

Do not weaken relay fail-safe behavior, freshness checks, secure provisioning/recovery, paired identity, signed update enforcement, rollback/downgrade protection, WebUI/SerialUI administrator controls, rate limiting/human challenge, audit persistence/export, trust-root verification, or P0-3 behavior.

## 12. Read first next session

At the exact live remote SHA, read:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/idf/README.md`
4. `battery-monitor/firmware/idf/build.sh`
5. `battery-monitor/firmware/idf/main/idf_component.yml`
6. `battery-monitor/firmware/idf/sdkconfig.defaults`
7. `battery-monitor/firmware/idf/partitions.csv`
8. `battery-monitor/firmware/BatteryMonitor/FirmwareUpdate.ino`
9. `battery-monitor/firmware/BatteryMonitor/FirmwareReleasePolicy.ino`
10. `battery-monitor/firmware/BatteryMonitor/ZManagementAuth.ino`
11. `.github/workflows/battery-monitor-ci.yml`
12. `.github/workflows/battery-monitor-signed-release.yml`

Then resolve the latest applicable `Battery Monitor Toolchain` run before modifying production source.

## 13. Remote/local warning

This handoff is based on the GitHub remote branch. Any local checkout must be fetched and compared against live `battery-monitor-dev` before use.
