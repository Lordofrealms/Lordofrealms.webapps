# Battery Monitor — Session Handoff

**Updated:** 2026-09-07 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`

**FIRST resolve the LIVE `battery-monitor-dev` remote head. Do not assume any SHA below is still current.**

## Current handoff checkpoint

The ESP-IDF architecture was verified at:

`931ff1fcf90c7dac828f0b7f3fd28f68deef04f8` — `Document sole ESP-IDF firmware architecture`

This session then refreshed the authoritative project-state document in:

`e8b7d426e048ac6d452b05eecbc9ad6e68e27615` — `Refresh Battery Monitor state for ESP-IDF migration`

The final live branch head will include this handoff refresh as a later commit. Resolve the branch live before reading or changing anything.

## 1. Mission now

Finish the build-system migration to the **single ESP-IDF production architecture**, get the authoritative ESP-IDF application build green, then clear all downstream safety/security/release gates.

Do **not** create a parallel firmware implementation or restore PlatformIO as a second production build path.

## 2. Canonical production architecture

The sole production firmware build authority is:

- **ESP-IDF v5.5.5**
- `espressif/arduino-esp32` IDF component pinned to **3.3.7**
- IDF target: **`esp32`** for the existing classic ESP32 / ESP32-WROOM-32 hardware
- project root: `battery-monitor/firmware/idf/`
- application component: `battery-monitor/firmware/idf/main/`
- entrypoint: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- single runtime behavior body: `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
- shared config/include authority: `battery-monitor/firmware/include/`

`BatteryMonitorApp.cpp` initializes Arduino as an ESP-IDF component and then invokes the existing `setup()` / `loop()` runtime body. This intentionally preserves one behavior implementation while ESP-IDF owns the build, component/framework resolution, SDK configuration, partitioning, and FreeRTOS runtime.

`battery-monitor/hardware/firmware/...` is fixture/interop/reference material only; it is not the production firmware source tree.

## 3. What changed immediately before handoff

- ESP-IDF became the sole documented production build architecture.
- CI now reaches a mandatory canonical ESP-IDF application build.
- The old `PROJECT_STATE_LATEST.md` / `PROJECT_HANDOFF_LATEST.md` still described the pre-migration PlatformIO authority and were stale.
- This handoff session replaced that stale state with the current ESP-IDF migration authority.
- Existing runtime/business/security behavior remains in the shared `.ino` so the migration does not fork behavior.

## 4. Current CI blocker

At architecture commit:

`931ff1fcf90c7dac828f0b7f3fd28f68deef04f8`

`Battery Monitor Toolchain`:

- run **#124**
- run ID **`34181484415`**
- result: **FAILED**
- failure step: **`Run ESP-IDF application build`**

The earlier ground-truth/setup portions reached before that step succeeded. The workflow stopped at the mandatory ESP-IDF application build, so later validation/safety/security/release gates were skipped for that run.

The connected GitHub job-log read did **not** return the concrete compiler diagnostic during this session. Therefore no root-cause theory is authoritative yet. **Do not guess.** The next session should retrieve the current job log and fix the first concrete build error shown.

## 5. Last known green pre-migration reference

The last documented green product-source checkpoint before the build-authority migration was:

`83c678127671f8c570c488c63f878a57fcafdacf`

with:

- `Battery Monitor Toolchain` run **#107**
- run ID **`34177651347`**
- result: **SUCCESS**

Use this only as a behavioral/security reference. It is **not** permission to restore PlatformIO as production build authority.

## 6. Requirements that remain frozen

The build migration must preserve established runtime and P0 security/resilience behavior. Do not weaken or bypass:

- relay safety/fail-safe behavior;
- voltage/current/operating-state freshness checks;
- OTA availability checks and fail-closed update behavior;
- signed OTA/release-policy enforcement and rollback protections;
- WebUI and SerialUI administrator security/recovery;
- lockout/human-challenge behavior;
- audit persistence/export behavior;
- release provenance, ledger, rollback policy, toolchain preflight, and ground-truth checks.

Do not weaken CI merely to get a green badge.

## 7. Read these first at the LIVE branch head

Read in this order:

1. `battery-monitor/AGENTS.md`
2. `battery-monitor/PROJECT_HANDOFF_LATEST.md`
3. `battery-monitor/PROJECT_STATE_LATEST.md`
4. `battery-monitor/firmware/README.md`
5. `battery-monitor/firmware/idf/README.md`
6. `.github/workflows/battery-monitor-ci.yml`
7. `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
8. `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`

Then inspect the latest `Battery Monitor Toolchain` workflow run and its ESP-IDF build job logs.

## 8. Exact next-session work order

1. Resolve the **live** `battery-monitor-dev` branch head and confirm no later work superseded this handoff.
2. Read the files above at that exact ref.
3. Resolve the latest CI run for the live head.
4. Obtain the actual diagnostic from `Run ESP-IDF application build`.
5. Fix the **first concrete build error** in the canonical ESP-IDF/shared-production-source architecture only.
6. Push and rerun until the canonical ESP-IDF application build passes.
7. Continue through every downstream safety/security/release gate that had been skipped.
8. Fix genuine downstream failures without bypassing or weakening the gates.
9. When everything is green, update `PROJECT_STATE_LATEST.md` and this handoff with the final green SHA/run.
10. Only then resume normal Phase 6 feature/operations work.

## 9. Migration completion criteria

Do not call the migration complete until:

- canonical ESP-IDF v5.5.5 application build is green in CI;
- the intended Arduino IDF component remains pinned to 3.3.7;
- all applicable later safety/security/release gates actually run and pass;
- no production build depends on PlatformIO;
- no second firmware runtime implementation exists;
- existing runtime/security behavior has not been weakened;
- authoritative state/handoff docs cite the final green commit and workflow run.

## 10. Remote/local warning

This handoff verifies the **GitHub remote branch**, not any developer's local clone. Before working locally, `git fetch` and compare the local checkout to the live remote head.
