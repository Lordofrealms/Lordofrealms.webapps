# Pad Grade Mapper v1.3.6 — DEV BUILD

## v1.3.6 — parallelize all heat tiers + repair USGS resolution proof

v1.3.6 extends the Android-proven Blob-worker heat path from only the final 891 tier to **all three progressive tiers: 99, 297, and 891**. It also strengthens the USGS imagery diagnostics so the next field log can determine whether the resolution-first mosaic rule is truly selecting the finest positive-resolution source available at the viewed location.

This build does **not** change heat interpolation formulas, heat colors, raster dimensions, project/cache formats, GPS calculations, imagery providers, or the protected whole-frame presenter.

## Heatmap — 99 / 297 / 891 now all use the proven Blob-band path

v1.3.5 proved that Android WebView can execute the nested Blob worker design successfully. Two fresh 891 generations used **7 compute workers / 7 completed bands**, with no serial fallback and no evidence of partial-row presentation.

v1.3.6 applies that same path to the smaller progressive tiers as well:

- tier 99 → parallel Blob-band coordinator
- tier 297 → parallel Blob-band coordinator
- tier 891 → parallel Blob-band coordinator

The worker policy remains `max(1, hardwareConcurrency - 1)`. On the current 8-thread test phone, the expected healthy result is therefore **7 compute workers** for each tier.

### No new sequential benchmark pass

The field build intentionally does **not** run a second sequential reference calculation. That would add CPU load, delay the progressive sequence, and make the timing comparison harder to interpret.

Instead, v1.3.6 records the normal per-tier parallel timings and compares them against the sequential results already captured in the immediately preceding v1.3.5 field log.

Useful v1.3.5 sequential baselines from that log were:

- **99 tier:** worker time ranged roughly **0.66–1.07 s** in the sampled fresh runs; one complete visible result was about **1.13 s**, another about **2.01 s** depending on queue/startup overhead.
- **297 tier:** worker time ranged roughly **3.78–4.80 s**; complete post-to-visible time ranged roughly **5.78–6.29 s**.
- **891 tier:** already parallel in v1.3.5, with successful 7-worker field runs around **12.5 s** and **17.3 s** post-to-visible.

The next field log should therefore let us judge whether parallelism helps 99 and 297, hurts them through worker/setup contention, or needs a smaller worker count by tier.

## Protected — no row painting or partial-frame publication

The no-flicker boundary remains a hard invariant for every tier.

- Child workers contain no MapLibre code and no canvas/presentation code.
- Child workers return private band buffers only to the coordinator.
- The coordinator copies completed bands into one offscreen full-size RGBA allocation.
- No band is ever published directly to the map.
- The coordinator cannot publish success while any band remains incomplete.
- If a child fails, partial band work is discarded before fallback.
- The existing v1.2.2 whole-frame presenter remains unchanged.
- The visible progression remains complete-frame **99 → 297 → 891**.

The v1.3.6 regression reconstructs **99, 297, and 891** row rasters from seven bands and requires each result to match the production monolithic interpolation cell-for-cell for mask/count data and within floating-point tolerance for values.

## Imagery — fix false `0 m` diagnostic values

The v1.3.5 field log proved that real MapLibre NAIP Plus requests are carrying the intended policy:

- requested export: **512 × 512** for a 256 logical tile
- resolution-first mosaic rule present
- `RSP_CubicConvolution` resampling present
- Natural Color present
- compression quality 95 present
- zero unexpected high-resolution request variants in the observed sample

It also proved that the resolution-first rule selected a **different raster** from the normal USGS service default.

However, the source-resolution diagnostic reported suspicious `0` values. v1.3.6 fixes the parsing bug that caused that ambiguity: the old numeric formatter could coerce JavaScript `null` to `0`. Missing/unknown resolution values now remain unknown instead of being reported as zero.

## Imagery — independent best-positive-resolution catalog proof

The diagnostic now performs three same-location USGS checks:

1. `identify` using Pad Grade's current resolution-first mosaic rule
2. `identify` using the normal USGS service default
3. an independent ImageServer `query` restricted to `resolution_value > 0`, ordered by `resolution_value ASC`

The third request is diagnostic-only and asks USGS for the smallest **positive** resolution candidates intersecting the viewed map point.

The resulting log now records:

- selected raster `objectId`
- service-default raster `objectId`
- best-positive catalog raster `objectId`
- `resolution_value` and units when actually present
- normalized resolution in meters when trustworthy
- `MinPS` / `MaxPS` as additional service metadata
- whether the resolution fields were present at all
- candidate positive resolutions
- `selectedMatchesBestPositive`
- `selectionVerdict` = `selected-is-best-positive`, `selected-differs-from-best-positive`, or `unknown`
- selected-vs-default resolution gain when both are comparable
- selected-vs-best-positive ratio when both are comparable

This is diagnostic-only. **The imagery selection behavior itself is unchanged in v1.3.6.** If the new proof shows that `resolution_value` nearest zero can rank an unknown/zero-resolution catalog record ahead of a genuine finer positive-resolution raster, the following build can correct the selection rule with evidence rather than guessing.

## Privacy boundary

Pad Grade remains default-deny for outbound network access.

v1.3.6 adds one narrowly scoped same-service GET allowance for:

`https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/query`

This is in addition to the already permitted exact NAIP Plus `exportImage` and `identify` endpoints. There is still no host-wide `imagery.nationalmap.gov` exemption, no general ArcGIS exemption, no analytics, and no additional imagery provider.

## Diagnostics to verify in the next field log

### Heat

After editing a measured point so a fresh generation occurs, the log should show 99, 297, and 891 results with:

- `enabled: true`
- `hardwareConcurrency: 8` on the current test phone
- `computeWorkers: 7`
- `bandsCompleted: 7`
- `childWorkerKind: blob-bundled-v136`
- `parallelTierPolicy: 99-297-891`
- non-null Blob/band timing fields
- `sequentialBenchmarkRun: false`
- no `fallbackReason`

The existing legacy observer event name may still contain `parallel-891` even when its embedded `tier` is 99 or 297; use the `tier` field as authoritative.

### Imagery

The live request proof should continue to show the real 512/resolution-first/cubic/quality-95 request policy.

The new useful event is `imagery.v136-source-selection-proof`. The most important fields are:

- `resolutionFirst.objectId`
- `resolutionFirst.resolutionMeters`
- `serviceDefault.objectId`
- `serviceDefault.resolutionMeters`
- `bestPositiveCatalog.objectId`
- `bestPositiveCatalog.resolutionMeters`
- `selectedMatchesBestPositive`
- `selectionVerdict`
- `bestPositiveCandidateResolutionsMeters`
- `diagnosticNullToZeroBugFixed: true`

## Version

- Android DEV version: **1.3.6**
- build: **108**
- DEV application ID remains `com.lordofrealms.padgrade.dev`, separate from stable.

## DEV field test

1. Install/update the v1.3.6 DEV APK.
2. Open the same project used for the v1.3.5 timing log.
3. Pan/zoom the aerial imagery at close zoom and allow the high-resolution source to settle.
4. Move/zoom at least once so the paired identify + best-positive catalog proof runs.
5. Edit a measured point to force a fresh heat generation rather than a cached return.
6. Let the complete **99 → 297 → 891** sequence finish.
7. Watch for any row painting, band seams, blanking, or tier-swap flicker; none is expected or permitted by the v1.3.6 path.
8. Export the diagnostic log.

That log should let us compare 99/297 parallel performance directly against the sequential timings already captured, confirm that 891 remains healthy, and finally determine whether the current USGS resolution-first rule is selecting the true finest positive-resolution imagery source.