from pathlib import Path

ROOT = Path('.')

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'{path}: expected text not found: {old!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# App title/runtime inclusion.
replace_once('pad-grade/index.html', '<title>Pad Grade Mapper v1.1.5 DEV</title>', '<title>Pad Grade Mapper v1.1.6 DEV</title>')
replace_once(
    'pad-grade/index.html',
    '<script src="v106-map-hitbox.js?v=20260830-1"></script>',
    '<script src="v106-map-hitbox.js?v=20260830-1"></script>\n<script src="v116-dev.js?v=20260830-1"></script>'
)

# Android package version.
replace_once('pad-grade-android/app/build.gradle.kts', 'versionCode = 87', 'versionCode = 88')
replace_once('pad-grade-android/app/build.gradle.kts', 'versionName = "1.1.5"', 'versionName = "1.1.6"')

web_section = '''## v1.1.6 — development build

### Changed
- When Pad Grade becomes hidden/minimized, continuous geolocation watches are now **suspended at the underlying provider** while the app keeps stable virtual watch IDs. This stops both the main GPS-guidance watch and the separate map-position watch from continuing to consume Precision Location/native GPS in the background. On return, only watches that were actually registered before backgrounding are restarted.
- An in-progress stabilized corner capture is cancelled when the app is minimized rather than allowing its capture timer to finish without live position samples. The user is prompted to capture that corner again after returning.
- The primary map and the intentionally separate Project Comparison map now unload only their USGS satellite raster **layers and sources** when the app is hidden. The MapLibre instances, camera state, project grid, GPS calibration, heat map, cached 891 raster, project data, and controls remain alive. The same imagery definitions are restored when the app becomes visible again.
- Background imagery suspension blocks the existing imagery-recovery path from silently re-adding USGS raster sources while the document is hidden. This build is a targeted experiment against the large graphics-PSS footprint measured in v1.1.5; it does not discard heat caches or destroy MapLibre.
- Android DEV package is **version 1.1.6 / build 88**.

### Fixed
- Replaced the unsuccessful v1.1.5 single-barrier heat-map handoff with a **two-render-barrier handoff**. The real Auto/99/297/891 selection is delayed while a same-source hold layer renders once with the old raster still fully visible; Pad Grade then swaps old → hold and waits for the full-opacity hold to render before the inspector is allowed to hide/remove the old layer or request the target tier.
- After the requested tier exists, it is staged at effectively transparent opacity and rendered once before the final hard hold → target paint swap. This keeps the transition a literal hard resolution change with no intentional cross-fade while avoiding a frame where MapLibre has neither a prepared old raster nor a prepared target raster.
- Project-switch, app-hide, and unload boundaries cancel any pending v1.1.6 heat handoff so a held raster cannot survive into another project or background state.

### Diagnostics
- Added `background.gps-*`, `background.imagery-*`, and `background.*-complete` markers so GPS suspension/restoration and imagery removal/restoration can be distinguished from Android lifecycle events.
- Added memory snapshots at **before background suspension**, **after GPS suspension**, **after imagery unload**, a settled post-unload checkpoint, and matching resume/restore checkpoints. This lets the next diagnostic log show whether stopping GPS changes process memory at all and how much graphics/PSS is released specifically by removing satellite imagery.
- GPS suspension is not being treated as the expected RAM fix. It is included because leaving high-accuracy location active while backgrounded is unnecessary power/background work and could influence Android/Samsung process treatment even if its direct memory cost is small.

### Unchanged
- No heat-map canvases, decoded project heat caches, cached `.pgheatcache` files, survey-grid sources, or project data are discarded on minimize.
- No MapLibre map instance is destroyed on minimize. Project Comparison remains intentionally implemented with its own separate map instance; v1.1.6 merely exposes that existing instance to the background imagery-suspension controller.
- IDW² interpolation, measured-point color scaling, 99/297/891 raster dimensions, project-file schema, cache format, and the v1.1.4 single-authority heat-map rule are unchanged.

### DEV verification
- With GPS Guided actively receiving fixes, minimize Pad Grade and return. Diagnostics should show the registered underlying location watches stop on hide and only the previously registered watches resume on visibility return.
- Observe memory/graphics PSS before minimize and at the post-GPS / post-imagery checkpoints. The comparison should isolate whether USGS imagery removal materially reduces the graphics-heavy foreground footprint measured in v1.1.5.
- Repeat the test with Project Comparison open so both the primary and intentional comparison imagery stacks are removed/restored without destroying either map or losing comparison/grid/heat state.
- Rapidly switch Auto → 99 → 297 → 891 and back. The old raster should remain stable through both hold render barriers, followed by a hard target swap with no visible bare-map flash, dark overlap, or cross-fade.

'''

p = ROOT / 'pad-grade/CHANGELOG.md'
text = p.read_text(encoding='utf-8')
anchor = '## v1.1.5 — development build\n'
if anchor not in text:
    raise SystemExit('pad-grade/CHANGELOG.md: v1.1.5 anchor missing')
if '## v1.1.6 — development build\n' not in text:
    text = text.replace(anchor, web_section + anchor, 1)
p.write_text(text, encoding='utf-8')

android_section = '''## v1.1.6 — development build (88)

### Changed
- Continuous GPS watches are suspended at the underlying geolocation/Precision Location provider whenever the WebView becomes hidden, then only the watches that were previously registered are restored on return. This covers both survey guidance and the map-position companion watch without forcing either feature to forget its app-level watch ID.
- Active stabilized corner capture is cancelled on minimize and must be recaptured after resume rather than completing against a gap in location samples.
- USGS cached imagery and high-resolution NAIP raster layers/sources are removed from both the primary map and the intentionally separate Project Comparison map while backgrounded. MapLibre instances, camera/project/grid/heat state, calibration, and disk/decoded heat caches remain intact and imagery is reattached on resume.
- This is a targeted background-resource experiment based on v1.1.5 diagnostics showing foreground process memory dominated by graphics PSS. GPS suspension is included to eliminate unnecessary background power/location work, not because GPS was measured as the graphics-memory source.

### Fixed
- Packaged the v1.1.6 two-render-barrier heat-map handoff. The same-source hold must render once before old → hold, the full-opacity hold must render before the real resolution selection proceeds, and the target must render staged before hold → target. The intended result remains a hard no-cross-fade resolution swap without a bare-map frame.
- Pending heat handoffs are cancelled across project, hide, and unload boundaries.

### Diagnostics
- Added explicit memory checkpoints before background suspension, after GPS suspension, after imagery removal, after a settled unload interval, and around resume/restoration.
- Added GPS and imagery suspend/restore event markers, including counts of stopped/restarted watches and removed/restored raster layers/sources.

### Packaging
- DEV `applicationId` remains `com.lordofrealms.padgrade.dev`.
- Version name **1.1.6**, version code **88**.
- No larger-heap flag, foreground keep-alive service, automatic heat-cache trimming, or MapLibre destruction is introduced in this build.

### DEV verification
- Reproduce the prior several-minute minimize/reopen scenario with GPS active and compare the v1.1.6 post-GPS and post-imagery memory snapshots to the v1.1.5 baseline.
- Verify satellite imagery disappears from memory while hidden and reloads on return without losing grid/heat/project state.
- Repeat with Project Comparison open and verify its intentionally separate map remains the only secondary MapLibre instance and is restored correctly.
- Exercise Auto/99/297/891 repeatedly and verify the stronger two-barrier handoff removes the remaining resolution-change flicker.

'''

p = ROOT / 'pad-grade-android/CHANGELOG.md'
text = p.read_text(encoding='utf-8')
anchor = '## v1.1.5 — development build (87)\n'
if anchor not in text:
    raise SystemExit('pad-grade-android/CHANGELOG.md: v1.1.5 anchor missing')
if '## v1.1.6 — development build (88)\n' not in text:
    text = text.replace(anchor, android_section + anchor, 1)
p.write_text(text, encoding='utf-8')

print('Applied Pad Grade v1.1.6 version, runtime inclusion, and changelog updates.')
