const fs=require('fs');
const vm=require('vm');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'v129-dev.js'),'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Structural invariants: this fix must sit outside v1.2.8, must validate an exact
// persisted 891 cache before rehydrating, and must feed a fresh clone downstream.
must(src.includes('if(!map.__padGradeV128RetiredCanvasGuard)return false;'),'v1.2.9 must install outside v1.2.8');
must(src.includes('raw.surfaceKey!==key')&&src.includes('raw.projectId!==projectId'),'rehydration must require exact current project/surface cache');
must(src.includes('+raw.tier!==891')&&src.includes('+raw.nx!==meta.width')&&src.includes('+raw.ny!==meta.height'),'rehydration must require exact 891 dimensions');
must(src.includes("mark('heatmap.v129-cache-rehydrated'"),'cache rehydrate diagnostic missing');
must(src.includes("mark('heatmap.v129-retired-retry-blocked'"),'retired retry diagnostic missing');
must(src.includes('preventsRetombstone:true'),'stale retry must be stopped before it can re-tombstone a current slot');
must(src.includes('const fresh=cloneCanvas(canvas,meta.width,meta.height)'),'restored cache memory must be cloned before v1.2.8/v1.2.7 admission');
must(src.includes("mark('heatmap.v129-cache-write-retired-canvas-blocked'"),'retired cache-write guard diagnostic missing');
must(src.includes('dims.width!==nx||dims.height!==ny'),'cache write must reject PNG/metadata dimension mismatch');
must(src.includes('protectedV122PresenterUnchanged:true'),'protected v1.2.2 presenter contract missing');

// Lightweight behavioral harness for the wrapper ordering. It deliberately does
// not model MapLibre; it proves which calls are allowed to reach the already-tested
// v1.2.8/v1.2.7 wrappers underneath this layer.
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
const currentKey=JSON.stringify({settings,points:points.map(p=>[p.x,p.y,p.v])});
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
const document={
  readyState:'complete',title:'',
  createElement(tag){return tag==='canvas'?makeCanvas():{};},
  getElementById(id){return id==='heatmapToggle'?{checked:true}:null;},
  addEventListener(){}
};
const window={
  __padGradeMapInstance:fakeMap,
  cfg:()=>settings,
  pgMeasuredSurfacePoints:()=>points,
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

async function main(){
  // A shrunk retired 297 canvas is stale maintenance only. It must stop here, before
  // v1.2.8 can re-tombstone source-1 and before the paired layer call reaches it.
  const retired297=makeCanvas();retired297.width=1;retired297.height=1;
  retired297.__padGradeV128RetiredWidth=250;retired297.__padGradeV128RetiredHeight=297;
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-1',{type:'canvas',canvas:retired297,coordinates:[]});
  fakeMap.addLayer({id:'pad-grade-interpolated-surface-canvas-layer-1',type:'raster',source:'pad-grade-interpolated-surface-canvas-source-1'});
  must(sourceCalls.length===0,'retired lower-tier canvas leaked through to v1.2.8');
  must(layerCalls.length===0,'paired retired layer leaked through to v1.2.8');

  // A genuinely fresh current canvas must continue through unchanged.
  const fresh=makeCanvas();fresh.width=83;fresh.height=99;
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:fresh,coordinates:[]});
  must(sourceCalls.length===1&&sourceCalls[0].spec.canvas===fresh,'fresh current canvas was blocked or replaced');

  // Once an old cache-memory canvas has been rehydrated for this exact surface, it
  // remains in v1.2.8's retired identity set. v1.2.9 must therefore clone it and send
  // the clone downstream instead of reusing the retired identity.
  const cacheCanvas=makeCanvas();cacheCanvas.width=750;cacheCanvas.height=891;
  cacheCanvas.__padGradeV128RetiredWidth=750;cacheCanvas.__padGradeV128RetiredHeight=891;
  cacheCanvas.__padGradeV129RehydratedProjectId=projectId;
  cacheCanvas.__padGradeV129RehydratedSurfaceKey=currentKey;
  fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:cacheCanvas,coordinates:[]});
  must(sourceCalls.length===2,'rehydrated exact cache was not forwarded');
  must(sourceCalls[1].spec.canvas!==cacheCanvas,'retired cache canvas identity was forwarded instead of a fresh clone');
  must(sourceCalls[1].spec.canvas.width===750&&sourceCalls[1].spec.canvas.height===891,'fresh cache clone lost 891 dimensions');

  // Simulate the v1.1.3 delayed cache-write race: metadata still says 750x891,
  // but the encoded canvas has already been retired to 1x1. The write must be
  // rejected before it can overwrite a valid persisted final cache.
  const badPayload=JSON.stringify({format:'PadGradeHeatCache',version:1,projectId,surfaceKey:currentKey,tier:891,nx:750,ny:891,png:pngHeaderDataUrl(1,1)});
  const badOk=await window.PadGradeFiles.write('Pad-Grade-Heat-pg-test.pgheatcache',badPayload);
  must(badOk===false,'retired 1x1 final-cache payload was not rejected');
  must(writeCalls.length===0,'retired 1x1 final-cache payload reached durable storage');

  const goodPayload=JSON.stringify({format:'PadGradeHeatCache',version:1,projectId,surfaceKey:currentKey,tier:891,nx:750,ny:891,png:pngHeaderDataUrl(750,891)});
  const goodOk=await window.PadGradeFiles.write('Pad-Grade-Heat-pg-test.pgheatcache',goodPayload);
  must(goodOk===true,'valid 750x891 final-cache payload was rejected');
  must(writeCalls.length===1,'valid final-cache payload did not reach durable storage exactly once');

  console.log('Pad Grade v1.2.9 exact cache return self-test passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
