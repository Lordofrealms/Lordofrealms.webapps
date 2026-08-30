# Changelog

All notable Android packaging and release changes for Pad Grade are documented here.

The Android app packages the canonical web application from `../pad-grade`; feature and interpolation history therefore lives primarily in [`../pad-grade/CHANGELOG.md`](../pad-grade/CHANGELOG.md). This file records Android-specific packaging, channel, and release information.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably.

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
