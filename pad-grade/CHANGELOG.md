# Changelog

All notable changes to Pad Grade are documented here.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably. Development-only versions are identified explicitly.

## v0.9.3 — development build

### Changed
- First-run durable-folder recovery now paints the black **Restoring saved project…** curtain before Android's native folder picker is launched. The picker is opened only after WebView has had two animation frames to commit the curtain, so returning from the picker should not expose intermediate recovery/indexing changes.
- Opening a project now closes the Projects dialog immediately, gives that close one paint frame, and then performs the existing in-place project-state/overlay swap. The surrounding document, map, imagery, controls, and other display groups remain mounted.

### Fixed
- Replaced the lower grid's per-string hidden-DOM measurement loop with canvas `measureText()` while preserving the existing physical-aspect/font-fit solver. This removes hundreds of forced layout reads that could delay an ordinary 9×9 bottom grid by several seconds on Android WebView.
- Project-list rows now reserve the complete File-ID line in the head-loaded stylesheet before the project manager can paint its first row. The later File-ID placeholder and final ID text are absolutely positioned inside that already-reserved slot, so File-ID hydration should no longer resize project boxes or move their buttons.
- Cancelling the native durable-folder picker removes the pre-painted recovery curtain and returns to the explanatory storage-choice dialog.

### Known issues
- This remains a development build intended for device verification of recovery-cover timing, project-list layout stability, and lower-grid render latency before stable promotion.

## v0.9.2 — development build

### Changed
- During a true first-run durable-folder recovery, the black **Restoring saved project…** curtain now begins immediately when Android returns the selected folder, before the background SAF index/reconciliation work starts. It remains through the saved-project recovery reload; an empty selected folder drops the temporary cover before creating/loading a new default project.
- Ordinary project Open actions now switch in place. The existing document, MapLibre object, USGS imagery, map controls, live GPS marker, cards, legends, and other static display groups stay mounted. Only project-owned state and overlays are replaced.
- The lower grade-grid cells are rebuilt for the selected project's dimensions/readings, while the surrounding grid card and other UI groups remain intact.

### Fixed
- Removed the v0.9.1 project-switch `location.reload()` path that unnecessarily destroyed and reconstructed the entire display and GPS map.
- Project switching now clears the old project's GPS grid/route/outline, heat-map canvas sources, and probe state before applying the selected project, then writes the new geometry into the same existing MapLibre sources immediately.
- The new project's heat-map refresh runs immediately after the state swap so the surface owner cancels any old worker before queued old-project output can repaint.
- Switching persists the newly selected project as the durable settings `lastProjectId`/`lastProjectName` when the durable folder is ready, preserving the expected in-work project for a later reinstall/recovery.
- Clicking **Open** on the already-current project no longer falls through to the older reload-based project manager.

### Known issues
- This remains a development build intended for device verification of immediate recovery-cover timing and repeated in-place switching between projects with different grids, GPS locations, and heat maps before stable promotion.

## v0.9.1 — development build

### Changed
- Restored the recovery curtain to the stable v0.8.0 semantics and wording: **Restoring saved project…** is shown only for the intentional reload after an existing durable project folder has been recovered.
- Ordinary app startup and ordinary project-to-project switching no longer show a loading/recovery curtain.

### Fixed
- Project switching still uses an atomic reload boundary, but now carries only the intended project ID through session storage. The new document applies that target in its head before project managers run, preventing old/new project layer mixing without reusing the durable-recovery curtain.
- Removed the v0.9.0 behavior that armed the curtain for every existing-project startup and for each project switch.
- Removed the late durable-reconciliation path that could independently arm a project-loading curtain after the screen was already visible.
- Cache-busted the recovery, first-run, project-switch, startup, and last-project-restore modules so an upgraded DEV install cannot keep the v0.9.0 curtain behavior from WebView cache.

### Known issues
- This remains a development build intended for device verification of first durable-folder recovery and repeated project switching before stable promotion.

## v0.9.0 — development build

### Changed
- A clean Android install now explains durable project-folder storage and offers **Choose durable folder** or **Not now** before Android's directory picker is opened. Cancelling the picker returns to that choice instead of silently creating a project or forcing another picker.
- Existing-project startup and project-to-project switching again use a brief black **Loading project…** curtain so intermediate settings/grid/map states are not painted to the user. The curtain waits only for local project/layout settling and does not wait for USGS imagery.

### Fixed
- Project switching now carries the intended target project through the reload in session storage and reapplies that target in the head of the new document before any project manager or autosave owner can read active-project state.
- Prevented the older `beforeunload` autosave path from effectively switching the new document back to the project being left.
- Durable reconciliation now treats an already-selected local active project as authoritative; a stale durable `lastProjectId` is only a fallback when no active project exists. This prevents old-grid/new-heat-map mixtures after switching projects.
- Durable recovery of a newer copy of the current project is also covered briefly while its settings/grid/map state is applied, avoiding visible multi-stage repaint.

### Known issues
- This remains a development build intended for device verification of clean-install storage choice and repeated switching between projects with different grids/heat maps before stable promotion.

## v0.8.9 — development build

### Added
- Added automatic detection/retry for a healthy MapLibre canvas whose USGS raster imagery has failed, with a visible retry status while the project grid and grade data remain usable.
- Added a true Android first-install folder decision: no default project is created until the user cancels/declines the durable-folder picker or selects an empty folder.

### Fixed
- Restored the comparison presentation after the asynchronous MapLibre startup change: comparison points again use CUT/GRADE/FILL colors and labels, the averaged grid remains foreground geometry, and the comparison heat-map color key is shown underneath.
- Project-list rows reserve the File ID line before the ID is hydrated, preventing Delete/reload operations from changing row height and moving neighboring buttons.
- Project switching now uses a hard rendering boundary so old project grid/heat-map state is cleared and the new project is loaded through a clean page state rather than allowing layers from two projects to coexist.
- Android durable-folder listing/read/write/delete calls no longer trigger a synchronous SAF directory scan on the WebView thread while the background folder index is incomplete.
- Cancelling the Android folder picker during a true first install is now explicitly reported back to the web app so it can create the normal local default project only after that decline.

### Changed
- When a first-install durable folder is selected, Pad Grade waits for its background index, restores portable settings and the last active/in-work project when present, and creates a default project only when the selected folder contains no Pad Grade projects.

### Known issues
- This remains a development build intended for device verification of first-install recovery, imagery retry behavior, project switching, and comparison presentation before stable promotion.

## v0.8.7 — development build

### Fixed
- Removed MapLibre from the local project/grid startup critical path. The cached project and lower grade grid initialize before the map library is requested.
- Android builds now package pinned MapLibre GL JS 5.16.0 JS/CSS locally, so the GPS map no longer waits on `unpkg.com` during normal APK startup.
- Retired the active v0.7.0/v0.7.3 durable-folder recovery owners that could still wait 45–60 seconds for SAF indexing and then reload the page underneath the newer non-blocking restore path.
- Durable-folder autosave/persistence code now treats the folder as unavailable until the native index is ready, preventing an early JavaScript read/write from forcing a synchronous `DocumentFile.listFiles()` scan on the WebView thread.
- The normal GPS project grid now has a style-ready overlay owner and no longer waits for MapLibre's full raster-imagery `load` event before installing grid lines, points, labels, and outline.
- Android/system Back while Project Comparison is open now exits the temporary comparison view first instead of offering to close Pad Grade.

### Changed
- The already-rendered lower project grid stays visible while the single-owner responsive grid renderer finishes its atomic sizing pass instead of being hidden during legacy project-workflow initialization.
- MapLibre and GPS-map modules load asynchronously after the local project UI is usable; browser-hosted copies retain an asynchronous pinned-CDN fallback when local vendor assets are not present.

### Known issues
- This remains a development build intended for device verification of startup timing, early GPS-grid/heat-map rendering, and comparison Back behavior before stable promotion.

## v0.8.6 — development build

### Fixed
- Removed the 60-second startup reveal dependency on Android durable-folder indexing. The locally cached active project is now rendered immediately while Storage Access Framework folder indexing/reconciliation continues in the background.
- The saved four-corner GPS calibration now frames the GPS map immediately after MapLibre construction instead of waiting for a fresh GPS fix or the map's full imagery/source load cycle.
- Cache-busted the startup/map activation chain so an upgraded DEV install cannot keep using the older delayed restore or map code from WebView cache.

### Changed
- Project Comparison points now use the same visual treatment as normal project GPS points: red CUT, green GRADE, blue FILL, white outlines, and A1/B1/etc. labels.
- Added the comparison heat-map color key beneath the comparison map, including maximum cut, grade tolerance, and maximum fill values. The averaged grid/points/labels remain foreground geometry above the heat map.

### Known issues
- This remains a development build intended for device verification of startup timing and comparison presentation before stable promotion.

## v0.8.5 — development build

### Fixed
- Prevented the older fallback MapLibre capture hook from wrapping the newer primary-map hook. Project Comparison maps can no longer steal `window.__padGradeMapInstance` through the legacy fallback path, which was still allowing the active project's heat map to be drawn into the comparison map.
- Added a render-order guard for the normal GPS map so project heat-map layers stay hidden until the survey grid/point layers exist, then remain below the grid, outline, route, points, labels, and current-position marker.
- Added the same foreground-order enforcement to the temporary comparison map so its averaged comparison grid and points remain above the comparison heat map.

### Changed
- Start the existing GPS grid-overlay owner at DOM-ready rather than waiting for the full `window.load` event, so the point/grid geometry can appear immediately after map imagery/style readiness instead of arriving late behind slower page resources.
- The comparison map continues to use its own averaged rectangular grid; the grid lines and points are explicitly kept visible in the foreground over the delta heat map.

### Known issues
- This remains a development build intended for device verification before stable promotion.

## v0.8.4 — development build

### Fixed
- Isolated the temporary Project Comparison MapLibre instance from the application's primary GPS/project map registration. Creating `pgCompareMap` no longer replaces `window.__padGradeMapInstance` or emits the primary `padgrade-map-created` event.
- Prevented project-map maintenance hooks from treating the comparison map as the active project map, which could leave the live project's grid/heat-map layers visible or redrawn into the comparison view.

### Changed
- The comparison map remains a separate MapLibre object with its own imagery, averaged comparison grid, delta heat map, probe handling, and lifecycle; the live project's map remains untouched underneath and is restored unchanged when comparison exits.
- Added a CI regression test that creates both `gpsMap` and `pgCompareMap` and verifies only `gpsMap` owns the global primary-map registration.

### Known issues
- This remains a development build intended for device verification that comparison shows only the averaged comparison grid/heat map and returns to the unchanged live project afterward.

## v0.8.3 — development build

### Fixed
- Removed the v0.8.2 comparison correction from the general application startup path after field testing showed the DEV build could remain on the recovery screen and fail to reach the durable save-folder prompt.
- Retired the directly linked v0.8.2 correction layer as an inert compatibility file so cached v0.8.2 pages cannot install its polling, observer, or recurring UI work during startup.
- The reviewed comparison correction now loads only after the existing v0.8.1 comparison core and UI have successfully loaded, keeping comparison completely outside the recovery/durable-folder bootstrap path.

### Changed
- Preserved the v0.8.2 comparison behavior: **Compare** remains beside **Clear Readings**, logical GPS points are averaged point-by-point between the two fitted rectangular project grids, dimensions/row-column counts must match, and every corresponding corner must be within 20 ft.
- Added CI startup-isolation checks so a comparison correction cannot again be linked directly into normal app startup without being detected.

### Known issues
- This is a development hotfix build intended to verify clean startup, durable-folder prompting/recovery, and the comparison workflow before stable promotion.

## v0.8.2 — development build

### Changed
- Moved **Compare** out of the fixed bottom bar and placed it beside **Clear Readings** in the existing project-action button holder. **Clear Readings remains unchanged.**
- Corrected comparison geometry so each project is first resolved to its own existing fitted rectangular GPS grid. Every logical point (`A1`, `A2`, etc.) in the comparison grid is then placed at the local east/north midpoint of that same logical point in the two fitted project grids.
- The resulting averaged comparison grid remains one rectangular grid. Elevation deltas are still calculated strictly by logical row/column identity and then attached to those averaged point positions before the existing heat-map interpolation is applied.
- Project comparison now requires identical row/column counts **and** identical configured pad width/length. Different-size projects fail comparison instead of averaging dimensions.
- Project comparison now requires every corresponding stabilized GPS corner (SW↔SW, SE↔SE, NE↔NE, NW↔NW) to be no more than 20 ft apart. A pair outside that limit fails with an explanatory error.
- Picker status now reports the same-size/location eligibility rules and the worst corresponding-corner separation before comparison starts.

### Fixed
- Removed the v0.8.1 behavior that averaged only the four observed GPS corners and refit a new shared rectangle, which did not represent the requested point-by-point average of the two already-calculated project grids.
- Removed the v0.8.1 behavior that allowed different physical pad sizes by averaging their dimensions.

### Known issues
- Both selected projects still need complete four-corner GPS calibration and a reading at every logical grid point.
- This remains a development build intended for field testing before stable promotion.

## v0.8.1 — development build

### Added
- Added **Compare** to the fixed bottom button bar for temporary comparison of two fully measured projects.
- Added First measurement and Second measurement selectors so elevation change direction is explicit.
- Added a dedicated temporary GPS comparison map with the current local IDW²/edge-locked heat-map interpolation and tap-to-probe behavior.

### Changed
- Comparison eligibility requires every logical grid point to have a finite reading; projects are matched strictly by row and column rather than nearest GPS position.
- Each survey is normalized so its configured target rod plane equals elevation zero before comparison. The displayed delta is Second normalized ground elevation minus First normalized ground elevation, so negative values are cut that occurred and positive values are fill that occurred.
- Corresponding stabilized SW/SE/NE/NW GPS corner observations are averaged between the two projects and fit into one shared comparison rectangle. Interior comparison points use that one shared grid rather than two overlaid grids.
- If the two projects have different configured pad dimensions but the same row/column count, the temporary shared grid uses the average dimensions and identifies that choice in the comparison view.
- Exiting comparison removes only the temporary view and returns directly to the still-open project without closing, reopening, or replacing its saved/runtime state.

### Known issues
- Both selected projects need complete four-corner GPS calibration to render the shared GPS comparison map.
- This is a development build intended for field testing before stable promotion.

## v0.8.0 — stable

### Added
- Added a stable six-character human-readable File ID to each project/save so files can be identified when moving saves between devices.
- Display the File ID in the app for the active project and in the project list.
- Prefix one-project exports with the same File ID stored inside the project data.

### Changed
- Legacy projects without a File ID are assigned one automatically and retain it for later saves and exports.
- When a durable project folder is restored or reconnected, legacy project files without a File ID prefix are upgraded to prefixed filenames.
- Durable-folder migration writes the new prefixed file successfully before removing the legacy filename and is safe to run repeatedly.
- Regular durable-folder autosaves continue using the prefixed filename after migration instead of recreating an unprefixed copy.

## v0.8.0 — development build

### Added
- Built the six-character File ID, export-prefix, UI display, and durable-folder legacy-save migration as a separately installable DEV build for testing before stable promotion.

## v0.7.9 — stable

### Changed
- Promoted the v0.7.9 development surface model to the stable production build.
- Kept locality-first support selection: choose the most-local containing 3-point triangle by nearest farthest vertex, then minimum total reference distance, then area.
- Promote a local 3-point support set to a 4-point rectangle when the corresponding fourth corner is measured.
- Lock shared rectangle and fallback-triangle edges to the 2-point inverse-distance-squared (IDW²) result of the edge endpoints.
- Fade the edge-lock correction smoothly to zero over the nearest one-sixth of the rectangle depth or triangle altitude, leaving the interior as ordinary local IDW².

### Fixed
- Removed artificial value jumps at shared interpolation edges while preserving legitimate differences in slope and curvature supported by neighboring measurements.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing are included but remained field-untested at this promotion.

## v0.7.8 — development build

### Changed
- Changed interpolation support selection to find the most-local containing 3-point triangle first.
- When those three points are three corners of a grid rectangle and the fourth corner is measured, promote the calculation to a single 4-point IDW² interpolation.
- Sparse four-corner surveys can interpolate the enclosed rectangle; sparse three-corner surveys interpolate only the supported triangle.

### Fixed
- Prevented a large four-corner rectangle from overriding a more-local supported triangle merely because four distant corners existed.

## v0.7.7 — development build

### Changed
- Replaced minimum-triangle-area selection with locality ranking: nearest farthest reference vertex, then minimum total reference distance, then triangle area.
- Average multiple interpolation results only when the complete locality score is genuinely tied.

### Fixed
- Eliminated the regular-grid failure where long, skinny triangles could have the same minimum area as small local triangles and therefore contaminate interpolation with distant measurements.
- Added a regression case ensuring a distant equal-area triangle loses to the local triangle while symmetric center ties remain valid.

## v0.7.6 — development build

### Added
- Added a shared surface interpolation path used by the heat map and calculation sampling.
- Added **Probe Surface** so a user can tap the map for an interpolated rod reading, CUT/FILL/GRADE result, target rod, pad position, contributing survey references, and navigation to the probe point.

### Changed
- Initial local interpolation used 3-point IDW² within the smallest containing measured triangle.
- Equal minimum-area triangle results were averaged.

### Known issues
- Minimum triangle area proved unsuitable as the primary locality rule on a regular grid because many long, skinny lattice triangles can have the same minimum positive area.

## v0.7.5 — stable baseline

### Added
- Included metric units, feet-and-tenths units, and laser-avoidance pathing.

### Changed
- Recovered active project state is primed before the first grid/GPS render.
- Saved GPS-map dimensions are applied before MapLibre construction.
- Startup resize calls are suppressed/coalesced and the recovery curtain is released only after the final settled layout/idle frame.
- Reduced older repeated project-application passes to a single final compatibility pass.

### Fixed
- Reduced startup flashes/repaints of the default project before the recovered project was applied.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing had not yet been field-tested.

## Earlier versions

Earlier Pad Grade development is preserved in repository history, but release-level notes have not yet been backfilled where version boundaries cannot be established reliably.