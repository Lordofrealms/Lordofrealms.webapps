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
