#!/usr/bin/env python3
from pathlib import Path
import re
root=Path(__file__).resolve().parent
index=(root/'pad-grade/index.html').read_text()
js=(root/'pad-grade/v118-dev.js').read_text()
main=(root/'pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/MainActivity.java').read_text()
life=(root/'pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/PadGradeLifecycleBridge.java').read_text()
manifest=(root/'pad-grade-android/app/src/main/AndroidManifest.xml').read_text()
gradle=(root/'pad-grade-android/app/build.gradle.kts').read_text()
assert '<title>Pad Grade Mapper v1.1.8 DEV</title>' in index
assert index.index('v118-dev.js') < index.index('v117-dev.js')
for token in ['__padGradeDevV117=true','pad-grade-v118-heat-image-source','pad-grade-v118-compare-heat-image-source','pg-compare-heat-source-','background.gps-suspended','imagery:\'retained\'']:
    assert token in js, token
assert 'background.imagery-unloaded' not in js
assert 'suspendAllImagery' not in js
assert 'current=chooseCandidate(state)' in js and 'authority-moved' not in js
assert 'ACCESS_COARSE_LOCATION' in manifest and 'ACCESS_FINE_LOCATION' in manifest
assert 'Before Android asks for location' in main
assert 'While using the app' in main and 'Only this time' in main and 'Precise location' in main
assert 'Manifest.permission.ACCESS_COARSE_LOCATION' in main and 'Manifest.permission.ACCESS_FINE_LOCATION' in main
assert 'consumeOneTimePermissionRevokedExitNotice' in main and 'consumeOneTimePermissionRevokedExitNotice' in life
assert 'try { webView.resumeTimers(); }' in main
resume=re.search(r'private void resumeWebViewFromBackground\(\) \{(.+?)\n    \}',main,re.S)
assert resume and '!webViewTimersPaused' not in resume.group(1)
assert 'versionCode = 90' in gradle and 'versionName = "1.1.8"' in gradle
print('Pad Grade v1.1.8 self-test: PASS')
