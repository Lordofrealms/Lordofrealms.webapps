# Pad Grade Mapper v1.3.2 — DEV BUILD

## v1.3.2 — restore heat lifecycle ownership and increase close-zoom NAIP raster density

### Fixed — v1.3.1 heat worker redirection no longer strips v1.2.6/v1.2.7 lifecycle methods
- The first v1.3.1 field log showed a real regression after a point edit: 99 and 297 calculations finished, but v1.2.7 rejected their fresh canvases as `no-current-generation-authorization` while reporting `currentGeneration: 0`.
- Root cause was the v1.3.1 worker implementation redirect. Its constructor returned a newly created parent `Worker`, which is legal JavaScript but discards the most-derived subclass prototype when that wrapper is itself extended. The v1.2.6/v1.2.7 `postMessage()` and `terminate()` overrides therefore never owned the actual redirected worker.
- v1.3.2 inserts a corrected redirect before v1.2.6/v1.2.7. It uses `Reflect.construct(..., new.target)` against the underlying native Worker so the redirected v1.3.1 implementation is constructed with the real most-derived lifecycle prototype intact.
- The worker URL still redirects only the historical heat raster workers to `heatmap-raster-worker-v131.js`; grid and other workers remain untouched.
- A dedicated regression recreates the broken v1.3.1 constructor shape, layers a lifecycle subclass over the v1.3.2 redirect, and requires the derived constructor, `postMessage()`, and `terminate()` methods to remain active while the underlying URL is redirected.

### Restored — regular heat generation/provenance path
- On a cache miss, v1.2.7 should again own a nonzero generation before 99 is forwarded, release 297 only after 99 completes, authorize each completed regular canvas against that same project/surface generation, and defer 891 until the lower tiers complete.
- Fresh 99/297 canvases should no longer be rejected against generation 0. The protected v1.2.2 completed-canvas presenter is unchanged.
- Point/project changes still physically terminate stale lifecycle workers before replacement work becomes authoritative. For a running 891, that termination also kills the coordinator that owns its nested band workers.
- Exact cached 891 returns remain ahead of raster work through the v1.3.0 preflight path and still require MapLibre render confirmation.

### Changed — denser close-zoom USGS NAIP Plus image exports
- The v1.3.1 field log showed the high-resolution NAIP Plus source was actually reaching loaded state with no source errors; after warm-up, a sampled group of high-resolution requests completed quickly. The remaining complaint is therefore treated as a visual-fidelity issue rather than another timeout/retry problem.
- The provider remains **USGS `USGSNAIPPlus` ImageServer + `NaturalColor`**. Layer order, geographic tile footprint, close-zoom threshold, and imagery recovery policy remain unchanged.
- Each high-resolution MapLibre logical 256 px tile now requests a **512 × 512** ImageServer export (2× raster density) instead of 256 × 256.
- `compressionQuality=95` is requested for JPG/JPGPNG output instead of relying on the service default. This increases transmitted/detail-preserving image density without switching providers or changing project/GPS behavior.
- The same upgrade is applied to initial map style construction and later `addSource()` calls, so the bounded imagery-recovery path cannot silently revert a repaired source to the old 256 px request.
- New `imagery.v132-quality-policy-installed` and `imagery.v132-highres-source-upgraded` rows identify the active 512 px / quality-95 policy without logging URLs, tile coordinates, viewed coordinates, project coordinates, or rod readings.

### Protected / unchanged behavior
- The **v1.2.2 flickerless completed-canvas presenter remains protected and unchanged**; v1.3.2 does not recreate the permanent canonical heat source/layer as part of tier handoff.
- Heat interpolation math, colors, raster dimensions (99 / 297 / 891), final 891 cache format, point mutation order, project schema, GPS calculations, Project Comparison math, and startup/storage-cover policy are unchanged.
- Final 891 adaptive compute policy remains **`max(1, navigator.hardwareConcurrency - 1)`** inside one lifecycle-visible coordinator, with atomic full-buffer publication and safe whole-raster fallback.
- USGS remains the imagery provider. v1.3.2 does not select an older alternate aerial dataset or change the NAIP Plus default mosaic/date selection; it only requests a denser rendition of the same configured source.

### Changed
- Android DEV package is **version 1.3.2 / build 104** and installs separately from stable.

### DEV verification
- Change a measured point to force a cache miss. Confirm `heatmap.v127-generation-owned` reports a **nonzero** generation and that 99/297 results are not followed by `no-current-generation-authorization` suppression for the current project/surface.
- Confirm regular presentation remains 99 → 297 → 891, with 297 released only after 99 completes and one final 891 coordinator for the current generation.
- Let 891 finish and inspect `heatmap.v131-parallel-891-complete`; on the current 8-logical-processor test device it should select 7 compute workers unless a safe fallback is explicitly reported.
- Change a point while 891 is running and confirm v1.2.7 physical termination retires the stale coordinator before replacement work proceeds.
- Return to an exact cached surface and confirm the v1.3.0 zero-real-worker cache short circuit and render-confirmation path still work.
- At close zoom, confirm `imagery.v132-quality-policy-installed` reports `exportPixels: 512`, `densityScale: 2`, and `compressionQuality: 95`; the high-resolution source should still load without changing provider/layer ordering.
- Export a diagnostic log after the test so final-891 wall/band timing and high-resolution request timing can be compared with v1.3.1.
