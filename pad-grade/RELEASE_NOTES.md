# Pad Grade Mapper v1.4.0 — STABLE

## v1.4.0 — promote the field-verified v1.3.8 line to stable

Pad Grade v1.4.0 promotes the tested v1.3.8 development line to the normal stable Android package. This is the first stable release since v1.0.2 and includes the surviving, field-tested work through v1.3.8. The withdrawn v1.0.3 lower-grid experiment is not included.

### Heat map
- Keeps the proven progressive **99 → 297 → 891** Auto sequence.
- Computation inside all three tiers is parallel; on the tested 8-thread device each tier used seven compute workers.
- Bands are assembled offscreen into one complete final buffer. There is no row painting, band painting, partial raster publication, or intentional cross-fade.
- Valid final 891 caches are reused for unchanged projects, while stale generations are cancelled before project/read mutations can publish old work.
- The current complete-frame MapLibre presentation path and Project Comparison behavior are promoted unchanged from the tested DEV line.

### Durable projects and recovery
- Promotes the schema-6 indexed durable-project architecture, bounded header reads, lazy body loading, and zero-project-read fast path for unchanged indexed projects.
- Project switching/recovery keeps outgoing project-owned overlays covered until the incoming project is ready and reuses compatible map/grid resources where practical.
- The successful first-run folder-picker handoff is promoted exactly as field-tested: the picker-specific `Choose project storage to continue` ownership is removed while Android still covers the app, so the first exposed Pad Grade frame already uses the existing `Restoring saved project…` cover.
- No new cover, native curtain, arbitrary delay, TOS redesign, or recovery/load redesign is introduced by the stable promotion.

### GPS and Android lifecycle
- Keeps transparent Precision Location → native GPS failover, authoritative source-state display, and the informed Precise/While Using permission flow.
- GPS subscriptions suspend while the app is minimized and resume on return without requesting background location.
- Retains WebView timer resume protection, renderer-loss recovery, process-exit diagnostics, and privacy-safe lifecycle/memory timing diagnostics.

### Imagery
- Keeps the current USGS NAIP Plus high-resolution path: Natural Color, 512×512 requests for 256 logical pixels, quality 95, cubic resampling, and resolution-first selection.
- Non-positive/unknown `resolution_value` records are excluded before ordering. The latest field diagnostics at the tested location selected the same 0.6 m raster as the best positive-resolution 0.6 m catalog candidate.

### Map interaction and comparison
- Promotes the field-selected fixed 15% GPS-map near-miss hitbox with exact-one-match/dead-space safeguards.
- Keeps the indexed Project Comparison workflow, detailed comparison grid/labels, CUT/GRADE/FILL presentation, and independent progressive comparison heat map.

### Stable channel
- Application ID: `com.lordofrealms.padgrade`.
- Android version: **1.4.0**.
- Build: **111**.
- Diagnostic logging defaults **off** for stable unless the user explicitly chose otherwise.
- The separately installable DEV package remains `com.lordofrealms.padgrade.dev`.

The v1.4.0 promotion intentionally changes no grading/interpolation math and makes no new heat-map, imagery, recovery, or folder-picker behavior change beyond switching the already-tested line to stable metadata/defaults.
