const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'v130-dev.js'),'utf8');
const captureSrc=fs.readFileSync(path.join(__dirname,'v130-base-capture.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const gradle=fs.readFileSync(path.join(__dirname,'../pad-grade-android/app/build.gradle.kts'),'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Versioning and load-order contract. Pad Grade intentionally rolls 1.2.9 to
// 1.3.0 rather than introducing a two-digit semver component such as 1.2.10.
must(src.includes("const VERSION='1.3.0'"),'v1.3.0 runtime version missing');
must(gradle.includes('versionCode = 102'),'Android build 102 missing');
must(gradle.includes('versionName = "1.3.0"'),'Android v1.3.0 versionName missing');
must(!/1\.2\.10|v1210/i.test(src+captureSrc+index+gradle),'two-digit version component leaked into v1.3.0 runtime');
const uiAt=index.indexOf('src="ui.js');
const captureAt=index.indexOf('src="v130-base-capture.js');
const v127At=index.indexOf('src="v127-dev.js');
const v130At=index.indexOf('src="v130-dev.js');
must(uiAt>=0&&captureAt>uiAt,'raw saveCurrent capture must load immediately after ui.js');
must(v127At>captureAt&&v130At>v127At,'v1.3.0 must install after raw capture and v1.2.7 cancellation owner');

// Structural boundaries from the field failure.
must(src.includes('wrapped.__padGradeV127MutationFirst=true'),'v1.2.7 rewrap suppression marker missing');
must(src.includes('wrapped.__padGradeV128MutationOrder=true'),'v1.2.8 rewrap suppression marker missing');
must(src.includes('wrapped.__padGradeV129CacheSnapshotBeforeRetire=true'),'v1.2.9 rewrap suppression marker missing');
must(src.includes("mark('heatmap.v130-cache-render-confirmed'"),'actual render confirmation diagnostic missing');
must(src.includes("mark('heatmap.v130-canonical-layer-reactivation-retry'"),'one-shot canonical visibility retry missing');
must(src.includes('exact891BeforeWorkerCreation:true'),'pre-worker exact cache contract missing');
must(src.includes('legacy900msRetryHasNoRaster:true'),'legacy producer retirement contract missing');
must(src.includes('protectedV122PresenterUnchanged:true'),'protected v1.2.2 presenter boundary missing');
must(src.includes("mark('imagery.v130-source-loaded'"),'imagery source-loaded diagnostic missing');
must(src.includes("mark('imagery.v130-source-error'"),'imagery source-error diagnostic missing');
must(src.includes("kind:'HIGH_RES_NAIP_PLUS'"),'independent high-resolution imagery probe missing');

const diag=[];
const order=[];
const localStore=new Map([['padGradeActiveProjectIdV5','pg-v130-test']]);
const readings={'0,0':37};
const settings={width:64,length:76,target:37,tol:1};
let rawSaveCalls=0,old127Calls=0,old128Calls=0,old129Calls=0;
let parentWorkerConstructions=0;
let virtualSource=null;
let commitSent=false;
let renderListener=null;
let canonicalVisibility='visible';
let canonicalOpacity=.58;
let currentInput='40';
const finalCanvas={width:750,height:891,getContext:()=>({drawImage(){},clearRect(){}})};
const makeCanvas=()=>({width:0,height:0,getContext:()=>({drawImage(){},clearRect(){}})});
const measured=()=>[
  {x:0,y:0,v:readings['0,0']},
  {x:64,y:0,v:38},
  {x:0,y:76,v:39}
];
const keyNow=()=>JSON.stringify({settings,points:measured().map(p=>[p.x,p.y,p.v])});
const originalKey=keyNow();

const mapListeners=new Map();
const sources=new Map([
  ['usgs-cached-imagery',{kind:'base'}],
  ['usgs-naip-plus',{kind:'high'}],
  ['pad-grade-v120-heat-image-source',{canvas:finalCanvas,play(){},pause(){}}]
]);
const layers=new Map([
  ['usgs-cached',{id:'usgs-cached'}],
  ['usgs-highres',{id:'usgs-highres'}],
  ['pad-grade-v120-heat-image-layer',{id:'pad-grade-v120-heat-image-layer'}]
]);
const fakeMap={
  __padGradeV129CacheReturnGuard:true,
  getZoom(){return 19;},
  getCenter(){return {lng:-97.5,lat:35.5};},
  isSourceLoaded(id){return id==='usgs-cached-imagery'||id==='usgs-naip-plus';},
  getStyle(){return {layers:[...layers.values()],sources:Object.fromEntries([...sources.keys()].map(k=>[k,{}]))};},
  getSource(id){return sources.get(String(id))||null;},
  getLayer(id){return layers.get(String(id))||null;},
  getLayoutProperty(id,name){if(name!=='visibility')return undefined;if(id==='pad-grade-v120-heat-image-layer')return canonicalVisibility;return 'visible';},
  setLayoutProperty(id,name,value){if(id==='pad-grade-v120-heat-image-layer'&&name==='visibility'){canonicalVisibility=value;order.push(value==='none'?'clear':'reactivate');}return this;},
  setPaintProperty(id,name,value){if(id==='pad-grade-v120-heat-image-layer'&&name==='raster-opacity')canonicalOpacity=value;return this;},
  addSource(id,spec){sources.set(String(id),{...spec,play(){},pause(){}});virtualSource=String(id);return this;},
  removeSource(id){sources.delete(String(id));return this;},
  addLayer(layer){layers.set(String(layer.id),layer);return this;},
  removeLayer(id){layers.delete(String(id));return this;},
  moveLayer(){return this;},
  on(type,fn){const list=mapListeners.get(type)||[];list.push(fn);mapListeners.set(type,list);return this;},
  once(type,fn){if(type==='render')renderListener=fn;else this.on(type,fn);return this;},
  triggerRepaint(){
    if(virtualSource&&!commitSent&&String(virtualSource).startsWith('pad-grade-interpolated-surface-canvas-source-')){
      commitSent=true;
      window.__padGradeV120PrimaryHeatState={currentFrame:{id:'frame'},currentSource:virtualSource};
      queueMicrotask(()=>window.PadGradeDiag.mark('heatmap.v122-canvas-committed',{tier:891,map:'primary',source:virtualSource}));
    }
    if(renderListener){const fn=renderListener;renderListener=null;queueMicrotask(fn);}
    return this;
  }
};

class ParentWorker{
  constructor(){parentWorkerConstructions++;this.listeners=new Map();}
  postMessage(){}
  terminate(){}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  removeEventListener(){}
}
ParentWorker.__padGradeV127Lifecycle=true;

const document={
  readyState:'complete',title:'',
  createElement(tag){if(tag==='canvas')return makeCanvas();return {};},
  getElementById(id){
    if(id==='heatmapToggle')return {checked:true};
    if(id==='readingInput')return {value:currentInput};
    return null;
  },
  addEventListener(){}
};
const rawSave=function(){rawSaveCalls++;order.push('mutate');readings['0,0']=+currentInput;return true;};
const window={
  saveCurrent:rawSave,
  Worker:ParentWorker,
  __padGradeMapInstance:fakeMap,
  __padGradeHeatmapMesh:{tier:891,nx:750,ny:891},
  __padGradeV120PrimaryHeatState:{currentFrame:{id:'old'},currentSource:'old-source',sources:new Map()},
  cfg:()=>settings,
  pgMeasuredSurfacePoints:measured,
  pointFromIndex:()=>({r:0,c:0}),
  k:(r,c)=>`${r},${c}`,
  currentIndex:0,
  readings,
  fitPointLatLon:(x,y)=>({lon:-97.5+x/100000,lat:35.5+y/100000}),
  pgHeatmapOpacity:()=>.58,
  pgDrawSurface(){const pts=window.pgMeasuredSurfacePoints();if(pts.length===0)order.push('retire-owner');else order.push('refresh');},
  PadGradeHeatGenerationV127:{beforeSurfaceMutation(){order.push('cancel');}},
  PadGradeFiles:{read:async()=>null},
  PadGradeDiag:{mark(name,details){diag.push({name,details});}},
  addEventListener(){},dispatchEvent(){},
  localStorage:null
};
const context={
  window,document,
  localStorage:{getItem:k=>localStore.get(k)||null,setItem:(k,v)=>localStore.set(k,v)},
  performance:{now:()=>Date.now()},
  pointFromIndex:window.pointFromIndex,k:window.k,readings,currentIndex:0,gpsFit:{},
  MessageEvent:class MessageEvent{constructor(type,init){this.type=type;this.data=init?.data;}},
  Image:class Image{set src(v){this.naturalWidth=256;this.naturalHeight=256;queueMicrotask(()=>this.onload?.());}},
  requestAnimationFrame:fn=>{queueMicrotask(fn);return 1;},
  queueMicrotask,
  setTimeout:(fn,ms=0)=>{if(ms<=0)queueMicrotask(fn);return 1;},clearTimeout(){},
  setInterval:()=>1,clearInterval(){},console
};
window.localStorage=context.localStorage;
vm.createContext(context);

// Capture the real point-save function before simulating the historical wrappers.
vm.runInContext(captureSrc,context,{filename:'v130-base-capture.js'});
must(window.__padGradeBaseSaveCurrentV130===rawSave,'raw saveCurrent was not captured before heat wrappers');
const old127=function(){old127Calls++;return rawSave.apply(this,arguments);};old127.__padGradeV127MutationFirst=true;
const old128=function(){old128Calls++;return old127.apply(this,arguments);};old128.__padGradeV128MutationOrder=true;
const old129=function(){old129Calls++;return old128.apply(this,arguments);};old129.__padGradeV129CacheSnapshotBeforeRetire=true;old129.__padGradeV128MutationOrder=true;
window.saveCurrent=old129;
vm.runInContext(src,context,{filename:'v130-dev.js'});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
  await tick();
  must(window.saveCurrent.__padGradeV130AuthoritativeMutation===true,'authoritative v1.3.0 saveCurrent did not install');
  must(window.saveCurrent.__padGradeV127MutationFirst&&window.saveCurrent.__padGradeV128MutationOrder&&window.saveCurrent.__padGradeV129CacheSnapshotBeforeRetire,'legacy installers were not told lifecycle is already satisfied');
  must(window.Worker.__padGradeV130Lazy===true,'lazy pre-cache Worker boundary did not install');

  // A real point save must bypass all three historical save wrappers. The old
  // generation is cancelled first, then the raw mutation runs, then the legacy
  // producer is emptied and the canonical derived heat is hidden, then refresh starts.
  window.saveCurrent();
  await tick();
  must(rawSaveCalls===1,'raw point mutation did not run exactly once');
  must(old127Calls===0&&old128Calls===0&&old129Calls===0,'historical saveCurrent wrapper stack still executed');
  const cancelAt=order.indexOf('cancel'),mutateAt=order.indexOf('mutate'),retireAt=order.indexOf('retire-owner'),clearAt=order.indexOf('clear'),refreshAt=order.indexOf('refresh');
  must(cancelAt>=0&&cancelAt<mutateAt,'generation cancellation was not first');
  must(mutateAt<retireAt&&retireAt<clearAt&&clearAt<refreshAt,'mutation/retire/clear/refresh order regressed');
  must(canonicalVisibility==='none','obsolete canonical heat was not hidden after mutation');

  // Return to the exact original value. The first mutation captured the original
  // completed 891 into the bounded transition cache. The regular 99/297 requests
  // must resolve that exact 891 before constructing even one real Worker.
  currentInput='37';
  window.saveCurrent();
  await tick();
  must(keyNow()===originalKey,'test did not return to the exact original surface');
  const terminal=[];
  const w99=new window.Worker('heatmap-raster-worker-v073.js?v=test');w99.onmessage=e=>terminal.push(e.data);
  const w297=new window.Worker('heatmap-raster-worker-v073.js?v=test');w297.onmessage=e=>terminal.push(e.data);
  const msgBase={type:'build',context:'regular',settings,points:measured()};
  w99.postMessage({...msgBase,jobId:101,tier:99,nx:83,ny:99});
  w297.postMessage({...msgBase,jobId:102,tier:297,nx:250,ny:297});
  await tick();await tick();await tick();
  must(parentWorkerConstructions===0,'exact cached 891 still constructed a real raster Worker');
  must(terminal.filter(x=>x?.cacheHit&&x?.cachePreflight).length===2,'99/297 cache-hit requests were not both short-circuited');
  must(diag.some(x=>x.name==='heatmap.v130-exact-cache-short-circuit'&&x.details?.workersCreated===0),'zero-worker exact-cache diagnostic missing');
  must(diag.some(x=>x.name==='heatmap.v130-cache-frame-committed'),'cached 891 never reached the protected presenter boundary');
  must(diag.some(x=>x.name==='heatmap.v130-cache-render-confirmed'),'cached 891 was not confirmed on a MapLibre render');
  must(canonicalVisibility==='visible','canonical heat layer was not reactivated after cache commit');
  must(Math.abs(canonicalOpacity-.58)<1e-9,'canonical heat opacity was not restored');

  // The provider stack itself is unchanged, but v1.3.0 must tell the next field log
  // whether close zoom expects high-res NAIP and whether both sources are actually loaded.
  const stack=diag.find(x=>x.name==='imagery.v130-stack-state'&&x.details?.expectedContributor==='HIGH_RES_NAIP_PLUS');
  must(!!stack,'close-zoom imagery contributor diagnostic missing');
  must(stack.details.base?.sourcePresent&&stack.details.highRes?.sourcePresent,'imagery diagnostic did not see both configured sources');
  must(diag.some(x=>x.name==='imagery.v130-diagnostics-attached'&&x.details?.independentHighResProbe===true),'independent high-res probe contract missing');

  console.log('Pad Grade v1.3.0 lifecycle/cache-render/imagery self-test passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
