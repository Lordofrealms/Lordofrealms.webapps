## v1.4.2 DEV / build 113 — unify local heat interpolation and invalidate ambiguous caches

- Fixed a mixed-engine heat path: foreground 99/297/891 jobs already used `surface-local-v078`, while v1.1.3 background-cache and DEV-inspector jobs used a captured native Worker pointed at the historical global-IDW² v073 worker.
- Redirected those background/inspector jobs to `heatmap-raster-worker-v078.js`, which uses the same locality-first triangle/rectangle evaluator and edge-locking rules as the v1.3.6 foreground coordinator.
- Advanced the durable heat-cache schema to v2 and added the engine identity `local-surface-v078-edge-locked`; v1/unknown-engine cache images are rejected and regenerated rather than silently mixing interpolation models.
- Added v1.4.2 regression coverage for local-triangle isolation from distant measurements, exact on-grade edge locking, cache-engine/schema invariants, and whole-raster versus seven-band equivalence at the 99/297/891 tiers.
- Preserved progressive 99 → 297 → 891 scheduling, parallel compute, atomic full-frame presentation, no-row/no-band painting, map reveal timing, imagery, GPS geometry, and project recovery behavior.

## v1.4.1 DEV / build 112 — durable identity repair, 50k diagnostics, stale heat producer retirement

- Added a pre-index persistent-directory integrity barrier that checks duplicate project IDs and six-character file IDs before durable restoration.
- Repairs collisions conservatively with newest-owner retention, write-first/delete-second replacement, rollback on cleanup failure, heat-cache invalidation for repaired shared project IDs, and project-index invalidation for clean rebuild.
- Preserved the normal recovery mutation lock; only the explicit integrity transaction can bypass it.
- Increased IndexedDB diagnostic retention to 50,000 entries with batch prune-back to 48,000; memory fallback remains bounded at 5,000.
- Fixed recurring stale heat restoration attempts by clearing the v1.1.1 producer completed-canvas/generation state on `padgrade-before-project-switch`; existing v1.2.6/v1.2.7 physical worker cancellation remains intact.
- Heat interpolation, 99/297/891 progressive computation, parallel band math, atomic complete-frame presentation, imagery, grading math, and map reveal timing are unchanged.

# Changelog

## v1.3.8 — development build

### Recovery UI — retire picker wording before post-picker reveal
- Fixes the remaining stale folder-cover flash after a successful Android durable-folder selection.
- Root cause: v1.3.7 re-armed the shared `padGradeRecoveryHold`, but the first-run `padGradeFirstRunSetupV127` class still overrode that same pseudo-element to `Choose project storage to continue` until reload.
- v1.3.8 removes/suppresses only that picker-specific class during the successful hidden handoff, while keeping the existing recovery cover continuously active as `Restoring saved project…`.
- Picker cancellation or rejected-folder recovery returns ownership to the existing folder-choice cover.
- Adds no cover, overlay, native curtain or arbitrary transition delay; TOS, indexing, recovery, reload and map-ready release remain unchanged.

### Heatmap
- No changes. v1.3.6/v1.3.7 all-tier parallel compute and atomic full-frame presentation are carried forward unchanged.

### Imagery
- No changes. v1.3.7 best-positive USGS NAIP Plus selection remains active; the latest field proof selected the available 0.6 m best-positive raster.

### Release pipeline
- Retains the v1.3.7 fresh synthetic main-equivalent tag anchor and newest-first Releases ordering.

### Version
- Android DEV package: **1.3.8 / build 110**.

## v1.3.7 — development build

### Imagery — best positive-resolution NAIP source
- Excludes `resolution_value <= 0` / unknown-resolution NAIP records before the existing resolution-nearest-zero ordering, preventing invalid catalog rows from outranking real positive-resolution imagery.
- Retains USGS NAIP Plus, Natural Color, 512-for-256 exports, cubic interpolation and quality 95.
- Adds live proof that the positive-resolution filter reached an actual imagery request.

### Recovery UI — successful folder-picker handoff
- Adds no new cover. The successful Android folder-picker result now re-arms the existing restoring cover and waits for that JS handoff before folder indexing begins.
- Cancellation, TOS, recovery logic, startup and map-ready release are unchanged.

### Heatmap
- No heatmap code changes; v1.3.6 all-tier parallel/atomic behavior is carried forward unchanged.

### Release pipeline
- Dev tags now point to fresh no-op commits with the current `main` tree/parent, preserving the release-permission workaround while restoring normal newest-first release ordering.

### Version
- Android DEV package: **1.3.7 / build 109**.

## v1.2.1 — development build (93)

### Fixed — self-aborting MapLibre ImageSource load
- The v1.2.0 field diagnostic showed **491 `heatmap.v120-image-requested` events but zero `heatmap.v120-image-committed` events**. The heat canvases themselves were populated, including the main 891 frame and Compare frames, so the failure was after raster generation.
- v1.2.0 was re-entering the permanent ImageSource commit whenever the legacy virtual heat layer changed visibility or opacity. Those repeated commits supplied the **same PNG data URL** while the first image load was still in flight.
- In pinned MapLibre GL JS 5.16.0, every `ImageSource.updateImage()` call aborts any current image request before starting the new one. The repeated same-URL calls therefore kept aborting/restarting the image before it could finish decoding.
- v1.2.1 installs a one-in-flight-load-per-unique-URL guard on the real permanent ImageSource. Repeated requests for the same frame no longer call MapLibre `updateImage()` again. A genuinely different completed frame URL may still replace the current/pending one once.
- When the real ImageSource reports loaded with the expected decoded dimensions, v1.2.1 promotes that frame into the v1.2.0 controller state and makes the canonical heat layer visible.

### Diagnostics / regression coverage
- Added `heatmap.v121-source-dedupe-installed`, `heatmap.v121-image-requested`, `heatmap.v121-image-committed`, and `heatmap.v121-image-load-timeout` diagnostics.
- Added a regression test that deliberately floods one pending ImageSource with **250 identical same-URL updates** and verifies the underlying MapLibre update is not re-entered; it then verifies a genuinely new URL is forwarded exactly once and can commit.

### Changed
- `v121-dev.js` now loads immediately after `v120-dev.js` and owns same-frame ImageSource request deduplication while retaining the v1.2.0 permanent ImageSource presentation path.
- Android DEV package is **version 1.2.1 / build 93**.

### DEV verification
- Open a project with a populated heat cache and confirm the heat map becomes visible.
- Export a diagnostic log and confirm there is a `heatmap.v121-image-committed` row rather than an endless stream of same-frame `heatmap.v120-image-requested` rows.
- Switch **Auto → 99 → 297 → 891 → Auto** and confirm genuinely new completed tiers still replace the prior tier.
- Open Project Comparison and confirm its heat map also commits.

## v1.2.0 — development build (92)

### Fixed — MapLibre 5.16.0 image transport
- The v1.1.9 diagnostic log exposed the actual blank-heat root cause: Pad Grade pins **MapLibre GL JS 5.16.0**, whose `ImageSource.updateImage()` implementation silently returns when only `image: ImageBitmap` is supplied. v1.1.9 therefore logged successful calls that MapLibre ignored, leaving the permanent source on its transparent placeholder.
- Completed worker/cache canvases are now encoded to a local PNG data URL and supplied through the **`url` contract that MapLibre 5.16.0 actually implements**. The first permanent ImageSource is created with the real completed frame URL rather than a transparent placeholder, and later resolutions call `updateImage({url, coordinates})`.
- A frame is no longer called committed merely because `updateImage()` returned. v1.2.0 waits until the ImageSource reports loaded and verifies that MapLibre's decoded image object changed and has the expected raster dimensions before making the canonical layer visible and emitting `heatmap.v120-image-committed`.

### Fixed — style readiness and Project Comparison
- Heat presentation no longer waits for `map.isStyleLoaded()` to become true after `style.load`. With the USGS raster stacks, `isStyleLoaded()` can remain false while imagery requests are still outstanding even though the style is already safe to mutate. That delayed the main heat map by many seconds and could block Compare indefinitely.
- `style.load` now establishes the presentation generation. Main and Compare may add their permanent local heat source/layer immediately after that event, independently of slow or stalled satellite imagery.
- Compare resolution diagnostics now report the actual 99 / 297 / 891 tier inferred from canvas dimensions instead of mistaking its double-buffer slot suffix (`0` / `1`) for a tier.

### Diagnostics / regression coverage
- Added `heatmap.v120-image-requested`, verified `heatmap.v120-image-committed`, and `heatmap.v120-image-verify-failed` events. Frame/request rows include PNG encode timing, encoded length, and a tiny alpha sample so a future failure can distinguish blank worker pixels from MapLibre presentation failure.
- The v1.2.0 runtime self-test emulates the **MapLibre 5.16.0 URL-only `updateImage` behavior**: direct `image` updates are deliberately ignored by the fake source. It also holds `isStyleLoaded()` false after `style.load` to prove both Main and Compare still create and verify the heat image.
- Historical v1.1.9 tests remain as carry-forward tests, but no longer require the broken v1.1.9 runtime to be executable.

### Changed
- Active heat presentation moves from `v119-dev.js` to `v120-dev.js`. v1.1.9 remains in the repository for regression/history only.
- Android DEV package is **version 1.2.0 / build 92**.
- The v1.1.9 GPS permission denial/retry behavior is carried forward unchanged while it is being field-tested.

### Unchanged
- IDW² interpolation math, measured-point/color-scale math, 99 / 297 / 891 worker resolutions, final 891 cache format, project schema, project-grid geometry, Project Comparison delta math, GPS suspension on minimize, and retained satellite imagery are unchanged.

### DEV verification
- Confirm the main heat map appears shortly after the map style becomes ready; it should not wait for all USGS imagery to finish loading.
- Switch **Auto → 99 → 297 → 891 → Auto** and confirm every completed tier visibly replaces the prior completed tier with no blank frame or crossfade.
- Open Project Comparison and confirm its heat map appears even while satellite imagery is still loading.
- Continue the v1.1.9 GPS permission test: deny/choose **Not now**, confirm Manual fallback, then select GPS Guided again to retry.

## v1.1.9 — development build

### Fixed — permanent heat presentation cutover
- Replaced the unsuccessful v1.1.7/v1.1.8 heat-presentation experiment with a single shared **style-owned MapLibre ImageSource controller** used by both the regular project map and Project Comparison. The controller is installed at map construction, but it does not create its real image source/layer until MapLibre reports the current style fully loaded.
- Completed 99 / 297 / 891 worker canvases are now intercepted **before they become real MapLibre CanvasSources**. They remain offscreen frame inputs only. After a complete canvas is decoded to an `ImageBitmap` when supported, the already-existing permanent ImageSource is updated in place. No real legacy heat CanvasSource or double-buffer heat layer is added to MapLibre by v1.1.9.
- The permanent source/layer is created once per genuine MapLibre style generation and rebuilt only after a subsequent `style.load`. It is no longer recreated opportunistically from every heat commit attempt while `isStyleLoaded()` is false, which was the reason v1.1.8 repeatedly logged source/layer creation without ever reaching `heatmap.v118-image-committed`.
- Resolution replacement retains the previously committed complete image while a new frame is decoding. Temporary removal of legacy virtual slots does not blank the permanent image. `raster-fade-duration` remains zero, so there is no intentional crossfade.
- Main and Compare now share the same controller implementation and lifecycle rules instead of separate presentation behavior.

### Changed — old presentation path removed from executable startup
- The app no longer executes `v114-dev.js`, `v115-dev.js`, `v116-dev.js`, `v117-dev.js`, or `v118-dev.js`. Those historical files remain in the repository only for history/regression reference. Their heat authority, render-barrier, imagery-unload, and prior ImageSource shims are not part of the v1.1.9 runtime.
- `v113-dev.js` remains responsible for worker scheduling, the 99/297/891 resolution inspector, project heat cache, and project-switch reuse. Its completed canvases are virtual inputs to v1.1.9; they are never installed as actual MapLibre CanvasSources.
- Retained GPS suspension on minimize. Satellite imagery remains attached while minimized. Android WebView timer pause/resume and native `ApplicationExitInfo` one-time-permission recovery from v1.1.8 remain in the Android host.
- Android DEV package is **version 1.1.9 / build 91**.

### Changed — location denial/retry behavior
- Pad Grade still uses the v1.1.8 informed Android permission explanation before the OS location prompt. If the resulting geolocation request is denied or the user chooses **Not now**, v1.1.9 automatically returns the workflow to **Manual** instead of leaving the UI visually stuck in GPS Guided mode without usable GPS.
- Selecting **GPS Guided** again is the retry action; Pad Grade requests foreground location again through the existing informed permission flow. The removed standalone Enable GPS control is not restored.
- If Android has stopped presenting the normal permission dialog after repeated/permanent denial, the failed retry returns to Manual and offers **Open App Settings** so Precise + While Using access can be restored explicitly.

### Diagnostics
- Added `heatmap.v119-*` events for constructor/controller installation, style readiness, intercepted complete canvases, ImageBitmap readiness, permanent source/layer creation, successful image commits, and commit/create failures.
- A healthy map should show one source/layer creation per style generation followed by `heatmap.v119-image-committed`; repeated source/layer creation without a style generation change is treated as a regression.

### Unchanged
- IDW² interpolation math, color-scale math, measured-point values, 99 / 297 / 891 target resolutions, worker rasterization, final 891 disk cache format, project schema, project-grid geometry, comparison delta math, and the intentional separate Compare MapLibre instance are unchanged.

### DEV verification
- Confirm the main project heat map appears on initial load. Switch **Auto → 99 → 297 → 891 → Auto** repeatedly; each completed image should replace the previous completed image with no blank frame, dark overlap, crossfade, or progressive horizontal bars.
- Open Project Comparison and confirm its heat map appears and progresses through its worker tiers using the same permanent ImageSource behavior.
- Switch projects, hard reload, and minimize/resume; no outgoing-project heat may remain visible and the permanent image should recover after a genuine style reload.
- Deny the informed location request or choose **Not now** and confirm Pad Grade returns to Manual. Select GPS Guided again and confirm that action retries the location flow.

All notable Android packaging and release changes for Pad Grade are documented here.

The Android app packages the canonical web application from `../pad-grade`; feature and interpolation history therefore lives primarily in [`../pad-grade/CHANGELOG.md`](../pad-grade/CHANGELOG.md). This file records Android-specific packaging, channel, and release information.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably.

## v1.1.8 — development build (90)

### Changed
- Updated the separately installable Android DEV package to **versionName 1.1.8 / versionCode 90**.
- Removed the web-side USGS imagery unload/restore experiment. Both primary and Project Comparison satellite imagery stacks remain attached while minimized; GPS watch suspension remains active.
- The packaged heat presentation runtime now uses one permanent completed-image source on both the primary and comparison maps while retaining existing interpolation workers/cache behavior.

### Added — location permission guidance and recovery
- Before invoking Android's foreground location permission sheet, Pad Grade now explains why **Precise location** is needed, recommends **While using the app**, warns that **Only this time** may later be revoked and terminate the process, and states that Pad Grade suspends GPS when minimized so background-location access is not needed.
- Added `ACCESS_COARSE_LOCATION` beside `ACCESS_FINE_LOCATION` and requests them together, allowing Android to expose its normal Approximate/Precise choice. Pad Grade verifies `ACCESS_FINE_LOCATION` after the result; approximate-only permission is rejected for GPS Guided surveying with an **Open App Settings** recovery path.
- Added a diagnostics-independent native `ApplicationExitInfo` check for `PERMISSION_CHANGE / one-time permission revoked`. The next launch can explain that Android closed Pad Grade even when diagnostic logging was disabled, and consumes a native exit fingerprint so each historical termination is shown only once.

### Fixed
- Fixed Activity recreation/hard reload leaving the new WebView frozen because `WebView.pauseTimers()` is process-global while the old resume guard was Activity-local. `resumeTimers()` is now called unconditionally whenever the foreground Activity/WebView resumes.
- Packaged the v1.1.8 current-candidate heat commit fix so a valid completed heat frame is no longer rejected merely because legacy layer-visibility synchronization ran while `createImageBitmap()` was completing.
- Applied the corrected permanent-image heat presentation to Project Comparison as well as the normal project map.

### DEV verification
- Confirm the main heat map actually appears and rapid Auto/99/297/891 changes no longer flash the bare map.
- Confirm comparison heat progresses from its lower to higher resolution without the old layer-swap flicker.
- Hard reload and confirm the local grid/map initialize without requiring an exit/reopen cycle.
- With location revoked, verify the explanatory dialog precedes Android's permission UI, then choose While using + Precise. Deliberately choosing Only this time should produce the one-time permission-revocation recovery notice after Android later terminates the process, even with Diagnostics off.


## v1.1.7 — development build (89)

### Changed
- Updated the separately installable Android DEV package to **versionName 1.1.7 / versionCode 89**.
- A stopped Pad Grade Activity now explicitly quiesces its WebView with `WebView.onPause()` plus `WebView.pauseTimers()`. `resumeTimers()` and `WebView.onResume()` restore it when the Activity returns.
- The web runtime keeps the v1.1.6 GPS-watch/USGS-imagery background suspension, then the native host stops WebView timer/layout/parsing activity at `onStop()`.

### Added
- Added `ApplicationExitInfo` history capture during `Activity.onCreate()`. Previous host-process exits are persisted with reason, status/signal, importance, sampled PSS/RSS, timestamp, and Android's description so a later diagnostic export can identify why Android terminated Pad Grade.
- Added explicit native lifecycle rows `webview.backgroundPaused` and `webview.backgroundResumed`.
- Packaged the v1.1.7 permanent-ImageSource heat-map runtime and regression self-test.

### Heat-map presentation
- The Android package now uses the v1.1.7 web presentation path: one permanent MapLibre `ImageSource`/raster layer receives only fully completed `ImageBitmap` frames. The existing heat workers/math/resolutions are unchanged.
- `raster-fade-duration` remains zero and the previous completed image remains displayed until the next completed image is ready; no live canvas is exposed to MapLibre while being painted.

### Fixed
- The image-commit cleanup path now keeps an explicit reference to the active MapLibre instance until the previous completed bitmap is safe to release after render.

### DEV verification
- Minimize for several minutes and confirm the lifecycle log reaches `webview.backgroundPaused` after `activity.onStop`.
- If the process is reclaimed, reopen the app and export diagnostics; `android.process.exit-reason` should report Android's historical reason/status.
- Exercise Auto/99/297/891 heat switching and confirm there are no partial horizontal bars, blank frames, dark overlap, or cross-fades.

## v1.1.6 — development build (88)

### Changed
- Continuous GPS watches are suspended at the underlying geolocation/Precision Location provider whenever the WebView becomes hidden, then only the watches that were previously registered are restored on return. This covers both survey guidance and the map-position companion watch without forcing either feature to forget its app-level watch ID.
- Active stabilized corner capture is cancelled on minimize and must be recaptured after resume rather than completing against a gap in location samples.
- USGS cached imagery and high-resolution NAIP raster layers/sources are removed from both the primary map and the intentionally separate Project Comparison map while backgrounded. MapLibre instances, camera/project/grid/heat state, calibration, and disk/decoded heat caches remain intact and imagery is reattached on resume.
- This is a targeted background-resource experiment based on v1.1.5 diagnostics showing foreground process memory dominated by graphics PSS. GPS suspension is included to eliminate unnecessary background power/location work, not because GPS was measured as the graphics-memory source.

### Fixed
- Packaged the v1.1.6 two-render-barrier heat-map handoff. The same-source hold must render once before old → hold, the full-opacity hold must render before the real resolution selection proceeds, and the target must render staged before hold → target. The intended result remains a hard no-cross-fade resolution swap without a bare-map frame.
- Pending heat handoffs are cancelled across project, hide, and unload boundaries.

### Diagnostics
- Added explicit memory checkpoints before background suspension, after GPS suspension, after imagery removal, after a settled unload interval, and around resume/restoration.
- Added GPS and imagery suspend/restore event markers, including counts of stopped/restarted watches and removed/restored raster layers/sources.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.6**, version code **88**.
- No larger-heap flag, foreground keep-alive service, automatic heat-cache trimming, or MapLibre destruction is introduced in this build.

### DEV verification
- Reproduce the prior several-minute minimize/reopen scenario with GPS active and compare the v1.1.6 post-GPS and post-imagery memory snapshots to the v1.1.5 baseline.
- Verify satellite imagery disappears from memory while hidden and reloads on return without losing grid/heat/project state.
- Repeat with Project Comparison open and verify its intentionally separate map remains the only secondary MapLibre instance and is restored correctly.
- Exercise Auto/99/297/891 repeatedly and verify the stronger two-barrier handoff removes the remaining resolution-change flicker.

## v1.1.5 — development build (87)

### Fixed
- Packaged the frame-synchronized heat-map handoff that keeps the prior completed raster displayed while a requested Auto/99/297/891 raster is staged, then performs a hard zero-fade paint swap after the target has rendered once. This removes the remaining bare-map flash without restoring the prior overlapping-raster behavior or adding a visible cross-fade.
- Cancels an in-progress handoff before project changes, map replacement, app hiding, or heat-map disable so the temporary hold can never carry outgoing-project imagery across a project boundary.
- Fixed v1.1.4 diagnostic exports dropping the actual nested memory measurements. Current snapshots and persisted Android lifecycle snapshots are now flattened into export-safe numeric fields instead of exporting only the checkpoint label.

### Diagnostics
- `memory.snapshot` now exports total PSS, Java/native/graphics/code/stack/private-other/system/swap categories, Java/native heap values, device available/threshold memory, process importance/trim state, JS heap when exposed, canvas/heat/cache estimates, and worker counts.
- `android.memory.lifecycle` now exports the native memory snapshot stored with Android lifecycle breadcrumbs, including measurements that survived a previous process reclamation.
- Added heat handoff timing markers so hold/stage/commit/cleanup timing can be distinguished from interpolation calculation time.
- Memory behavior itself remains unchanged: this build intentionally adds no automatic trimming, tile-cache reduction, larger-heap request, or background keep-alive.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.5**, version code **87**.
- IDW² math, color scaling, 99/297/891 resolutions, project schema, and the lossless 891 cache format remain unchanged.

### DEV verification
- Repeatedly switch the exact heat-map tiers and confirm there is neither a bare-map flash nor a visible overlap/cross-fade.
- Export diagnostics and verify numeric process/device memory fields are present on `memory.snapshot` and `android.memory.lifecycle` rows before using the data to decide whether memory reduction is warranted.

## v1.1.4 — development build (86)

### Fixed
- Fixed multiple normal heat-map raster slots becoming visible simultaneously after an otherwise atomic 99→297→891 swap.
- Fixed manual resolution inspection allowing a normal Auto raster to remain visible underneath the selected 99/297/891 inspector raster.
- Prevented an already-loaded cached 891 final raster from being visually replaced by lower-tier regular work that was already in flight.

### Diagnostics
- Lifecycle breadcrumbs now include native process/device memory snapshots: total PSS, dirty memory, Java/native heaps, graphics/code/stack/private-other/system categories, available/threshold device RAM, process importance, and trim state.
- Web diagnostics now add `memory.snapshot` checkpoints with JS heap (where available), canvas/CanvasSource backing-store estimates, decoded heat-cache estimates, and heat-worker inventory.
- Memory instrumentation is observation-only in this build; it does not automatically trim MapLibre, canvases, or caches.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.4**, version code **86**.

## v1.1.3 — development build

### Added
- Packaged the separate lossless 891 heat-map cache and visible-idle one-project-at-a-time background cache generation for other projects. Cache files are disposable and keyed to exact surface inputs; the `.padgrade` project remains authoritative.
- Added persistent Android Activity/process/WebView lifecycle breadcrumbs to the existing DEV diagnostic export, including process and Activity identity, saved-state restoration, memory-trim callbacks, and renderer termination details.
- Added handled WebView renderer recovery with `onRenderProcessGone()` so renderer reclamation can rebuild the WebView without an unhandled app-process exit.

### Changed
- Replaced the v1.1.2 cross-fade diagnostic with exact Auto/99/297/891 display controls and packaged the literal no-overlap normal heat-map tier swap.
- Packaged reusable project switching: outgoing project-owned map content is blanked before the chooser closes, existing MapLibre/grid infrastructure is reused where safe, and same-dimension lower-grid cells are updated in place.
- Bumped the separately installable DEV package to **version 1.1.3 / versionCode 85**. Build 84 remains the v1.1.2 diagnostic package and is not reused.

### Fixed
- Removed the intentional two-animation-frame overlap between completed heat-map tiers.
- Removed the v1.1.2 double project-overlay teardown while preserving the requirement that no previous-project grid or heat content is visible after the project dialog closes.

### DEV verification
- Verify exact raster inspection and no dark/blank tier-transition frame, then repeat same-size/different-size project switches looking specifically for stale outgoing content.
- Complete an 891 map, restart, and verify the unchanged project restores from its `.pgheatcache`; change a reading and verify regeneration.
- Reproduce the prior several-minute background/reopen case and export diagnostics to determine whether Android killed the process/Activity or the WebView renderer.

## v1.1.2 — development build

### Added
- Packaged the **DEV heat-map resolution inspector** beneath the GPS map. The inspector can display the exact completed 99, 297, and 891 regular-project rasters and can cross-fade neighboring completed tiers while the tester scrubs between the exact stops.
- Added an **Auto** control and tier-readiness/status display so the diagnostic view can be returned to the normal staged heat-map presentation and the tester can see which rasters are actually available.

### Changed
- Packaged the revised project-switch presentation: the Projects dialog remains visible while a lazily loaded target project is read, then the outgoing project's project-owned map overlays are cleared before the dialog closes and the new project is applied.
- Bumped the separately installable DEV package to **version 1.1.2 / versionCode 84**. Build 83 remains the v1.1.1 resilience/startup package and is not reused.
- The packaged heat-map worker, interpolation math, color normalization, tier dimensions, 99/297 concurrent start, deferred 891 scheduling, and monotonic promotion are unchanged from v1.1.1. The proposed measured-point/anchor color change is intentionally **not** present in this diagnostic APK.
- Schema 6, rollback behavior, durable indexing/recovery protections, the fixed 15% GPS-map hitbox behavior, and Project Comparison's independent heat-map path are unchanged.

### Fixed
- Fixed the visible old-project flash during lazy project switching by keeping the chooser over the map until the target project is ready and clearing outgoing project-owned overlays before revealing the switched map.

### DEV verification
- Compare the exact 99/297/891 stops on-device before approving any later heat-map color change. Intermediate slider positions are display-only cross-fades, not additional calculated resolutions.
- Confirm **Auto** restores the normal staged heat-map display and that repeated lazy project switches no longer reveal the outgoing project's map content between chooser close and target-project application.

## v1.1.1 — development build

### Added
- Packaged the generation-scoped map-overlay repair controller, including bounded retries across transient MapLibre style states, a direct project-grid fallback when the style object exists but full style loading is temporarily incomplete, and lifecycle diagnostics for repair attempts/results, WebGL recovery, and GPS provider/state changes.

### Changed
- The packaged recovery experience now reveals the restored project UI/lower grid as soon as they are ready while leaving the existing durable recovery/write lock intact. The GPS map card uses its own temporary **Restoring project map…** veil until the saved project grid has been restored.
- Regular 99/297 heat-map workers may begin before MapLibre finishes startup; completed rasters are buffered and installed when the map becomes usable. The 891 tier remains deferred until 297 completes, and Project Comparison remains independent.
- Bumped the separately installable DEV package to **version 1.1.1 / versionCode 83**. Build 82 remains the v1.1.0 staged-heat package and is not reused.

### Fixed
- Fixed the intermittent blank project-grid/heat-map state caused by a project switch landing inside a transient MapLibre `isStyleLoaded() === false` window.
- Fixed regular heat-map results being thrown away if a worker completed just before the map could accept its CanvasSource.
- Reduced perceived settings-restore/initial-startup delay by no longer using GPS-map readiness as a prerequisite for visually revealing an otherwise restored project.

### DEV verification
- Exercise GPS provider fallback/blips, repeated project switches, app resume, and a clean durable-folder restore. Confirm the correct grid/heat map recover without reopening a project and that the new local map veil disappears once the active project grid is truly present.
- Export diagnostics after a startup/switch test and confirm the new overlay/GPS lifecycle events contain timing/state but no GPS coordinates or rod readings.

## v1.1.0 — development build

### Changed
- Removed the **33-tier** heat-map pass from the packaged regular and Project Comparison surfaces. Device diagnostics showed it was only briefly visible before the much better 99-tier surface while adding another worker during startup.
- The APK now starts **99 and 297 concurrently**, then starts the **891 final tier only after 297 completes**. This keeps the high-resolution final surface while removing the largest heat-map worker from the early-load contention window.
- Atomic monotonic whole-raster swaps remain unchanged, as does the grid-aware minimum of 3 raster pixels between adjacent survey points.
- Regular and comparison heat-map work remain independent; opening Project Comparison does not cancel, defer, or globally throttle a regular-project heat calculation.
- Bumped the separately installable DEV Android package to **version 1.1.0 / versionCode 82**. Build 81 remains the v1.0.9 four-concurrent-tier diagnostic build and is not reused.
- Schema 6, the tested schema-6 → schema-5 rollback path, durable project indexing/recovery protections, and the fixed 15% GPS-map hitbox behavior are unchanged.

### DEV verification
- Export diagnostics after a normal heat-map load and a Project Comparison load. New generations should initially post only tiers 99 and 297, then log the 891 final-tier start after the corresponding 297 worker completes; no tier-33 job should appear.
- Compare 99/297 time-to-visible against v1.0.9 to verify that removing tier 33 and deferring 891 reduces early CPU contention without changing the final surface quality.

## v1.0.9 — development build

### Added
- Added four concurrent whole-raster heat-map tiers for both the normal GPS project map and Project Comparison: **33 → 99 → 297 → 891**. All four calculations start together instead of waiting for an earlier tier to finish.
- Added monotonic atomic promotion: a completed raster replaces the displayed raster only when it is a higher tier for the same surface. A late 33/99/297 result can never downgrade a higher-resolution image that already finished.
- Replaced the old 64-pixel whole-axis minimum with a grid-aware quality floor of **3 raster pixels between adjacent survey points** on each axis. For the normal 9×9, 64×76 ft pad, the requested tiers are approximately 28×33, 83×99, 250×297, and 750×891.
- Extended heat diagnostics across all four tiers, including generation-start, worker-post, worker-complete, visible, and late-tier-skipped events.

### Fixed
- Fixed the normal heat map being initialized twice. `index.html` is now the sole loader for `v063-dev.js`; the legacy dynamic loader in `v062-dev.js` was removed.
- Added a singleton guard inside the normal heat-map engine so an accidental future duplicate script load cannot create another set of workers/timers.

### Changed
- The normal and comparison heat maps now use the same **33/99/297/891** progressive policy while retaining complete-raster CanvasSource swaps with no partial bands or blank-frame transition.
- Project Comparison remains independent of the normal project heat map. Opening comparison does **not** cancel or defer regular-map heat work; no global worker-throttling policy was added.
- Android DEV package is **version 1.0.9 / build 81**. Schema 6, schema-6 → schema-5 rollback, project indexing, first-install recovery protection, and the fixed 15% GPS-map hitbox behavior are unchanged.

### DEV verification
- Export diagnostics after a normal heat-map load and a Project Comparison load. Confirm only one regular generation is started, all four tiers are posted once per surface generation, the first coarse raster appears quickly, and visible tiers only move upward.
- Compare 33/99/297/891 worker runtimes to determine whether the new concurrent progression materially improves time-to-first-heat and time-to-297/891 on the test phone.

## v1.0.8 — development build

### Added
- Added matching heat-map timing diagnostics for the normal project surface and Project Comparison. Both 304-tier and 888-tier jobs now record worker-post time, worker completion time, worker internal total/rasterization/color timing, canvas conversion time, MapLibre install time, and total post-to-visible time so the two paths can be compared directly from one exported diagnostic log.
- Added an explicit recovered-project reload save guard. Intentional durable-recovery reloads are marked before unload, and only that unload is prevented from persisting a not-yet-applied runtime snapshot over the recovered project.

### Changed
- Project Comparison now starts its 304-tier heat-map worker immediately after the two projects have been loaded and the comparison values/shared geometry have been computed. MapLibre creation, style loading, grid installation, and imagery loading proceed in parallel; a raster that somehow finishes before the map is ready is buffered and installed as soon as the authoritative comparison grid exists.
- The comparison picker now uses an already-verified in-memory durable catalog without rereading `Pad-Grade-Project-Index.pgindex` or touching SAF. Folder select/index/refresh events explicitly dirty that cache so externally copied or replaced files still force a real reconciliation before the catalog is trusted again.
- During durable first-install/folder recovery, the selected active project body is force-read from its authoritative `.padgrade` file once instead of trusting a preexisting local cached body. This is a second defense against stale/partial local state surviving the recovery reload.
- Unchanged durable-index rewrites are suppressed. The indexed project entries are compared independently of the index `updatedAt` timestamp, so a reconciliation that proves the same project catalog no longer writes the same `.pgindex` contents back to SAF.
- Android DEV package is **version 1.0.8 / build 80**. Schema 6 and its tested schema-6 → schema-5 rollback path are unchanged, and the fixed 15% GPS-map hitbox behavior is unchanged.

### Fixed
- Fixed a first-install recovery race where a correctly recovered/upgraded project could be overwritten during the intentional recovery reload by the legacy before-unload autosave snapshot. The diagnostic log that exposed this showed an approximately 18 KB recovered project being rewritten to roughly 1.1 KB; v1.0.8 blocks that recovery-only snapshot while leaving ordinary autosave intact.
- Fixed the Project Comparison legend bar disappearing while its CUT / GRADE / FILL text remained visible. The authoritative comparison renderer now owns the gradient-bar CSS instead of depending on the retired v0.8.6 presentation override.
- Removed the remaining comparison-picker delay caused by forcing a durable reconciliation even when the in-memory catalog had already been verified and no folder-change event had occurred.

### Known issues / DEV verification
- Re-test a clean install against an existing durable folder and verify the previous active project opens with its readings/GPS state intact and that no unexpectedly tiny replacement project file is written during the recovery reload.
- Export a diagnostic log after allowing both the normal project heat map and comparison heat map to reach 304 and 888 tiers. Compare `heatmap.regular-*` against `compare.heat-*` events before changing the shared interpolation algorithm.
- Confirm the comparison CUT / GRADE / FILL gradient bar, grid labels, probe behavior, imagery, Android Back exit, and progressive heat-map replacement before stable promotion.

## v1.0.7 — development build

### Added
- Packaged the schema-6 project format, rebuildable `Pad-Grade-Project-Index.pgindex`, cached SAF file metadata, bounded header-read bridge, lazy project loading, SHA-256-on-full-read/write tracking, and tested schema-6-to-schema-5 rollback path.
- Added native cached `filename`/size/last-modified project metadata and bounded asynchronous header reads so the web runtime can validate unchanged project folders without reopening every project payload.
- Packaged the indexed progressive Project Comparison renderer and its comparison-specific timing diagnostics.

### Changed
- Bumped the separately installable DEV Android package to **version 1.0.7 / versionCode 79**. Build 78 remains the tested v1.0.6 fixed-15%-hitbox release candidate and is not reused.
- Unchanged durable project files now take the index/metadata fast path with zero project-body reads. New/changed schema-6 files use the bounded header path; schema-5 files are fully read and upgraded once.
- Comparison uses the shared durable catalog for its picker, loads only the selected pair, shows its shell immediately, renders the final detailed grid at MapLibre style readiness, and then adds the 304-tier/888-tier heat maps while imagery loads independently.
- The field-tested fixed **15%** GPS-map survey-point near-miss hitboxes remain unchanged from v1.0.6.

### Fixed
- Removed recurring full-file maintenance reads whose only result was that every durable project was already unchanged.
- Restored the intended detailed comparison point colors/labels and CUT/GRADE/FILL scale in the authoritative comparison render path rather than relying on a later asynchronous presentation repair.

### Known issues
- This build changes durable project files from schema 5 to schema 6. Exercise folder upgrade/reconnect/copy-in scenarios with backups before stable promotion and verify the schema-5 rollback test/gate remains green.
- Confirm an unchanged second reconciliation performs zero project-body reads and verify comparison grid/heat/imagery/probe/Back behavior on-device before promoting stable.

## v1.0.6 — development build

### Changed
- Bumped the separately installable DEV Android package to **version 1.0.6 / versionCode 78**. Build 77 remains the published v1.0.5 adjustable hitbox test and is not reused.
- Packaged the field-selected GPS-map survey-point near-miss padding as a fixed **15% of projected point spacing** instead of exposing the v1.0.5 0–45% Advanced Settings slider. Existing v1.0.5 slider preferences are ignored.
- Removed the map-specific **Map tap diagnostics** Advanced Settings control from the packaged runtime and no longer load the v1.0.4 MapLibre tap tracer or temporary **ML** crosshair during normal startup. Existing map-diagnostic preferences are inert.
- Preserved the safety behavior validated in v1.0.5: visible-circle taps retain the existing MapLibre selection path; expanded hitboxes remain oriented with the projected grid; total semi-axes are capped at 45% of point spacing; exactly one expanded target must match; there is no nearest-point fallback; and Probe Surface bypasses expanded measurement hit testing.
- The lower rectangular measurement grid is unchanged and the withdrawn v1.0.3 experiment remains absent.
- This APK is the release-candidate DEV confirmation build intended for one final device check before stable promotion.

### Known issues
- Complete one final field pass at normal working zoom, including near-miss point taps and Probe Surface, before promoting this exact behavior to stable.

## v1.0.5 — development build

### Added
- Packaged the new **Map tap diagnostics** Advanced Settings switch. The v1.0.4 MapLibre tap tracer and temporary **ML** crosshair now default off and can be enabled for troubleshooting without changing normal map behavior.
- Packaged the **Map grid hitbox padding** Advanced Settings slider from **0% to 45%**, defaulting to **10%**.

### Changed
- Bumped the separately installable DEV Android package to **version 1.0.5 / versionCode 77**. Build 76 remains the published v1.0.4 diagnostic build and is not reused.
- Near-miss taps outside a visible GPS-map survey point can use an oriented expanded ellipse based on the configured percentage of projected point spacing. The total semi-axis is capped at 45% of spacing so adjacent targets retain dead space.
- Expanded hit testing requires exactly one matching point and has no nearest-point fallback. Probe Surface mode bypasses the expanded measurement hitboxes.
- Taps directly on the existing rendered point circle still use the established MapLibre layer-selection path.
- The lower rectangular measurement grid remains unchanged; none of the withdrawn v1.0.3 lower-grid experiment is packaged.

### Known issues
- The earlier intermittent wrong-point selection was not reproduced during the v1.0.4 diagnostic test. The default 10% padding therefore needs field verification as a touch-usability improvement. If wrong-point selection returns, enable both the map-specific diagnostic switch and the general Diagnostic timing log before exporting a diagnostic log.

## v1.0.4 — development build

### Added
- Packaged the diagnostic-only GPS/MapLibre point-tap alignment tracer from the canonical web app, including the temporary **ML** event-position crosshair and the expanded local diagnostic-log fields used to compare the physical touch, MapLibre event coordinates, projected survey points, selected feature, and final edit-dialog point.

### Changed
- Bumped the separately installable DEV Android package to **version 1.0.4 / versionCode 76**. Build 75 remains consumed and is not reused.
- The APK is intentionally based on the exact tested v1.0.2 runtime plus the new diagnostic module. The withdrawn v1.0.3 lower-grid experiment is not packaged.
- No map hitbox size or point-selection algorithm is changed in this diagnostic build.

### Known issues
- The reported GPS-map point misselection remains intentionally unfixed while the new diagnostic data is collected. Reproduce the problem with diagnostic logging enabled and export the log from **Settings → Advanced Settings**.

## v1.0.3 — withdrawn development build

### Changed
- A DEV-only lower rectangular-grid sizing experiment was packaged while investigating a reported point-selection problem.

### Known issues
- The issue was subsequently confirmed to concern the GPS/MapLibre map grid rather than the lower measurement grid. The v1.0.3 runtime changes were withdrawn and rolled back completely before v1.0.4.

## v0.9.8 — development build

### Changed
- Bumped the separately installable DEV Android package to version 0.9.8 / versionCode 65.
- Cache-busted the recovery, async durable bridge/controller, authoritative grid bootstrap, single MapLibre grid owner, and MapLibre loader paths so an upgraded DEV install cannot retain the v0.9.7 startup behavior.

### Fixed
- Packaged the bounded recovery reveal, recovery-time durable mutation guard, canonical File-ID recovery, idle reconciliation/migration scheduling, duplicate grid-render suppression, single map-grid owner, and measured bottom-bar clearance from the canonical web app.

### Known issues
- This development build needs device verification of first-install durable recovery, project switching, main-thread responsiveness, Back behavior after startup, and bottom-grid/button clearance before stable promotion.

## v0.9.4 — development build

### Changed
- Project switching now keeps the existing MapLibre map, USGS imagery, controls, and live GPS marker mounted while completely removing the old project's grid, outline, route, point, and label sources/layers before creating the new project's overlay family.
- Lower-grid text sizing now runs in a dedicated Web Worker using `OffscreenCanvas.measureText()`. Project cells paint immediately at a provisional physical size while map, heat-map, GPS, and other UI work continue; the completed worker result causes one CSS-only final size/font adjustment rather than a second cell rebuild.
- Normal startup starts a lightweight grid-sizing worker immediately after `init.js` restores the active project. The authoritative grid owner still takes control only after the legacy project-management modules finish, and can consume the already-completed early measurement instead of measuring twice.

### Fixed
- Prevented old MapLibre GeoJSON grid/source state from surviving a project switch and appearing over the new project's heat map.
- Removed the older stability gate's late authoritative-grid rerender, which could make the lower grid become the final screen element even after its data was already available.
- Bumped the DEV Android package to version 0.9.4 / versionCode 61 and cache-busted the project/grid bootstrap path.

### Known issues
- This development build needs device verification of repeated switching between projects with different GPS grids and of lower-grid first-paint/final-resize timing before stable promotion.

## v0.8.6 — development build

### Fixed
- Packaged the non-blocking startup/recovery change so Android durable-folder indexing no longer holds the visible project for up to 60 seconds.
- Packaged immediate saved-pad framing so the GPS map can show the restored calibrated grid without waiting for a fresh location fix.

### Changed
- Bumped the DEV Android package to version 0.8.6 / versionCode 53.
- Packaged comparison point colors/labels matching the normal project map and the new comparison heat-map color key below the map.
- Cache-busted the restored-project/map activation files used by the WebView after an APK upgrade.

### Known issues
- This development build needs device verification of restored-project startup speed, early GPS-grid visibility, and comparison presentation before stable promotion.

## v0.8.4 — development build

### Fixed
- Packaged the comparison-map isolation correction so the temporary `pgCompareMap` cannot replace the application's primary `gpsMap` registration or receive project-map hooks intended for the live project.

### Changed
- Bumped the DEV Android package to version 0.8.4 / versionCode 51.
- Added CI coverage verifying the comparison map remains a distinct, private MapLibre instance while the live project map retains primary-map ownership.

### Known issues
- This development build needs device verification that comparison shows only the averaged comparison grid/heat map and returns to the unchanged live project afterward.

## v0.8.3 — development build

### Fixed
- Packaged the startup/recovery hotfix that removes the v0.8.2 comparison correction from the general WebView startup path so clean startup can reach durable-folder selection/recovery normally.
- The v0.8.2 directly linked correction file is now inert; the active correction is deferred until the comparison core and UI are loaded.

### Changed
- Bumped the DEV Android package to version 0.8.3 / versionCode 50.
- Preserved the reviewed v0.8.2 comparison behavior while isolating it from Android startup.

### Known issues
- This development hotfix needs device verification of clean startup/folder prompting and the comparison workflow before stable promotion.

## v0.8.2 — development build

### Changed
- Packaged the reviewed comparison corrections: Compare is beside Clear Readings, project dimensions must match, corresponding GPS corners must be within 20 ft, and the comparison grid uses point-by-point midpoint geometry from the two fitted rectangular project grids.
- Bumped the DEV Android package to version 0.8.2 / versionCode 49.
- Release descriptions continue to use the short Pad Grade functionality header followed by the matching canonical changelog section.

### Known issues
- The comparison feature remains development-only pending field testing.

## v0.8.1 — development build

### Added
- Packaged the temporary two-project comparison view, shared averaged GPS grid, elevation-change heat map, and map probe in the separately installable `Pad Grade DEV` package.

### Changed
- Bumped the DEV Android package to version 0.8.1 / versionCode 48.
- Release descriptions continue to use the short Pad Grade functionality header followed by the matching canonical changelog section.

### Known issues
- The comparison feature is development-only pending field testing.

## v0.8.0 — stable

### Changed
- Promoted the tested v0.8.0 Pad Grade File ID/save-migration changes to the normal Android production package.
- Stable and development release descriptions now use a short Pad Grade functionality header followed by the matching version section from the canonical Pad Grade changelog, rather than accumulating implementation history in every build description.

### Added
- Packaged the six-character human-readable project File ID UI, export filename prefix, and durable-folder legacy-save migration.

## v0.7.9 — stable

### Changed
- Packaged and released the stable v0.7.9 Pad Grade web application as the normal Android production app.
- Stable package uses the production application ID `com.lordofrealms.padgrade`.
- Development builds remain separately installable as `Pad Grade DEV` with application ID `com.lordofrealms.padgrade.dev`, so DEV testing does not replace the stable app or its local data.
- Canonical web assets are copied from the repository's `pad-grade` source during the Android build.

### Fixed
- Stable release validation verifies the packaged web assets and Android package channel before publishing the APK.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing are included in the packaged web app but remained field-untested at the v0.7.9 stable promotion.

## v0.7.9 — development build

### Changed
- Built the v0.7.9 Pad Grade surface/interpolation changes as the separately installable DEV package before stable promotion.

## v0.7.8 — development build

### Changed
- Packaged the locality-first triangle-to-local-rectangle interpolation model for field evaluation.

## v0.7.7 — development build

### Changed
- Packaged the revised locality-ranked interpolation selector for field evaluation.

## v0.7.6 — development build

### Added
- Packaged the first Probe Surface and shared local-surface interpolation implementation for Android field testing.

## v0.7.5 — stable baseline

### Changed
- Stable Android baseline included the startup/recovery improvements and the canonical v0.7.5 web application.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing were included but had not yet been field-tested.

## Earlier versions

Earlier Android builds are preserved in repository and release history, but release-level notes have not yet been backfilled where version boundaries cannot be established reliably.
