const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function must(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);}
const runtime=read('pad-grade/v116-dev.js');
const current=read('pad-grade/v120-dev.js');
const index=read('pad-grade/index.html');
const gradle=read('pad-grade-android/app/build.gradle.kts');
const webLog=read('pad-grade/CHANGELOG.md');
const androidLog=read('pad-grade-android/CHANGELOG.md');

// Preserve the historical v1.1.6 contract in its source file without requiring its
// superseded imagery/render-barrier implementation to stay executable forever.
must(runtime,"const VERSION='1.1.6'",'runtime version');
must(runtime,'background.gps-suspended','GPS suspend diagnostics');
must(runtime,'background.gps-resumed','GPS resume diagnostics');
must(runtime,"['usgs-cached-imagery','usgs-naip-plus']",'primary imagery IDs');
must(runtime,"['pg-compare-usgs-cached','pg-compare-usgs-naip']",'compare imagery IDs');
must(runtime,'window.__padGradeImagerySuspendedV116=true','imagery suspend flag');
must(runtime,"memorySnapshot('v116-background-after-gps-suspend')",'post-GPS memory sample');
must(runtime,"memorySnapshot('v116-background-after-imagery-unload')",'post-imagery memory sample');
must(runtime,'Barrier 1:','first heat render barrier');
must(runtime,'Barrier 2:','second heat render barrier');
must(runtime,'event.stopImmediatePropagation()','delayed real inspector click');
must(runtime,'state.button.click()','synthetic target click after hold render');
must(runtime,"window.__padGradeV116BackgroundPolicy='pause-active-geolocation-watches-unload-usgs-raster-sources-layers-keep-map-project-grid-heat-state-restore-on-visible'",'historical background policy');

if(!/<title>Pad Grade Mapper v\d+\.\d+\.\d+ DEV<\/title>/.test(index))throw new Error('current DEV title missing');
must(index,'src="v120-dev.js','current v1.2.0 runtime');
if(index.includes('<script src="v116-dev.js'))throw new Error('superseded v1.1.6 runtime must not remain executable after heat cutover');
must(current,'background.gps-suspended','current GPS suspension retained');
must(current,'imagerySuspend:false','current imagery suspension removed');
const code=Number((gradle.match(/versionCode\s*=\s*(\d+)/)||[])[1]||0);
if(code<88)throw new Error(`Android versionCode regressed below v1.1.6 baseline: ${code}`);
const version=(gradle.match(/versionName\s*=\s*"(\d+)\.(\d+)\.(\d+)"/)||[]).slice(1).map(Number);
if(version.length!==3||version[0]<1||(version[0]===1&&version[1]<1)||(version[0]===1&&version[1]===1&&version[2]<6))throw new Error(`Android versionName regressed below 1.1.6: ${version.join('.')}`);
must(webLog,'## v1.1.6 — development build','web changelog');
must(androidLog,'## v1.1.6 — development build (88)','Android changelog');

console.log('v1.1.6 background suspension / heat handoff carry-forward self-test passed');
