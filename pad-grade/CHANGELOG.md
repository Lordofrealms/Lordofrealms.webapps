# Changelog

All notable changes to Pad Grade are documented here.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably. Development-only versions are identified explicitly.

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
- Kept locality-first support selection: choose the most-local containing 3-point triangle by nearest farthest vertex, then minimum total vertex distance, then area.
- Promote a local 3-point support set to a 4-point rectangle when the corresponding fourth grid corner is measured.
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
