# Pad Grade Mapper v1.3.3 — DEV BUILD

## v1.3.3 — best-available USGS imagery + real dedicated-band 891 parallelism

### Fixed — final 891 heatmap now uses dedicated compute workers instead of recursively spawning the coordinator
- The v1.3.2 field log proved the intended adaptive path was not actually parallel on the 8-logical-processor test phone: both completed 891 runs reported `computeWorkers: 1`, `bandsCompleted: 0`, and `band-worker-failed`, then spent roughly 23–29 seconds in whole-raster fallback.
- The final 891 tier now keeps one lifecycle-visible coordinator worker but spawns **dedicated compute-only band workers** from `heatmap-raster-band-worker-v133.js` using an absolute same-origin asset URL.
- Dedicated band workers import the interpolation module directly, compute exactly one horizontal band, transfer only that raw RGBA band buffer to the coordinator, and exit. They do not recursively load the coordinator and contain no MapLibre/canvas/presentation code.
- The adaptive count remains **`max(1, navigator.hardwareConcurrency - 1)`**. On the current 8-thread test device the expected successful path is 7 compute workers / 7 completed bands.
- Child-worker exceptions are returned as explicit `band-error` messages so a future failure records a useful fallback reason instead of only the generic browser worker error.

### Protected — no row painting, no partial heatmap frames, no flicker regression
- Parallelism changes **compute only**. Band completion messages are private to the coordinator and are never exposed as heatmap frames.
- The coordinator allocates one full 891 RGBA array offscreen, copies each completed band into its final row range, waits until `remaining === 0`, then transfers **one complete buffer** through the existing terminal `complete` message.
- The protected v1.2.2 canonical MapLibre/ImageSource presenter remains unchanged. It still receives only complete 99, complete 297, and complete 891 frames.
- Whole-raster fallback is also still atomic; a failed band path does not publish already-finished rows before falling back.
- A v1.3.3 regression divides an 891-row raster into 7 bands, reassembles them, and requires the banded result to match a monolithic raster cell-for-cell (mask/count) and value-for-value within floating-point tolerance. The test also rejects any band-worker MapLibre/canvas code or coordinator partial-frame publication path.

### Changed — generic USGS-only “best available” close-zoom imagery
- **No Esri imagery provider was added.** The existing fast cached USGS basemap remains underneath and `USGSNAIPPlus` + `NaturalColor` remains the close-zoom provider.
- The 512-pixel export for each 256-pixel logical tile and `compressionQuality=95` from v1.3.2 are retained.
- Each NAIP Plus export now supplies an ImageServer mosaic rule using `resolution_value` with a reference value of 0 and `MT_FIRST`. Because the ImageServer evaluates the overlapping raster catalog for every requested tile, this makes source selection **generic and server-side** rather than hard-coding any Oklahoma/state/local coverage.
- The intent is resolution-first selection: among overlapping NAIP Plus source rasters, prefer the source whose catalog ground-pixel size is smallest instead of relying only on the service's default year-oriented attribute rule.
- Export resampling now requests `RSP_CubicConvolution` rather than the service's default nearest-neighbor resampling so down/up-sampling the selected aerial raster preserves smoother high-frequency image detail.
- No source is removed/re-added when this policy changes. The rule is part of each export URL from initial style construction onward, so there is no extra imagery-layer swap cycle.

### Diagnostics
- `heatmap.v133-worker-bootstrap-installed` confirms legacy heat requests are redirected to the v1.3.3 coordinator while v1.2.6/v1.2.7 lifecycle subclasses remain intact.
- Existing `heatmap.v131-parallel-891-complete` diagnostics remain the performance proof point. A successful v1.3.3 run should show `enabled: true`, `computeWorkers > 1`, and `bandsCompleted === computeWorkers` with no fallback reason.
- `imagery.v133-best-available-policy-installed` and `imagery.v133-best-source-upgraded` identify the nationwide resolution-first USGS policy without logging URLs, tile coordinates, GPS coordinates, project coordinates, or rod readings.

### Protected / unchanged behavior
- Heat interpolation math, colors, raster sizes (99 / 297 / 891), final heat cache format, current project generation/cancellation ownership, point-mutation order, project schema, GPS calculations, Project Comparison math, and startup/storage-cover policy are unchanged.
- 99 and 297 remain sequential single-worker tiers so the user still gets the same staged whole-frame progression before final 891.
- Exact cached 891 surfaces still bypass real raster work through the existing cache path.
- Project switching still removes the outgoing grid/heat presentation before the project dialog closes.

### Version
- Android DEV package is **version 1.3.3 / build 105** and installs separately from stable.

### DEV verification
- Edit a measured point so the exact final cache cannot be reused. Confirm visible heat progression remains whole-frame **99 → 297 → 891** with no partial rows/bands appearing.
- Confirm `heatmap.v131-parallel-891-complete` for tier 891 reports `enabled: true`; on the current 8-thread phone it should report `computeWorkers: 7` and `bandsCompleted: 7`.
- Compare final-891 `wallElapsedMs` against the v1.3.2 field runs that fell back to one worker (~25–29 seconds post-to-visible for 891). The new build should materially reduce that final-tier wall time if Android WebView permits the dedicated subworkers.
- Change another point while 891 is running and confirm stale work is still physically terminated and never becomes visible.
- Pan/zoom at close range and confirm `imagery.v133-best-available-policy-installed`, then confirm the high-resolution NAIP Plus source reaches loaded state without switching away from USGS.
- Export a fresh diagnostic log after the field test so successful band counts/timing and imagery source behavior can be compared directly with v1.3.2.
