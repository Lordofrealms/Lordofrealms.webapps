from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text(encoding='utf-8')
    if new in text:return
    if old not in text:raise SystemExit(f'{path}: missing marker {old!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

def prepend(path,marker,section):
    p=ROOT/path;text=p.read_text(encoding='utf-8')
    if section.splitlines()[0] in text:return
    if marker not in text:raise SystemExit(f'{path}: missing marker {marker!r}')
    p.write_text(text.replace(marker,section.rstrip()+'\n\n'+marker,1),encoding='utf-8')

replace_once('pad-grade/index.html','<title>Pad Grade Mapper v1.1.4 DEV</title>','<title>Pad Grade Mapper v1.1.5 DEV</title>')
replace_once('pad-grade/index.html','<script src="v114-dev.js?v=20260830-2"></script>','<script src="v114-dev.js?v=20260830-2"></script>\n<script src="v115-dev.js?v=20260830-1"></script>')
replace_once('pad-grade-android/app/build.gradle.kts','versionCode = 86','versionCode = 87')
replace_once('pad-grade-android/app/build.gradle.kts','versionName = "1.1.4"','versionName = "1.1.5"')

canonical='''## v1.1.5 — development build

### Fixed
- Removed the remaining visible **bare-map flicker** when switching among Auto / 99 / 297 / 891. Pad Grade now keeps the currently displayed completed raster visually intact through a temporary same-source handoff layer, stages the requested target raster at effectively transparent opacity, waits for MapLibre to render the staged target once, then performs a hard paint swap in one update. There is no intentional visible cross-fade and no intentional frame with neither raster displayed.
- The frame handoff is cancelled before project switching, map replacement/recreation, app hiding, or disabling the heat map so an outgoing project's held raster cannot survive across a project boundary.
- Fixed the v1.1.4 **memory-export bug**. v1.1.4 was collecting native process/device memory but the existing privacy-safe timing logger discarded the nested measurement objects, leaving exported `memory.snapshot` entries with only version/reason metadata.
- Fixed lifecycle-memory export separately from current-process snapshots: native lifecycle breadcrumbs already persisted their memory measurements across process death, but the v1.1.3 importer omitted the nested `memory` object. v1.1.5 reimports those persisted measurements through a separate sequence key rather than losing them.

### Added
- Added export-safe scalar memory fields to `memory.snapshot`, including total PSS/private/shared dirty memory; Java/native/code/stack/graphics/private-other/system/swap PSS; Java and native heap values; device available/threshold memory; memory class; process importance/trim/LRU state; JS heap when Chromium exposes it; canvas/backing-store estimates; normal/inspector heat-canvas estimates; decoded heat-cache estimates; and heat-worker counts.
- Added `android.memory.lifecycle` diagnostic rows carrying the same native memory categories for persisted Android lifecycle events. Because the native bridge already stored these values in v1.1.4, v1.1.5 can recover useful memory data from lifecycle events that preceded an earlier process kill instead of requiring every event to be reproduced from scratch.
- Added `heatmap.frame-handoff-*` timing markers for hold installation, target staging, hard-swap commit, cleanup, and cancellation so any remaining transition artifact can be tied to the exact display phase.

### Changed
- Android DEV package is **version 1.1.5 / build 87**.
- Memory instrumentation remains **measurement-only**. This build does not automatically discard heat-map canvases/caches, reduce MapLibre tile caching, request a larger heap, or run a keep-alive/foreground service. Optimization decisions remain deferred until the numeric measurements identify the actual pressure.
- The authoritative IDW² interpolation math, measured-point color scaling, 99/297/891 raster dimensions, project-file schema, single-authority heat-map rule, and lossless 891 disk-cache format are unchanged.

### DEV verification
- Rapidly switch Auto → 99 → 297 → 891 and back. The old completed raster should remain visually stable until the requested raster has been staged/rendered, followed by a direct hard swap with no bare-map flash, dark double-raster frame, or visible cross-fade.
- Start a resolution change and immediately switch projects. Confirm the project chooser boundary still prevents any outgoing-project heat surface from appearing after the target project takes over.
- Export diagnostics and verify `memory.snapshot` lines now contain numeric fields such as `totalPssKb`, `graphicsPssKb`, `javaHeapPssKb`, `nativeHeapPssKb`, and `deviceAvailKb`, plus canvas/cache/worker estimates where available.
- Reproduce the several-minute background-process kill and compare the last old-process `android.memory.lifecycle`/`memory.snapshot` values with the new process. Use the measured PSS/graphics/heap/device-pressure values before making any memory-trimming change.
'''
prepend('pad-grade/CHANGELOG.md','## v1.1.4 — development build',canonical)

android='''## v1.1.5 — development build (87)

### Fixed
- Packaged the frame-synchronized heat-map handoff that keeps the prior completed raster displayed while a requested Auto/99/297/891 raster is staged, then performs a hard zero-fade paint swap after the target has rendered once. This removes the remaining bare-map flash without restoring the prior overlapping-raster behavior or adding a visible cross-fade.
- Cancels an in-progress handoff before project changes, map replacement, app hiding, or heat-map disable so the temporary hold can never carry outgoing-project imagery across a project boundary.
- Fixed v1.1.4 diagnostic exports dropping the actual nested memory measurements. Current snapshots and persisted Android lifecycle snapshots are now flattened into export-safe numeric fields instead of exporting only the checkpoint label.

### Diagnostics
- `memory.snapshot` now exports total PSS, Java/native/graphics/code/stack/private-other/system/swap categories, Java/native heap values, device available/threshold memory, process importance/trim state, JS heap when exposed, canvas/heat/cache estimates, and worker counts.
- `android.memory.lifecycle` now exports the native memory snapshot stored with Android lifecycle breadcrumbs, including measurements that survived a previous process reclamation.
- Added heat handoff timing markers so hold/stage/commit/cleanup timing can be distinguished from interpolation calculation time.
- Memory behavior itself remains unchanged: this build intentionally adds no automatic trimming, tile-cache reduction, larger-heap request, or background keep-alive.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.5**, version code **87**.
- IDW² math, color scaling, 99/297/891 resolutions, project schema, and the lossless 891 cache format remain unchanged.

### DEV verification
- Repeatedly switch the exact heat-map tiers and confirm there is neither a bare-map flash nor a visible overlap/cross-fade.
- Export diagnostics and verify numeric process/device memory fields are present on `memory.snapshot` and `android.memory.lifecycle` rows before using the data to decide whether memory reduction is warranted.
'''
prepend('pad-grade-android/CHANGELOG.md','## v1.1.4 — development build (86)',android)

selftest=r'''const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function must(cond,msg){if(!cond){console.error('FAIL:',msg);process.exitCode=1;}}
const html=read('pad-grade/index.html');
const src=read('pad-grade/v115-dev.js');
const gradle=read('pad-grade-android/app/build.gradle.kts');
const changelog=read('pad-grade/CHANGELOG.md');
const androidChangelog=read('pad-grade-android/CHANGELOG.md');
must(html.includes('<title>Pad Grade Mapper v1.1.5 DEV</title>'),'v1.1.5 DEV title');
must(html.includes('src="v115-dev.js?v=20260830-1"'),'v115 runtime loaded');
must(gradle.includes('versionCode = 87'),'versionCode 87');
must(gradle.includes('versionName = "1.1.5"'),'versionName 1.1.5');
must(src.includes("HOLD_LAYER_ID='pad-grade-v115-heat-handoff-hold'"),'same-source hold layer exists');
must(src.includes('STAGE_OPACITY=0.000001'),'near-transparent staging is explicit');
must(src.includes("map.once?.('render'"),'handoff waits for a MapLibre render');
must(src.includes("map.setPaintProperty(targetId,'raster-opacity',targetOpacity)"),'target hard paint enable');
must(src.includes("map.setPaintProperty(HOLD_LAYER_ID,'raster-opacity',0)"),'hold hard paint disable');
must(src.includes('projectOpen')&&src.includes("button[data-act=\"open\"]"),'project switch cancels pending handoff');
must(src.includes('no-crossfade-no-bare-map'),'no-crossfade/no-bare-map policy');
for(const key of ['totalPssKb','graphicsPssKb','javaHeapPssKb','nativeHeapPssKb','deviceAvailKb','canvasTotalKb','decodedCacheEstimatedKb','foregroundWorkerCount'])must(src.includes(key),`memory export includes ${key}`);
must(src.includes("mark('android.memory.lifecycle'"),'persisted lifecycle memory exported');
must(src.includes('PadGradeLifecycle'),'native lifecycle bridge consumed');
must(src.includes('no-auto-trim'),'memory remains measurement-only');
must(changelog.indexOf('## v1.1.5 — development build')<changelog.indexOf('## v1.1.4 — development build'),'canonical changelog newest-first');
must(changelog.includes('bare-map flicker'),'canonical flicker fix documented');
must(changelog.includes('memory-export bug'),'canonical memory export repair documented');
must(androidChangelog.includes('## v1.1.5 — development build (87)'),'Android build 87 changelog');
if(process.exitCode)process.exit(process.exitCode);
console.log('Pad Grade v1.1.5 flicker/memory self-test passed.');
'''
(ROOT/'pad-grade/v115-flicker-memory-selftest.js').write_text(selftest,encoding='utf-8')
print('Applied non-workflow Pad Grade v1.1.5 updates.')
