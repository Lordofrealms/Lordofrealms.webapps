# Pad Grade Mapper v1.4.0 — STABLE

## v1.4.0 — what changed since v1.0.2

Pad Grade v1.4.0 rolls up the field-tested improvements made since the previous stable release, **v1.0.2**. The focus of this release is faster heat maps, quicker project handling, better aerial imagery, easier GPS-map interaction, and improved Android reliability.

The grading and interpolation math is unchanged from the previous stable release.

### Faster, smoother heat maps
- Heat maps now generate substantially faster, including the final high-detail view.
- Auto mode still builds progressively so a usable heat map appears before the highest-detail version is finished.
- Heat-map updates are now presented as complete frames, eliminating the partial painting, overlap, and flicker problems seen during development.
- When an unchanged project already has a completed high-detail heat map available, Pad Grade can reuse it instead of recalculating it from scratch.
- Switching projects or changing readings now cancels obsolete heat-map work so an older result cannot appear over the current project.

### Faster project loading and cleaner project switching
- Large project folders are handled more efficiently. Pad Grade keeps a lightweight project index and avoids reopening every full project file during routine loading and maintenance.
- Opening and switching projects is cleaner: the outgoing project's grid and heat map stay covered until the incoming project is ready, preventing old and new project data from briefly appearing together.
- Project Comparison now uses the same faster project catalog and loads only the two projects being compared.
- First-run storage-folder setup and recovery have been polished so the app transitions directly into normal project restoration without flashing the old folder-selection message again.

### Better aerial imagery
- The USGS NAIP aerial-imagery path has been improved to request higher-quality imagery and prefer the best valid source resolution available at the project location.
- Invalid or unknown-resolution imagery records no longer outrank a better real image source.

### Better GPS and map interaction
- Survey points on the GPS map are easier to tap accurately. The app now allows a small near-miss around a point while still protecting against accidental selection when taps are ambiguous or fall in empty space.
- The Android location-permission flow is clearer about the need for Precise location and handles denied or approximate-only permission more cleanly.
- If Precision Location cannot provide a usable fix, Pad Grade can fall back to Android's native GPS provider for the active session.
- GPS updates pause while the app is in the background and resume when you return; Pad Grade does not require background-location permission.

### Android reliability and recovery
- Improved behavior when returning to Pad Grade after it has been minimized or interrupted, including fixes for paused WebView timers and renderer recovery.
- Additional safeguards prevent stale project or heat-map work from reappearing after project changes or app lifecycle events.
- Diagnostic tools remain available in Advanced Settings for troubleshooting, but diagnostic logging defaults to off in the stable build.

### Stable release
- Stable Android version: **v1.4.0 build 111**.
- Stable package: `com.lordofrealms.padgrade`.
- The separately installable DEV build remains available as `com.lordofrealms.padgrade.dev`.
