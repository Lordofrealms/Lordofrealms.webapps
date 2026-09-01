# Pad Grade Mapper v1.3.0 — DEV BUILD

## v1.3.0 — authoritative heat lifecycle, verified cached-frame return, and imagery health diagnostics

### Fixed — one authoritative point-save heat lifecycle replaces the stacked wrappers
- Field diagnostics from v1.2.9 showed a single point save could still enter multiple historical `saveCurrent()` heat wrappers. Even when those wrappers reached compatible results, repeated cancellation/snapshot/retirement bookkeeping made the mutation path harder to reason about and added avoidable work.
- v1.3.0 captures the original point-save primitive immediately after `ui.js`, before the v1.2.7/v1.2.8/v1.2.9 heat wrappers can install. Once v1.2.7's physical-generation cancellation API is available, v1.3.0 replaces the live point-save stack with one authoritative controller.
- A real changed reading now follows one auditable order: **cancel cache preflight and active heat generation → snapshot the valid completed 891 if present → mutate the reading once → retire the obsolete legacy raster owner → hide the invalid canonical heat → resolve exact cache or generate replacement heat**.
- The v1.3.0 wrapper carries the v1.2.7/v1.2.8/v1.2.9 readiness markers, so their periodic installers recognize that the lifecycle is already satisfied instead of wrapping `saveCurrent()` again.
- The underlying reading-save semantics are unchanged; v1.3.0 changes heat lifecycle ownership around that save, not how the reading itself is stored.

### Fixed — exact cached 891 is resolved before a real raster Worker is created
- The v1.2.9 field failure occurred after the app had already identified the exact cached final surface. v1.3.0 moves the exact-cache decision farther upstream to the `Worker` construction boundary.
- Regular 99/297 requests initially receive lightweight lazy Worker shims. Before either request creates a real heat raster worker, v1.3.0 checks the bounded transition snapshot and then the durable exact 891 cache for the current **project + surface key**.
- On an exact 891 hit, the cached frame is submitted through the existing protected presentation path and both lower-tier requests terminate as cache hits with **zero real raster Worker constructions**.
- On a cache miss, the real v1.2.7 worker lifecycle is activated and the existing sequential **99 → 297 → 891** pipeline continues unchanged.
- Rapid point/project changes cancel outstanding cache-preflight work before the replacement surface is admitted.

### Fixed — cached heat is not considered restored until MapLibre renders it
- v1.2.9 could report `cache-visible`, `surface-visible`, and a v1.2.2 canvas commit while the user still saw a blank heat layer. Those diagnostics proved the correct image reached the presenter but did not prove that the canonical layer had actually become visible on screen after v1.2.8 intentionally hid it.
- v1.3.0 separates the stages explicitly: exact cache hit → cached frame submitted → v1.2.2 completed-canvas commit observed → canonical layer visibility/opacity reactivated → **MapLibre render confirmed**.
- Cache restoration is successful only after a real render event still matches the current project/surface and the canonical heat layer is visible.
- If that first render check fails, v1.3.0 performs one in-place visibility/opacity/texture-refresh retry. It does not start a recurring repair loop and does not recreate the protected source/layer.
- If the one-shot retry still cannot confirm the frame, the cache is bypassed for that surface and normal heat generation is requested rather than leaving the UI in a false “cached and visible” state.

### Fixed — obsolete raster ownership is retired at the legacy producer
- v1.2.8/v1.2.9 successfully blocked stale canvases from reaching MapLibre, but field logs still showed the legacy v1.1.1 900 ms maintenance loop waking repeatedly because its closure continued to retain `displayedCanvas` / pending-raster state.
- v1.3.0 retires that state through the legacy engine's own public draw boundary immediately after the new point value is authoritative. The retirement call temporarily presents an empty measured-point set to the legacy heat engine so its internal `removeRaster()` path clears active jobs, pending rasters, displayed canvas, active slot, and related strong references.
- The subsequent 900 ms maintenance pass therefore has no obsolete raster to re-offer. v1.2.8 tombstones and v1.2.7 provenance checks remain installed as safety nets, but they should no longer be the normal way stale raster work is stopped.
- The canonical v1.2.2 heat source/layer remains in place; only the invalid display is hidden until a valid replacement frame is confirmed.

### Added — diagnostic-only BASE vs HIGH_RES imagery health reporting
- The imagery providers and map behavior are unchanged in v1.3.0. The app still uses the USGS `USGSImageryOnly` tiled base source and the USGS `USGSNAIPPlus` high-resolution ImageServer overlay.
- New diagnostics report current zoom, whether each configured imagery source is present/loaded, whether its layer is visible, and which source is expected to contribute at the current zoom.
- BASE USGS and HIGH_RES NAIP Plus now have independent image probes. At close zoom, a successful base-tile probe is no longer treated as evidence that high-resolution NAIP is also healthy.
- NAIP/ImageServer source errors that were historically easy to miss are recorded with provider/source/zoom context while stripping request URLs from the diagnostic message.
- These probes are **diagnostic only**: they do not replace imagery sources, alter layer ordering, change retry/recovery policy, or introduce another imagery provider. The next field log should tell us whether the lower-resolution appearance is caused by a failed/missing high-resolution NAIP path.

### Protected / unchanged behavior
- The v1.2.2 flickerless completed-canvas presenter remains protected. v1.3.0 does **not** remove/recreate its permanent canonical MapLibre heat source or layer.
- The v1.2.8 immediate invalid-heat blanking behavior remains: once a changed reading is authoritative, the prior derived heat is not left on screen looking finished.
- The fresh-install Terms → durable-storage cover and ordinary startup cover are unchanged, including the historical **6-second maximum reveal** for ordinary map startup and the existing storage-selection renewal behavior.
- IDW² interpolation math, heat colors, 99 / 297 / 891 raster dimensions, final 891 cache-file format, project schema, GPS calculations, Project Comparison math, and map imagery providers are unchanged.

### Diagnostics
- `heatmap.v130-mutation-start` / `heatmap.v130-mutation-authoritative` identify the single authoritative point-save lifecycle.
- `heatmap.v130-exact-cache-short-circuit` reports exact-cache returns that created zero real raster workers.
- `heatmap.v130-cache-frame-submitted`, `heatmap.v130-cache-frame-committed`, `heatmap.v130-canonical-layer-reactivated`, and `heatmap.v130-cache-render-confirmed` separate logical cache discovery from actual rendered visibility.
- `heatmap.v130-cache-render-failed` identifies the one-shot recovery failure before the surface falls back to normal generation.
- `heatmap.v130-legacy-owner-retired` confirms the old producer's retained raster state was cleared rather than merely rejected downstream.
- `imagery.v130-stack-state`, `imagery.v130-source-loaded`, `imagery.v130-source-error`, and `imagery.v130-probe-result` expose BASE vs HIGH_RES imagery health independently.

### Changed
- Android DEV package is **version 1.3.0 / build 102** and installs separately from stable.

### DEV verification
- With a completed 891 visible, change one reading. Confirm diagnostics show cancellation before mutation, the changed numeric/grid state becomes authoritative, and the obsolete heat disappears immediately.
- Change the reading back to its exact original value. The cached 891 should return without starting real 99/297 raster workers; look for `heatmap.v130-exact-cache-short-circuit` with `workersCreated: 0`.
- Confirm the cache path does not stop at a logical “visible” marker: it should reach `heatmap.v130-cache-render-confirmed` after the protected v1.2.2 commit and canonical-layer reactivation.
- Repeat after letting the changed surface finish its own 891 first. Returning to the original exact surface should still use the bounded transition snapshot/durable cache path when available.
- Make several point changes and inspect the log for the old ~900 ms stale-canvas retry cadence. The legacy producer should report retirement and should no longer retain a raster that needs repeated tombstone/provenance rejection.
- At the close zoom where the pad fills the map, inspect `imagery.v130-stack-state` and `imagery.v130-probe-result`. The log should independently state whether BASE USGS and HIGH_RES NAIP Plus loaded/probed successfully and whether HIGH_RES is the expected contributor.
- Confirm fresh-install Terms/storage covering, ordinary 6-second startup safety behavior, sequential 99 → 297 → 891 generation on cache miss, and flickerless v1.2.2 presentation remain unchanged.

---

# Pad Grade Mapper v1.2.9 — DEV BUILD

## v1.2.9 — exact cached 891 return after retired-canvas cleanup

### Fixed — returning a point to an exact cached surface restores the heat map again
- The v1.2.8 field log confirmed that invalid heat is hidden immediately and that the exact final **891 cache is found** when a changed point is returned to its original value, but the cached image could still fail to reach the protected presenter.
- Root cause: v1.1.3 keeps decoded 891 cache canvases in memory by object reference. v1.2.8 can retire that same legacy handoff canvas and collapse its backing store to **1×1**. Returning to the exact old surface then reused the logically valid cache entry but offered the already-retired canvas object, so v1.2.8 correctly rejected it while the older cache layer still reported `cache-visible`.
- v1.2.9 installs outside the v1.2.8 retired-canvas guard. When that exact retired 891 cache object is offered, the stale attempt is stopped before it can re-tombstone a source slot, the persisted cache is verified against the **current project + exact surface key + 891 dimensions**, and the in-memory cache canvas is rehydrated from its saved PNG.
- Presentation uses a **fresh clone** of the rehydrated cache canvas. That fresh identity passes the existing v1.2.7 provenance check and feeds the unchanged v1.2.0/v1.2.2 completed-canvas handoff normally.
- The restored in-memory cache canvas remains reusable. Later returns to the same exact surface can clone it synchronously rather than decoding the cache file again.
- Retired 99/297 maintenance retries continue to be stopped cheaply, and a late stale retry can no longer re-tombstone an ID after a current cache frame has reclaimed that slot.

### Protected behavior unchanged
- v1.2.8's **cancel → mutate → clear → refresh** ordering is unchanged. Invalid heat still disappears immediately after a real point/settings mutation.
- The fresh-install Terms → storage-selection cover and ordinary base-map startup cover are unchanged, including the historical 6-second safety reveal.
- The protected v1.2.2 permanent MapLibre heat source/layer are not removed or recreated. v1.2.9 only repairs the upstream virtual-canvas handoff into that presenter.
- IDW²/local-surface interpolation math, heat colors, 99 / 297 / 891 resolutions, cache-file format, project schema, GPS calculations, Project Comparison math, and imagery sources are unchanged.

### Diagnostics
- `heatmap.v129-retired-retry-blocked` identifies a retired canvas stopped before v1.2.8 can re-tombstone its source ID.
- `heatmap.v129-cache-rehydrated` identifies an exact 891 cache restored from disk and staged through a fresh canvas identity.
- `heatmap.v129-cache-memory-reuse-cloned` identifies a later exact return that reused the already-rehydrated in-memory cache without another disk decode.
- `heatmap.v129-cache-rehydrate-present-check` records whether the current surface is still exact and whether the canonical heat layer became visible after the repaired handoff.

### Changed
- Android DEV package is **version 1.2.9 / build 101** and installs separately from stable.

### DEV verification
- Start with a completed/cached 891 surface. Change one measured point and confirm the old heat disappears immediately as in v1.2.8.
- Change that point back to its exact original value. The cached 891 should return quickly; diagnostics should show the v1.2.9 rehydrate path on the first return if v1.2.8 had released the resident canvas.
- Repeat the same away-and-back sequence. The restored in-memory cache should now be reusable through a fresh clone, without another disk rehydrate.
- Confirm no stale 99/297 frame appears over the restored 891, and repeated retired maintenance retries do not re-tombstone the current source slot.
- Confirm fresh-install Terms/storage covering and ordinary startup covering still behave exactly like v1.2.8.
- Confirm heat presentation remains flickerless and the v1.2.2 canonical source/layer are never recreated.

---

# Pad Grade Mapper v1.2.8 — DEV BUILD

## v1.2.8 — authoritative mutation blanking, stale-canvas retirement, and first-run precover

### Fixed — changed points no longer leave an obsolete heat map looking finished
- A real point change now follows the explicit visual/data order **cancel obsolete heat work → apply the point mutation → hide the now-invalid heat map → resolve cache or generate replacement heat**.
- v1.2.7 remains the cancellation owner, so physical worker termination still happens before the reading is mutated. v1.2.8 wraps that established contract and hides the derived surface only after the new point value is authoritative.
- The protected v1.2.2 permanent MapLibre heat source/layer are **not removed or recreated**. v1.2.8 clears the user-visible heat state by hiding the existing canonical layer in place, then the next valid cached/generated frame uses the same flickerless presenter to make it visible again.
- Point deletion and heat-affecting settings application use the same cancel/mutate/clear/refresh boundary.
- v1.2.8 requests an immediate regular-heat sync after the clear so a replacement/cache restore does not have to wait for the legacy 900 ms maintenance interval.

### Fixed — obsolete canvases stop being retried every 900 ms
- The v1.2.7 field log showed repeated `heatmap.v127-stale-canvas-suppressed` entries at roughly 0.9-second spacing even after an old generation was dead. The source was traced to the legacy v1.1.1 regular heat engine: its 900 ms `syncSurface()` maintenance loop unconditionally calls `ensureDisplayedRaster()` and can retain/re-offer its previous `displayedCanvas`.
- v1.2.8 retires the old virtual canvas-source/layer records and cancels pending legacy presentation verification/commit timers as soon as a new authoritative surface mutation occurs.
- A lightweight retired-canvas admission guard sits ahead of the v1.2.7 provenance guard. If the legacy maintenance loop tries to re-offer a retired canvas, it is stopped immediately rather than repeatedly entering the full stale-provenance/logging path.
- The immutable v1.2.7 provenance guard remains installed as a correctness safety net for any stale canvas that did not come through the retired legacy path.

### Fixed — fresh install stays covered through storage selection startup
- The first-run recovery curtain is now armed from the head-loaded startup gate **before the normal workspace body can paint** on a genuinely fresh Android install.
- When Terms of Use is accepted, that same cover is renewed immediately before the existing first-run storage controller presents the storage choice/folder picker. This closes the brief workspace flash that could occur between the native legal screen and project-storage selection.
- Existing installs with project/local state do not take the fresh-install precover path.
- The historical recovery **6-second maximum reveal remains intact** for ordinary map startup. The map-readiness preference still does not continuously re-arm that safety timer. The existing first-run directory-selection controller may continue renewing the hold while storage selection/recovery is actively unresolved, as before.

### Performance / diagnostics
- New markers identify the authoritative post-mutation boundary, legacy presentation retirement, canonical heat hiding, immediate replacement refresh, and the first suppressed retry from a retired canvas.
- This build keeps the v1.2.7 sequential **99 → 297 → 891** generation strategy because the v1.2.7 field log showed materially lower renderer/WebView scheduling delay and faster 99/297 completion than the prior co-generated 99+297 path.

### Protected behavior unchanged
- The v1.2.2 completed-canvas flickerless presentation architecture and its maintenance/change-control warning remain in force. v1.2.8 does not recreate the canonical heat source/layer.
- IDW²/local-surface interpolation math, color calculation, 99 / 297 / 891 resolutions, final 891 cache format, project schema, GPS calculations, Project Comparison math, and imagery sources are unchanged.

### Changed
- Android DEV package is **version 1.2.8 / build 100** and installs separately from stable.

### DEV verification
- Change a measured point while 297 or 891 is running. The old worker should terminate first, the numeric/grid state should update, and the old heat map should disappear immediately rather than remaining visible until replacement heat arrives.
- On an uncached new surface, confirm the heat map remains blank until the new 99 appears, then progresses 99 → 297 → 891 with the existing flickerless completed-frame handoffs.
- Change a point away from a value and then back to an exact surface with a valid final 891 cache. The heat should blank on mutation and the cached 891 should return without a stale lower tier repainting over it.
- Inspect diagnostics after several point changes. Repeated ~900 ms `heatmap.v127-stale-canvas-suppressed` spam from the same retired canvas should be gone; at most the new v1.2.8 retired-retry marker should appear once per retired canvas.
- Clear app data/reinstall. Confirm Terms of Use transitions directly into the covered storage-choice/durable-folder flow without the normal workspace flashing first.
- Confirm ordinary startup still reveals by the base-map render when available, with the historical 6-second safety reveal still able to win on a deliberately slow/non-rendering map.
- Confirm heat transitions remain flickerless and the v1.2.2 permanent source/layer are never recreated.

---

# Pad Grade Mapper v1.2.7 — DEV BUILD

## v1.2.7 — point-mutation cancellation, sequential heat generation, and startup visual gating

### Fixed — point changes cancel obsolete heat work before anything else
- Saving a changed rod reading now makes heat-generation cancellation the first heat-related operation. The currently owned regular generation is invalidated before the reading mutation can start replacement heat work.
- Point deletion and settings application use the same mutation-first cancellation boundary.
- Every physical regular-worker termination is now diagnostic-visible with project, tier, generation, age, forwarding state, and cancellation reason. This closes the v1.2.6 observability gap where an older owner could terminate a worker without leaving an auditable v1.2.6 termination marker.
- Project switching continues to cancel the outgoing generation, and v1.2.7 additionally cancels any queued-but-not-yet-forwarded regular tier owned by the superseded project/surface.

### Changed — regular heat tiers are sequential for this DEV evaluation
- For an uncached active surface, the regular heat pipeline is now **99 → 297 → 891** rather than starting 99 and 297 together.
- The 297 request is held without forwarding raster work until the current 99 tier completes. If 99 discovers an exact valid final-891 cache, the queued 297 request is terminated without ever reaching the raster worker.
- The existing final 891 behavior remains deferred until 297 completes.
- New diagnostics report queued 297 work, queue wait time, release after 99, cache-hit cancellation, and worker forwarding so this DEV build can be compared directly against the prior co-generated 99/297 behavior.
- This is intentionally a performance experiment in v1.2.7; interpolation math, tier dimensions, and color calculation are unchanged.

### Fixed — stale completed rasters cannot reappear after a surface change
- Completed regular canvases are now bound to immutable project + exact surface-key + generation provenance before they may feed the legacy canvas-source compatibility path.
- Reuse of that same canvas is permitted only while its provenance still matches the active project/surface/generation. After a point changes, the old canvas can no longer be re-added by a later layout/visibility repair.
- This specifically prevents the v1.2.6 failure where the correct cached 891 could be restored after returning a point to its original value and then an older 297 canvas could reappear and overwrite it.
- Exact cached 891 canvases remain authoritative for their exact project/surface key. A cache hit can therefore restore the finished 891 while obsolete lower-tier work is cancelled instead of repainting afterward.

### Changed — first-install storage setup stays covered
- On a clean Android install, Pad Grade may continue preloading local code/layout underneath the native Terms of Use screen, but the normal workspace is now covered before the legal screen releases.
- The first-run storage choice/native durable-folder flow therefore occurs before the normal Pad Grade workspace can become visible. Cancelling the Android folder picker returns to the storage choice while the workspace remains covered rather than exposing a partially initialized layout.
- Existing installs with an already valid durable folder continue through normal recovery without an unnecessary folder prompt.

### Changed — startup prefers a rendered base map while retaining the 6-second safety reveal
- During recovery, v1.2.7 prefers to keep the startup cover in place until the base MapLibre map has produced a real rendered frame, rather than releasing as soon as project/grid state is ready.
- The historical recovery **6-second maximum reveal** remains in force. If the base map has not rendered by that deadline, the failsafe is allowed to reveal the app rather than leaving an indefinite curtain.
- Existing durable-folder/setup behavior remains unchanged: while the user is still choosing or resolving storage, the setup flow may call the recovery `begin()` primitive again, intentionally renewing the same 6-second timer.
- The v1.2.7 map-readiness gate itself does not re-arm that failsafe and does **not** wait for heatmap, GPS fix, NAIP refinement, or other secondary overlays.

### Protected behavior unchanged
- The protected v1.2.2 flickerless completed-canvas presenter is unchanged. v1.2.7 operates upstream by controlling worker ownership and admission of completed legacy canvases; it does not recreate or replace the permanent MapLibre heat source/layer.
- IDW²/local-surface interpolation math, color calculation, 99 / 297 / 891 resolutions, final 891 cache format, project schema, GPS calculations, Project Comparison math, and map imagery sources are unchanged.

### Changed
- Android DEV package is **version 1.2.7 / build 99** and installs separately from stable.

### DEV verification
- Change a measured point while 297 or 891 is still running. Diagnostics should show `heatmap.v127-mutation-cancel-first` before the new generation and physical termination of obsolete work.
- Make several rapid point changes. Only the newest surface generation should continue consuming regular heat CPU.
- For an uncached surface, confirm diagnostics show 297 queued behind 99 and released only after current 99 completes; 891 should still begin after 297.
- Change a point away from a saved value and then back to the exact original value. The valid cached 891 should return, 297 should be skipped/cancelled, and no stale 99/297 canvas should overwrite the restored 891.
- Reinstall/clear app data and confirm the sequence is Terms of Use → storage choice/durable folder picker → recovery/init → normal workspace, without the workspace flashing in between.
- On recovered startup, confirm the cover drops when the base map renders if that occurs first, but also confirm the historical 6-second maximum reveal still releases the cover on a deliberately slow/non-rendering map. During directory selection, renewed recovery begins may extend that window as before.
- Confirm heat transitions remain flickerless and the v1.2.2 permanent source/layer are never recreated during tier changes.

---

# Pad Grade Mapper v1.2.6 — DEV BUILD

## v1.2.6 — active heat-generation cancellation and cache-aware worker ownership

### Fixed — stale heat-map generations are actively terminated
- Project switching no longer relies on merely ignoring stale worker results. Once the outgoing project overlays are confirmed hidden, v1.2.6 actively cancels the outgoing regular heat generation and terminates every still-owned 99 / 297 / 891 worker.
- The lifecycle controller maintains a single active regular generation identity and enforces at most one active worker for each tier in that generation. If a duplicate same-tier worker is requested, the older worker is terminated instead of allowing two copies to continue consuming CPU.
- Surface-generation replacement also cancels the previous generation before admitting the new one.
- New diagnostics expose generation ownership, duplicate-tier prevention, explicit worker termination, generation cancellation, and a runtime invariant check showing the number of active identities/jobs.

### Fixed — final 891 cache gating survives the v0.7.8 worker redirect
- The v1.1.3 cache controller originally recognized only the old `heatmap-raster-worker-v073.js` URL. The active v0.7.8 surface layer redirects that worker to `heatmap-raster-worker-v078.js`, which meant the v1.1.3 cache/preemption wrapper could fail to identify the redirected worker as heat work.
- v1.2.6 explicitly repairs that worker identity after redirection. The existing v1.1.3 cache path can therefore again prove a valid cached 891 before native 99/297 raster work is posted.
- When the cached final 891 is valid for the active project/surface, lower-tier 99/297 requests terminate through the cache-hit path instead of generating redundant smaller rasters.
- Restoring the v1.1.3 heat-worker identity also restores its foreground-vs-background preemption behavior, preventing background cache generation from competing with a newly requested foreground regular heat generation.

### Changed — Projects dialog waits only for outgoing removal
- v1.2.5 held the Projects dialog until the replacement project had been applied and then waited two more paint frames. That was stronger than intended and could make the chooser remain visible while replacement heat work continued.
- v1.2.6 makes the original boundary explicit: after the outgoing grid/heat overlays are hidden, the app waits two animation frames so that cleared state is painted, then closes the Projects dialog.
- The dialog does **not** wait for target heat generation, target heat presentation, or target-project completion before it is allowed to close.

### Protected behavior unchanged
- The protected v1.2.2 flickerless completed-canvas presentation remains unchanged: no canonical heat source/layer recreation was introduced.
- IDW²/local-surface interpolation math, color calculation, 99 / 297 / 891 resolutions, final 891 cache format, project schema, GPS behavior, Project Comparison math, and map imagery behavior are unchanged.

### Changed
- Android DEV package is **version 1.2.6 / build 98** and installs separately from stable.

### DEV verification
- Start a project with an uncached heat map and switch projects while 99/297/891 work is still running. Diagnostics should show `heatmap.v126-generation-cancelled` and `heatmap.v126-worker-terminated`; no outgoing worker should continue after `project.switch-outgoing-hidden`.
- Repeatedly trigger redraw/switch activity and confirm `heatmap.v126-generation-invariant` remains `ok: true`, with one active generation identity and no duplicate tier ownership.
- Reopen a project with a valid final 891 cache. Diagnostics should show `heatmap.v126-lower-tier-skipped-final-cache` for lower tiers rather than native lower-tier raster generation.
- Switch projects and confirm the chooser disappears after the outgoing overlays are painted away; it must not remain on screen waiting for the replacement heat map.
- Confirm the heat map still progresses/appears with no blank flash or flicker and that the v1.2.2 permanent presentation source/layer remains intact.

---

# Pad Grade Mapper v1.2.5 — DEV BUILD

## v1.2.5 — renderer-pressure cleanup and project-switch visual boundary

### Fixed — diagnostic logger no longer rewrites the entire saved log
- The v1.2.4 callback instrumentation showed that Android file I/O itself was usually fast while the large delay accumulated after `WebView.evaluateJavascript()` had already been invoked. In the worst captured case, the project-index read spent only about **58 ms** doing native I/O but about **1.52 seconds** waiting for JavaScript/WebView dispatch.
- The same diagnostic period showed matching main-thread timer stalls, which made the diagnostic logger itself a likely contributor: every 750 ms it was reading the entire saved diagnostic array from `localStorage`, parsing it, appending the new rows, serializing the entire array again, and synchronously replacing the whole stored log.
- v1.2.5 removes that whole-log rewrite path. Diagnostic entries are now appended in small batches to a local **IndexedDB** object store. The active JavaScript thread keeps only a small pending batch; the full text log is assembled only when **Export diagnostic log** is requested.
- IndexedDB persistence remains entirely local to the WebView and does not use the Pad Grade native project-file bridge or SAF project folder.
- If IndexedDB is unavailable, diagnostics fall back to a bounded in-memory log rather than returning to synchronous whole-log `localStorage` rewrites.
- The old `padGradeDiagnosticLogV1` localStorage value is no longer read or rewritten during normal startup/runtime. It is removed only when the user explicitly clears the diagnostic log.

### Changed — obsolete heat PNG encoding removed from the active v1.2.2 presentation path
- **The protected v1.2.2 flickerless heat-map presentation architecture is unchanged.** Completed heat canvases are still copied into the permanent MapLibre canvas-backed source, and the existing texture is refreshed in place without recreating the canonical source or layer.
- The older v1.2.0 compatibility controller was still synchronously calling `canvas.toDataURL('image/png')` for every completed heat raster even though v1.2.2 immediately resolved that frame back to the already-complete canvas and never needed the PNG bytes.
- v1.2.5 replaces that redundant full-canvas PNG encoding with a tiny unique **frame identity token** whenever the v1.2.2 direct-canvas runtime is active. v1.2.2 uses the token only to identify the matching completed canvas and then performs the same protected completed-canvas copy/texture-refresh sequence.
- The historical v1.2.0 PNG path remains as a fallback when the direct-canvas runtime is not active, preserving the older standalone regression tests.
- This change is specifically authorized as a renderer-pressure optimization; it does **not** alter interpolation, color calculation, tier ordering, source/layer lifetime, or flickerless presentation semantics.

### Fixed — Projects dialog stays up until the replacement project is staged
- Project switching already hid/cleared the outgoing grid and heatmap before calling `dialog.close()`, but both operations happened in the same JavaScript task. The browser could therefore close the chooser before it ever painted the cleared outgoing state, briefly revealing the old project's grid/heatmap underneath.
- v1.2.5 holds the Projects dialog open through the successful in-place project apply. After the new project has been staged, it waits through a **two-animation-frame paint barrier** before actually closing the dialog.
- A failed project load/apply cancels the held close and leaves the chooser available instead of revealing a partially switched map.
- This sequencing change is outside the protected v1.2.2 heat presentation block; it changes only when the modal is allowed to uncover the map.

### Diagnostics retained
- The v1.2.4 native callback stage measurements remain enabled: JS→native bridge call, native file-executor queue wait, native I/O, Android UI-post wait, `evaluateJavascript()`→JS dispatch, and callback/microtask handoff.
- New logs should now be substantially less affected by the logger's own persistence work, making the remaining WebView/renderer scheduling delays much more representative of the actual app workload.
- New v1.2.5 markers identify IndexedDB diagnostic storage, lightweight heat-frame token transport, held project-dialog close, and close-after-paint completion.

### Unchanged / protected behavior
- v1.2.2 permanent completed-canvas heat presentation and its **no source/layer recreation** requirement remain in force.
- The maintenance/change-control warning around the flickerless heat presentation remains in place: changes to that architecture require specific developer agreement and dedicated no-flicker regression coverage.
- IDW² interpolation math, measured-point/color-scale math, 99 / 297 / 891 worker resolutions, final 891 project heat-cache format, project schema, GPS behavior, Project Comparison calculations, and map imagery behavior are unchanged.
- The temporary Auto / 99 / 297 / 891 diagnostic resolution picker remains retired.

### Changed
- Android DEV package is **version 1.2.5 / build 97** and installs separately from stable.

### DEV verification
- Open a measured project and confirm the heat map still progresses through Auto with **no blank flash or flicker**.
- Switch projects several times. The Projects chooser should remain covering the map until the outgoing grid/heatmap cannot be exposed; when it closes, the replacement project's map/grid should be the content underneath.
- Use the app normally for a few minutes with diagnostic logging enabled, then export a diagnostic log. Confirm the header reports **IndexedDB append log** and compare the remaining `webViewEvalToJsMs` / timer-lag values with v1.2.4.
- In the diagnostic log, completed active heat frames should report lightweight canvas-token transport with `encodedChars: 0`; there should be no active-path full heat PNG encode times while v1.2.2 direct-canvas presentation is installed.
- Open Project Comparison and confirm its heat map remains flickerless and visually correct.
