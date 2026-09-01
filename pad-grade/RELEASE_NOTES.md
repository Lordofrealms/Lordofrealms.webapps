# Pad Grade Mapper v1.3.4 — DEV BUILD

## v1.3.4 — prove imagery quality + diagnose Android child-worker failure

This build is intentionally **diagnostic-first**. It does not change heat interpolation math, heat presentation, imagery providers, or the v1.3.3 best-available USGS selection policy. It adds the evidence needed to determine whether the imagery improvement is real in the field and exactly why the final 891 heat band workers still fail on the Android test device.

### Field evidence that drove v1.3.4

The v1.3.3 field log showed two important results:

- The upgraded `USGSNAIPPlus` source did load, and the v1.3.3 resolution-first policy was installed, but the old diagnostics could only prove **configuration**, not that live MapLibre export requests actually carried the 512-pixel/mosaic/interpolation parameters or which source raster the ImageServer selected.
- Two fresh 891 generations still fell back to one compute worker on an 8-logical-processor device. They completed in roughly 23–25 seconds and reported `bandsCompleted: 0` with `fallbackReason: band-worker-failed:dedicated band worker failed`. The generic WebView worker error did not say whether failure occurred before script execution, during `importScripts`, while receiving the band job, during rasterization, or during message return.

v1.3.4 instruments exactly those unknowns.

## Added — live imagery request proof

The existing v1.3.3 imagery behavior is retained unchanged:

- provider remains **USGSNAIPPlus**
- rendering remains **NaturalColor**
- each logical 256-pixel tile still requests a **512 × 512** export
- `compressionQuality=95` remains unchanged
- the mosaic rule still uses `resolution_value` nearest zero with `MT_FIRST`
- resampling remains `RSP_CubicConvolution`
- the cached USGS basemap remains underneath
- no Esri source and no state/local coverage hard-code are added

New v1.3.4 resource diagnostics inspect the **actual high-resolution `exportImage` resource URLs in memory** without writing the URL, bounding box, tile coordinates, or map coordinates to the diagnostic log.

A real upgraded map resource produces `imagery.v134-live-request-policy-observed`. The event proves the observed network resource itself carried 512 × 512 requested pixels, the resolution-first mosaic rule, cubic interpolation, compression quality 95, and Natural Color when present in the live request.

Periodic `imagery.v134-live-request-summary` rows separate actual 512-policy requests, existing 256-pixel diagnostic probes, and unexpected high-resolution export requests. This closes the previous gap where the app could say the style was configured correctly while the live map might still have been requesting something else.

## Added — selected-source resolution proof

v1.3.4 adds a throttled, diagnostic-only **paired ImageServer identify test** at the current map center. For the same location it asks USGS NAIP Plus twice: once with Pad Grade's `resolution_value`-nearest-zero mosaic rule and once with the ImageServer's normal/default mosaic behavior. The log does **not** record the map center or request URL.

`imagery.v134-source-selection-proof` records sanitized catalog metadata for the first-ranked source from each request: `resolution_value`, `resolution_units`, normalized `resolutionMeters` when possible, imagery year, acquisition date, agency, and returned catalog count.

It also reports whether both calls appear to select the same raster, whether the resolution-first source is actually finer than the service default, the linear resolution gain (`default / resolution-first`), the first few returned candidate resolutions, and whether a real 512-policy MapLibre request had already been observed.

This gives the next field log enough evidence to distinguish **real source-resolution improvement**, **same source as default**, **policy present but not affecting source selection**, and **identify/service failure**. The paired proof is throttled and only runs at useful map zooms. It adds no new imagery provider.

## Added — staged child heat-worker diagnostics

The final 891 architecture remains coordinator + compute-only horizontal band workers, but the child worker now emits private diagnostic stage messages to the coordinator:

- `script-entered`
- `surface-imported`
- `handler-ready`
- `build-received`
- `raster-start`
- `raster-complete`
- `color-complete`

These are **diagnostic messages only**. They contain no heat pixels and are never forwarded to MapLibre or the presentation layer.

The coordinator tracks the last stage reached by each child. On a failure, the existing `fallbackReason` now includes a compact diagnostic fingerprint: child index, last completed stage, failure event type, sanitized error name/message, and worker-script basename plus line/column when WebView supplies them. This makes an immediate failure before `script-entered` distinguishable from an interpolation import failure or a compute failure.

## Added — failure-only nested-worker and asset probes

Only after a real child-band failure, the coordinator performs three bounded probes before starting whole-raster fallback:

1. a tiny **nested Blob worker** test
2. a same-origin fetch of `heatmap-raster-band-worker-v134.js`
3. a same-origin fetch of `surface-local-v078.js`

The results are appended to the fallback diagnostic fingerprint.

That combination should distinguish the major Android/WebView failure classes: nested workers unsupported/broken even for a trivial Blob worker; nested workers work but same-origin child script loading fails; child script is fetchable but `importScripts` fails; or child script/import succeeds and failure occurs after the band job begins.

The failure probes are bounded and **do not run on a successful parallel 891 calculation**.

## Protected — no row painting, no partial frames, no flicker regression

This remains a hard invariant.

- Band workers still have no MapLibre/canvas presentation code.
- Stage/diagnostic messages contain no pixel buffers.
- Completed band RGBA buffers are copied into one offscreen full-size coordinator buffer.
- The coordinator still waits for every band before publishing a successful parallel frame.
- If any band fails, already-finished bands are discarded and no partial rows are published before whole-raster fallback.
- 99 and 297 remain complete sequential frames.
- The existing v1.2.2 canonical presenter remains unchanged.
- The final visible sequence remains whole-frame **99 → 297 → 891**.

The v1.3.4 regression repeats the seven-band 891 equivalence test against the real interpolation module and statically rejects presentation authority in the child worker.

## Diagnostics to look for in the next field log

### Imagery

Healthy proof should include `imagery.v134-live-request-policy-observed`, `imagery.v134-live-request-summary` with `policy512Requests > 0`, and `imagery.v134-source-selection-proof`.

The most important fields in `source-selection-proof` are `resolutionFirst.resolutionMeters`, `serviceDefault.resolutionMeters`, `resolutionImproved`, `linearResolutionGain`, `sameRaster`, and `policyActuallyObservedOnLiveRequests`.

### Heatmap

Force at least one fresh 891 calculation by editing a measured point.

If parallelism succeeds, the existing `heatmap.v131-parallel-891-complete` should report `enabled: true`, `computeWorkers > 1`, and `bandsCompleted === computeWorkers`.

If it still fails, `fallbackReason` should now identify the last child stage and include `nestedBlob=...`, `bandAsset=...`, and `surfaceAsset=...`. That should be enough to choose the next fix rather than trying another blind worker-layout change.

## Version

- Android DEV package: **v1.3.4**
- build: **106**
- DEV application ID remains separate from stable.

## DEV field test

1. Open the normal project/map and pan/zoom at close aerial zoom for long enough to let NAIP Plus load.
2. Pan or zoom once or twice so the paired source-selection proof has an opportunity to run.
3. Edit a measured point to invalidate the exact final heat cache.
4. Let the full **99 → 297 → 891** progression finish.
5. Confirm visually that there is no horizontal row painting, partial-band display, blanking, or resolution flicker.
6. Export a fresh diagnostic log.

That single log should now tell us both whether v1.3.3 actually improved the aerial source at the tested location and exactly where Android WebView rejects the parallel heat-worker path.
