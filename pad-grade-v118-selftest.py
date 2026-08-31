#!/usr/bin/env python3
from pathlib import Path
import re
root=Path(__file__).resolve().parent
index=(root/'pad-grade/index.html').read_text()
legacy=(root/'pad-grade/v118-dev.js').read_text()
current=(root/'pad-grade/v119-dev.js').read_text()
main=(root/'pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/MainActivity.java').read_text()
life=(root/'pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/PadGradeLifecycleBridge.java').read_text()
manifest=(root/'pad-grade-android/app/src/main/AndroidManifest.xml').read_text()
gradle=(root/'pad-grade-android/app/build.gradle.kts').read_text()

def semver(value):
    return tuple(int(x) for x in value.split('.'))

title=re.search(r'<title>Pad Grade Mapper v(\d+\.\d+\.\d+) DEV</title>',index)
assert title and semver(title.group(1)) >= (1,1,8)
assert 'src="v119-dev.js' in index
# v1.1.8 remains syntax/history context, while the current cutover must preserve its
# informed-permission/background decisions without executing the failed v1.1.8 heat shim.
for token in ['__padGradeDevV117=true','pad-grade-v118-heat-image-source','pad-grade-v118-compare-heat-image-source','pg-compare-heat-source-','background.gps-suspended','imagery:\'retained\'']:
    assert token in legacy, token
for token in ['pad-grade-v119-heat-image-source','pad-grade-v119-compare-heat-image-source','background.gps-suspended','imagerySuspend:false','legacyMapLibreCanvasSources:false']:
    assert token in current, token
assert 'background.imagery-unloaded' not in current
assert 'ACCESS_COARSE_LOCATION' in manifest and 'ACCESS_FINE_LOCATION' in manifest
assert 'Before Android asks for location' in main
assert 'While using the app' in main and 'Only this time' in main and 'Precise location' in main
assert 'Manifest.permission.ACCESS_COARSE_LOCATION' in main and 'Manifest.permission.ACCESS_FINE_LOCATION' in main
assert 'consumeOneTimePermissionRevokedExitNotice' in main and 'consumeOneTimePermissionRevokedExitNotice' in life
assert 'try { webView.resumeTimers(); }' in main
resume=re.search(r'private void resumeWebViewFromBackground\(\) \{(.+?)\n    \}',main,re.S)
assert resume and '!webViewTimersPaused' not in resume.group(1)
code=int(re.search(r'versionCode\s*=\s*(\d+)',gradle).group(1))
name=re.search(r'versionName\s*=\s*"(\d+\.\d+\.\d+)"',gradle)
assert code >= 90 and name and semver(name.group(1)) >= (1,1,8)
print('Pad Grade v1.1.8 permission/background carry-forward self-test: PASS')
