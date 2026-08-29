# Changelog

All notable Android packaging and release changes for Pad Grade are documented here.

The Android app packages the canonical web application from `../pad-grade`; feature and interpolation history therefore lives primarily in [`../pad-grade/CHANGELOG.md`](../pad-grade/CHANGELOG.md). This file records Android-specific packaging, channel, and release information.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably.

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
