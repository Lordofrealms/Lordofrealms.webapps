const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function must(cond,msg){if(!cond){console.error('FAIL:',msg);process.exitCode=1;}}
function semverAtLeast(value,floor){
  const a=String(value||'').split('.').map(Number),b=String(floor||'').split('.').map(Number);
  for(let i=0;i<3;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y;}
  return true;
}
const html=read('pad-grade/index.html');
const src=read('pad-grade/v115-dev.js');
const gradle=read('pad-grade-android/app/build.gradle.kts');
const changelog=read('pad-grade/CHANGELOG.md');
const androidChangelog=read('pad-grade-android/CHANGELOG.md');
const titleVersion=(html.match(/<title>Pad Grade Mapper v([0-9]+\.[0-9]+\.[0-9]+) DEV<\/title>/)||[])[1];
const versionCode=Number((gradle.match(/versionCode\s*=\s*(\d+)/)||[])[1]);
const versionName=(gradle.match(/versionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/)||[])[1];
must(!!titleVersion&&semverAtLeast(titleVersion,'1.1.5'),'current DEV title carries v1.1.5 or later');
must(html.includes('src="v115-dev.js?v=20260830-1"'),'v115 runtime loaded');
must(Number.isFinite(versionCode)&&versionCode>=87,'current versionCode carries build 87 or later');
must(!!versionName&&semverAtLeast(versionName,'1.1.5'),'current versionName carries v1.1.5 or later');
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
must(changelog.indexOf('## v1.1.5 — development build')<changelog.indexOf('## v1.1.4 — development build'),'v1.1.5 canonical changelog retained in order');
must(changelog.includes('bare-map flicker'),'canonical flicker fix documented');
must(changelog.includes('memory-export bug'),'canonical memory export repair documented');
must(androidChangelog.includes('## v1.1.5 — development build (87)'),'Android build 87 changelog retained');
if(process.exitCode)process.exit(process.exitCode);
console.log('Pad Grade v1.1.5 flicker/memory carry-forward self-test passed.');
