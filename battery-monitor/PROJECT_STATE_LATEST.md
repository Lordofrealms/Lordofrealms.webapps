# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-07 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Version:** V0.1.0 prototype

## A. Current architecture authority

The sole production firmware build architecture is now **ESP-IDF**.

Canonical authority:

- ESP-IDF: **v5.5.5**
- Arduino compatibility/runtime component: `espressif/arduino-esp32` pinned to **3.3.7**
- IDF target: **`esp32`** (classic ESP32 / existing ESP32-WROOM-32 hardware)
- ESP-IDF project root: `battery-monitor/firmware/idf/`
- ESP-IDF application component: `battery-monitor/firmware/idf/main/`
- ESP-IDF entrypoint: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- Single production runtime behavior body: `battery-monitor/firmware/BatteryMonitor/BatteryMonitor.ino`
- Shared firmware configuration/include authority: `battery-monitor/firmware/include/`
- `BatteryMonitorApp.cpp` initializes Arduino through ESP-IDF and invokes the existing `setup()` / `loop()` behavior body.

There must be **no second production firmware implementation** and no alternate PlatformIO/Arduino production build path. The migration intentionally keeps one runtime behavior body while ESP-IDF owns the build, framework/component resolution, SDK configuration, partitioning, and FreeRTOS runtime.

`battery-monitor/hardware/firmware/...` remains fixture/interop/reference material and is **not** the production firmware source tree.

## B. Current remote checkpoint

Remote branch head verified immediately before this handoff refresh:

`931ff1fcf90c7dac828f0b7f3fd28f68deef04f8` — `Document sole ESP-IDF firmware architecture`

At that head, the current authoritative workflow is:

- Workflow: `Battery Monitor Toolchain`
- Run: **#124**
- Run ID: `34181484415`
- Result: **FAILED**
- Failure step: **`Run ESP-IDF application build`**

The ground-truth consistency/setup portions reached before the ESP-IDF build succeeded. The workflow stopped at the mandatory ESP-IDF application build, so later product/safety/security/release gates did not run for this head.

The exact compiler diagnostic was not recoverable through the connected job-log read during this handoff session. **Do not guess the root cause.** The next session must inspect the latest job log and fix the first concrete build error shown there.

## C. Last known green pre-migration behavioral baseline

Before the build-authority migration, the last documented green product-source checkpoint was:

`83c678127671f8c570c488c63f878a57fcafdacf`

with:

- `Battery Monitor Toolchain` run **#107**
- Run ID: `34177651347`
- Result: **SUCCESS**

That commit is a useful behavioral/security reference, but it is **not** the current build-system authority. Do not restore PlatformIO as a production path just to reproduce that green result.

## D. Runtime and safety requirements that remain frozen

The ESP-IDF migration must preserve the established runtime/product behavior already carried by the shared firmware source. In particular, do not weaken or bypass existing P0 security/resilience requirements, including:

- relay safety behavior and fail-safe handling;
- voltage/current/operating-state freshness checks;
- OTA availability and fail-closed update behavior;
- signed update/release-policy enforcement and rollback protections;
- WebUI and SerialUI administrative security/recovery behavior;
- lockout and human-challenge behavior;
- audit persistence/export behavior;
- release provenance, release-ledger, rollback-policy, toolchain-preflight, and ground-truth consistency checks.

A build-system migration is not authority to simplify these controls or create a second implementation of them.

## E. CI authority

`.github/workflows/battery-monitor-ci.yml` remains a release/build gate and must not be weakened to make the migration pass.

The canonical ESP-IDF application build must pass first. After it does, the later existing safety, firmware-fact, traceability, test-vector, render, toolchain, release-policy/rollback/ledger, deployment, and other repository checks must actually execute and pass as applicable.

## F. Active blocker

**Blocker:** the authoritative ESP-IDF application build fails in CI run #124 at `Run ESP-IDF application build`.

No compiler/root-cause claim is authoritative yet because the concrete diagnostic was not available in the connector log response during handoff.

## G. Next action — do this first in the next session

1. Resolve the **live** `battery-monitor-dev` remote head. Do not assume any SHA in this document is still current.
2. Read `battery-monitor/PROJECT_HANDOFF_LATEST.md` and this file at that exact live ref.
3. Inspect the latest `Battery Monitor Toolchain` run and obtain the concrete diagnostic from `Run ESP-IDF application build`.
4. Fix the **first real build error** only in the canonical `battery-monitor/firmware/idf/` architecture and shared production source as appropriate.
5. Do **not** introduce a parallel PlatformIO build, a second Arduino firmware tree, or duplicate runtime behavior.
6. Push and repeat until the mandatory ESP-IDF build is green.
7. Then clear every later safety/security/release gate that was previously skipped.
8. Only after the migration is completely green should normal feature/operations work resume.

## H. Migration completion criteria

Do not call the migration complete until all of the following are true:

- the canonical ESP-IDF v5.5.5 build is green in CI;
- the pinned `espressif/arduino-esp32` 3.3.7 component remains the intended compatibility component;
- later safety/security/release checks execute and pass;
- no production build depends on PlatformIO;
- no second firmware behavior implementation exists;
- runtime/security behavior has not been weakened;
- this state file and `PROJECT_HANDOFF_LATEST.md` are updated to cite the final green commit and workflow run.

## I. Remote/local state note

This state was verified against the **GitHub remote branch**. A local clone is not proven current by this document; always `git fetch` and compare the local branch to the remote head before doing further work.
