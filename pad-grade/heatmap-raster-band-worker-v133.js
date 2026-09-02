/* Pad Grade v1.3.3 DEV — compute-only heatmap band worker.
 *
 * This worker has no MapLibre/canvas/presentation code and cannot publish a
 * partial heatmap frame. It computes one horizontal raster band, transfers the
 * raw RGBA band buffer back to the coordinator, and exits.
 */
'use strict';

const pgWorkerNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
const SURFACE_URL=new URL('surface-local-v078.js?v=20260826-2',self.location.href).href;
importScripts(SURFACE_URL);

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
  if(points.length<3){
    postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:points.length});
    return;
  }
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  const nx=Math.max(2,+msg.nx|0),ny=Math.max(2,+msg.ny|0),width=Math.max(.001,+s.width||1),length=Math.max(.001,+s.length||1);
  const startRow=Math.max(0,+spec.startRow|0),endRow=Math.min(ny,+spec.endRow|0),rows=Math.max(0,endRow-startRow);
  if(!rows){
    postMessage({type:'band-empty',jobId:msg.jobId,bandIndex:+spec.index||0,count:points.length});
    return;
  }

  // Exactly preserves full-raster cell-center coordinates:
  // globalY = length - (globalRow + 0.5) / ny * length.
  const yBottom=length-(endRow/ny)*length,bandLength=(rows/ny)*length;
  const translated=points.map(p=>({...p,y:p.y-yBottom}));
  const {maxCut,maxFill}=scaleFor(points,target);
  const rasterStarted=pgWorkerNow();
  const surface=PadGradeLocalSurface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
  const rasterEnded=pgWorkerNow();
  const colored=colorRaster(surface,target,tol,maxCut,maxFill),ended=pgWorkerNow();

  // Compute transport only. The parent coordinator copies this into an offscreen
  // full-size buffer; this message is never a visible/presentable heat frame.
  postMessage({
    type:'band-complete',jobId:msg.jobId,bandIndex:+spec.index||0,startRow,endRow,nx,rows,cells:surface.cells,
    workerElapsedMs:+(ended-started).toFixed(1),rasterizeElapsedMs:+(rasterEnded-rasterStarted).toFixed(1),
    colorElapsedMs:colored.colorElapsedMs,setupElapsedMs:+(rasterStarted-started).toFixed(1),
    buffer:colored.rgba.buffer
  },[colored.rgba.buffer]);
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type!=='build-band')return;
  try{buildBand(msg);}
  catch(error){
    postMessage({
      type:'band-error',jobId:msg.jobId,bandIndex:+msg.band?.index||0,
      message:String(error&&error.message||error).slice(0,160)
    });
  }
};
