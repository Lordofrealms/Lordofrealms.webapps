# Changelog

All notable changes to Pad Grade are documented here.

Entries use **Added**, **Changed**, **Fixed**, and **Known issues**. Historical entries are backfilled only where repository or release history supports them reliably. Development-only versions are identified explicitly.

## v1.0.7 — development build

### Added
- Added a rebuildable durable folder catalog, `Pad-Grade-Project-Index.pgindex`. The index stores project filename/File ID/internal ID, schema version, project-list and comparison metadata, filesystem size/modified time, and a SHA-256 fingerprint when the full project bytes have already been read or written. The `.padgrade` project files remain authoritative; losing or deleting the index cannot lose a project.
- Added **schema 6** project files. Schema 6 writes a small `_pgHeader` as the first JSON member containing the format/version identity and lightweight catalog fields, allowing Android to inspect a new or changed project with a bounded prefix read instead of reading the complete readings payload.
- Added an explicit, tested **schema 6 → schema 5 downgrade path**. The downgrade strips only schema-6-only header/format data, resets `schemaVersion`/`version` to 5, and preserves settings, readings, reading metadata, GPS calibration, project IDs/File IDs,timestamps, status, and other schema-5-understood payload fields.
- Added cached native project-file metadata (`filename`, byte size, and last-modified time) to the existing background SAF folder index, plus bounded asynchronous project-header reads. Normal JavaScript metadata checks are served from that cache rather than making synchronous SAF calls per project.
- Added comparison-specific timing diagnostics for picker open, comparison start, overlay visibility, map style readiness, grid visibility, imagery readiness, low-resolution heat visibility, and high-resolution heat visibility.

### Changed
- Durable reconciliation now reads the tiny `.pgindex` plus the cached directory metadata first. An indexed project whose filename, size, and modified time still match takes the **zero-project-read fast path**: no full project read, JSON parse, schema migration, or File-ID rewrite is performed.
- New or externally changed schema-6 project files are identified from the bounded `_pgHeader` read. Legacy/schema-5 files are fully read only when first discovered or changed, upgraded once to canonical schema 6, and then use the metadata fast path on later reconciliations.
- SHA-256 is calculated when Pad Grade already has the complete project bytes in memory (full load/import/migration or normal durable write). Hashing is not used as a reason to reread every unchanged file.
- Copied-in files remain discoverable because the real folder listing is always compared with the rebuildable index. Missing indexed files are removed from the catalog only; unindexed files are inspected and added. Same-name external replacements are detected through changed size/last-modified metadata.
- Project bodies can remain unloaded after reconciliation. Project-list metadata is synchronized from the durable index, and a full project file is read lazily only when an operation actually needs the project body. The comparison picker uses this same shared index rather than maintaining a separate project cache.
- Project Comparison now opens from indexed metadata and fully loads only the two selected projects. The comparison screen appears before those possible durable reads complete.
- The comparison renderer now installs its final detailed grid at **MapLibre style readiness** rather than waiting for full map/imagery load. The first comparison render directly uses 6 px cut/grade/fill points, point labels from zoom 18, the foreground grid/outline ordering, and the detailed CUT / GRADE / FILL scale instead of drawing 3.5 px white points and depending on a later polling/restyle layer.
- Comparison preserves the progressive heat-map strategy: the 304-tier preview starts immediately after the grid is installed; the 888-tier refinement follows in the same worker while imagery continues independently in the background.
- Android DEV package is **version 1.0.7 / build 79**. Build 78 remains the tested v1.0.6 fixed-15%-hitbox release candidate and is not reused.
- The validated 15% GPS-map near-miss hitbox behavior from v1.0.6 is intentionally unchanged in this build.

### Fixed
- Removed the recurring durable maintenance behavior that could reread every project file only to report all of them unchanged. Routine reconciliation should now reduce an unchanged folder to one lightweight index read plus cached metadata comparison.
- Removed the comparison presentation race where the intended detailed point styling/labels/color scale could fail to attach and expose the older basic comparison grid instead.
- Removed repeated deep-loading of the complete project set during one comparison picker interaction; picker eligibility now comes from the shared project catalog and selected bodies are loaded once.

### Known issues
- This is the first DEV build that automatically upgrades durable schema-5 project files to schema 6. Test with copies/backups of representative project folders before stable promotion, including an existing folder, a clean-install folder reconnect, a project copied in from another device, and a same-filename externally replaced project.
- Verify a second reconciliation of an unchanged folder records `index.fast-match` / `zeroProjectReads` behavior and does not reproduce the previous repeated multi-file `file.read` sequence.
- Verify the comparison grid, point colors/labels, scale, probe behavior, Android Back exit, preview heat map, final heat map, and imagery on-device before stable promotion.
- The schema-5 downgrade operation is implemented and regression-tested as a rollback tool, but is not exposed as a normal user-facing button; if rollback is required, use a controlled rollback build/action rather than silently rewriting the folder during ordinary operation.

## v1.0.6 — development build

### Changed
- Promoted the GPS/MapLibre survey-point near-miss padding from the v1.0.5 field-test control to a fixed **15% of projected point-to-point spacing**. Field testing found 15% noticeably easier to hit than the original visible circles without feeling excessively large or intrusive.
- Removed the user-facing **Map grid hitbox padding** slider from **Settings → Advanced Settings**. The release-candidate runtime ignores any `mapGridHitboxPaddingPct` value left in local preferences by v1.0.5 and always uses the fixed 15% behavior.
- Removed the user-facing **Map tap diagnostics** switch and stopped loading the v1.0.4 map-tap tracer/crosshair during normal startup. Any old `mapTapDiagnosticsEnabled` preference is therefore inert in this build. The general application diagnostic timing log remains a separate existing Advanced Settings feature.
- Kept the v1.0.5 safety rules unchanged: taps directly on visible point circles use the established MapLibre layer-click path; expanded hit testing only supplements near misses; total clickable semi-axes remain capped at **45% of neighboring point spacing**; a near miss must match exactly one point; there is no nearest-point fallback or tie-breaking guess; and **Probe Surface** mode owns its taps without expanded measurement-point hit testing.
- Android DEV package is **version 1.0.6 / build 78**. Build 77 remains the adjustable v1.0.5 field-test package and is not reused.
- The lower rectangular measurement grid remains unchanged from the restored v1.0.2 baseline; the withdrawn v1.0.3 lower-grid experiment remains absent.
- This build is intended as the final DEV confirmation of the field-selected map hitbox behavior before promotion to the stable channel, assuming device verification is clean.

### Known issues
- This is still a development build. Confirm normal point-center taps, a representative set of near-miss taps a few pixels outside the visible circles, **Probe Surface**, project switching, and ordinary GPS-guided recording once more on-device before stable promotion.
- The earlier intermittent wrong-point opening was not reproduced during diagnostic testing. v1.0.6 therefore preserves the exact-one-match/dead-space safeguards rather than claiming to have corrected an unconfirmed coordinate-offset defect.

## v1.0.5 — development build

### Added
- Added a dedicated **Map tap diagnostics** switch under **Settings → Advanced Settings**. The v1.0.4 GPS/MapLibre tap tracer and temporary magenta **ML** crosshair now default **off** and can be enabled only when point-selection troubleshooting is needed. The general **Diagnostic timing log** must also be enabled for those map-tap records to persist/export.
- Added a **Map grid hitbox padding** slider under **Advanced Settings**, adjustable from **0% to 45%** with a default of **10%**. The setting is stored in local app preferences and applies to the GPS/MapLibre survey-point grid only.

### Changed
- Taps directly on a visible survey-point circle continue through the existing MapLibre layer click path unchanged. The new hitbox logic only supplements near-miss taps that land outside every rendered point circle.
- Expanded hitboxes are oriented ellipses centered on each projected survey point. Each semi-axis starts with the visible point radius (6 px normally, 9 px for the current target) and adds the configured percentage of the corresponding projected point-to-point spacing.
- The total clickable semi-axis is capped at **45% of neighboring point spacing**, even when the selected padding or zoom level would otherwise make the target larger. This preserves genuine dead space between adjacent survey points instead of letting expanded targets intentionally meet or overlap.
- An expanded near-miss tap is accepted only when it falls inside exactly one survey-point ellipse. A tap matching zero or multiple expanded targets does nothing; there is no nearest-point fallback or tie-breaking guess.
- Expanded measurement-point hit testing is disabled while **Probe Surface** mode is active so probe taps remain owned by the probe workflow.
- Android DEV package is **version 1.0.5 / build 77**. Build 76 remains the v1.0.4 diagnostic package and is not reused.
- The lower rectangular measurement grid is unchanged from the restored v1.0.2 baseline; the withdrawn v1.0.3 lower-grid experiment remains absent.

### Known issues
- The previously reported intermittent wrong-point opening was not reproduced during the v1.0.4 diagnostic test session. v1.0.5 therefore treats the new padding as a touch-usability improvement rather than claiming to fix an unconfirmed coordinate-offset fault.
- Field-test the default **10%** padding at normal working zoom by tapping both point centers and a few pixels outside the visible circles. Setting the slider to **0%** restores visible-circle-only behavior for comparison.
- If a wrong-point selection reappears, enable both **Map tap diagnostics** and the general **Diagnostic timing log**, reproduce the tap, then export the diagnostic log from **Settings → Advanced Settings**.

## v1.0.4 — development build

### Added
- Added a diagnostic-only GPS/MapLibre map-tap tracer for the intermittent condition where tapping one visible survey point can open another point's **Enter Reading** dialog.
- Each completed map tap records the raw browser/Android touch `clientX/clientY`, MapLibre's `event.point`, the screen point independently reconstructed from the touch and canvas rectangle, and the X/Y delta between those two coordinate systems.
- Tap diagnostics record the MapLibre canvas and map-container bounding rectangles, internal MapLibre viewport size, CSS/client canvas size, backing-bitmap size, device-pixel ratio, and any effective display scale between the internal viewport and visible canvas.
- For every tap, Pad Grade independently projects all configured survey-grid points into screen space and records both the point nearest the physical touch and the point nearest MapLibre's interpreted event position, along with pixel distances and X/Y offsets.
- The diagnostic records the point feature returned by `queryRenderedFeatures`, the final point shown in the **Enter Reading** dialog, and the number/identity of `openPoint()` calls associated with the same physical tap. This is intended to distinguish a canvas/event-coordinate offset from stale feature identity or duplicate historical click handlers.
- Added a temporary magenta **ML** crosshair on the GPS map for about 2.6 seconds after a tap. The crosshair is drawn at MapLibre's interpreted event point and has `pointer-events:none`, so it cannot intercept or redirect the tap.

### Changed
- Android DEV package is version **1.0.4 / build 76**. Build 75 remains consumed and is not reused.
- This build intentionally keeps the v1.0.2 map-point selection behavior unchanged: no hitbox enlargement, nearest-point fallback, touch remapping, or alternate point-selection algorithm has been added yet.
- The active development baseline was restored to the exact tested v1.0.2 runtime before adding these diagnostics; the withdrawn v1.0.3 lower-grid experiment is not part of this build.
- The page title and diagnostic runtime marker identify this package as **v1.0.4 DEV**, and the new diagnostic module is cache-busted in `index.html`.

### Known issues
- The underlying map-point misselection is intentionally **not fixed in this diagnostic build**. Reproduce several correct and incorrect point taps, then export the diagnostic log from **Settings → Advanced Settings**. The most useful entries are `map.tap-alignment`, `map.tap-open-point`, and `map.tap-dialog-result`.
- Diagnostic logging must be enabled for the tap records to persist. DEV builds default it on unless it was previously turned off in Advanced Settings.
- The temporary **ML** crosshair is diagnostic UI only and should be removed once the map hit-test issue is understood.

## v1.0.3 — withdrawn development build

### Changed
- v1.0.3 attempted to correct suspected hitbox misalignment by changing compatibility sizing rules for the **lower rectangular measurement grid**.

### Known issues
- Field review established that the reported problem is on the **GPS/MapLibre survey-point grid**, not the lower rectangular measurement grid. The v1.0.3 runtime changes were therefore withdrawn and completely rolled back before v1.0.4 work began.
- No v1.0.3 lower-grid behavior is carried forward into the active development branch.

## v1.0.2 — development build

### Changed
- The GPS source badge and state indicator now follow the shared geolocation provider's authoritative runtime state. The map's display-only watch can no longer promote the visible provider back to **Precision Location** after the shared provider has already failed over to Android/WebView native geolocation.
- The map listens for the existing `padgrade-location-fallback` event and refreshes the source badge immediately when native fallback begins instead of waiting for a later map polling cycle or GPS fix to repaint the header.
- Native fallback status preserves the provider's current **WAITING**, **ACTIVE**, or **ERROR** state in the map header rather than synthesizing a Precision-state label from the companion availability flag.
- The v1.0.2 GPS map runtime is cache-busted so upgraded DEV installs cannot continue running the older source-label behavior from WebView cache.

### Fixed
- Fixed the condition where Precision Location could correctly fail over to native GPS and continue supplying positions while the map header still displayed **Precision Location** or **STOPPED**.
- Prevented the map's secondary/display GPS watch from overwriting `PadGradePlatform.lastLocationMeta` with a Precision Location provider after native failover was already authoritative.
- Added a regression gate that syntax-checks both the provider and map layers and verifies the native-provider guard and fallback-event UI refresh remain present.

### Known issues
- This remains a development build for device verification. Test by starting GPS with Precision Location available, causing the companion to stop/fail, and confirming that fixes continue through native GPS while the badge changes promptly to **Native GPS** and stays there for the remainder of that GPS subscription session.

## v1.0.1 — development build

### Changed
- When Precision Location becomes unavailable after a GPS session has already started, Pad Grade now keeps the same active GPS requests and watches alive and transfers them to Android/WebView native geolocation instead of requiring the user to leave and re-enter GPS mode.
- Native fallback is scoped to the current GPS subscription session. Once all GPS requests and watches are released, a later GPS session can try Precision Location again.

### Fixed
- Fixed the state where Precision Location could report **STOPPED** after starting while Pad Grade remained subscribed to the Precision-backed geolocation proxy indefinitely, leaving the map on **Waiting for current GPS position…** instead of falling back.
- Precision start failures, IPC/service errors, service STOPPED/disconnect events, and first-fix timeouts now trigger transparent native GPS fallback when WebView geolocation is available.
- Late Precision Location callbacks are ignored after failover begins so a dying or restarting companion cannot reclaim the stream while native GPS is active.
- Fallback uses the existing Android/WebView location-permission path, so a missing native location grant can be requested normally.

### Known issues
- This remains a development build for device verification. Test by starting GPS with Precision Location available, then stopping or failing the companion and confirming the source badge changes to **Native GPS** and fixes continue without toggling GPS mode.

## v1.0.0 — development build

### Added
- Added calculator-specific diagnostic timing spans for total target calculation, surface construction/cache reuse, minimum-disturbed-area search, and earthwork passes so Android device logs can show exactly where grading-calculation time is spent.

### Changed
- The balanced cut/fill and minimum-disturbed-area calculator keeps the same 90-resolution equal-area sampling grid and the same global inverse-distance-squared (IDW²) surface values, but replaces the old per-sample Delaunay-triangle coverage search with the equivalent convex-hull coverage test.
- Target-independent surface samples, sorted sample elevations, and the neutral target are cached until measured readings or pad/grid geometry actually change. Changing only target elevation or tolerance can reuse the already-sampled ground surface.
- Applying either suggested target now reuses the result that was just calculated instead of immediately rebuilding and rescanning the same surface a second time.

### Fixed
- Removed unnecessary geometry and duplicate recalculation work from the **Net-zero earthwork target** and **Minimum disturbed-area target** workflow without lowering calculation resolution or changing the interpolation model.

### Known issues
- This remains a development build for device verification. Diagnostic logging remains enabled by default in DEV so calculator timing and cache-hit behavior can be compared with the prior implementation before stable promotion.

## v0.9.9 — development build

### Added
- Added first-run legal-preload diagnostics so the timing log can distinguish local layout/grid preparation performed while the Terms screen is open, map/network work intentionally deferred by the legal gate, and the acceptance release point.

### Changed
- On a true first run, the native Terms screen still appears first, but the underlying WebView can begin local DOM, CSS, grid, worker, and layout preparation shortly afterward while the user is reading the Terms.
- Durable-folder choice and project-storage access remain blocked until the Terms are accepted.
- MapLibre and map/network startup remain blocked until acceptance, so legal-preload time is used only for local application/layout preparation rather than location-dependent network activity.
- Accepting the Terms releases the storage and map gates immediately; unusually fast acceptance falls through to the normal startup path instead of waiting for preload work to finish.

### Fixed
- Reduced avoidable post-TOS startup delay by moving safe local layout/bootstrap work into the time the app was previously idle behind the native legal notice.

### Known issues
- This remains a development build intended to verify that Terms acceptance proceeds directly into the durable-folder decision with the underlying app already laid out and without starting storage or map/network work before acceptance.

## v0.9.8 — development build

### Changed
- Durable-folder recovery now releases the **Restoring saved project…** curtain as soon as the recovered project has been applied, the lower grid has painted, and any saved GPS survey grid exists. Final grid-font sizing, MapLibre render/idle state, raster imagery, heat-map work, full-folder reconciliation, and File-ID maintenance are no longer reveal prerequisites.
- Full durable-folder reconciliation and File-ID maintenance are deferred until after the visible project is usable and an idle slice is available instead of starting immediately behind first paint.
- The v0.9.5 MapLibre survey-grid fast path is now the single active lightweight grid owner. Generic lower-grid/GPS UI calls use signature-based no-op refreshes, transient style readiness gets only a bounded animation-frame retry, and the older parallel polling overlay is no longer loaded.
- Identical lower-grid rebuild requests from legacy startup timers are collapsed for a short startup window while real project, settings, reading, and unit changes still rebuild immediately.
- The fixed bottom control bar is measured at runtime and the page reserves that measured height plus scroll clearance so the final project/grid controls cannot sit underneath it.

### Fixed
- Recovery now treats an existing six-character durable filename prefix as the recovered project's authoritative File ID when the project payload does not yet contain one, preventing recovery from inventing a second ID for the same project.
- Durable project writes/deletes issued through the asynchronous file bridge are temporarily rejected while first-run/recovery-curtain restoration is still active, preventing partially initialized runtime state from overwriting or duplicating the recovered project before it is painted.
- A genuinely empty selected durable folder explicitly releases the recovery write lock before its first default project is created, preserving the v0.9.7 empty-folder first-use behavior.
- Removed the v0.9.7 visual-settle path that could hold the recovery curtain until a long safety timeout even though settings, the active project, and the lower grid were already available in well under a second.
- Removed the parallel MapLibre grid polling/styledata workload and immediate post-recovery maintenance scheduling that could starve WebView timers and delay otherwise-fast native file-operation callbacks by many seconds.

### Known issues
- This remains a development build for device verification. Diagnostic logging stays enabled by default in DEV; recovery curtain duration, main-thread stall entries, file callback delay, project switching, and the bottom-grid/button clearance should be checked on-device before stable promotion.

## v0.9.7 — development build

### Changed
- Durable-folder recovery now keeps the **Restoring saved project…** curtain in place while the recovered active project, lower grid, and saved GPS map grid settle, then reveals after the visible state is ready instead of relying on the earlier short fixed timeout. Background folder reconciliation and File-ID maintenance do not hold the curtain.
- Project switching now gives the small MapLibre survey-grid refresh the earliest usable point after the new fitted GPS rectangle is reconstructed. The fast-grid owner attempts the GeoJSON update against an existing style even when `isStyleLoaded()` is briefly false after a style mutation, with a retry if MapLibre genuinely rejects the update.
- Background durable File-ID/filename reconciliation is single-flight so repeated startup/project events cannot launch overlapping migration passes. Already-canonical files are left alone instead of being rewritten unnecessarily.

### Fixed
- Fixed first-install recovery creating a default project before the user had resolved the durable-folder choice. A minimum-recovery attempt made before a folder exists is no longer cached as a permanent `ready:false` result.
- Choosing an actually empty durable folder is treated as legitimate first use: the initial project is created only after that folder has been selected and becomes its first saved project. A folder containing Pad Grade state still attempts recovery instead of silently replacing it with a new default.
- Restored the startup curtain behavior after the v0.9.6 async recovery work so users do not see intermediate project/grid/map repaint flashes while a recovered project is still settling.
- Reduced cases where a project change could display the new heat map before the new map grid merely because MapLibre transiently reported its style as not loaded immediately after old overlay removal.

### Known issues
- This remains a development build for device verification. Diagnostic logging remains enabled by default in DEV; if map-grid ordering or startup settling still looks wrong, export the diagnostic log from **Settings → Advanced Settings** for timing analysis before stable promotion.

## v0.9.6 — development build

### Added
- Added a local diagnostic timing log for startup, durable-folder recovery, project switching, map/grid refreshes, heat-map completion, native file operations, and main-thread stalls. DEV builds default logging **on** unless the user has explicitly turned it off; stable promotion will change the default to **off** while retaining the Advanced Settings toggle, export, and clear controls.
- Added asynchronous Android durable-file read/write/delete bridge calls and a minimum-recovery path that restores only the durable settings and active project needed to become usable before full folder reconciliation continues in the background.

### Changed
- The worker-based lower-grid renderer is now the authoritative grid owner. Legacy v0.4/v0.5 compatibility renderers no longer reclaim `window.renderGrid` or run old DOM-measurement resize work after the worker grid takes ownership.
- Project switching now refreshes the new MapLibre grid immediately after the selected project's four-corner GPS fit is reconstructed, before lower-grid, GPS UI, stats, or heat-map follow-up work.
- Durable settings/project mirrors now use local state immediately and perform their SAF writes asynchronously rather than holding the WebView on document-provider I/O.

### Fixed
- Removed remaining startup/switch persistence paths that could synchronously read or rewrite durable settings/projects on the WebView thread.
- Removed a cached-folder `DocumentFile.isFile()` check that could re-query the SAF provider once per cached entry even after the directory index had already been built in the background.
- A configured durable-folder URI that cannot be indexed no longer leaves recovery waiting indefinitely; recovery is released and the failure is recorded in the local timing log.
- Fixed a latent syntax error in the new diagnostic module that was exposed after v0.9.6 modules were added to the normal CI syntax/package gates.
- Expanded Android CI to syntax-check and APK-verify the v0.9.5/v0.9.6 startup, grid-worker, diagnostics, and async-recovery modules so these files cannot silently escape validation again.

### Known issues
- This remains a development build intended for device timing verification. After reproducing any remaining slow startup or project switch, export the diagnostic log from **Settings → Advanced Settings** so the remaining delay can be localized before stable promotion.

## v0.9.5 — development build

### Changed
- Added a dedicated MapLibre survey-grid fast path so the small grid/outline/route/point GeoJSON family installs or refreshes as soon as the map style is ready rather than waiting on raster imagery or heat-map interpolation.
- The fast grid refresh is placed ahead of lower-grid and GPS UI work and tolerates duplicate legacy source/layer attempts while compatibility modules finish loading.

### Fixed
- The **Enter Reading** dialog now tracks Android's visual viewport and stays at the top of the visible area when the software keyboard opens, keeping the reading controls and lower dialog actions reachable.
- Project-grid refreshes are wrapped around later compatibility replacements of `renderGrid` and `updateGpsUI`, reducing the chance that a legacy owner can make the map grid arrive late during startup or a project change.

### Known issues
- This remained a development build for device verification of map-grid ordering, lower-grid timing, and keyboard behavior; the follow-on v0.9.6 build adds detailed timing instrumentation and further async durability fixes.

## v0.9.4 — development build

### Changed
- Project switching now keeps the existing MapLibre map, USGS imagery, controls, and live GPS marker mounted while completely removing the old project's grid, outline, route, point, and label sources/layers before creating the new project's overlay family.
- Lower-grid text sizing now runs in a dedicated Web Worker using `OffscreenCanvas.measureText()`. Project cells paint immediately at a provisional physical size while map, heat-map, GPS, and other UI work continue in parallel; the completed worker result causes one CSS-only final size/font adjustment rather than a second cell rebuild.
- Normal startup starts a lightweight grid-sizing worker immediately after `init.js` restores the active project. The authoritative grid owner still takes control only after the legacy project-management modules finish, and can consume the already-completed early measurement instead of measuring twice.

### Fixed
- Prevented old MapLibre GeoJSON grid/source state from surviving a project switch and appearing over the new project's heat map.
- Removed the older stability gate's late authoritative-grid rerender, which could make the lower grid become the final screen element even after its data was already available.
- The lower-grid worker is started as one of the first project-load jobs, so its result can already be waiting by the time the rest of the project display settles.

### Known issues
- This remains a development build intended for device verification of repeated switching between projects with different GPS grids and of lower-grid first-paint/final-resize timing before stable promotion.

## v0.9.3 — development build

### Changed
- First-run durable-folder recovery now paints the black **Restoring saved project…** curtain before Android's native folder picker is launched. The picker is opened only after WebView has had two animation frames to commit the curtain, so returning from the picker should not expose intermediate recovery/indexing changes.
- Opening a project now closes the Projects dialog immediately, gives that close one paint frame, and then performs the existing in-place project-state/overlay swap. The surrounding document, map, imagery, controls, and other display groups remain mounted.

### Fixed
- Replaced the lower grid's per-string hidden-DOM measurement loop with canvas `measureText()` while preserving the existing physical-aspect/font-fit solver. This removes hundreds of forced layout reads that could delay an ordinary 9×9 bottom grid by several seconds on Android WebView.
- Project-list rows now reserve the complete File-ID line in the head-loaded stylesheet before the project manager can paint its first row. The later File-ID placeholder and final ID text are absolutely positioned inside that already-reserved slot, so File-ID hydration should no longer resize project boxes or move their buttons.
- Cancelling the native durable-folder picker removes the pre-painted recovery curtain and returns to the explanatory storage-choice dialog.

### Known issues
- This remains a development build intended for device verification of recovery-cover timing, project-list layout stability, and lower-grid render latency before stable promotion.

## v0.9.2 — development build

### Changed
- During a true first-run durable-folder recovery, the black **Restoring saved project…** curtain now begins immediately when Android returns the selected folder, before the background SAF index/reconciliation work starts. It remains through the saved-project recovery reload; an empty selected folder drops the temporary cover before creating/loading a new default project.
- Ordinary project Open actions now switch in place. The existing document, MapLibre object, USGS imagery, map controls, live GPS marker, cards, legends, and other static display groups stay mounted. Only project-owned state and overlays are replaced.
- The lower grade-grid cells are rebuilt for the selected project's dimensions/readings, while the surrounding grid card and other UI groups remain intact.

### Fixed
- Removed the v0.9.1 project-switch `location.reload()` path that unnecessarily destroyed and reconstructed the entire display and GPS map.
- Project switching now clears the old project's GPS grid/route/outline, heat-map canvas sources, and probe state before applying the selected project, then writes the new geometry into the same existing MapLibre sources immediately.
- The new project's heat-map refresh runs immediately after the state swap so the surface owner cancels any old worker before queued old-project output can repaint.
- Switching persists the newly selected project as the durable settings `lastProjectId`/`lastProjectName` when the durable folder is ready, preserving the expected in-work project for a later reinstall/recovery.
- Clicking **Open** on the already-current project no longer falls through to the older reload-based project manager.

### Known issues
- This remains a development build intended for device verification of immediate recovery-cover timing and repeated in-place switching between projects with different grids, GPS locations, and heat maps before stable promotion.

## v0.9.1 — development build

### Changed
- Restored the recovery curtain to the stable v0.8.0 semantics and wording: **Restoring saved project…** is shown only for the intentional reload after an existing durable project folder has been recovered.
- Ordinary app startup and ordinary project-to-project switching no longer show a loading/recovery curtain.

### Fixed
- Project switching still uses an atomic reload boundary, but now carries only the intended project ID through session storage. The new document applies that target in its head before project managers run, preventing old/new project layer mixing without reusing the durable-recovery curtain.
- Removed the v0.9.0 behavior that armed the curtain for every existing-project startup and for each project switch.
- Removed the late durable-reconciliation path that could independently arm a project-loading curtain after the screen was already visible.
- Cache-busted the recovery, first-run, project-switch, startup, and last-project-restore modules so an upgraded DEV install cannot keep the v0.9.0 curtain behavior from WebView cache.

### Known issues
- This remains a development build intended for device verification of first durable-folder recovery and repeated project switching before stable promotion.

## v0.9.0 — development build

### Changed
- A clean Android install now explains durable project-folder storage and offers **Choose durable folder** or **Not now** before Android's directory picker is opened. Cancelling the picker returns to that choice instead of silently creating a project or forcing another picker.
- Existing-project startup and project-to-project switching again use a brief black **Loading project…** curtain so intermediate settings/grid/map states are not painted to the user. The curtain waits only for local project/layout settling and does not wait for USGS imagery.

### Fixed
- Project switching now carries the intended target project through the reload in session storage and reapplies that target in its head before any project manager or autosave owner can read active-project state.
- Prevented the older `beforeunload` autosave path from effectively switching the new document back to the project being left.
- Durable reconciliation now treats an already-selected local active project as authoritative; a stale durable `lastProjectId` is only a fallback when no active project exists. This prevents old-grid/new-heat-map mixtures after switching projects.
- Durable recovery of a newer copy of the current project is also covered briefly while its settings/grid/map state is applied, avoiding visible multi-stage repaint.

### Known issues
- This remains a development build intended for device verification of clean-install storage choice and repeated switching between projects with different grids/heat maps before stable promotion.

## v0.8.9 — development build

### Added
- Added automatic detection/retry for a healthy MapLibre canvas whose USGS raster imagery has failed, with a visible retry status while the project grid and grade data remain usable.
- Added a true Android first-install folder decision: no default project is created until the user cancels/declines the durable-folder picker or selects an empty folder.

### Fixed
- Restored the comparison presentation after the asynchronous MapLibre startup change: comparison points again use CUT/GRADE/FILL colors and labels, the averaged grid remains foreground geometry, and the comparison heat-map color key is shown underneath.
- Project-list rows reserve the File ID line before the ID is hydrated, preventing Delete/reload operations from changing row height and moving neighboring buttons.
- Project switching now uses a hard rendering boundary so old project grid/heat-map state is cleared and the new project is loaded through a clean page state rather than allowing layers from two projects to coexist.
- Android durable-folder listing/read/write/delete calls no longer trigger a synchronous SAF directory scan on the WebView thread while the background folder index is incomplete.
- Cancelling the Android folder picker during a true first install is now explicitly reported back to the web app so it can create the normal local default project only after that decline.

### Changed
- When a first-install durable folder is selected, Pad Grade waits for its background index, restores portable settings and the last active/in-work project when present, and creates a default project only when the selected folder contains no Pad Grade projects.

### Known issues
- This remains a development build intended for device verification of first-install recovery, imagery retry behavior, project switching, and comparison presentation before stable promotion.

## v0.8.7 — development build

### Fixed
- Removed MapLibre from the local project/grid startup critical path. The cached project and lower grade grid initialize before the map library is requested.
- Android builds now package pinned MapLibre GL JS 5.16.0 JS/CSS locally, so the GPS map no longer waits on `unpkg.com` during normal APK startup.
- Retired the active v0.7.0/v0.7.3 durable-folder recovery owners that could still wait 45–60 seconds for SAF indexing and then reload the page underneath the newer non-blocking restore path.
- Durable-folder autosave/persistence code now treats the folder as unavailable until the native index is ready, preventing an early JavaScript read/write from forcing a synchronous `DocumentFile.listFiles()` scan on the WebView thread.
- The normal GPS project grid now has a style-ready overlay owner and no longer waits for MapLibre's full raster-imagery `load` event before installing grid lines, points, labels, and outline.
- Android/system Back while Project Comparison is open now exits the temporary comparison view first instead of offering to close Pad Grade.

### Changed
- The already-rendered lower project grid stays visible while the single-owner responsive grid renderer finishes its atomic sizing pass instead of being hidden during legacy project-workflow initialization.
- MapLibre and GPS-map modules load asynchronously after the local project UI is usable; browser-hosted copies retain an asynchronous pinned-CDN fallback when local vendor assets are not present.

### Known issues
- This remains a development build intended for device verification of startup timing, early GPS-grid/heat-map rendering, and comparison Back behavior before stable promotion.

## v0.8.6 — development build

### Fixed
- Removed the 60-second startup reveal dependency on Android durable-folder indexing. The locally cached active project is now rendered immediately while Storage Access Framework folder indexing/reconciliation continues in the background.
- The saved four-corner GPS calibration now frames the GPS map immediately after MapLibre construction instead of waiting for a fresh GPS fix or the map's full imagery/source load cycle.
- Cache-busted the startup/map activation chain so an upgraded DEV install cannot keep using the older delayed restore or map code from WebView cache.

### Changed
- Project Comparison points now use the same visual treatment as normal project GPS points: red CUT, green GRADE, blue FILL, white outlines, and A1/B1/etc. labels.
- Added the comparison heat-map color key beneath the comparison map, including maximum cut, grade tolerance, and maximum fill values. The averaged grid/points/labels remain foreground geometry above the heat map.

### Known issues
- This remains a development build intended for device verification of startup timing and comparison presentation before stable promotion.

## v0.8.5 — development build

### Fixed
- Prevented the older fallback MapLibre capture hook from wrapping the newer primary-map hook. Project Comparison maps can no longer steal `window.__padGradeMapInstance` through the legacy fallback path, which was still allowing the active project's heat map to be drawn into the comparison map.
- Added a render-order guard for the normal GPS map so project heat-map layers stay hidden until the survey grid/point layers exist, then remain below the grid, outline, route, points, labels, and current-position marker.
- Added the same foreground-order enforcement to the temporary comparison map so its averaged comparison grid and points remain above the comparison heat map.

### Changed
- Start the existing GPS grid-overlay owner at DOM-ready rather than waiting for the full `window.load` event, so the point/grid geometry can appear immediately after map imagery/style readiness instead of arriving late behind slower page resources.
- The comparison map continues to use its own averaged rectangular grid; the grid lines and points are explicitly kept visible in the foreground over the delta heat map.

### Known issues
- This remains a development build intended for device verification before stable promotion.

## v0.8.4 — development build

### Fixed
- Isolated the temporary Project Comparison MapLibre instance from the application's primary GPS/project map registration. Creating `pgCompareMap` no longer replaces `window.__padGradeMapInstance` or emits the primary `padgrade-map-created` event.
- Prevented project-map maintenance hooks from treating the comparison map as the active project map, which could leave the live project's grid/heat-map layers visible or redrawn into the comparison view.

### Changed
- The comparison map remains a separate MapLibre object with its own imagery, averaged comparison grid, delta heat map, probe handling, and lifecycle; the live project's map remains untouched underneath and is restored unchanged when comparison exits.
- Added a CI regression test that creates both `gpsMap` and `pgCompareMap` and verifies only `gpsMap` owns the global primary-map registration.

### Known issues
- This remains a development build intended for device verification that comparison shows only the averaged comparison grid/heat map and returns to the unchanged live project afterward.

## v0.8.3 — development build

### Fixed
- Removed the v0.8.2 comparison correction from the general application startup path after field testing showed the DEV build could remain on the recovery screen and fail to reach the durable save-folder prompt.
- Retired the directly linked v0.8.2 correction layer as an inert compatibility file so cached v0.8.2 pages cannot install its polling, observer, or recurring UI work during startup.
- The reviewed comparison correction now loads only after the existing v0.8.1 comparison core and UI have successfully loaded, keeping comparison completely outside the recovery/durable-folder bootstrap path.

### Changed
- Preserved the v0.8.2 comparison behavior: **Compare** remains beside **Clear Readings**, logical GPS points are averaged point-by-point between the two fitted rectangular project grids, dimensions/row-column counts must match, and every corresponding corner must be within 20 ft.
- Added CI startup-isolation checks so a comparison correction cannot again be linked directly into normal app startup without being detected.

### Known issues
- This is a development hotfix build intended to verify clean startup, durable-folder prompting/recovery, and the comparison workflow before stable promotion.

## v0.8.2 — development build

### Changed
- Moved **Compare** out of the fixed bottom bar and placed it beside **Clear Readings** in the existing project-action button holder. **Clear Readings remains unchanged.**
- Corrected comparison geometry so each project is first resolved to its own existing fitted rectangular GPS grid. Every logical point (`A1`, `A2`, etc.) in the comparison grid is then placed at the local east/north midpoint of that same logical point in the two fitted project grids.
- The resulting averaged comparison grid remains one rectangular grid. Elevation deltas are still calculated strictly by logical row/column identity and then attached to those averaged point positions before the existing heat-map interpolation is applied.
- Project comparison now requires identical row/column counts **and** identical configured pad width/length. Different-size projects fail comparison instead of averaging dimensions.
- Project comparison now requires every corresponding stabilized GPS corner (SW↔SW, SE↔SE, NE↔NE, NW↔NW) to be no more than 20 ft apart. A pair outside that limit fails with an explanatory error.
- Picker status now reports the same-size/location eligibility rules and the worst corresponding-corner separation before comparison starts.

### Fixed
- Removed the v0.8.1 behavior that averaged only the four observed GPS corners and refit a new shared rectangle, which did not represent the requested point-by-point average of the two already-calculated project grids.
- Removed the v0.8.1 behavior that allowed different physical pad sizes by averaging their dimensions.

### Known issues
- Both selected projects still need complete four-corner GPS calibration and a reading at every logical grid point.
- This remains a development build intended for field testing before stable promotion.

## v0.8.1 — development build

### Added
- Added **Compare** to the fixed bottom button bar for temporary comparison of two fully measured projects.
- Added First measurement and Second measurement selectors so elevation change direction is explicit.
- Added a dedicated temporary GPS comparison map with the current local IDW²/edge-locked heat-map interpolation and tap-to-probe behavior.

### Changed
- Comparison eligibility requires every logical grid point to have a finite reading; projects are matched strictly by row and column rather than nearest GPS position.
- Each survey is normalized so its configured target rod plane equals elevation zero before comparison. The displayed delta is Second normalized ground elevation minus First normalized ground elevation, so negative values are cut that occurred and positive values are fill that occurred.
- Corresponding stabilized SW/SE/NE/NW GPS corner observations are averaged between the two projects and fit into one shared comparison rectangle. Interior comparison points use that one shared grid rather than two overlaid grids.
- If the two projects have different configured pad dimensions but the same row/column count, the temporary shared grid uses the average dimensions and identifies that choice in the comparison view.
- Exiting comparison removes only the temporary view and returns directly to the still-open project without closing, reopening, or replacing its saved/runtime state.

### Known issues
- Both selected projects need complete four-corner GPS calibration to render the shared GPS comparison map.
- This is a development build intended for field testing before stable promotion.

## v0.8.0 — stable

### Added
- Added a stable six-character human-readable File ID to each project/save so files can be identified when moving saves between devices.
- Display the File ID in the app for the active project and in the project list.
- Prefix one-project exports with the same File ID stored inside the project data.

### Changed
- Legacy projects without a File ID are assigned one automatically and retain it for later saves and exports.
- When a durable project folder is restored or reconnected, legacy project files without a File ID prefix are upgraded to prefixed filenames.
- Durable-folder migration writes the new prefixed file successfully before removing the legacy filename and is safe to run repeatedly.
- Regular durable-folder autosaves continue using the prefixed filename after migration instead of recreating an unprefixed copy.

## v0.8.0 — development build

### Added
- Built the six-character File ID, export-prefix, UI display, and durable-folder legacy-save migration as a separately installable DEV build for testing before stable promotion.

## v0.7.9 — stable

### Changed
- Promoted the v0.7.9 development surface model to the stable production build.
- Kept locality-first support selection: choose the most-local containing 3-point triangle by nearest farthest vertex, then minimum total reference distance, then area.
- Promote a local 3-point support set to a 4-point rectangle when the corresponding fourth corner is measured.
- Lock shared rectangle and fallback-triangle edges to the 2-point inverse-distance-squared (IDW²) result of the edge endpoints.
- Fade the edge-lock correction smoothly to zero over the nearest one-sixth of the rectangle depth or triangle altitude, leaving the interior as ordinary local IDW².

### Fixed
- Removed artificial value jumps at shared interpolation edges while preserving legitimate differences in slope and curvature supported by neighboring measurements.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing are included but remained field-untested at this promotion.

## v0.7.8 — development build

### Changed
- Changed interpolation support selection to find the most-local containing 3-point triangle first.
- When those three points are three corners of a grid rectangle and the fourth corner is measured, promote the calculation to a single 4-point IDW² interpolation.
- Sparse four-corner surveys can interpolate the enclosed rectangle; sparse three-corner surveys interpolate only the supported triangle.

### Fixed
- Prevented a large four-corner rectangle from overriding a more-local supported triangle merely because four distant corners existed.

## v0.7.7 — development build

### Changed
- Replaced minimum-triangle-area selection with locality ranking: nearest farthest reference vertex, then minimum total reference distance, then triangle area.
- Average multiple interpolation results only when the complete locality score is genuinely tied.

### Fixed
- Eliminated the regular-grid failure where long, skinny triangles could have the same minimum area as small local triangles and therefore contaminate interpolation with distant measurements.
- Added a regression case ensuring a distant equal-area triangle loses to the local triangle while symmetric center ties remain valid.

## v0.7.6 — development build

### Added
- Added a shared surface interpolation path used by the heat map and calculation sampling.
- Added **Probe Surface** so a user can tap the map for an interpolated rod reading, CUT/FILL/GRADE result, target rod, pad position, contributing survey references, and navigation to the probe point.

### Changed
- Initial local interpolation used 3-point IDW² within the smallest containing measured triangle.
- Equal minimum-area triangle results were averaged.

### Known issues
- Minimum triangle area proved unsuitable as the primary locality rule on a regular grid because many long, skinny lattice triangles can have the same minimum positive area.

## v0.7.5 — stable baseline

### Added
- Included metric units, feet-and-tenths units, and laser-avoidance pathing.

### Changed
- Recovered active project state is primed before the first grid/GPS render.
- Saved GPS-map dimensions are applied before MapLibre construction.
- Startup resize calls are suppressed/coalesced and the recovery curtain is released only after the final settled layout/idle frame.
- Reduced older repeated project-application passes to a single final compatibility pass.

### Fixed
- Reduced startup flashes/repaints of the default project before the recovered project was applied.

### Known issues
- Metric units, feet-and-tenths units, and laser-avoidance pathing had not yet been field-tested.

## Earlier versions

Earlier Pad Grade development is preserved in repository history, but release-level notes have not yet been backfilled where version boundaries cannot be established reliably.