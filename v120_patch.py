#!/usr/bin/env python3
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent
WEB=ROOT/'pad-grade'
ANDROID=ROOT/'pad-grade-android'

src=(WEB/'v119-dev.js').read_text()
# Start from the tested v1.1.9 interception/GPS controller, but make v1.1.10 the only
# executable owner and adapt presentation to the actual pinned MapLibre 5.16.0 contract.
src=src.replace('v1.1.9','v1.1.10').replace('1.1.9','1.1.10').replace('119','120')
src=src.replace("  window.__padGradeDevV120=true;\n", "  window.__padGradeDevV120=true;\n  window.__padGradeDevV119=true;\n")
src=src.replace('complete ImageBitmap. Main and Project Comparison use the same controller.',
                'complete PNG data URL using the URL-only ImageSource.updateImage contract in pinned MapLibre 5.16.0. Main and Project Comparison use the same controller.')

old=re.search(r"  function closeFrame\(frame\).*?  function styleLoaded\(state\)\{.*?\}\n",src,re.S)
if not old:
    raise SystemExit('failed to locate frame decode/styleLoaded block')
new=r'''  function sampleFrame(canvas){
    try{
      const probe=document.createElement('canvas');probe.width=16;probe.height=16;
      const ctx=probe.getContext('2d',{alpha:true});if(!ctx)return null;
      ctx.drawImage(canvas,0,0,probe.width,probe.height);
      const data=ctx.getImageData(0,0,probe.width,probe.height).data;
      let nonTransparent=0,maxAlpha=0,minAlpha=255;
      for(let i=3;i<data.length;i+=4){const a=data[i];if(a>0)nonTransparent++;if(a>maxAlpha)maxAlpha=a;if(a<minAlpha)minAlpha=a;}
      return {samplePixels:data.length/4,sampleNonTransparent:nonTransparent,sampleMinAlpha:minAlpha,sampleMaxAlpha:maxAlpha};
    }catch(e){return null;}
  }
  async function encodeCompleteCanvas(canvas){
    if(!canvas||typeof canvas.toDataURL!=='function')return null;
    const started=performance.now?.()||Date.now();
    try{
      const url=canvas.toDataURL('image/png');
      if(!url||!url.startsWith('data:image/png'))return null;
      const stats=sampleFrame(canvas)||{};
      return {url,kind:'PNGDataURL',width:+canvas.width||0,height:+canvas.height||0,encodedChars:url.length,encodeMs:Math.max(0,(performance.now?.()||Date.now())-started),...stats};
    }catch(e){mark('heatmap.v120-frame-encode-failed',{error:String(e?.message||e).slice(0,160)});return null;}
  }
  function canMutateStyle(state){try{return state.styleEpoch>0||!!state.map.isStyleLoaded?.();}catch(e){return state.styleEpoch>0;}}
'''
src=src[:old.start()]+new+src[old.end():]

ensure_pat=re.search(r"  function ensureCanonical\(state,coords\)\{.*?\n  \}\n  function visibleCandidates",src,re.S)
if not ensure_pat:
    raise SystemExit('failed to locate ensureCanonical')
ensure_new=r'''  function ensureCanonical(state,coords,frame){
    if(!canMutateStyle(state)||!coords||!frame?.url)return null;
    try{
      let source=state.baseGetSource(state.cfg.canonicalSource),created=false;
      if(!source){
        state.baseAddSource(state.cfg.canonicalSource,{type:'image',url:frame.url,coordinates:coords});
        source=state.baseGetSource(state.cfg.canonicalSource);created=true;
        mark('heatmap.v120-image-source-created',{map:state.role,styleEpoch:state.styleEpoch,source:state.cfg.canonicalSource,transport:'url',initialFrame:true});
      }
      if(!state.baseGetLayer(state.cfg.canonicalLayer)){
        const layer={id:state.cfg.canonicalLayer,type:'raster',source:state.cfg.canonicalSource,layout:{visibility:'none'},paint:{'raster-opacity':state.cfg.opacity(),'raster-fade-duration':0}};
        const before=anchor(state);before?state.baseAddLayer(layer,before):state.baseAddLayer(layer);
        mark('heatmap.v120-image-layer-created',{map:state.role,styleEpoch:state.styleEpoch,layer:state.cfg.canonicalLayer,before:before||null});
      }
      source=state.baseGetSource(state.cfg.canonicalSource);
      state.canonicalReady=!!source&&!!state.baseGetLayer(state.cfg.canonicalLayer);
      return state.canonicalReady?{source,created}:null;
    }catch(e){
      state.canonicalReady=false;
      let actual=false;try{actual=!!state.map.isStyleLoaded?.();}catch(_){}
      mark('heatmap.v120-canonical-create-wait',{map:state.role,styleReady:canMutateStyle(state),actualStyleLoaded:actual,styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180)});
      return null;
    }
  }
  function visibleCandidates'''
src=src[:ensure_pat.start()]+ensure_new+src[ensure_pat.end():]

commit_pat=re.search(r"  function commit\(state,candidate,reason\)\{.*?\n  \}\n  function maybeCommit",src,re.S)
if not commit_pat:
    raise SystemExit('failed to locate commit block')
commit_new=r'''  function imageDims(source){
    try{const image=source?.image;return {width:+image?.width||0,height:+image?.height||0};}catch(e){return {width:0,height:0};}
  }
  function verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,attempt=0){
    if(request!==state.requestSerial)return;
    let loaded=false;try{loaded=source.loaded?.()===true;}catch(e){}
    const dims=imageDims(source),changed=!!source?.image&&source.image!==previousImage;
    if(loaded&&changed&&dims.width===frame.width&&dims.height===frame.height){
      const previous=state.currentFrame;
      state.currentFrame=frame;state.currentSource=candidate.source.id;state.currentLayer=candidate.id;state.committedStyleEpoch=state.styleEpoch;
      showCanonical(state);
      mark('heatmap.v120-image-committed',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,transport:'url',sourceLoaded:true,verifiedImageWidth:dims.width,verifiedImageHeight:dims.height,verifyMs:Math.max(0,(performance.now?.()||Date.now())-started),reason});
      if(previous&&previous!==frame)previous.url='';
      return;
    }
    if(attempt<200){state.verifyTimer=setTimeout(()=>verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,attempt+1),25);return;}
    mark('heatmap.v120-image-verify-failed',{map:state.role,styleEpoch:state.styleEpoch,loaded,changed,verifiedImageWidth:dims.width,verifiedImageHeight:dims.height,expectedWidth:frame.width,expectedHeight:frame.height,reason});
  }
  function commit(state,candidate,reason){
    if(!candidate||hidden||shouldHide(state)||!canMutateStyle(state))return false;
    const current=chooseCandidate(state);if(!current||current.id!==candidate.id||current.source.id!==candidate.source.id)return false;
    const frame=candidate.source.frame,coords=cloneCoords(candidate.source.coordinates);if(!frame?.url||!coords)return false;
    if(state.currentFrame===frame&&state.committedStyleEpoch===state.styleEpoch){showCanonical(state);return true;}
    const ensured=ensureCanonical(state,coords,frame);if(!ensured)return false;
    const source=ensured.source,previousImage=ensured.created?null:(source.image||null),request=++state.requestSerial,started=performance.now?.()||Date.now();
    if(state.verifyTimer){clearTimeout(state.verifyTimer);state.verifyTimer=null;}
    try{
      if(!ensured.created)source.updateImage({url:frame.url,coordinates:coords});
      mark('heatmap.v120-image-requested',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,transport:'url',encodedChars:frame.encodedChars||0,encodeMs:frame.encodeMs||0,sampleNonTransparent:frame.sampleNonTransparent??null,samplePixels:frame.samplePixels??null,reason,initialSource:ensured.created});
      verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,0);
      return true;
    }catch(e){
      mark('heatmap.v120-image-commit-failed',{map:state.role,styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180),reason,transport:'url'});
      return false;
    }
  }
  function maybeCommit'''
src=src[:commit_pat.start()]+commit_new+src[commit_pat.end():]

src=src.replace('decodeCompleteCanvas(canvas).then(frame=>{','encodeCompleteCanvas(canvas).then(frame=>{')
src=src.replace('if(record.removed){closeFrame(frame);return;}','if(record.removed)return;if(!frame){mark(\'heatmap.v120-frame-encode-failed\',{map:state.role,source:record.id});return;}')
src=src.replace("record.frame=frame;mark('heatmap.v120-frame-ready',{map:state.role,source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none'});scheduleCommit(state,'frame-ready');",
                "record.frame=frame;mark('heatmap.v120-frame-ready',{map:state.role,source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none',encodedChars:frame?.encodedChars||0,encodeMs:frame?.encodeMs||0,sampleNonTransparent:frame?.sampleNonTransparent??null,samplePixels:frame?.samplePixels??null});scheduleCommit(state,'frame-ready');")
src=src.replace('if(r.frame&&r.frame!==state.currentFrame)closeFrame(r.frame);','')
src=src.replace("projectBlank:false,commitTimer:null,", "projectBlank:false,commitTimer:null,requestSerial:0,verifyTimer:null,")
src=src.replace("map.on('remove',()=>{if(state.commitTimer)clearTimeout(state.commitTimer);for(const s of state.sources.values())if(s.frame&&s.frame!==state.currentFrame)closeFrame(s.frame);closeFrame(state.currentFrame);controllers.delete(state);});",
                "map.on('remove',()=>{if(state.commitTimer)clearTimeout(state.commitTimer);if(state.verifyTimer)clearTimeout(state.verifyTimer);controllers.delete(state);});")
# v1.1.10 allows source/layer mutation after style.load even when imagery keeps isStyleLoaded false.
src=src.replace('if(!state.canonicalReady&&chooseCandidate(state))maybeCommit(state,\'map-idle\')','if(chooseCandidate(state))maybeCommit(state,\'map-idle\')')
# Compare buffer slot suffixes are 0/1, not resolution tiers. Infer tier from canvas dimensions.
old_tier="  function inferTier(role,id,canvas){\n    const explicit=String(id||'').match(/(?:inspect-source-|heat-source-)(\\d+)$/);\n    if(explicit)return +explicit[1];\n    const longest=Math.max(+canvas?.width||0,+canvas?.height||0);\n    if(role==='compare')return longest;\n    return [99,297,891].reduce((best,t)=>Math.abs(t-longest)<Math.abs(best-longest)?t:best,99);\n  }"
new_tier="  function inferTier(role,id,canvas){\n    const longest=Math.max(+canvas?.width||0,+canvas?.height||0);\n    const nearest=[99,297,891].reduce((best,t)=>Math.abs(t-longest)<Math.abs(best-longest)?t:best,99);\n    if(role==='compare')return nearest;\n    const explicit=String(id||'').match(/inspect-source-(\\d+)$/);\n    return explicit?+explicit[1]:nearest;\n  }"
if old_tier not in src:
    raise SystemExit('failed to replace inferTier')
src=src.replace(old_tier,new_tier)
# No direct image payloads or transparent placeholder are allowed in v1.1.10.
src=src.replace("  const TRANSPARENT_PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';\n",'')
if 'updateImage({image:' in src or 'TRANSPARENT_PIXEL' in src:
    raise SystemExit('v1.1.10 still contains unsupported direct-image transport')
(WEB/'v120-dev.js').write_text(src)

# Active startup switches entirely to v1.1.10.
index=(WEB/'index.html').read_text()
index=index.replace('<title>Pad Grade Mapper v1.1.9 DEV</title>','<title>Pad Grade Mapper v1.1.10 DEV</title>')
index=index.replace('<script src="v119-dev.js?v=20260831-1"></script>','<script src="v120-dev.js?v=20260831-1"></script>')
(WEB/'index.html').write_text(index)

gradle=(ANDROID/'app/build.gradle.kts').read_text().replace('versionCode = 91','versionCode = 92').replace('versionName = "1.1.9"','versionName = "1.1.10"')
(ANDROID/'app/build.gradle.kts').write_text(gradle)

web_entry='''## v1.1.10 — development build

### Fixed — MapLibre 5.16.0 image transport
- The v1.1.9 diagnostic log exposed the actual blank-heat root cause: Pad Grade pins **MapLibre GL JS 5.16.0**, whose `ImageSource.updateImage()` implementation silently returns when only `image: ImageBitmap` is supplied. v1.1.9 therefore logged successful calls that MapLibre ignored, leaving the permanent source on its transparent placeholder.
- Completed worker/cache canvases are now encoded to a local PNG data URL and supplied through the **`url` contract that MapLibre 5.16.0 actually implements**. The first permanent ImageSource is created with the real completed frame URL rather than a transparent placeholder, and later resolutions call `updateImage({url, coordinates})`.
- A frame is no longer called committed merely because `updateImage()` returned. v1.1.10 waits until the ImageSource reports loaded and verifies that MapLibre's decoded image object changed and has the expected raster dimensions before making the canonical layer visible and emitting `heatmap.v120-image-committed`.

### Fixed — style readiness and Project Comparison
- Heat presentation no longer waits for `map.isStyleLoaded()` to become true after `style.load`. With the USGS raster stacks, `isStyleLoaded()` can remain false while imagery requests are still outstanding even though the style is already safe to mutate. That delayed the main heat map by many seconds and could block Compare indefinitely.
- `style.load` now establishes the presentation generation. Main and Compare may add their permanent local heat source/layer immediately after that event, independently of slow or stalled satellite imagery.
- Compare resolution diagnostics now report the actual 99 / 297 / 891 tier inferred from canvas dimensions instead of mistaking its double-buffer slot suffix (`0` / `1`) for a tier.

### Diagnostics / regression coverage
- Added `heatmap.v120-image-requested`, verified `heatmap.v120-image-committed`, and `heatmap.v120-image-verify-failed` events. Frame/request rows include PNG encode timing, encoded length, and a tiny alpha sample so a future failure can distinguish blank worker pixels from MapLibre presentation failure.
- The v1.1.10 runtime self-test emulates the **MapLibre 5.16.0 URL-only `updateImage` behavior**: direct `image` updates are deliberately ignored by the fake source. It also holds `isStyleLoaded()` false after `style.load` to prove both Main and Compare still create and verify the heat image.
- Historical v1.1.9 tests remain as carry-forward tests, but no longer require the broken v1.1.9 runtime to be executable.

### Changed
- Active heat presentation moves from `v119-dev.js` to `v120-dev.js`. v1.1.9 remains in the repository for regression/history only.
- Android DEV package is **version 1.1.10 / build 92**.
- The v1.1.9 GPS permission denial/retry behavior is carried forward unchanged while it is being field-tested.

### Unchanged
- IDW² interpolation math, measured-point/color-scale math, 99 / 297 / 891 worker resolutions, final 891 cache format, project schema, project-grid geometry, Project Comparison delta math, GPS suspension on minimize, and retained satellite imagery are unchanged.

### DEV verification
- Confirm the main heat map appears shortly after the map style becomes ready; it should not wait for all USGS imagery to finish loading.
- Switch **Auto → 99 → 297 → 891 → Auto** and confirm every completed tier visibly replaces the prior completed tier with no blank frame or crossfade.
- Open Project Comparison and confirm its heat map appears even while satellite imagery is still loading.
- Continue the v1.1.9 GPS permission test: deny/choose **Not now**, confirm Manual fallback, then select GPS Guided again to retry.

'''
android_entry=web_entry.replace('## v1.1.10 — development build','## v1.1.10 — development build (92)')
for path,entry in [(WEB/'CHANGELOG.md',web_entry),(ANDROID/'CHANGELOG.md',android_entry)]:
    text=path.read_text()
    if '## v1.1.10 — development build' not in text:
        text=text.replace('# Changelog\n\n','# Changelog\n\n'+entry,1)
    path.write_text(text)

# v1.1.9 is now historical carry-forward, not the active presentation runtime.
v119_test='''const fs=require('fs');
const html=fs.readFileSync('pad-grade/index.html','utf8');
const js=fs.readFileSync('pad-grade/v119-dev.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');
function ok(v,m){if(!v)throw new Error(m);}
function semverAtLeast(v,f){const a=String(v).split('.').map(Number),b=String(f).split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return true;}
const title=(html.match(/Pad Grade Mapper v([0-9]+\\.[0-9]+\\.[0-9]+) DEV/)||[])[1];
const version=(gradle.match(/versionName = "([0-9]+\\.[0-9]+\\.[0-9]+)"/)||[])[1];
const code=Number((gradle.match(/versionCode = ([0-9]+)/)||[])[1]);
ok(title&&semverAtLeast(title,'1.1.9'),'current DEV title regressed below 1.1.9');
ok(!html.includes('<script src="v119-dev.js'),'superseded v119 runtime must not be executable');
ok(js.includes("source.updateImage({image:frame.image,coordinates:coords})"),'historical v119 direct-image behavior unexpectedly changed');
ok(js.includes('heatmap.v119-image-committed'),'historical v119 diagnostics missing');
ok(version&&semverAtLeast(version,'1.1.9')&&code>=91,'Android version/build regressed below v1.1.9');
console.log('Pad Grade v1.1.9 historical carry-forward self-test passed');
'''
(WEB/'v119-heat-cutover-selftest.js').write_text(v119_test)

v120_static='''const fs=require('fs');
const html=fs.readFileSync('pad-grade/index.html','utf8');
const js=fs.readFileSync('pad-grade/v120-dev.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');
function ok(v,m){if(!v)throw new Error(m);}
ok(html.includes('Pad Grade Mapper v1.1.10 DEV'),'v1.1.10 DEV title missing');
ok(html.includes('src="v120-dev.js'),'v120 runtime not loaded');
ok(!html.includes('<script src="v119-dev.js'),'v119 runtime still executable');
ok(js.includes("source.updateImage({url:frame.url,coordinates:coords})"),'MapLibre 5.16 URL update contract missing');
ok(!js.includes('updateImage({image:'),'unsupported direct ImageBitmap update remains');
ok(!js.includes('TRANSPARENT_PIXEL'),'transparent placeholder remains');
ok(js.includes('state.styleEpoch>0||!!state.map.isStyleLoaded?.()'),'style.load readiness fallback missing');
ok(js.includes('source.loaded?.()===true'),'source loaded verification missing');
ok(js.includes('source.image!==previousImage'),'decoded image replacement verification missing');
ok(js.includes('heatmap.v120-image-requested')&&js.includes('heatmap.v120-image-committed')&&js.includes('heatmap.v120-image-verify-failed'),'v120 verification diagnostics missing');
ok(!/baseAddSource\\([^\\n]+type:\\s*['\"]canvas['\"]/.test(js),'v120 adds a real MapLibre CanvasSource');
ok(js.includes("id==='gpsMap'")&&js.includes("id==='pgCompareMap'"),'shared main/compare constructor hook missing');
ok(js.includes('gps.permission-denied-manual-fallback'),'GPS denial/manual fallback not carried forward');
ok(gradle.includes('versionCode = 92')&&gradle.includes('versionName = "1.1.10"'),'Android version/build mismatch');
console.log('Pad Grade v1.1.10 static self-test passed');
'''
(WEB/'v120-heat-fix-selftest.js').write_text(v120_static)

v120_runtime=r'''const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('pad-grade/v120-dev.js','utf8');
const marks=[];
class ImageSrc{
  constructor(spec){this.spec=spec;this.url=spec.url;this.image=null;this._loaded=false;this.requests=[spec.url];this._load(spec.url);}
  _load(url){this._loaded=false;setTimeout(()=>{if(this.url!==url)return;const m=String(url).match(/FAKE-(\d+)x(\d+)/);this.image={width:m?+m[1]:1,height:m?+m[2]:1,token:url};this._loaded=true;},4);}
  updateImage(o){if(!o.url)return this;this.url=o.url;this.requests.push(o.url);this._load(o.url);return this;}
  loaded(){return this._loaded;}
  setCoordinates(c){this.coords=c;return this;}
}
class FakeMap{
  constructor(opts){this.opts=opts;this._styleLoaded=false;this.sources=new Map();this.layers=new Map();this.events=new Map();this.realAdds=[];this.realLayerAdds=[];}
  on(n,fn){(this.events.get(n)||this.events.set(n,[]).get(n)).push(fn);return this;}
  once(n,fn){const wrap=(...a)=>{this.off(n,wrap);fn(...a)};return this.on(n,wrap);}
  off(n,fn){this.events.set(n,(this.events.get(n)||[]).filter(x=>x!==fn));return this;}
  fire(n){for(const fn of [...(this.events.get(n)||[])])fn();return this;}
  isStyleLoaded(){return this._styleLoaded;}
  addSource(id,spec){this.realAdds.push({id,spec});if(spec.type==='canvas')throw new Error('real CanvasSource forbidden');this.sources.set(id,spec.type==='image'?new ImageSrc(spec):{spec});return this;}
  getSource(id){return this.sources.get(id);}
  removeSource(id){this.sources.delete(id);return this;}
  addLayer(layer,before){this.realLayerAdds.push({layer,before});this.layers.set(layer.id,JSON.parse(JSON.stringify(layer)));return this;}
  getLayer(id){return this.layers.get(id);}
  removeLayer(id){this.layers.delete(id);return this;}
  setLayoutProperty(id,n,v){const l=this.layers.get(id);if(l){l.layout=l.layout||{};l.layout[n]=v;}return this;}
  getLayoutProperty(id,n){return this.layers.get(id)?.layout?.[n];}
  setPaintProperty(id,n,v){const l=this.layers.get(id);if(l){l.paint=l.paint||{};l.paint[n]=v;}return this;}
  getPaintProperty(id,n){return this.layers.get(id)?.paint?.[n];}
  moveLayer(){return this;}
  getStyle(){return {version:8,sources:Object.fromEntries([...this.sources].map(([k,v])=>[k,v.spec||{}])),layers:[...this.layers.values()]};}
  triggerRepaint(){return this;}
}
const heatToggle={checked:true},manual={classList:{contains:()=>false},click(){this.clicked=(this.clicked||0)+1;}},instruction={textContent:''};
let gid=0;
const geo={watchPosition(){return ++gid;},clearWatch(){},getCurrentPosition(){}};
const document={visibilityState:'visible',getElementById(id){return id==='heatmapToggle'?heatToggle:id==='manualModeBtn'?manual:id==='gpsInstruction'?instruction:null;},addEventListener(){},createElement(){throw new Error('probe canvas intentionally unavailable in node');}};
const fakeCanvas=(w,h)=>({width:w,height:h,toDataURL(){return `data:image/png;base64,FAKE-${w}x${h}`;}});
const performance={now:()=>Date.now()};
const sandbox={console,Map,Set,Promise,JSON,Math,Number,String,Date,Array,Object,RegExp,Error,Uint8Array,document,performance,navigator:{geolocation:geo},maplibregl:{Map:FakeMap},setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),CustomEvent:function(){}};
sandbox.window=sandbox;sandbox.addEventListener=()=>{};sandbox.PadGradeDiag={mark:(n,d)=>marks.push([n,d])};
vm.runInNewContext(code,sandbox,{filename:'v120-dev.js'});
const tick=(ms=35)=>new Promise(r=>setTimeout(r,ms));
async function exercise(container,prefix,layerPrefix,canonical){
  const map=new sandbox.maplibregl.Map({container});
  const coords=[[0,1],[1,1],[1,0],[0,0]];
  map.addSource(prefix+'0',{type:'canvas',canvas:fakeCanvas(83,99),coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'0',type:'raster',source:prefix+'0',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  await tick(15);
  if(map.realAdds.some(x=>x.spec.type==='canvas'))throw new Error(container+' leaked real CanvasSource');
  if(map.getSource(canonical))throw new Error(container+' canonical created before style.load');
  // Critical regression: pinned MapLibre can still report false here because raster imagery is loading.
  map._styleLoaded=false;map.fire('style.load');await tick();await tick();
  const src=map.getSource(canonical);if(!src)throw new Error(container+' canonical source missing after style.load with isStyleLoaded=false');
  if(!src.requests[0]?.includes('FAKE-83x99'))throw new Error(container+' initial image source did not use real frame URL');
  if(map.getLayoutProperty(canonical.replace('source','layer'),'visibility')!=='visible')throw new Error(container+' canonical layer not shown after verified URL load');
  const created=map.realAdds.filter(x=>x.id===canonical).length;
  map.addSource(prefix+'1',{type:'canvas',canvas:fakeCanvas(250,297),coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'1',type:'raster',source:prefix+'1',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  map.setLayoutProperty(layerPrefix+'0','visibility','none');
  await tick();await tick();
  if(map.getSource(canonical)!==src)throw new Error(container+' replaced canonical source during resolution change');
  if(src.requests.length<2||!src.requests.at(-1).includes('FAKE-250x297'))throw new Error(container+' second frame did not use MapLibre 5.16 URL update contract');
  if(map.realAdds.filter(x=>x.id===canonical).length!==created)throw new Error(container+' recreated canonical source without style reload');
  return map;
}
(async()=>{
  await exercise('gpsMap','pad-grade-interpolated-surface-canvas-source-','pad-grade-interpolated-surface-canvas-layer-','pad-grade-v120-heat-image-source');
  await exercise('pgCompareMap','pg-compare-heat-source-','pg-compare-heat-layer-','pad-grade-v120-compare-heat-image-source');
  const commits=marks.filter(x=>x[0]==='heatmap.v120-image-committed');
  if(commits.filter(x=>x[1].map==='primary').length<2||commits.filter(x=>x[1].map==='compare').length<2)throw new Error('missing verified main/compare commits');
  if(marks.some(x=>x[0]==='heatmap.v120-image-verify-failed'))throw new Error('unexpected verification failure');
  console.log('Pad Grade v1.1.10 MapLibre 5.16 URL-image runtime self-test passed');
})().catch(e=>{console.error(e);process.exit(1);});
'''
(WEB/'v120-runtime-selftest.js').write_text(v120_runtime)

workflow='''name: Pad Grade v1.1.10 MapLibre 5.16 Heat Fix

on:
  pull_request:
    branches: [pad-grade-dev]
    paths:
      - 'pad-grade/**'
      - 'pad-grade-android/**'
      - '.github/workflows/pad-grade-v120-heat-fix.yml'
  push:
    branches: [pad-grade-dev]
    paths:
      - 'pad-grade/**'
      - 'pad-grade-android/**'
      - '.github/workflows/pad-grade-v120-heat-fix.yml'

permissions:
  contents: read

jobs:
  v120-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate v1.1.10 runtime syntax
        run: node --check pad-grade/v120-dev.js
      - name: Validate MapLibre 5.16 cutover and version policy
        run: node pad-grade/v120-heat-fix-selftest.js
      - name: Exercise URL-only ImageSource controller
        run: node pad-grade/v120-runtime-selftest.js
      - name: Confirm pinned MapLibre version
        run: grep -F 'val mapLibreVersion = "5.16.0"' pad-grade-android/app/build.gradle.kts
'''
(ROOT/'.github/workflows/pad-grade-v120-heat-fix.yml').write_text(workflow)

print('v1.1.10 patch prepared')
