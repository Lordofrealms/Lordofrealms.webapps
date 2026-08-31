const fs=require('fs');
const html=fs.readFileSync('pad-grade/index.html','utf8');
const js=fs.readFileSync('pad-grade/v119-dev.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');
function ok(v,m){if(!v)throw new Error(m);}
ok(html.includes('Pad Grade Mapper v1.1.9 DEV'),'v1.1.9 DEV title missing');
ok(html.includes('src="v119-dev.js'),'v119 runtime not loaded');
for(const f of ['v114-dev.js','v115-dev.js','v116-dev.js','v117-dev.js','v118-dev.js']) ok(!html.includes(`<script src="${f}`),`${f} still executable`);
ok(js.includes("type:'image',url:TRANSPARENT_PIXEL"),'permanent ImageSource definition missing');
ok(js.includes('isStyleLoaded'),'style-loaded gate missing');
ok(js.includes("map.on('style.load'"),'style.load lifecycle missing');
ok(js.includes('heatmap.v119-image-committed'),'commit diagnostic missing');
ok(js.includes('legacyMapLibreCanvasSources:false'),'legacy CanvasSource cutover marker missing');
ok(!/baseAddSource\([^\n]+type:\s*['\"]canvas['\"]/.test(js),'v119 adds a real MapLibre CanvasSource');
ok(js.includes("id==='gpsMap'")&&js.includes("id==='pgCompareMap'"),'shared main/compare constructor hook missing');
ok(js.includes('gps.permission-denied-manual-fallback'),'permission denial manual fallback missing');
ok(js.includes('geo.getCurrentPosition=function'),'initial getCurrentPosition denial fallback missing');
ok(gradle.includes('versionCode = 91')&&gradle.includes('versionName = "1.1.9"'),'Android version/build mismatch');
console.log('Pad Grade v1.1.9 heat cutover self-test passed');
