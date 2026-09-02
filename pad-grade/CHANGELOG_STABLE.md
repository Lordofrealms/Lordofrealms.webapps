# Pad Grade Stable Changelog

This file summarizes changes promoted to stable Pad Grade releases. Detailed development-by-development history remains in `CHANGELOG.md`.

## v1.4.4 — stable

Pad Grade v1.4.4 promotes the field-tested improvements made since the previous stable release, **v1.4.0**. This release focuses on project-file reliability and making sure every heat map uses the same intended surface calculation.

### More reliable projects and storage
- Pad Grade now checks project identities when restoring a persistent project folder. If copied or older files contain duplicate internal project IDs or duplicate six-character File IDs, the app repairs the conflict before normal project restoration continues.
- Project deletion is now coordinated across the saved project file, project list/index, local project state, and derived heat-map cache. A deleted project should no longer return as a non-openable “ghost” entry in Project Manager.
- Deleting copied projects correctly uses their human-readable six-character filename prefix instead of falling back to an obsolete filename.
- If a project file is already missing but an old list entry remains, deleting that entry is treated as successful cleanup rather than getting stuck on the missing file.

### Consistent heat maps
- Foreground heat maps, background-generated heat maps, and saved heat-map caches now all use the same nearby triangle/rectangle interpolation rules. This removes a case where some heat maps could use an older global interpolation method and look different from a freshly regenerated map of the same project.
- Older heat-map caches that do not identify the current local-surface calculation are rejected and rebuilt automatically once when needed. Project measurements and project files are not changed by this cache refresh.
- Project switching now retires the outgoing project’s completed heat state as well as cancelling obsolete worker activity, preventing old heat results from repeatedly trying to return after the switch.
- The existing progressive **99 → 297 → 891** heat-map sequence, parallel computation, and complete-frame/no-flicker presentation remain in place.

### Better troubleshooting history
- Optional diagnostic logging can now retain up to **50,000 entries** instead of the much smaller previous history, making longer field sessions easier to diagnose.
- Stable builds still default diagnostic logging **off** unless the user has explicitly enabled it.

### Unchanged
- No change was made to survey readings, target/grade calculations, earthwork-volume calculations, GPS geometry, aerial-imagery selection, or the map-reveal timing as part of these v1.4.1–v1.4.4 fixes.
- The field-tested folder-picker/recovery transition and existing atomic heat-map presentation remain unchanged.

### Stable promotion
- Stable Android version: **v1.4.4 build 115**.
- Stable package: `com.lordofrealms.padgrade`.
- The separately installable DEV package remains `com.lordofrealms.padgrade.dev`.

## v1.4.0 — stable

Promoted from the field-verified v1.3.8 development line. This is the first stable release since **v1.0.2** and rolls up the surviving tested changes from v1.0.4 through v1.3.8. The withdrawn v1.0.3 lower-grid experiment is not included. The stable Android package is build **111**. The stable-channel promotion itself does not change grading/interpolation math, heat-map surface values, project geometry, or the tested imagery/recovery behavior; it changes version/channel metadata and restores the normal stable diagnostic default.

### Added
- Added the schema-6 durable project format/index architecture with a rebuildable `Pad-Grade-Project-Index.pgindex`, bounded header reads for changed/new files, lazy project-body loading, and a zero-project-read fast path for unchanged indexed projects.
- Added explicit schema-6 rollback support to schema 5 for controlled recovery while keeping ordinary reconciliation non-destructive.
- Added a disposable, lossless final 891-tier heat-map cache keyed to the exact surface inputs so unchanged projects can restore the completed heat surface without recalculating all tiers.
- Added lazy background generation of missing final heat caches for other projects while the app is visible and foreground heat work is idle.
- Added Android lifecycle/process diagnostics, renderer-loss recovery, process-exit reason capture, native memory snapshots, and callback-stage timing needed to diagnose WebView/background/resource problems without logging survey payload contents.
- Added an informed Android foreground-location permission flow that explains the need for Precise location, handles approximate-only or denied permission cleanly, and provides an App Settings recovery path when Android stops presenting the normal prompt.
- Added exact 99 / 297 / 891 heat-resolution inspection controls while preserving Auto as the normal progressive presentation mode.
- Added regression/self-test coverage around durable indexing, project switching, heat-map ownership/presentation, cache validity, worker-generation cancellation, imagery selection, startup cover release, and the folder-picker handoff.

### Changed
- GPS/MapLibre survey-point near-miss selection now uses the field-selected fixed **15% of projected point spacing** padding with exact-one-match and dead-space safeguards; the temporary diagnostic slider/crosshair controls used to tune it were removed from normal runtime.
- Project opening/switching keeps the chooser covering the map until the target is ready, clears outgoing project-owned overlays before reveal, and reuses the MapLibre instance, compatible grid sources/layers, and same-size lower-grid DOM where practical.
- Durable-folder reconciliation now compares real directory metadata with the rebuildable index first. Unchanged indexed projects avoid full project reads/parses/migrations; changed or newly copied files are inspected and incorporated, and selected bodies are loaded only when needed.
- Project Comparison now uses the shared indexed project catalog, loads only the two selected project bodies, installs its detailed grid at style readiness, and preserves the progressive heat-map path independently of raster imagery completion.
- Heat-map presentation was consolidated onto one authoritative style-owned presentation path per map. Completed rasters are prepared offscreen and only complete frames are handed to the presenter; retired/stale layers and generations cannot reclaim visibility.
- Auto heat generation remains progressive **99 → 297 → 891**, but the computation inside every tier is now parallel. On the tested 8-thread Android device, each tier used seven compute workers and assembled the bands into one complete offscreen final buffer before publication.
- Heat presentation remains atomic. There is no row painting, band painting, partial raster publication, intentional cross-fade, or exposed live canvas while a frame is being computed.
- Valid cached final 891 rasters suppress redundant lower-tier work on unchanged reloads, while reading/project mutations cancel stale work before new generations are admitted.
- Background behavior keeps map/project/heat state resident while suspending active GPS subscriptions and pausing stopped-WebView timer activity. The earlier experiment that removed/restored USGS imagery on minimize was retired; imagery remains attached.
- Startup/recovery cover release is tied to usable recovered state and the established base-map render gate rather than raster imagery completion, full durable maintenance, or heat-map completion.
- USGS high-resolution imagery remains on the NAIP Plus dynamic ImageServer path using Natural Color, 512×512 exports for 256 logical pixels, quality 95, cubic resampling, and resolution-first selection.
- NAIP source selection now excludes non-positive/unknown `resolution_value` records before ordering, preventing invalid catalog rows from outranking real positive-resolution imagery.
- Stable builds continue to default diagnostic logging **off** unless the user explicitly chose otherwise; all diagnostic tools remain available from Advanced Settings.

### Fixed
- Fixed multiple heat-map blank/flicker/overlap failure modes encountered while moving from legacy live CanvasSources to the current complete-frame presentation model, including MapLibre 5.16.0 ImageSource request behavior, same-frame request self-abort, stale layer reappearance, cache downgrade races, and project-switch ownership races.
- Fixed the progressive heat-map path so lower or retired generations cannot overwrite a valid final cached/active surface after a project/read mutation or generation change.
- Fixed worker/bootstrap behavior on Android WebView by using parent-fetched source bundled into in-memory Blob workers for nested parallel computation rather than the failing external nested-worker bootstrap path.
- Fixed the remaining all-tier heat performance bottleneck by parallelizing 99, 297, and 891 computation while retaining one atomic final frame per tier.
- Fixed hard reload/return paths that could inherit a globally paused WebView timer pool by resuming timers whenever a foreground WebView/Activity resumes.
- Fixed location-denial behavior so a failed GPS Guided attempt returns to Manual rather than leaving the UI visually stuck waiting for unavailable GPS, and selecting GPS Guided again performs the retry.
- Fixed durable index/reconciliation behavior that previously reread every project file on routine maintenance and could deep-load the entire project set during one comparison interaction.
- Fixed project-switch/recovery presentation cases where old project geometry or heat content could remain visible while the selected project was being applied.
- Fixed imagery selection so zero/null/unknown-resolution NAIP catalog records cannot sort ahead of the best valid positive-resolution raster. Field diagnostics at the tested location confirmed the selected 0.6 m raster matched the best available positive-resolution 0.6 m candidate.
- Fixed the first-run successful durable-folder transition so the picker-specific `Choose project storage to continue` ownership is removed while Android still covers the app. The same existing shared cover is already in `Restoring saved project…` state before Pad Grade becomes visible again; no new cover or arbitrary delay is introduced.

### Stable promotion
- Promoted the tested v1.3.8 behavior to the normal `com.lordofrealms.padgrade` stable package; the DEV package remains separately installable as `com.lordofrealms.padgrade.dev`.
- Stable Android version: **v1.4.0 build 111**.
- Stable diagnostics default to off while respecting an existing explicit user preference.
- The field-verified v1.3.8 folder-picker handoff, v1.3.7 imagery selection, and v1.3.6 all-tier parallel atomic heat-map behavior are promoted unchanged.

## v1.0.2 — stable

Promoted from the tested v1.0.2 development line. This is the first stable release since **v0.8.0** and rolls up the field-tested changes from v0.8.1 through v1.0.2. The stable Android package is build 75. No grading/interpolation math was changed as part of the stable-channel promotion itself.

### Added
- Added **Project Comparison** for two fully measured projects. The comparison workflow explicitly selects a First and Second survey, normalizes each survey to its own configured target plane, and displays Second minus First elevation change as CUT/GRADE/FILL.
- Added a dedicated temporary comparison map with its own averaged GPS grid, delta heat map, CUT/GRADE/FILL point colors and labels, heat-map key, tap-to-probe behavior, and clean exit back to the still-open project.
- Added comparison eligibility checks requiring identical row/column counts, identical configured pad dimensions, complete measurements, complete four-corner GPS calibration, and no more than 20 ft separation between each corresponding stabilized GPS corner.
- Added local diagnostic timing for startup, project recovery/switching, native durable-file operations, map/grid/heat-map activity, main-thread stalls, and grading-calculation phases. Diagnostics remain available in Advanced Settings with export and clear controls.
- Added asynchronous Android durable-file read/write/delete paths so Storage Access Framework work can trail behind the visible UI instead of blocking the WebView.
- Added first-run legal-preload support: while the Terms screen is open, safe local DOM/CSS/grid/worker/layout preparation can begin, while durable-folder access and map/network startup remain gated until acceptance.
- Added transparent Precision Location failover to Android/WebView native GPS for Precision start failure, service error/disconnect/STOPPED, or first-fix timeout.

### Changed
- Reworked startup and durable-folder recovery around the locally cached active project. The app now becomes usable from local state first while durable-folder indexing, reconciliation, and File-ID maintenance continue later in the background.
- The **Restoring saved project…** curtain now releases when the recovered project, lower grid, and saved GPS survey grid are usable. It no longer waits for raster imagery, MapLibre idle, heat-map completion, final font sizing, full-folder reconciliation, or File-ID housekeeping.
- First-run durable storage now explains the folder choice before opening Android's picker, handles cancel/decline explicitly, treats an empty selected folder as legitimate first use, and restores existing Pad Grade state before creating a default project when a selected folder already contains projects.
- Project switching now occurs in place instead of reloading the entire app. The MapLibre map, imagery, controls, and live GPS marker remain mounted while old project-owned overlays/state are removed and the selected project's grid, route, points, heat map, and GPS fit are installed.
- MapLibre is packaged locally in the Android APK and loaded asynchronously after the local project/grid UI is usable. Browser-hosted copies retain the pinned CDN fallback.
- The GPS survey grid has a single lightweight authoritative owner with signature-based no-op refreshes rather than competing polling/styledata paths.
- Lower-grid text sizing moved to a Web Worker/OffscreenCanvas path. Cells can paint provisionally while final physical sizing is calculated without hundreds of forced DOM measurements.
- Repeated identical lower-grid rebuild requests during startup are collapsed while real project, settings, reading, unit, and geometry changes still rebuild immediately.
- File-ID/durable-folder maintenance is deferred out of covered recovery and serialized so full reconciliation and File-ID migration do not flood the native callback queue at the same time.
- The grading target calculator keeps the same 90-resolution equal-area sample grid and the same global IDW² surface values, but replaces the old per-sample Delaunay-triangle coverage search with the equivalent convex-hull coverage test.
- Target-independent grading samples, sorted elevations, and the neutral target are cached until readings or pad/grid geometry change. Changing only target or tolerance reuses the sampled surface, and applying a suggested target no longer recalculates the same surface immediately.
- Precision-to-native GPS failover is scoped to the active GPS subscription session. A later fresh GPS session can try Precision Location again.
- Stable builds now default diagnostic logging **off**. An explicit user setting continues to be respected, and diagnostics remain available manually from Advanced Settings.

### Fixed
- Fixed the severe v0.9.7-era WebView backlog/frozen-UI condition by removing parallel MapLibre grid polling/styledata work, suppressing no-op map activity, batching diagnostic-log persistence, slowing/no-oping File-ID housekeeping when state has not changed, and serializing post-recovery durable maintenance.
- Fixed cases where Android Back appeared unresponsive because the WebView/UI thread was buried under that event and persistence backlog; no special Back workaround was required once the backlog source was removed.
- Fixed recovery paths that could hold the curtain for a long safety timeout even though the active project and grid had already restored quickly.
- Fixed premature durable writes during covered recovery so partially initialized runtime state cannot overwrite or duplicate the project being restored.
- Fixed File-ID recovery conflicts by treating an existing durable filename prefix or payload ID as authoritative over stale local File-ID mappings and by preventing recovery from inventing a competing ID for the same project.
- Fixed project switching/render-order cases where the old project's grid or heat map could remain visible with the new project, or where the new heat map could appear before the new survey grid.
- Fixed Project Comparison map isolation so the temporary comparison MapLibre instance cannot replace the application's primary map registration or receive live-project heat-map/grid maintenance.
- Fixed comparison presentation/order so the averaged comparison grid, point labels, and CUT/GRADE/FILL points stay visible above the comparison heat map, and Android/system Back exits comparison before offering to close Pad Grade.
- Fixed the Enter Reading dialog so Android's software keyboard does not make its controls/actions unreachable.
- Fixed lower-grid/page clearance so survey content cannot extend underneath the fixed bottom controls.
- Fixed project-list File-ID hydration so late-arriving ID text does not resize project rows or move action buttons.
- Fixed native durable-folder callbacks and project-listing paths that could synchronously re-query the document provider and stall the WebView while folder indexing was incomplete.
- Fixed the Precision Location failure state where Pad Grade could remain stuck waiting for Precision after the provider had reported STOPPED instead of handing existing GPS subscriptions to native GPS.
- Fixed the follow-on source-status bug where native fallback was working and providing positions but the map header could still display **Precision Location** or **STOPPED**. The shared provider is now authoritative, late Precision callbacks are ignored after failover, and the badge updates immediately to **Native GPS** and remains there for that GPS session.

### Stable promotion
- Promoted the tested v1.0.2 behavior to the normal `com.lordofrealms.padgrade` stable package; the DEV package remains separately installable.
- Stable Android version: **v1.0.2 build 75**.
- Diagnostic logging defaults to off for stable while retaining the same optional diagnostic tools for future troubleshooting.
