/* Pad Grade v1.1.2 DEV — whole-image IDW² heat-map worker.
 *
 * The worker never publishes partial map bands. It calculates an entire raster
 * off the UI thread, yielding between small row batches so cancellation remains
 * responsive. The main thread swaps the completed image atomically into MapLibre.
 *
 * Color normalization is project-data based, not raster-sample based: every tier
 * derives the same cut/fill endpoints from the measured points. After IDW
 * rasterization, each measured point is also stamped into its nearest raster
 * pixel with its exact normalized color. That keeps the visible palette anchors
 * stable as 99 -> 297 -> 891 refines the pixels around them.
 */
'use strict';

const GRADE=[79,143,58];
const CUT_NEAR=[247,196,92];
const CUT_MID=[230,126,45];
const CUT_MAX=[180,45,35];
const FILL_NEAR=[103,205,220];
const FILL_MID=[54,137,205];
const FILL_MAX=[40,80,200];

let job=null;

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

function cross(o,a,b){return (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);}
function convexHull(points){
  const unique=[],seen=new Set();
  for(const p of points){
    const key=`${p.x},${p.y}`;
    if(!seen.has(key)){seen.add(key);unique.push({x:+p.x,y:+p.y});}
  }
  if(unique.length<3)return [];
  unique.sort((a,b)=>a.x-b.x||a.y-b.y);
  const lower=[];
  for(const p of unique){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  const upper=[];
  for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();
  const hull=lower.concat(upper);
  if(hull.length<3)return [];
  let area2=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];area2+=a.x*b.y-b.x*a.y;}
  return Math.abs(area2)>1e-8?hull:[];
}
function pointInConvex(x,y,hull){
  let sign=0;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    const z=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
    if(Math.abs(z)<=1e-9)continue;
    const s=z>0?1:-1;
    if(!sign)sign=s;else if(sign!==s)return false;
  }
  return true;
}
function idw2(x,y,points){
  let sw=0,sv=0;
  for(const p of points){
    const dx=p.x-x,dy=p.y-y,d2=dx*dx+dy*dy;
    if(d2<1e-12)return p.v;
    const w=1/d2;sw+=w;sv+=w*p.v;
  }
  return sw?sv/sw:NaN;
}

function writePixel(j,ix,iy,color){
  ix=Math.max(0,Math.min(j.nx-1,ix|0));
  iy=Math.max(0,Math.min(j.ny-1,iy|0));
  const o=(iy*j.nx+ix)*4;
  j.rgba[o]=color[0];j.rgba[o+1]=color[1];j.rgba[o+2]=color[2];j.rgba[o+3]=255;
}
function stampMeasuredPointAnchors(j){
  let count=0;
  for(const p of j.points){
    // The raster itself samples pixel centers. A finite coarse raster therefore
    // may miss a measured point (especially an edge/corner) by up to half a
    // pixel. Pinning the nearest pixel to the exact measured-point color keeps
    // each progressive tier on the same visible color endpoints without changing
    // the continuous IDW calculation used everywhere else.
    const ix=Math.round((p.x/j.width)*(j.nx-1));
    const iy=Math.round((1-(p.y/j.length))*(j.ny-1));
    writePixel(j,ix,iy,surfaceColor(p.v-j.target,j.tol,j.maxCut,j.maxFill));
    count++;
  }
  return count;
}

function startBuild(msg){
  const points=(msg.points||[]).map(p=>({x:+p.x,y:+p.y,v:+p.v})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
  const hull=convexHull(points);
  if(points.length<3||hull.length<3){postMessage({type:'empty',jobId:msg.jobId,count:points.length});return;}
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  let maxCut=0,maxFill=0;
  for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}
  const nx=Math.max(2,+msg.nx|0),ny=Math.max(2,+msg.ny|0);
  job={
    id:msg.jobId,tier:+msg.tier,nx,ny,
    width:Math.max(.001,+s.width||1),length:Math.max(.001,+s.length||1),
    target,tol,maxCut,maxFill,points,hull,
    rgba:new Uint8ClampedArray(nx*ny*4),row:0,cells:0,
    rowsPerSlice:Math.max(4,Math.min(32,+msg.rowsPerSlice||12))
  };
  setTimeout(processSlice,0);
}

function processSlice(){
  const j=job;if(!j)return;
  const end=Math.min(j.ny,j.row+j.rowsPerSlice);
  for(let iy=j.row;iy<end;iy++){
    // Image row zero is the pad's +Y edge so MapLibre can georeference the
    // completed raster using TL/TR/BR/BL pad corners without any later rotation.
    const y=j.length-(iy+.5)/j.ny*j.length;
    for(let ix=0;ix<j.nx;ix++){
      const x=(ix+.5)/j.nx*j.width;
      if(!pointInConvex(x,y,j.hull))continue;
      const v=idw2(x,y,j.points);if(!Number.isFinite(v))continue;
      const c=surfaceColor(v-j.target,j.tol,j.maxCut,j.maxFill),o=(iy*j.nx+ix)*4;
      j.rgba[o]=c[0];j.rgba[o+1]=c[1];j.rgba[o+2]=c[2];j.rgba[o+3]=255;j.cells++;
    }
  }
  j.row=end;
  if(j.row<j.ny){setTimeout(processSlice,0);return;}
  const done=job;job=null;
  const anchorPixels=stampMeasuredPointAnchors(done);
  postMessage({type:'complete',jobId:done.id,tier:done.tier,nx:done.nx,ny:done.ny,cells:done.cells,anchorPixels,buffer:done.rgba.buffer},[done.rgba.buffer]);
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type==='build'){
    job=null;
    try{startBuild(msg);}catch(error){postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});job=null;}
    return;
  }
  if(msg.type==='cancel'&&job&&msg.jobId===job.id)job=null;
};
