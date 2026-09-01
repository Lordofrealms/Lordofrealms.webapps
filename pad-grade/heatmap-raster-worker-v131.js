/* Pad Grade v1.3.1 DEV — adaptive parallel final heat raster worker.
 *
 * The normal 99 and 297 tiers remain single-worker calculations. The final 891
 * tier keeps one lifecycle-visible coordinator worker, which fans the completed
 * raster into independent horizontal compute bands. The coordinator publishes
 * exactly one complete 891 RGBA buffer after every band has finished, preserving
 * the protected atomic/flickerless presentation contract and the v1.2.7 single
 * generation/cancellation owner.
 */
'use strict';

const pgWorkerNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
const SELF_URL='heatmap-raster-worker-v131.js?v=20260901-1';
importScripts('surface-local-v078.js?v=20260826-2');

const GRADE=[79,143,58];
const CUT_NEAR=[247,196,92];
const CUT_MID=[230,126,45];
const CUT_MAX=[180,45,35];
const FILL_NEAR=[103,205,220];
const FILL_MID=[54,137,205];
const FILL_MAX=[40,80,200];

let activeCoordinator=null;

function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
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
      enabled:false,hardwareConcurrency:hardwareConcurrency(),computeWorkers:1,fallbackReason:extra.fallbackReason||null
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
function buildBand(msg){
  const state=commonBuildState(msg),spec=msg.band||{};
  if(state.empty){postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:state.points.length});return;}
  const startRow=Math.max(0,+spec.startRow|0),endRow=Math.min(state.ny,+spec.endRow|0),rows=Math.max(0,endRow-startRow);
  if(!rows){postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:state.points.length});return;}
  const yBottom=state.length-(endRow/state.ny)*state.length,bandLength=(rows/state.ny)*state.length;
  const translated=state.points.map(p=>({...p,y:p.y-yBottom}));
  const rasterStarted=pgWorkerNow();
  const surface=PadGradeLocalSurface.rasterize({nx:state.nx,ny:rows,width:state.width,length:bandLength,points:translated,flipY:true});
  const rasterEnded=pgWorkerNow(),colored=colorRaster(surface,state.target,state.tol,state.maxCut,state.maxFill),ended=pgWorkerNow();
  postMessage({
    type:'band-complete',jobId:msg.jobId,bandIndex:+spec.index||0,startRow,endRow,nx:state.nx,rows,cells:surface.cells,
    workerElapsedMs:+(ended-state.started).toFixed(1),rasterizeElapsedMs:+(rasterEnded-rasterStarted).toFixed(1),
    colorElapsedMs:colored.colorElapsedMs,setupElapsedMs:+(rasterStarted-state.started).toFixed(1),buffer:colored.rgba.buffer
  },[colored.rgba.buffer]);
}
function terminateCoordinator(reason){
  const c=activeCoordinator;if(!c)return;
  activeCoordinator=null;c.cancelled=true;
  for(const w of c.workers)try{w.terminate();}catch(e){}
  c.workers.length=0;
}
function startParallel(msg){
  const state=commonBuildState(msg);
  if(state.empty){postMessage({type:'empty',jobId:msg.jobId,count:state.points.length});return;}
  const desired=Math.min(state.ny,desiredComputeWorkers());
  if(desired<=1||typeof Worker!=='function'){buildWhole(msg,{fallbackReason:desired<=1?'single-compute-worker':'nested-worker-unavailable'});return;}

  terminateCoordinator('replacement-build');
  const coordinator={jobId:msg.jobId,started:state.started,workers:[],remaining:desired,cancelled:false,rgba:new Uint8ClampedArray(state.nx*state.ny*4),cells:0,bandMetrics:[],createStarted:pgWorkerNow(),firstBandAt:0};
  activeCoordinator=coordinator;
  let createError=null;
  for(let i=0;i<desired;i++){
    const band=bandSpec(i,desired,state.ny,state.length);if(!band.rows){coordinator.remaining--;continue;}
    let w=null;
    try{w=new Worker(SELF_URL);}catch(e){createError=e;break;}
    coordinator.workers.push(w);
    w.onmessage=event=>{
      if(activeCoordinator!==coordinator||coordinator.cancelled)return;
      const data=event.data||{};
      if(data.jobId!==msg.jobId)return;
      if(data.type==='band-empty'){coordinator.remaining--;finishIfReady();return;}
      if(data.type!=='band-complete')return;
      if(!coordinator.firstBandAt)coordinator.firstBandAt=pgWorkerNow();
      try{coordinator.rgba.set(new Uint8ClampedArray(data.buffer),(+data.startRow||0)*state.nx*4);}catch(e){fail(e);return;}
      coordinator.cells+=+data.cells||0;
      coordinator.bandMetrics.push({workerElapsedMs:+data.workerElapsedMs||0,rasterizeElapsedMs:+data.rasterizeElapsedMs||0,colorElapsedMs:+data.colorElapsedMs||0,setupElapsedMs:+data.setupElapsedMs||0});
      coordinator.remaining--;try{w.terminate();}catch(e){};finishIfReady();
    };
    w.onerror=event=>fail(new Error(event?.message||'band worker failed'));
    try{w.postMessage({type:'build-band',jobId:msg.jobId,tier:msg.tier,nx:state.nx,ny:state.ny,settings:msg.settings,points:msg.points,band});}
    catch(e){fail(e);return;}
  }
  coordinator.createElapsedMs=+(pgWorkerNow()-coordinator.createStarted).toFixed(1);
  if(createError){terminateCoordinator('child-construction-failed');buildWhole(msg,{fallbackReason:'child-construction-failed'});return;}
  finishIfReady();

  function fail(error){
    if(activeCoordinator!==coordinator)return;
    terminateCoordinator('band-failure');
    postMessage({type:'error',jobId:msg.jobId,message:`Parallel 891 band failed: ${String(error&&error.message||error)}`});
  }
  function finishIfReady(){
    if(activeCoordinator!==coordinator||coordinator.cancelled||coordinator.remaining>0)return;
    activeCoordinator=null;
    for(const w of coordinator.workers)try{w.terminate();}catch(e){}
    const mergeEnded=pgWorkerNow(),metrics=coordinator.bandMetrics,elapsed=mergeEnded-coordinator.started;
    const vals=name=>metrics.map(m=>+m[name]||0),sum=a=>a.reduce((x,y)=>x+y,0),max=a=>a.length?Math.max(...a):0,min=a=>a.length?Math.min(...a):0;
    const workerVals=vals('workerElapsedMs'),rasterVals=vals('rasterizeElapsedMs'),colorVals=vals('colorElapsedMs'),setupVals=vals('setupElapsedMs');
    const parallelMetrics={
      enabled:true,hardwareConcurrency:hardwareConcurrency(),computeWorkers:desired,bandsCompleted:metrics.length,
      childCreateElapsedMs:coordinator.createElapsedMs||0,firstBandResultMs:coordinator.firstBandAt?+(coordinator.firstBandAt-coordinator.started).toFixed(1):null,
      wallElapsedMs:+elapsed.toFixed(1),bandWorkerMinMs:+min(workerVals).toFixed(1),bandWorkerAvgMs:+((workerVals.length?sum(workerVals)/workerVals.length:0)).toFixed(1),bandWorkerMaxMs:+max(workerVals).toFixed(1),
      bandRasterizeTotalMs:+sum(rasterVals).toFixed(1),bandRasterizeMaxMs:+max(rasterVals).toFixed(1),bandColorTotalMs:+sum(colorVals).toFixed(1),bandSetupTotalMs:+sum(setupVals).toFixed(1)
    };
    const buffer=coordinator.rgba.buffer;
    postMessage({type:'complete',jobId:msg.jobId,tier:+msg.tier,nx:state.nx,ny:state.ny,cells:coordinator.cells,context:msg.context||'regular',
      workerElapsedMs:+elapsed.toFixed(1),rasterizeElapsedMs:+max(rasterVals).toFixed(1),colorElapsedMs:+max(colorVals).toFixed(1),setupElapsedMs:+(coordinator.createElapsedMs||0).toFixed(1),parallelMetrics,buffer},[buffer]);
  }
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type==='cancel'){terminateCoordinator('cancel-message');return;}
  try{
    if(msg.type==='build-band'){buildBand(msg);return;}
    if(msg.type!=='build')return;
    if((+msg.tier||0)===891)startParallel(msg);else buildWhole(msg);
  }catch(error){terminateCoordinator('exception');postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});}
};
