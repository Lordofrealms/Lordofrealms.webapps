from pathlib import Path

root=Path('.')
index=root/'pad-grade/index.html'
web_log=root/'pad-grade/CHANGELOG.md'
android_log=root/'pad-grade-android/CHANGELOG.md'

text=index.read_text()
text=text.replace('<title>Pad Grade Mapper v1.2.0 DEV</title>','<title>Pad Grade Mapper v1.2.1 DEV</title>',1)
old='<script src="v120-dev.js?v=20260831-1"></script>'
new=old+'\n<script src="v121-dev.js?v=20260831-1"></script>'
if 'src="v121-dev.js' not in text:
    if old not in text: raise SystemExit('v120 script marker not found')
    text=text.replace(old,new,1)
index.write_text(text)

web_entry='''## v1.2.1 — development build

### Fixed — self-aborting MapLibre ImageSource load
- The v1.2.0 field diagnostic showed **491 `heatmap.v120-image-requested` events but zero `heatmap.v120-image-committed` events**. The heat canvases themselves were populated, including the main 891 frame and Compare frames, so the failure was after raster generation.
- v1.2.0 was re-entering the permanent ImageSource commit whenever the legacy virtual heat layer changed visibility or opacity. Those repeated commits supplied the **same PNG data URL** while the first image load was still in flight.
- In pinned MapLibre GL JS 5.16.0, every `ImageSource.updateImage()` call aborts any current image request before starting the new one. The repeated same-URL calls therefore kept aborting/restarting the image before it could finish decoding.
- v1.2.1 installs a one-in-flight-load-per-unique-URL guard on the real permanent ImageSource. Repeated requests for the same frame no longer call MapLibre `updateImage()` again. A genuinely different completed frame URL may still replace the current/pending one once.
- When the real ImageSource reports loaded with the expected decoded dimensions, v1.2.1 promotes that frame into the v1.2.0 controller state and makes the canonical heat layer visible.

### Diagnostics / regression coverage
- Added `heatmap.v121-source-dedupe-installed`, `heatmap.v121-image-requested`, `heatmap.v121-image-committed`, and `heatmap.v121-image-load-timeout` diagnostics.
- Added a regression test that deliberately floods one pending ImageSource with **250 identical same-URL updates** and verifies the underlying MapLibre update is not re-entered; it then verifies a genuinely new URL is forwarded exactly once and can commit.

### Changed
- `v121-dev.js` now loads immediately after `v120-dev.js` and owns same-frame ImageSource request deduplication while retaining the v1.2.0 permanent ImageSource presentation path.
- Android DEV package is **version 1.2.1 / build 93**.

### DEV verification
- Open a project with a populated heat cache and confirm the heat map becomes visible.
- Export a diagnostic log and confirm there is a `heatmap.v121-image-committed` row rather than an endless stream of same-frame `heatmap.v120-image-requested` rows.
- Switch **Auto → 99 → 297 → 891 → Auto** and confirm genuinely new completed tiers still replace the prior tier.
- Open Project Comparison and confirm its heat map also commits.

'''
android_entry=web_entry.replace('## v1.2.1 — development build','## v1.2.1 — development build (93)',1)
for path,entry in ((web_log,web_entry),(android_log,android_entry)):
    t=path.read_text()
    if entry.splitlines()[0] not in t:
        marker='# Changelog\n\n'
        if not t.startswith(marker): raise SystemExit(f'changelog header missing: {path}')
        t=marker+entry+t[len(marker):]
        path.write_text(t)
