# Changelog

All notable Android packaging and release changes for Pad Grade are documented here.

The Android app packages the canonical web application from `../pad-grade`; feature and interpolation history therefore lives primarily in [`../pad-grade/CHANGELOG.md`](../pad-grade/CHANGELOG.md). This file records Android-specific packaging, channel, and release information.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably.

## v1.0.8 — development build

### Added
- Added matching heat-map timing diagnostics for the normal project surface and Project Comparison. Both 304-tier and 888-tier jobs now record worker-post time, worker completion time, worker internal total/rasterization/color timing, canvas conversion time, MapLibre install time, and total post-to-visible time so the two paths can be compared directly from one exported diagnostic log.
- Added an explicit recovered-project reload save guard. Intentional durable-recovery reloads are marked before unload, and only that unload is prevented from persisting a not-yet-applied runtime snapshot over the recovered project.

### Changed
- Project Comparison now starts its 304-tier heat-map worker immediately after the two projects have been loaded and the comparison values/shared geometry have been computed. MapLibre creation, style loading, grid installation, and imagery loading proceed in parallel; a raster that somehow finishes before the map is ready is buffered and installed as soon as the authoritative comparison grid exists.
- The comparison picker now uses an already-verified in-memory durable catalog without rereading `Pad-Grade-Project-Index.pgindex` or touching SAF. Folder select/index/refresh events explicitly dirty that cache so externally copied or replaced files still force a real reconciliation before the catalog is trusted again.
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
