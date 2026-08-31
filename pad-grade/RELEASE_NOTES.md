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

### Changed — recovered GPS startup waits for the base map itself
- The startup/recovery cover may no longer be released merely because project state, the lower grid, or survey-grid overlays are ready when the active project is in GPS mode.
- v1.2.7 requires the base MapLibre map to reach a real rendered frame before the full cover can drop. It does **not** wait for the heatmap, GPS fix, NAIP refinement, or other secondary overlays.
- The older v1.1.1 partial-reveal CSS is explicitly overridden while the v1.2.7 full startup gate is active so the ordinary app layout cannot appear before the base map is ready.

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
- On a recovered GPS project, confirm the startup cover remains until the base map itself is rendered, but does not wait for the heatmap or GPS fix.
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