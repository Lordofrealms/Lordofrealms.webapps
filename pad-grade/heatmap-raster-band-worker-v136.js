/* Pad Grade v1.3.6 DEV — compute-only bundled heatmap band worker.
 *
 * Used by all progressive heatmap tiers (99 / 297 / 891). The coordinator
 * prepends surface-local-v078.js to this source and creates a Blob worker.
 * This worker performs compute only: it has no MapLibre/canvas presentation
 * authority and never publishes partial visible heatmap frames.
 */
'use strict';

const pgWorkerStarted=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
const pgWorkerNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

function safeError(error){
  return {
    name:String(error?.name||'Error').slice(0,48),
    message:String(error?.message||error||'unknown error').slice(0,220),
    stackTop:String(error?.stack||'').split('\n').slice(0,2).join(' | ').slice(0,260)
  };
}
function stage(name,extra={}){
  try{postMessage({type:'band-stage',stage:name,elapsedMs:+(pgWorkerNow()-pgWorkerStarted).toFixed(1),...extra});}catch(e){}
}

stage('script-entered',{transport:'blob-bundled-v136',parallelTiers:[99,297,891]});
if(!self.PadGradeLocalSurface||typeof self.PadGradeLocalSurface.rasterize!=='function'){
  const error=new Error('Bundled surface API unavailable');
  const e=safeError(error);
  try{postMessage({type:'band-bootstrap-error',stage:'surface-bundled-check',...e});}catch(ignore){}
  throw error;
}
stage('surface-bundled',{surfaceApiReady:true});
stage('handler-ready');

const GRADE=[79,143,58];
const CUT_NEAR=[247,196,92];
const CUT_MID=[230,126,45];
const CUT_MAX=[180,45,35];
const FILL_NEAR=[103,205,220];
const FILL_MID=[54,137,205];
const FILL_MAX=[40,80,200];

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
function buildBand(msg){
  const started=pgWorkerNow(),points=normalizedInputPoints(msg),spec=msg.band||{};
  stage('build-received',{jobId:+msg.jobId||0,tier:+msg.tier||0,bandIndex:+spec.index||0,rows:+spec.rows||0});
  if(points.length<3){postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:points.length});return;}
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  const nx=Math.max(2,+msg.nx|0),ny=Math.max(2,+msg.ny|0),width=Math.max(.001,+s.width||1),length=Math.max(.001,+s.length||1);
  const startRow=Math.max(0,+spec.startRow|0),endRow=Math.min(ny,+spec.endRow|0),rows=Math.max(0,endRow-startRow);
  if(!rows){postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:points.length});return;}

  const yBottom=length-(endRow/ny)*length,bandLength=(rows/ny)*length;
  const translated=points.map(p=>({...p,y:p.y-yBottom}));
  const {maxCut,maxFill}=scaleFor(points,target);
  stage('raster-start',{jobId:+msg.jobId||0,tier:+msg.tier||0,bandIndex:+spec.index||0});
  const rasterStarted=pgWorkerNow();
  const surface=PadGradeLocalSurface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
  const rasterEnded=pgWorkerNow();
  stage('raster-complete',{jobId:+msg.jobId||0,tier:+msg.tier||0,bandIndex:+spec.index||0,cells:+surface.cells||0,elapsedMs:+(rasterEnded-rasterStarted).toFixed(1)});
  const colored=colorRaster(surface,target,tol,maxCut,maxFill),ended=pgWorkerNow();
  stage('color-complete',{jobId:+msg.jobId||0,tier:+msg.tier||0,bandIndex:+spec.index||0,elapsedMs:colored.colorElapsedMs});

  postMessage({
    type:'band-complete',jobId:msg.jobId,tier:+msg.tier||0,bandIndex:+spec.index||0,startRow,endRow,nx,rows,cells:surface.cells,
    workerElapsedMs:+(ended-started).toFixed(1),rasterizeElapsedMs:+(rasterEnded-rasterStarted).toFixed(1),
    colorElapsedMs:colored.colorElapsedMs,setupElapsedMs:+(rasterStarted-started).toFixed(1),buffer:colored.rgba.buffer
  },[colored.rgba.buffer]);
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type==='diagnostic-ping'){stage('ping-received',{token:String(msg.token||'').slice(0,32)});return;}
  if(msg.type!=='build-band')return;
  try{buildBand(msg);}
  catch(error){
    const spec=msg.band||{},e=safeError(error);
    postMessage({type:'band-error',jobId:msg.jobId,tier:+msg.tier||0,bandIndex:+spec.index||0,stage:'build-band',...e});
  }
};

self.onunhandledrejection=event=>{
  const e=safeError(event?.reason);
  try{postMessage({type:'band-fatal-error',stage:'unhandled-rejection',...e});}catch(ignore){}
};
