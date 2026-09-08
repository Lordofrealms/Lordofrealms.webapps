# Battery Monitor — Session Handoff

**Updated:** 2026-09-07 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA below is still current.**

## 1. Current handoff checkpoint

The ESP-IDF production-build migration is complete and fully validated.

Final green product-source SHA:

`249c18028b97714df7a62cabbb64b0ad1b354d7f` — `Revalidate ESP-IDF release pin alignment`

Authoritative validation:

- Workflow: `Battery Monitor Toolchain`
- Run: **#129**
- Run ID: **`34185344138`**
- Result: **SUCCESS**

Run #129 completed all normal branch Toolchain jobs successfully:

- canonical ESP-IDF firmware build;
- Android provisioning APK build/package;
- Windows exact-firmware download and toolchain verification;
- pinned Security-2 provisioner helper build;
- Windows client build;
- **P0-3 protocol self-test**;
- self-contained Windows publish/bundle/artifact upload.

Normal Phase 6 feature/operations work may resume after resolving and reading the live branch state.

## 2. Canonical production architecture

There is **one production firmware build architecture**:

- ESP-IDF **v5.5.5**
- exact ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- `espressif/arduino-esp32` managed component pinned to **3.3.7**
- target **`esp32`** for classic ESP32 / ESP32-WROOM-32
- project root: `battery-monitor/firmware/idf/`
- application component: `battery-monitor/firmware/idf/main/`
- wrapper/entrypoint: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- sole runtime behavior implementation: existing `.ino` source under `battery-monitor/firmware/BatteryMonitor/`, headed by `BatteryMonitor.ino`
- authoritative firmware build entrypoint: `battery-monitor/firmware/idf/build.sh`

`BatteryMonitorApp.cpp` is only a thin translation-unit wrapper. It initializes Arduino under ESP-IDF, supplies required forward declarations, directly includes the established `.ino` tabs, and invokes the existing `setup()` / `loop()` implementation.

**Do not create a second production firmware implementation.**  
**Do not restore PlatformIO as an alternate production build path.**

The current tree contains no PlatformIO production path and no duplicate firmware runtime.

## 3. Migration failure and resolution

The original authoritative failing migration run was Toolchain #124 / run ID `34181484415`.

The first concrete compiler diagnostic was:

`SecureProvisioning.ino:199: percentEncode was not declared in this scope`

The root cause was loss of Arduino IDE sketch-preprocessor auto-generated prototypes when the same `.ino` tabs were compiled directly as C++ under ESP-IDF.

The fix was intentionally narrow: required cross-tab forward declarations were added to `BatteryMonitorApp.cpp`. No runtime behavior was duplicated or rewritten.

A second concrete migration issue was then found: Arduino-ESP32 had drifted to **3.3.11** in the managed-component/release metadata despite the architecture requiring **3.3.7**. The live component manifest, IDF authority documentation, and signed-release provenance are now aligned to **3.3.7**.

The first fully green post-fix Toolchain was #128 / `34184628946`. Run #129 is the final migration authority because it revalidated the corrected release-pin alignment head.

## 4. Frozen runtime/security requirements

Do not weaken or bypass the established Battery Monitor behavior, including:

- relay safety/fail-safe behavior;
- voltage/current/operating-state freshness checks;
- OTA availability checking and fail-closed update behavior;
- signed update/release-policy enforcement and rollback protection;
- WebUI and SerialUI administrator security/recovery;
- lockout/human-challenge behavior;
- audit persistence/export;
- release provenance and production signature verification;
- existing rollback/release-policy/toolchain/ground-truth expectations where implemented.

The migration is complete specifically because these controls remained in the single existing runtime rather than being forked into a second implementation.

## 5. Manual signed-release workflow

`.github/workflows/battery-monitor-signed-release.yml` is intentionally a **manual `workflow_dispatch` production-release gate**, not an ordinary branch-push CI job.

No production release was requested as part of this migration closeout, so this workflow was **not dispatched just to satisfy migration CI**. Do not claim otherwise in future state.

Its current definition was audited during closeout and remains fail-closed. It uses the same `firmware/idf/build.sh` authority and enforces:

- exact source-SHA validation;
- production signing-key fingerprint validation;
- RSA-3072-PSS-SHA256 signatures;
- independent signature verification;
- tampered-image rejection;
- wrong-key rejection;
- production Windows verifier validation/tamper rejection;
- signed-release provenance recording Arduino-ESP32 **3.3.7**.

For an actual production release, dispatch this workflow with the exact intended source SHA and version and require its gated signing environment to pass.

## 6. Last pre-migration reference

Behavioral/security reference only:

`83c678127671f8c570c488c63f878a57fcafdacf`

- Toolchain run **#107**
- Run ID `34177651347`
- Result **SUCCESS**

Do not restore its old build-system assumptions. Current production authority is ESP-IDF only.

## 7. Read first in the next session

At the exact **live** `battery-monitor-dev` SHA, read:

1. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
2. `battery-monitor/PROJECT_STATE_LATEST.md`
3. `battery-monitor/firmware/idf/README.md`
4. `.github/workflows/battery-monitor-ci.yml`
5. `.github/workflows/battery-monitor-signed-release.yml` when release/security work is relevant
6. `battery-monitor/firmware/idf/main/idf_component.yml`
7. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
8. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`

Then resolve the latest applicable Battery Monitor workflow run for the live head before changing production source.

The earlier handoff named `battery-monitor/AGENTS.md` and `battery-monitor/firmware/README.md`; those paths were verified absent in the live Git tree during migration closeout. Do not silently substitute default-branch/stale copies. The previously named `battery-monitor/firmware/include/` path likewise is not a tracked directory in the current tree.

## 8. Next work order

The migration blocker is closed. Resume normal **Phase 6 feature/operations work** from the live branch.

When doing so:

1. resolve the live remote head first;
2. preserve the single ESP-IDF/Arduino-component runtime architecture;
3. keep Arduino-ESP32 pinned to 3.3.7 unless an explicit, separately validated architecture decision changes it;
4. keep existing safety/security behavior fail-closed;
5. run the applicable Toolchain after production-source changes;
6. use the manual signed-release workflow only for an actual production release;
7. treat Secure Boot, Flash Encryption, and NVS Encryption as deliberate future security changes, not incidental migration cleanup.

## 9. Completion record

ESP-IDF migration completion criteria are satisfied at product-source SHA `249c18028b97714df7a62cabbb64b0ad1b354d7f` with Toolchain run #129 / `34185344138`:

- ESP-IDF 5.5.5 canonical build: green;
- Arduino-ESP32 3.3.7 pin: confirmed;
- normal applicable downstream Toolchain jobs/gates including P0-3: green;
- PlatformIO production dependency: absent;
- second runtime implementation: absent;
- migration runtime/security weakening: none introduced by the build fixes;
- authoritative state/handoff: updated to cite this final green checkpoint.

## 10. Remote/local warning

This handoff is based on the **GitHub remote branch**. A local checkout must be fetched and compared to the live remote head before further work.
