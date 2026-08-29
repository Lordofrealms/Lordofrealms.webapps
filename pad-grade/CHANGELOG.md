# Changelog

All notable changes to Pad Grade are documented here.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably. Development-only versions are identified explicitly.

## v0.8.4 — development build

### Fixed
- Isolated the temporary Project Comparison MapLibre instance from the application's primary GPS/project map registration. Creating `pgCompareMap` no longer replaces `window.__padGradeMapInstance` or emits the primary `padgrade-map-created` event.
- Prevented project-map maintenance hooks from treating the comparison map as the active project map, which could leave the live project's grid/heat-map layers visible or redrawn into the comparison view.

### Changed
- The comparison map remains a separate MapLibre object with its own imagery, averaged comparison grid, delta heat map, probe handling, and lifecycle; the live project's map remains untouched underneath and is restored unchanged when comparison exits.
- Added a CI regression test that creates both `gpsMap` and `pgCompareMap` and verifies only `gpsMap` owns the global primary-map registration.

### Known issues
- This remains a development build intended for device verification before stable promotion.

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
