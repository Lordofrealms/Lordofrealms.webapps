# Pad Grade Stable Changelog

This file summarizes changes promoted to stable Pad Grade releases. Detailed development-by-development history remains in `CHANGELOG.md`.

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
