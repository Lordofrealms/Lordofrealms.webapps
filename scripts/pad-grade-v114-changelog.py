from pathlib import Path

WEB = '''## v1.1.4 — development build

### Fixed
- Enforced a **single authoritative heat-map raster** on the normal GPS map. The retained double-buffer slots can still be used internally for upload/replacement, but a later legacy visibility sync can no longer make a retired 99/297/891 slot visible beside the current raster.
- Manual **99 / 297 / 891** inspection now blocks every normal heat layer while the selected inspector raster is visible, preventing a regular Auto raster from being composited underneath the diagnostic view.
- Protected a valid cached 891 raster from being retired by lower-resolution regular workers that were already in flight when the cache finished loading. This prevents the cached final surface from being visually downgraded to 99 or 297 during reload/project switching.

### Added
- Added native Android memory snapshots to lifecycle diagnostics. Each lifecycle breadcrumb now records process PSS/private-dirty/shared-dirty, Java/native heap, Android memory-stat categories including graphics/code/stack/private-other/system, device available/threshold memory, app memory class, process importance, and last trim level.
- Added on-demand native memory snapshots through the existing privacy-safe lifecycle bridge so the web diagnostic layer can capture memory at heat-map, map, project-switch, visibility, and periodic checkpoints.
- Added DEV `memory.snapshot` entries that inventory JS heap when Chromium exposes it, DOM/MapLibre canvas backing-store estimates, normal and inspector heat CanvasSources, retained inspector-tier estimates, decoded project heat-cache estimates, and foreground/background heat-worker activity.
- Added a manual `pgDiagnosticMemorySnapshot()` hook for targeted testing without changing runtime memory-management behavior.

### Changed
- Android DEV package is **version 1.1.4 / build 86**.
- This release deliberately **does not add automatic memory trimming, MapLibre cache reductions, or background keep-alive behavior**. The purpose of the new memory telemetry is to measure the actual pressure before deciding what, if anything, should be discarded when Android backgrounds the app.
- The authoritative IDW² interpolation math, measured-point color scaling, 99/297/891 raster dimensions, project-file schema, and lossless 891 disk-cache format are unchanged.

### DEV verification
- Switch repeatedly among Auto, 99, 297, and 891. At every point, only one heat raster should be visible; diagnostic logs should show `heatmap.exclusive-state` and any prevented stale-layer attempts as `heatmap.stale-raster-show-suppressed`.
- Open an unchanged project with a valid 891 cache. The cached final raster should remain authoritative even if previously started 99/297 workers finish later; it must not visibly downgrade to a lower tier.
- Reproduce the background-process kill without changing phone settings. Export diagnostics immediately after returning. Compare `memory.snapshot` entries before backgrounding with the persisted Android lifecycle `memory` objects at `onPause`, `onStop`, `onTrimMemory`, and the next process `onCreate`.
- Do not infer a memory fix from this build alone: use the recorded PSS/heap/graphics/device-pressure values to decide whether Pad Grade itself is unusually large or Android is reclaiming an otherwise reasonable cached process.

'''

ANDROID = '''## v1.1.4 — development build (86)

### Fixed
- Fixed multiple normal heat-map raster slots becoming visible simultaneously after an otherwise atomic 99→297→891 swap.
- Fixed manual resolution inspection allowing a normal Auto raster to remain visible underneath the selected 99/297/891 inspector raster.
- Prevented an already-loaded cached 891 final raster from being visually replaced by lower-tier regular work that was already in flight.

### Diagnostics
- Lifecycle breadcrumbs now include native process/device memory snapshots: total PSS, dirty memory, Java/native heaps, graphics/code/stack/private-other/system categories, available/threshold device RAM, process importance, and trim state.
- Web diagnostics now add `memory.snapshot` checkpoints with JS heap (where available), canvas/CanvasSource backing-store estimates, decoded heat-cache estimates, and heat-worker inventory.
- Memory instrumentation is observation-only in this build; it does not automatically trim MapLibre, canvases, or caches.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.4**, version code **86**.

'''

def prepend(path: Path, heading: str, section: str) -> None:
    text = path.read_text(encoding='utf-8')
    if '## v1.1.4' in text:
        return
    marker = text.find(heading)
    if marker < 0:
        raise SystemExit(f'{heading!r} missing in {path}')
    path.write_text(text[:marker] + section + text[marker:], encoding='utf-8')

prepend(Path('pad-grade/CHANGELOG.md'), '## v1.1.3', WEB)
prepend(Path('pad-grade-android/CHANGELOG.md'), '## v1.1.3', ANDROID)

for cleanup in [
    Path('.github/workflows/pad-grade-v114-changelog-helper.yml'),
    Path('.github/workflows/pad-grade-v114-changelog-helper2.yml'),
    Path('scripts/pad-grade-v114-changelog.py'),
]:
    if cleanup.exists():
        cleanup.unlink()
