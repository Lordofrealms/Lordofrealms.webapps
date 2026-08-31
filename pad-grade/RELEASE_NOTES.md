# Pad Grade Mapper v1.2.4 — DEV BUILD

## v1.2.4 — diagnostic build

### Diagnostic — native file callback queue timing
- This build does **not** change file ordering, file concurrency, project persistence semantics, or the v1.2.2 heat-map presentation path. It adds timing markers so the long callback delays seen in field diagnostics can be split into the stage that actually consumed the time.
- Each native file request now records the synchronous JavaScript → Android bridge-call time, wait time in the existing single-threaded `PadGradeFileIO` executor, actual SAF/file I/O time, wait time after posting the completed result to the Android/WebView UI thread, and the delay from `evaluateJavascript()` invocation until the JavaScript completion callback actually begins.
- The JavaScript completion path also records the remaining callback/microtask handoff time.
- Native queue diagnostics include the operation/file labels that were already ahead of a request when it was queued. If, for example, a settings write is waiting behind a heat-cache read and project-index write, the diagnostic log can now show that directly.
- `file.callback-stage-breakdown` is emitted for a file request with at least 250 ms total elapsed time, or when an individual queue/dispatch stage reaches 100 ms.

### DEV heat-map resolution inspector retired
- The temporary **Auto / 99 / 297 / 891** diagnostic switcher is no longer shown or user-accessible.
- The app remains in normal **Auto** heat-map operation. Historical inspector code and regression tests remain in the repository for reference, but the field UI is retired now that the resolution investigation is complete.

### Heat-map presentation change control
- The v1.2.2 permanent completed-canvas presentation remains unchanged. It keeps the previous complete raster visible until the next complete raster is ready, then refreshes the existing MapLibre texture without recreating the canonical heat source/layer.
- A prominent maintenance/change-control note now surrounds that presentation implementation. It records that this architecture was reached after substantial field debugging involving partial-canvas painting, source/layer flicker, MapLibre ImageSource request behavior, and Android WebView image-decode failures.
- The note explicitly requires **specific developer agreement before changing the heat-map presentation architecture**, plus the dedicated no-flicker regression coverage. Heat calculation/interpolation changes should stay separate from this presentation block whenever possible.

### Changed
- Android DEV package is **version 1.2.4 / build 96** and installs separately from stable.

### DEV verification
- Load a normal measured project and confirm the heat map still progresses normally in Auto with no blank flash or flicker.
- Confirm the temporary Auto / 99 / 297 / 891 resolution selector is gone.
- Switch among existing projects roughly **5–10 times**, allowing normal settings/project/index saves to occur.
- Ordinary use is enough; no special timing controls are required.
- Export one Pad Grade diagnostic log afterward. The new stage-breakdown entries should tell us whether any large delays are coming from `PadGradeFileIO` queueing, actual storage I/O, Android UI/WebView queueing, renderer/JavaScript dispatch, or the final JS callback handoff.