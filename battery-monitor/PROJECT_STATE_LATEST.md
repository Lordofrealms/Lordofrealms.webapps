# Battery Monitor Project State — Authoritative Live State

**Updated:** 2026-09-07 (America/Chicago)  
**Repository:** `Lordofrealms/Lordofrealms.webapps`  
**Branch:** `battery-monitor-dev`  
**Version:** V0.1.0 prototype

## A. Current architecture authority

The ESP-IDF migration is complete. Battery Monitor has **one production firmware build architecture**.

Canonical authority:

- ESP-IDF: **v5.5.5**
- Exact ESP-IDF commit: `b774170ff46c393eeb5e495ea37936038d3f4f4f`
- Arduino compatibility/runtime component: `espressif/arduino-esp32` pinned to **3.3.7**
- IDF target: **`esp32`** for classic ESP32 / existing ESP32-WROOM-32 hardware
- ESP-IDF project root: `battery-monitor/firmware/idf/`
- ESP-IDF application component: `battery-monitor/firmware/idf/main/`
- ESP-IDF wrapper/entrypoint: `battery-monitor/firmware/idf/main/BatteryMonitorApp.cpp`
- Sole runtime behavior implementation: the existing Arduino-style source under `battery-monitor/firmware/BatteryMonitor/`, headed by `BatteryMonitor.ino`
- Sole authoritative firmware build entrypoint: `battery-monitor/firmware/idf/build.sh`

`BatteryMonitorApp.cpp` is intentionally a thin ESP-IDF translation-unit wrapper. It initializes Arduino as an ESP-IDF component, supplies the forward declarations that the Arduino sketch preprocessor used to synthesize, includes the existing `.ino` tabs, and calls the established `setup()` / `loop()` runtime. It is **not** a second behavior implementation.

There is no production PlatformIO build path in the current tree and no second production firmware runtime.

The previously documented `battery-monitor/firmware/include/` path is not a tracked directory in the current Git tree and is therefore not listed as a live source authority here.

## B. Final green migration checkpoint

Final green product-source SHA:

`249c18028b97714df7a62cabbb64b0ad1b354d7f` — `Revalidate ESP-IDF release pin alignment`

Authoritative CI result:

- Workflow: `Battery Monitor Toolchain`
- Run: **#129**
- Run ID: **`34185344138`**
- Result: **SUCCESS**

All three jobs completed successfully:

1. **ESP32 ESP-IDF + Arduino firmware**
   - pinned ESP-IDF 5.5.5 installation passed;
   - canonical ESP-IDF application build passed;
   - established application and deterministic 4 MiB merged-image artifacts were produced/uploaded.
2. **Windows .NET 8 client**
   - exact firmware artifact download passed;
   - pinned Espressif esptool verification passed;
   - pinned Espressif Security-2 provisioner helper build passed;
   - Windows client build passed;
   - **P0-3 protocol self-test passed**;
   - self-contained publish, bundle, and artifact upload passed.
3. **Android provisioning APK**
   - build, staging, and artifact upload passed.

The immediately preceding run #128 (`34184628946`) was also green after the initial compiler/prototype and component-pin fixes. Run #129 is the final migration revalidation authority because it includes the corrected signed-release provenance alignment.

## C. What was actually fixed

The first concrete build failure from migration run #124 (`34181484415`) was:

`SecureProvisioning.ino:199: percentEncode was not declared in this scope`

Additional cross-tab helper declarations failed for the same reason. Under the ESP-IDF wrapper, the `.ino` files are compiled directly as C++, so Arduino IDE's sketch preprocessor no longer auto-generates cross-tab function prototypes.

The fix was deliberately minimal: forward declarations were added to `BatteryMonitorApp.cpp`. Runtime behavior was not duplicated or rewritten.

A separate migration drift was then confirmed: the managed Arduino component/release provenance had been using **3.3.11** even though the architecture authority requires **3.3.7**. The live component manifest, ESP-IDF documentation, and signed-release provenance are now aligned to **3.3.7**.

No runtime logic was changed by the final pin/provenance revalidation commits.

## D. Safety and security authority

The migration does not authorize weakening existing safety/security behavior. The established requirements remain frozen, including:

- relay safety/fail-safe behavior;
- voltage/current/operating-state freshness checks;
- OTA availability and fail-closed update behavior;
- signed update/release-policy enforcement and rollback protections;
- WebUI and SerialUI administrator security/recovery;
- lockout/human-challenge behavior;
- audit persistence/export behavior;
- release provenance and production signature verification;
- existing rollback/release-policy/toolchain/ground-truth expectations where implemented.

The migration compile fix consists only of declarations, so it does not create a second implementation of those controls.

## E. Signed production release gate

`.github/workflows/battery-monitor-signed-release.yml` remains the gated **manual production-release** workflow (`workflow_dispatch`). It is not an ordinary `battery-monitor-dev` push job and no production release was requested during this migration closeout, so it was **not dispatched** merely to obtain a green badge.

Its current definition remains fail-closed and includes:

- exact source-SHA validation;
- build through the same authoritative `firmware/idf/build.sh` path;
- production signing-key fingerprint validation;
- RSA-3072-PSS-SHA256 signing of application and merged images;
- independent signature verification;
- tampered-image rejection;
- wrong-key rejection;
- production Windows `FirmwareSignatureVerifier` validation and tamper rejection;
- signed release provenance now recording Arduino-ESP32 **3.3.7**.

A real production release must still dispatch that workflow with an exact source SHA/version and pass its gated signing environment. Migration closeout does not substitute for a future signed-release run.

## F. Last pre-migration behavioral reference

The last documented green product-source checkpoint before migration remains:

`83c678127671f8c570c488c63f878a57fcafdacf`

- `Battery Monitor Toolchain` run **#107**
- Run ID: `34177651347`
- Result: **SUCCESS**

Use it only as a behavioral/security comparison point. It is not current build authority and is not a reason to restore PlatformIO.

## G. Current status and next work

**Migration status: COMPLETE.**

The completion criteria are satisfied for the production build migration:

- canonical ESP-IDF v5.5.5 application build is green;
- Arduino-ESP32 remains intentionally pinned to 3.3.7;
- all applicable branch Toolchain jobs and downstream P0-3/package gates ran and passed;
- no production PlatformIO path exists in the current tree;
- no second runtime implementation exists;
- runtime/security behavior was not weakened by the migration fixes;
- project state/handoff cite the final green product-source SHA and run.

Normal Phase 6 feature/operations work may resume from this point. Do not casually enable Secure Boot, Flash Encryption, or NVS Encryption; those remain explicit roadmap/security changes to be handled deliberately with their own validation.

## H. Known path/documentation note

Two paths named by the earlier migration handoff were not present in the verified live tree:

- `battery-monitor/AGENTS.md`
- `battery-monitor/firmware/README.md`

Do not silently substitute files from another branch/ref if those paths are requested in a future session. Resolve the live branch first and use the actual checked-in authorities.

## I. Remote/local state note

This state is based on the **GitHub remote branch**. A local clone is not proven current by this document. Always fetch and compare against the live `battery-monitor-dev` remote head before making further changes.
