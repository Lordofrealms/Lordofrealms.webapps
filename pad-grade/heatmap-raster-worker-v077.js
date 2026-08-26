/* Pad Grade v0.7.7 DEV — locality-based 3-point IDW² raster worker.
 *
 * Each raster sample uses the containing triangle with the nearest farthest
 * vertex, then the smallest total sample-to-vertex distance, then the smallest
 * triangle area. Only complete-score ties are averaged. The shared surface module
 * is also used by the map probe and earthwork/target calculations on the main thread.
 */
'use strict';
importScripts('surface-local-v077.js?v=20260826-1');

const GRADE=[79,143,58];
const CUT_NEAR=[247,196,92];
const CUT_MID=[230,126,45];
const CUT_MAX=[180,45,35];
const FILL_NEAR=[103,205,220];
const FILL_MID=[54,137,205];
const FILL_MAX=[40,80,200];

function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
function spectrum(near,mid,end,t){
  t=Math.max(0,Math.min(1,t));
  return t<=.5?lerp(near,mid,t*2):lerp(mid,end,(t-.5)*2);
}
function surfaceColor(diff,tol,maxCut,maxFill){
  tol=Math.max(0,Number(tol)||0);
  if(Math.abs(diff)<=tol)return GRADE;
  if(diff<0){
    const span=Math.max(maxCut-tol,1e-9);
    return spectrum(CUT_NEAR,CUT_MID,CUT_MAX,(Math.abs(diff)-tol)/span);
  }
  const span=Math.max(maxFill-tol,1e-9);
  return spectrum(FILL_NEAR,FILL_MID,FILL_MAX,(diff-tol)/span);
}

function build(msg){
  const points=(msg.points||[]).map(p=>({x:+p.x,y:+p.y,v:+p.v,r:+p.r,c:+p.c,label:p.label})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
  if(points.length<3){postMessage({type:'empty',jobId:msg.jobId,count:points.length});return;}
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  let maxCut=0,maxFill=0;
  for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}
  const nx=Math.max(2,+msg.nx|0),ny=Math.max(2,+msg.ny|0),width=Math.max(.001,+s.width||1),length=Math.max(.001,+s.length||1);
  const surface=PadGradeLocalSurface.rasterize({nx,ny,width,length,points,flipY:true});
  if(!surface.cells){postMessage({type:'empty',jobId:msg.jobId,count:points.length});return;}

  const rgba=new Uint8ClampedArray(nx*ny*4);
  for(let o=0;o<surface.values.length;o++){
    if(!surface.counts[o])continue;
    const v=surface.values[o];if(!Number.isFinite(v))continue;
    const c=surfaceColor(v-target,tol,maxCut,maxFill),p=o*4;
    rgba[p]=c[0];rgba[p+1]=c[1];rgba[p+2]=c[2];rgba[p+3]=255;
  }
  postMessage({type:'complete',jobId:msg.jobId,tier:+msg.tier,nx,ny,cells:surface.cells,buffer:rgba.buffer},[rgba.buffer]);
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type!=='build')return;
  try{build(msg);}catch(error){postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});}
};
