/* Pad Grade v1.3.5 DEV — Blob-bundled parallel final-891 coordinator.
 *
 * Android WebView field diagnostics proved nested Blob workers execute while a
 * nested worker created from the external appassets URL dies before its first
 * statement. v1.3.5 therefore fetches the local surface + compute-only band
 * sources in this coordinator, builds one Blob payload, and spawns every final
 * 891 compute worker from that same Blob URL. Bands remain offscreen; only one
 * complete assembled 891 RGBA buffer can leave this coordinator.
 */
'use strict';

const pgWorkerNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
const SURFACE_URL=new URL('surface-local-v078.js?v=20260826-2',self.location.href).href;
const BAND_SOURCE_URL=new URL('heatmap-raster-band-worker-v135.js?v=20260901-1',self.location.href).href;
importScripts(SURFACE_URL);

const GRADE=[79,143,58];
const CUT_NEAR=[247,196,92];
const CUT_MID=[230,126,45];
const CUT_MAX=[180,45,35];
const FILL_NEAR=[103,205,220];
const FILL_MID=[54,137,205];
const FILL_MAX=[40,80,200];

let activeCoordinator=null;

function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-a[i])*t));}
function spectrum(near,mid,end,t){t=Math.max(0,Math.min(1,t));return t<=.5?lerp(near,mid,t*2):lerp(mid,end,(t-.5)*2);}
function surfaceColor(diff,tol,maxCut,maxFill){
  tol=Math.max(0,Number(tol)||0);
  if(Math.abs(diff)<=tol)return GRADE;
  if(diff<0){const span=Math.max(maxCut-tol,1e-9);return spectrum(CUT_NEAR,CUT_MID,CUT_MAX,(Math.abs(diff)-tol)/span);}
  const span=Math.max(maxFill-tol,1e-9);return spectrum(FILL_NEAR,FILL_MID,FILL_MAX,(diff-tol)/span);
}
function normalizedInputPoints(msg){
  return (msg.points||[]).map(p=>({x:+p.x,y:+p.y,v:+p.v,r:+p.r,c:+p.c,label:p.label}))
    .filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
}
function scaleFor(points,target){
  let maxCut=0,maxFill=0;
  for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}
  return {maxCut,maxFill};
}
function colorRaster(surface,target,tol,maxCut,maxFill){
  const started=pgWorkerNow(),rgba=new Uint8ClampedArray(surface.nx*surface.ny*4);
  for(let o=0;o<surface.values.length;o++){
    if(!surface.counts[o])continue;
    const v=surface.values[o];if(!Number.isFinite(v))continue;
    const c=surfaceColor(v-target,tol,maxCut,maxFill),p=o*4;
    rgba[p]=c[0];rgba[p+1]=c[1];rgba[p+2]=c[2];rgba[p+3]=255;
  }
  return {rgba,colorElapsedMs:+(pgWorkerNow()-started).toFixed(1)};
}
function commonBuildState(msg){
  const started=pgWorkerNow(),points=normalizedInputPoints(msg);
  if(points.length<3)return {empty:true,points,started};
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  const nx=Math.max(2,+msg.nx|0),ny=Math.max(2,+msg.ny|0),width=Math.max(.001,+s.width||1),length=Math.max(.001,+s.length||1);
  const {maxCut,maxFill}=scaleFor(points,target);
  return {empty:false,started,points,s,target,tol,nx,ny,width,length,maxCut,maxFill};
}
function buildWhole(msg,extra={}){
  const state=commonBuildState(msg);
  if(state.empty){postMessage({type:'empty',jobId:msg.jobId,count:state.points.length});return;}
  const rasterStarted=pgWorkerNow();
  const surface=PadGradeLocalSurface.rasterize({nx:state.nx,ny:state.ny,width:state.width,length:state.length,points:state.points,flipY:true});
  const rasterEnded=pgWorkerNow();
  if(!surface.cells){postMessage({type:'empty',jobId:msg.jobId,count:state.points.length});return;}
  const colored=colorRaster(surface,state.target,state.tol,state.maxCut,state.maxFill),ended=pgWorkerNow();
  postMessage({
    type:'complete',jobId:msg.jobId,tier:+msg.tier,nx:state.nx,ny:state.ny,cells:surface.cells,context:msg.context||'regular',
    workerElapsedMs:+(ended-state.started).toFixed(1),rasterizeElapsedMs:+(rasterEnded-rasterStarted).toFixed(1),
    colorElapsedMs:colored.colorElapsedMs,setupElapsedMs:+(rasterStarted-state.started).toFixed(1),parallelMetrics:{
      enabled:false,hardwareConcurrency:hardwareConcurrency(),computeWorkers:1,bandsCompleted:0,
      fallbackReason:extra.fallbackReason||null,childWorkerKind:'blob-bundled-v135',
      blobPrepElapsedMs:extra.blobPrepElapsedMs??null,blobSourceBytes:extra.blobSourceBytes??null,
      atomicFinalBuffer:true,partialFramesPublished:0,bandFramesPublished:0
    },buffer:colored.rgba.buffer
  },[colored.rgba.buffer]);
}
function hardwareConcurrency(){
  const n=Number(typeof navigator!=='undefined'&&navigator.hardwareConcurrency);
  return Number.isFinite(n)&&n>=1?Math.floor(n):1;
}
function desiredComputeWorkers(){return Math.max(1,hardwareConcurrency()-1);}
function bandSpec(index,count,ny,length){
  const startRow=Math.floor(index*ny/count),endRow=Math.floor((index+1)*ny/count),rows=Math.max(0,endRow-startRow);
  const yBottom=length-(endRow/ny)*length,bandLength=(rows/ny)*length;
  return {index,startRow,endRow,rows,yBottom,bandLength};
}
function clean(value,max=100){return String(value==null?'':value).replace(/[;\r\n]/g,' ').slice(0,max);}
function basename(value){try{return new URL(String(value||''),self.location.href).pathname.split('/').pop()||'';}catch(e){return '';}}
function timeoutPromise(ms,value){return new Promise(resolve=>setTimeout(()=>resolve(value),ms));}
function releaseBlob(c){
  const url=c&&c.blobUrl;c.blobUrl='';
  if(url)try{URL.revokeObjectURL(url);}catch(e){}
}
function stopWorkers(c){
  if(!c)return;
  for(const w of c.workers||[])try{w.terminate();}catch(e){}
  if(c.workers)c.workers.length=0;
  releaseBlob(c);
}
function terminateCoordinator(reason){
  const c=activeCoordinator;if(!c)return;
  activeCoordinator=null;c.cancelled=true;c.cancelReason=reason;
  stopWorkers(c);
}

async function fetchAssetText(url,timeoutMs=2500){
  if(typeof fetch!=='function')throw new Error('Worker fetch unavailable');
  const ctrl=typeof AbortController==='function'?new AbortController():null;
  let timer=null;
  try{
    if(ctrl)timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    const response=await fetch(url,{cache:'no-store',signal:ctrl?.signal});
    if(!response.ok)throw new Error(`Asset fetch failed ${response.status}`);
    const text=await response.text();
    if(!text||text.length<100)throw new Error('Asset fetch returned empty source');
    return text;
  }finally{if(timer)clearTimeout(timer);}
}
async function prepareBundledWorkerBlob(){
  if(typeof Blob!=='function'||typeof URL?.createObjectURL!=='function')throw new Error('Blob worker API unavailable');
  const started=pgWorkerNow();
  const [surfaceSource,bandSource]=await Promise.all([
    fetchAssetText(SURFACE_URL),
    fetchAssetText(BAND_SOURCE_URL)
  ]);
  const source=`${surfaceSource}\n;\n${bandSource}\n//# sourceURL=pad-grade-heat-band-v135-bundle.js\n`;
  const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  return {blobUrl,blobSourceBytes:source.length,blobPrepElapsedMs:+(pgWorkerNow()-started).toFixed(1)};
}

async function nestedBlobProbe(){
  if(typeof Worker!=='function')return 'worker-unavailable';
  if(typeof Blob!=='function'||typeof URL?.createObjectURL!=='function')return 'blob-api-unavailable';
  let url='',w=null;
  try{
    url=URL.createObjectURL(new Blob(["postMessage({type:'nested-blob-boot'});"],{type:'text/javascript'}));
    return await Promise.race([
      new Promise(resolve=>{
        try{w=new Worker(url);}catch(e){resolve(`construct:${clean(e?.name||'Error',24)}:${clean(e?.message||e,60)}`);return;}
        w.onmessage=e=>resolve(e?.data?.type==='nested-blob-boot'?'ok':'message-other');
        w.onerror=e=>{try{e?.preventDefault?.();}catch(ignore){}resolve(`error:${clean(e?.message||'worker-error',70)}`);};
        w.onmessageerror=()=>resolve('messageerror');
      }),timeoutPromise(650,'timeout')
    ]);
  }catch(e){return `probe:${clean(e?.name||'Error',24)}:${clean(e?.message||e,60)}`;}
  finally{try{w?.terminate?.();}catch(e){}try{if(url)URL.revokeObjectURL(url);}catch(e){}}
}
async function assetProbe(url){
  try{const text=await fetchAssetText(url,900);return `ok:js:${text.length}`;}
  catch(e){return `${clean(e?.name||'Error',24)}:${clean(e?.message||e,60)}`;}
}
async function collectFailureDiagnostics(meta){
  const [blobResult,bandAsset,surfaceAsset]=await Promise.all([nestedBlobProbe(),assetProbe(BAND_SOURCE_URL),assetProbe(SURFACE_URL)]);
  return {
    blobResult,bandAsset,surfaceAsset,
    bandIndex:Number.isFinite(+meta?.bandIndex)?+meta.bandIndex:-1,
    stage:clean(meta?.stage||'unknown',40),eventType:clean(meta?.eventType||'unknown',32),
    errorName:clean(meta?.errorName||'',32),errorMessage:clean(meta?.errorMessage||'',100),
    filename:basename(meta?.filename),line:Number.isFinite(+meta?.line)?+meta.line:0,col:Number.isFinite(+meta?.col)?+meta.col:0
  };
}
function failureReason(d){
  return [
    'blob-band-worker-failed',`event=${d.eventType}`,`band=${d.bandIndex}`,`stage=${d.stage}`,
    d.errorName?`name=${d.errorName}`:'',d.errorMessage?`msg=${d.errorMessage}`:'',d.filename?`file=${d.filename}`:'',
    d.line?`line=${d.line}`:'',d.col?`col=${d.col}`:'',`nestedBlob=${d.blobResult}`,`bandAsset=${d.bandAsset}`,`surfaceAsset=${d.surfaceAsset}`
  ].filter(Boolean).join(';').slice(0,500);
}

async function startParallel(msg){
  const state=commonBuildState(msg);
  if(state.empty){postMessage({type:'empty',jobId:msg.jobId,count:state.points.length});return;}
  const desired=Math.min(state.ny,desiredComputeWorkers());
  if(desired<=1||typeof Worker!=='function'){buildWhole(msg,{fallbackReason:desired<=1?'single-compute-worker':'nested-worker-unavailable'});return;}

  terminateCoordinator('replacement-build');
  const coordinator={
    jobId:msg.jobId,started:state.started,workers:[],remaining:desired,cancelled:false,fallingBack:false,
    rgba:new Uint8ClampedArray(state.nx*state.ny*4),cells:0,bandMetrics:[],bandStates:[],
    blobUrl:'',blobSourceBytes:0,blobPrepElapsedMs:0,createElapsedMs:0,firstBandAt:0
  };
  activeCoordinator=coordinator;

  let bundle;
  try{bundle=await prepareBundledWorkerBlob();}
  catch(error){
    if(activeCoordinator!==coordinator||coordinator.cancelled)return;
    coordinator.fallingBack=true;
    activeCoordinator=null;
    stopWorkers(coordinator);
    buildWhole(msg,{fallbackReason:`blob-bundle-prep-failed;name=${clean(error?.name||'Error',32)};msg=${clean(error?.message||error,120)}`});
    return;
  }
  if(activeCoordinator!==coordinator||coordinator.cancelled){try{URL.revokeObjectURL(bundle.blobUrl);}catch(e){}return;}
  coordinator.blobUrl=bundle.blobUrl;
  coordinator.blobSourceBytes=bundle.blobSourceBytes;
  coordinator.blobPrepElapsedMs=bundle.blobPrepElapsedMs;
  const createStarted=pgWorkerNow();

  let createError=null;
  for(let i=0;i<desired;i++){
    const band=bandSpec(i,desired,state.ny,state.length);
    const bandState={index:i,stage:'not-created',stageElapsedMs:null};
    coordinator.bandStates[i]=bandState;
    if(!band.rows){coordinator.remaining--;bandState.stage='empty-spec';continue;}
    let w=null;
    try{
      w=new Worker(coordinator.blobUrl);
      bandState.stage='constructed';
      bandState.constructedAt=pgWorkerNow();
    }catch(e){createError={error:e,bandIndex:i,stage:'construct'};break;}
    coordinator.workers.push(w);
    w.onmessage=event=>{
      if(activeCoordinator!==coordinator||coordinator.cancelled)return;
      const data=event.data||{};
      if(data.type==='band-stage'){
        const idx=Number.isFinite(+data.bandIndex)?+data.bandIndex:i;
        const s=coordinator.bandStates[idx]||bandState;
        s.stage=clean(data.stage||'stage-message',40);
        s.stageElapsedMs=Number.isFinite(+data.elapsedMs)?+data.elapsedMs:null;
        return;
      }
      if(data.jobId!==msg.jobId&&data.jobId!=null)return;
      if(data.type==='band-bootstrap-error'||data.type==='band-fatal-error'||data.type==='band-error'){
        const idx=Number.isFinite(+data.bandIndex)?+data.bandIndex:i;
        const s=coordinator.bandStates[idx]||bandState;
        void fallback(null,{bandIndex:idx,stage:data.stage||s.stage,eventType:data.type,errorName:data.name,errorMessage:data.message});
        return;
      }
      if(data.type==='band-empty'){
        coordinator.remaining--;bandState.stage='band-empty';try{w.terminate();}catch(e){}finishIfReady();return;
      }
      if(data.type!=='band-complete')return;
      bandState.stage='band-complete';
      if(!coordinator.firstBandAt)coordinator.firstBandAt=pgWorkerNow();
      try{
        const rowOffset=(+data.startRow||0)*state.nx*4;
        coordinator.rgba.set(new Uint8ClampedArray(data.buffer),rowOffset);
      }catch(e){void fallback(e,{bandIndex:i,stage:'merge-buffer',eventType:'merge-error',errorName:e?.name,errorMessage:e?.message});return;}
      coordinator.cells+=+data.cells||0;
      coordinator.bandMetrics.push({
        workerElapsedMs:+data.workerElapsedMs||0,rasterizeElapsedMs:+data.rasterizeElapsedMs||0,
        colorElapsedMs:+data.colorElapsedMs||0,setupElapsedMs:+data.setupElapsedMs||0
      });
      coordinator.remaining--;
      try{w.terminate();}catch(e){}
      finishIfReady();
    };
    w.onerror=event=>{
      try{event?.preventDefault?.();}catch(e){}
      void fallback(null,{
        bandIndex:i,stage:bandState.stage,eventType:'worker-error',errorName:event?.error?.name,
        errorMessage:event?.error?.message||event?.message||'Blob band worker failed',
        filename:event?.filename,line:event?.lineno,col:event?.colno
      });
    };
    w.onmessageerror=event=>{
      void fallback(null,{bandIndex:i,stage:bandState.stage,eventType:'message-error',errorName:'DataCloneError',errorMessage:event?.message||'child message could not be deserialized'});
    };
    try{
      w.postMessage({type:'build-band',jobId:msg.jobId,tier:msg.tier,nx:state.nx,ny:state.ny,settings:msg.settings,points:msg.points,band});
      bandState.postedAt=pgWorkerNow();
    }catch(e){void fallback(e,{bandIndex:i,stage:'post-message',eventType:'post-error',errorName:e?.name,errorMessage:e?.message});return;}
  }

  coordinator.createElapsedMs=+(pgWorkerNow()-createStarted).toFixed(1);
  if(createError){
    const e=createError.error;
    await fallback(e,{bandIndex:createError.bandIndex,stage:createError.stage,eventType:'construct-error',errorName:e?.name,errorMessage:e?.message});
    return;
  }
  finishIfReady();

  async function fallback(error,meta={}){
    if(activeCoordinator!==coordinator||coordinator.fallingBack)return;
    coordinator.fallingBack=true;
    if(error){meta.errorName=meta.errorName||error?.name;meta.errorMessage=meta.errorMessage||error?.message||String(error);}
    const prepMs=coordinator.blobPrepElapsedMs,blobBytes=coordinator.blobSourceBytes;
    terminateCoordinator('band-failure');
    const diagnostic=await collectFailureDiagnostics(meta);
    buildWhole(msg,{fallbackReason:failureReason(diagnostic),blobPrepElapsedMs:prepMs,blobSourceBytes:blobBytes});
  }
  function finishIfReady(){
    if(activeCoordinator!==coordinator||coordinator.cancelled||coordinator.fallingBack||coordinator.remaining>0)return;
    activeCoordinator=null;
    const mergeEnded=pgWorkerNow(),metrics=coordinator.bandMetrics,elapsed=mergeEnded-coordinator.started;
    const vals=name=>metrics.map(m=>+m[name]||0),sum=a=>a.reduce((x,y)=>x+y,0),max=a=>a.length?Math.max(...a):0,min=a=>a.length?Math.min(...a):0;
    const workerVals=vals('workerElapsedMs'),rasterVals=vals('rasterizeElapsedMs'),colorVals=vals('colorElapsedMs'),setupVals=vals('setupElapsedMs');
    const parallelMetrics={
      enabled:true,hardwareConcurrency:hardwareConcurrency(),computeWorkers:desired,bandsCompleted:metrics.length,
      childWorkerKind:'blob-bundled-v135',childCreateElapsedMs:coordinator.createElapsedMs||0,
      blobPrepElapsedMs:coordinator.blobPrepElapsedMs||0,blobSourceBytes:coordinator.blobSourceBytes||0,
      firstBandResultMs:coordinator.firstBandAt?+(coordinator.firstBandAt-coordinator.started).toFixed(1):null,
      wallElapsedMs:+elapsed.toFixed(1),bandWorkerMinMs:+min(workerVals).toFixed(1),
      bandWorkerAvgMs:+((workerVals.length?sum(workerVals)/workerVals.length:0)).toFixed(1),
      bandWorkerMaxMs:+max(workerVals).toFixed(1),bandRasterizeTotalMs:+sum(rasterVals).toFixed(1),
      bandRasterizeMaxMs:+max(rasterVals).toFixed(1),bandColorTotalMs:+sum(colorVals).toFixed(1),
      bandSetupTotalMs:+sum(setupVals).toFixed(1),atomicFinalBuffer:true,partialFramesPublished:0,bandFramesPublished:0
    };
    const buffer=coordinator.rgba.buffer;
    stopWorkers(coordinator);
    postMessage({
      type:'complete',jobId:msg.jobId,tier:+msg.tier,nx:state.nx,ny:state.ny,cells:coordinator.cells,
      context:msg.context||'regular',workerElapsedMs:+elapsed.toFixed(1),rasterizeElapsedMs:+max(rasterVals).toFixed(1),
      colorElapsedMs:+max(colorVals).toFixed(1),setupElapsedMs:+(coordinator.blobPrepElapsedMs+coordinator.createElapsedMs).toFixed(1),
      parallelMetrics,buffer
    },[buffer]);
  }
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type==='cancel'){terminateCoordinator('cancel-message');return;}
  if(msg.type!=='build')return;
  if((+msg.tier||0)===891){
    void startParallel(msg).catch(error=>{
      const c=activeCoordinator;
      if(c&&c.jobId===msg.jobId){terminateCoordinator('parallel-promise-rejection');buildWhole(msg,{fallbackReason:`parallel-promise-rejection;${clean(error?.message||error,140)}`});}
      else if(!c)postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});
    });
  }else{
    try{buildWhole(msg);}catch(error){postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});}
  }
};
