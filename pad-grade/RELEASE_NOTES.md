# Pad Grade Mapper v1.3.5 — DEV BUILD

## v1.3.5 — use proven Blob-worker transport for final 891 heat + complete USGS source-resolution proof

v1.3.5 turns the v1.3.4 field diagnostics into two targeted fixes. It does **not** change heat interpolation math, heat colors, raster dimensions, project/cache formats, GPS calculations, imagery providers, or the protected whole-frame presenter.

### Field evidence that drove v1.3.5

The v1.3.4 field log finally separated configuration from actual runtime behavior.

For imagery, the live-resource observer proved that the real MapLibre high-resolution requests were carrying the intended policy. During the test the app observed up to 93 high-resolution export resources, 88 of them real 512-policy requests and 5 legacy diagnostic probes, with **zero unexpected high-resolution requests**. The live requests carried the resolution-first mosaic rule, cubic resampling, Natural Color, and compression quality 95. The remaining unanswered question was whether that rule actually selected a finer source raster than the USGS service default. The paired `identify` diagnostic could not answer it because Pad Grade's privacy guard blocked its own same-service diagnostic GET.

For heat, a fresh final 891 still fell back to one worker on the 8-logical-processor Android device and took about 24.1 seconds post-to-visible, with about 23.2 seconds spent rasterizing. The important v1.3.4 failure fingerprint was:

- the external nested child reached `stage=constructed` but never emitted its first `script-entered` stage
- the failure-only nested **Blob** worker probe returned `nestedBlob=ok`
- the coordinator could fetch the band-worker JavaScript asset successfully (`bandAsset=200:ok:js:...`)
- the surface asset was also locally reachable

That combination isolates the problem to Android WebView bootstrapping an external appassets URL as a **nested worker**, not to lack of worker support, the interpolation algorithm, or the local assets themselves.

## Fixed — final 891 workers now use one parent-built Blob payload

The final-tier coordinator no longer does `new Worker(externalAppassetsBandUrl)`.

Instead it now:

1. fetches the local `surface-local-v078.js` source inside the already-running coordinator worker
2. fetches the local compute-only `heatmap-raster-band-worker-v135.js` source
3. concatenates those local sources into one JavaScript payload
4. creates one in-memory JavaScript `Blob`
5. creates one Blob URL for that payload
6. launches every final-891 compute worker from that same Blob URL
7. revokes the Blob URL when the generation completes, fails, is replaced, or is cancelled

This uses the exact nested-worker transport that the v1.3.4 Android field log proved works on the test device.

The adaptive worker policy remains `max(1, hardwareConcurrency - 1)`. On the current 8-thread test device, a healthy v1.3.5 final tier should therefore use **7 compute workers**.

### Child worker no longer has an external bootstrap dependency

The v1.3.5 band worker has no `importScripts()` call. The interpolation implementation is already present because the coordinator prepends it to the Blob payload before creating the child workers.

The child emits staged diagnostics beginning with:

- `script-entered` with `transport: blob-bundled-v135`
- `surface-bundled`
- `handler-ready`
- `build-received`
- `raster-start`
- `raster-complete`
- `color-complete`

If the Android runtime still rejects the worker, these stages remain available to distinguish construction/bootstrap failures from computation or message-transfer failures.

## Protected — no row painting, partial-band display, or flicker regression

This remains a hard release invariant.

- The child worker contains no MapLibre code and no canvas/presentation code.
- Child workers return only private band buffers to the coordinator.
- Completed bands are copied into their final row offsets in one offscreen full-size 891 RGBA allocation.
- A completed band is **never** forwarded as a visible heat frame.
- The coordinator will not publish success while `remaining > 0`.
- If any child fails, already-computed band results are discarded before whole-raster fallback.
- 99 and 297 remain the existing complete sequential frames.
- The v1.2.2 canonical presenter is unchanged.
- The visible progression remains complete-frame **99 → 297 → 891**.

The v1.3.5 regression divides an 891-row raster into seven horizontal bands using the production band transform, reconstructs the full raster, and requires it to match a monolithic production interpolation cell-for-cell for masks/counts and within floating-point tolerance for values. It also statically rejects `importScripts`, `new Worker`, MapLibre, or canvas presentation authority in the child.

## Fixed — source-resolution diagnostic may call only the exact USGS identify endpoint

The actual imagery behavior remains unchanged from v1.3.3/v1.3.4:

- provider: **USGSNAIPPlus**
- rendering: **NaturalColor**
- logical tile: 256 × 256
- requested export: **512 × 512**
- density scale: 2×
- compression quality: 95
- mosaic selection: `resolution_value` nearest zero / `MT_FIRST`
- resampling: `RSP_CubicConvolution`
- cached USGS imagery stays underneath
- no Esri source
- no state/local imagery hard-code

v1.3.5 adds one narrowly scoped privacy allow-list entry:

`https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/identify`

Only GET requests matching that exact service endpoint are newly permitted. Pad Grade remains default-deny for outbound network access; there is no host-wide `imagery.nationalmap.gov` exemption and no general ArcGIS exemption.

This lets the existing paired source-selection diagnostic compare, at the same location, the source ranked first by Pad Grade's resolution-first mosaic rule with the source ranked first by the normal USGS service behavior.

## Diagnostics to verify in the next field log

### Final 891 heat

After changing a measured point so the exact 891 cache cannot be reused, a successful parallel calculation should report:

- `heatmap.v131-parallel-891-complete`
- `enabled: true`
- `hardwareConcurrency: 8` on the current test phone
- `computeWorkers: 7`
- `bandsCompleted: 7`
- `childWorkerKind: blob-bundled-v135`
- non-null `blobPrepElapsedMs`
- non-null `blobSourceBytes`
- non-null band timing fields
- no `fallbackReason`

The main performance comparison is against the v1.3.4 serial-fallback field result of roughly **24.1 seconds post-to-visible / 23.2 seconds rasterization** for the 891 tier.

### Imagery

The already-proven live request evidence should continue to show:

- `imagery.v134-live-request-policy-observed`
- `requestedPixels: 512x512`
- `resolutionFirstMosaic: true`
- `compressionQuality: 95`
- periodic summaries with `unexpectedRequests: 0`

The previously blocked `imagery.v134-source-selection-proof` should now complete. The useful comparison fields are:

- `resolutionFirst.resolutionMeters`
- `serviceDefault.resolutionMeters`
- `resolutionImproved`
- `linearResolutionGain`
- `sameRaster`
- `policyActuallyObservedOnLiveRequests`

That will tell us whether the generic resolution-first rule produces a genuinely finer underlying aerial source at the tested location, or merely makes the same selection as USGS default there.

## Version

- Android DEV version: **1.3.5**
- build: **107**
- DEV application ID remains `com.lordofrealms.padgrade.dev`, separate from stable.

## DEV field test

1. Install/update the v1.3.5 DEV APK.
2. Open the normal project and pan/zoom the aerial imagery at close zoom long enough for NAIP Plus to load.
3. Move/zoom at least once so the paired source-resolution proof runs.
4. Edit a measured point to force a fresh heat generation rather than an exact 891 cache hit.
5. Let the complete **99 → 297 → 891** progression finish.
6. Watch specifically for horizontal row painting, partial bands, blanking, or tier-swap flicker; none is expected or permitted by the v1.3.5 presentation path.
7. Export a fresh diagnostic log.

The next log should answer both remaining questions directly: whether the Blob-worker path actually gives us seven-way final-tier computation on this Android WebView, and whether the resolution-first USGS rule selected a finer source raster at the tested location.
