const fs=require('fs');
const html=fs.readFileSync('pad-grade/index.html','utf8');
const js=fs.readFileSync('pad-grade/v120-dev.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');
function ok(v,m){if(!v)throw new Error(m);}
function semverAtLeast(value,floor){
  const a=String(value||'').split('.').map(Number),b=String(floor||'').split('.').map(Number);
  for(let i=0;i<3;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y;}
  return true;
}
const titleVersion=(html.match(/Pad Grade Mapper v(\d+\.\d+\.\d+) DEV/)||[])[1];
const code=Number((gradle.match(/versionCode\s*=\s*(\d+)/)||[])[1]);
const name=(gradle.match(/versionName\s*=\s*"(\d+\.\d+\.\d+)"/)||[])[1];
ok(!!titleVersion&&semverAtLeast(titleVersion,'1.2.0'),'current DEV title regressed below v1.2.0');
ok(html.includes('src="v120-dev.js'),'v120 runtime not loaded');
ok(!html.includes('<script src="v119-dev.js'),'v119 runtime still executable');
ok(js.includes("source.updateImage({url:frame.url,coordinates:coords})"),'MapLibre 5.16 URL update contract missing');
ok(!js.includes('updateImage({image:'),'unsupported direct ImageBitmap update remains');
ok(!js.includes('TRANSPARENT_PIXEL'),'transparent placeholder remains');
ok(js.includes('state.styleEpoch>0||!!state.map.isStyleLoaded?.()'),'style.load readiness fallback missing');
ok(js.includes('source.loaded?.()===true'),'source loaded verification missing');
ok(js.includes('source.image!==previousImage'),'decoded image replacement verification missing');
ok(js.includes('heatmap.v120-image-requested')&&js.includes('heatmap.v120-image-committed')&&js.includes('heatmap.v120-image-verify-failed'),'v120 verification diagnostics missing');
ok(!/baseAddSource\([^\n]+type:\s*['"]canvas['"]/.test(js),'v120 adds a real MapLibre CanvasSource');
ok(js.includes("id==='gpsMap'")&&js.includes("id==='pgCompareMap'"),'shared main/compare constructor hook missing');
ok(js.includes('gps.permission-denied-manual-fallback'),'GPS denial/manual fallback not carried forward');
ok(Number.isFinite(code)&&code>=92,'Android versionCode regressed below build 92');
ok(!!name&&semverAtLeast(name,'1.2.0'),'Android versionName regressed below 1.2.0');
console.log('Pad Grade v1.2.0 carry-forward static self-test passed');
