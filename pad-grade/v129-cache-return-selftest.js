const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'v129-dev.js'),'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Structural invariants: v1.2.9 stays outside v1.2.8, preserves the protected
// presenter, snapshots only a small number of final surfaces, and rejects a cache
// file whose actual PNG was collapsed before its delayed write.
must(src.includes('if(!map.__padGradeV128RetiredCanvasGuard)return false;'),'v1.2.9 must install outside v1.2.8');
must(src.includes('const SNAPSHOT_LIMIT=2'),'transition snapshot cache must remain explicitly bounded');
must(src.includes("mark('heatmap.v129-final-cache-snapshot-captured'"),'pre-retire final snapshot diagnostic missing');
must(src.includes("mark('heatmap.v129-cache-snapshot-restored'"),'snapshot restore diagnostic missing');
must(src.includes('raw.surfaceKey!==key')&&src.includes('raw.projectId!==projectId'),'disk fallback must require exact current project/surface cache');
must(src.includes('+raw.tier!==891')&&src.includes('+raw.nx!==meta.width')&&src.includes('+raw.ny!==meta.height'),'disk fallback must require exact 891 dimensions');
must(src.includes("mark('heatmap.v129-retired-retry-blocked'"),'retired retry diagnostic missing');
must(src.includes('preventsRetombstone:true'),'stale retry must stop before it can re-tombstone a current slot');
must(src.includes('const fresh=cloneCanvas(canvas,meta.width,meta.height)'),'restored cache memory must be cloned before v1.2.8/v1.2.7 admission');
must(src.includes("mark('heatmap.v129-cache-write-retired-canvas-blocked'"),'retired cache-write guard diagnostic missing');
must(src.includes('dims.width!==nx||dims.height!==ny'),'cache write must reject PNG/metadata dimension mismatch');
must(src.includes('protectedV122PresenterUnchanged:true'),'protected v1.2.2 presenter contract missing');

const sourceCalls=[];
const layerCalls=[];
const writeCalls=[];
const fakeMap={
  __padGradeV128RetiredCanvasGuard:true,
  addSource(id,spec){sourceCalls.push({id,spec});return this;},
  addLayer(layer,before){layerCalls.push({layer,before});return this;},
  getLayer(){return null;},getSource(){return null;},removeLayer(){return this;},removeSource(){return this;},
  setLayoutProperty(){return this;},triggerRepaint(){return this;}
};
const projectId='pg-test';
const settings={width:64,length:76,target:37,tol:1};
const points=[{x:0,y:0,v:37},{x:64,y:0,v:38},{x:0,y:76,v:39}];
const originalValue=points[0].v;
const surfaceKey=()=>JSON.stringify({settings,points:points.map(p=>[p.x,p.y,p.v])});
const originalKey=surfaceKey();
const localStore=new Map([['padGradeActiveProjectIdV5',projectId]]);
function makeCanvas(){
  const c={width:0,height:0};
  c.getContext=()=>({drawImage(){},clearRect(){}});
  return c;
}
function pngHeaderDataUrl(width,height){
  const bytes=Buffer.alloc(48);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes,0);
  bytes.writeUInt32BE(13,8);Buffer.from('IHDR').copy(bytes,12);
  bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  return 'data:image/png;base64,'+bytes.toString('base64');
}
const displayed891=makeCanvas();displayed891.width=750;displayed891.height=891;
function v128WrappedSave(){points[0].v=40;return true;}
v128WrappedSave.__padGradeV128MutationOrder=true;
const document={
  readyState:'complete',title:'',
  createElement(tag){return tag==='canvas'?makeCanvas():{};},
  getElementById(id){return id==='heatmapToggle'?{checked:true}:null;},
  addEventListener(){}
};
const window={
  __padGradeMapInstance:fakeMap,
  __padGradeV120PrimaryHeatState:{
    currentSource:'pad-grade-interpolated-surface-canvas-source-0',
    sources:new Map([['pad-grade-interpolated-surface-canvas-source-0',{canvas:displayed891,removed:false,serial:1}]])
  },
  cfg:()=>settings,
  pgMeasuredSurfacePoints:()=>points,
  saveCurrent:v128WrappedSave,
  PadGradeDiag:{mark(){}},
  PadGradeFiles:{
    read:async()=>null,
    write:async(filename,text)=>{writeCalls.push({filename,text});return true;}
  },
  addEventListener(){},
  localStorage:null
};
const context={window,document,localStorage:{getItem:k=>localStore.get(k)||null},performance:{now:()=>1000},
  setTimeout:fn=>{fn();return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){},queueMicrotask:fn=>fn(),
  Image:function(){},requestAnimationFrame:fn=>fn(),atob:s=>Buffer.from(s,'base64').toString('binary'),console};
window.localStorage=context.localStorage;
vm.createContext(context);
vm.runInContext(src,context,{filename:'v129-dev.js'});
must(fakeMap.__padGradeV129CacheReturnGuard===true,'v1.2.9 map guard did not install');
must(window.PadGradeFiles.write.__padGradeV129CacheWriteGuard===true,'v1.2.9 cache write guard did not install');
must(window.saveCurrent.__padGradeV129CacheSnapshotBeforeRetire===true,'v1.2.9 pre-retire save wrapper did not install');

async function main(){
  // A real point save captures the currently visible 891 before the underlying
  // v1.2.8 wrapper mutates/clears/retires it.
  window.saveCurrent();
  must(points[0].v===40,'underlying mutation did not run');

  // Model v1.2.8 retirement of the shared v1.1.3 cache object, then return the
  // project data to the exact original surface. The old object should be restored
  // from v1.2.9's bounded transition snapshot and only a fresh clone may continue
  // into the v1.2.8/v1.2.7/v1.2.0 stack.
  displayed891.__padGradeV128RetiredWidth=750;
  displayed891.__padGradeV128RetiredHeight=891;
  displayed891.width=1;displayed891.height=1;
  points[0].v=originalValue;
  must(surfaceKey()===originalKey,'test did not return to exact original surface');
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:displayed891,coordinates:[]});
  must(displayed891.width===750&&displayed891.height===891,'retired cache-memory canvas was not restored from transition snapshot');
  must(sourceCalls.length===1,'restored exact cache was not forwarded exactly once');
  must(sourceCalls[0].spec.canvas!==displayed891,'retired cache canvas identity was forwarded instead of a fresh clone');
  must(sourceCalls[0].spec.canvas.width===750&&sourceCalls[0].spec.canvas.height===891,'fresh cache clone lost 891 dimensions');

  // A shrunk retired lower tier is stale maintenance only. It must stop here,
  // before v1.2.8 can re-tombstone source-1 and before its paired layer reaches it.
  const retired297=makeCanvas();retired297.width=1;retired297.height=1;
  retired297.__padGradeV128RetiredWidth=250;retired297.__padGradeV128RetiredHeight=297;
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-1',{type:'canvas',canvas:retired297,coordinates:[]});
  fakeMap.addLayer({id:'pad-grade-interpolated-surface-canvas-layer-1',type:'raster',source:'pad-grade-interpolated-surface-canvas-source-1'});
  must(sourceCalls.length===1,'retired lower-tier canvas leaked through to v1.2.8');
  must(layerCalls.length===0,'paired retired layer leaked through to v1.2.8');

  // A genuinely fresh current canvas must continue through unchanged.
  const fresh=makeCanvas();fresh.width=83;fresh.height=99;
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:fresh,coordinates:[]});
  must(sourceCalls.length===2&&sourceCalls[1].spec.canvas===fresh,'fresh current canvas was blocked or replaced');

  // Simulate the v1.1.3 delayed cache-write race: metadata still says 750x891,
  // but the encoded canvas was retired before idle persistence. It must not replace
  // a good durable cache. A matching 750x891 payload must still pass normally.
  const badPayload=JSON.stringify({format:'PadGradeHeatCache',version:1,projectId,surfaceKey:originalKey,tier:891,nx:750,ny:891,png:pngHeaderDataUrl(1,1)});
  const badOk=await window.PadGradeFiles.write('Pad-Grade-Heat-pg-test.pgheatcache',badPayload);
  must(badOk===false,'retired 1x1 final-cache payload was not rejected');
  must(writeCalls.length===0,'retired 1x1 final-cache payload reached durable storage');

  const goodPayload=JSON.stringify({format:'PadGradeHeatCache',version:1,projectId,surfaceKey:originalKey,tier:891,nx:750,ny:891,png:pngHeaderDataUrl(750,891)});
  const goodOk=await window.PadGradeFiles.write('Pad-Grade-Heat-pg-test.pgheatcache',goodPayload);
  must(goodOk===true,'valid 750x891 final-cache payload was rejected');
  must(writeCalls.length===1,'valid final-cache payload did not reach durable storage exactly once');

  console.log('Pad Grade v1.2.9 exact cache return self-test passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
