/* Pad Grade v0.7.1 DEV — background IDW² heat-map worker.
 *
 * Builds one horizontal band at a time and waits for an acknowledgement before
 * continuing. This keeps both worker memory and main-thread MapLibre updates
 * bounded while the visible map progressively sharpens.
 */
'use strict';

const FT_PER_M=3.280839895;
const EARTH_M=6378137;
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
function colorHex(c){return '#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function surfaceColor(diff,tol,maxCut,maxFill){
  tol=Math.max(0,Number(tol)||0);
  if(Math.abs(diff)<=tol)return colorHex(GRADE);
  if(diff<0){
    const span=Math.max(maxCut-tol,1e-9);
    return colorHex(spectrum(CUT_NEAR,CUT_MID,CUT_MAX,(Math.abs(diff)-tol)/span));
  }
  const span=Math.max(maxFill-tol,1e-9);
  return colorHex(spectrum(FILL_NEAR,FILL_MID,FILL_MAX,(diff-tol)/span));
}

function cross(o,a,b){return (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);}
function convexHull(points){
  const unique=[];
  const seen=new Set();
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
  // Hull from monotonic chain is consistently wound. Boundary counts as covered.
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

function roundCoord(v){return Math.round(v*1e8)/1e8;}
function prepareTransform(fit){
  const theta=+fit.theta||0,ct=Math.cos(theta),st=Math.sin(theta);
  const originLat=+fit.originLat,originLon=+fit.originLon;
  const degPerNorthFt=(1/FT_PER_M/EARTH_M)*180/Math.PI;
  const degPerEastFt=(1/FT_PER_M/(EARTH_M*Math.cos(originLat*Math.PI/180)))*180/Math.PI;
  return {
    lon0:originLon+(+fit.tx||0)*degPerEastFt,
    lat0:originLat+(+fit.ty||0)*degPerNorthFt,
    lonX:ct*degPerEastFt,
    lonY:-st*degPerEastFt,
    latX:st*degPerNorthFt,
    latY:ct*degPerNorthFt
  };
}
function coord(x,y,t){return [roundCoord(t.lon0+t.lonX*x+t.lonY*y),roundCoord(t.lat0+t.latX*x+t.latY*y)];}

function startBuild(msg){
  const points=(msg.points||[]).map(p=>({x:+p.x,y:+p.y,v:+p.v})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
  const hull=convexHull(points);
  if(points.length<3||hull.length<3){
    postMessage({type:'empty',jobId:msg.jobId,count:points.length});
    return;
  }
  const s=msg.settings||{},target=+s.target||0,tol=Math.max(0,+s.tol||0);
  let maxCut=0,maxFill=0;
  for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}
  job={
    id:msg.jobId,
    tier:+msg.tier,
    nx:Math.max(2,+msg.nx|0),ny:Math.max(2,+msg.ny|0),
    width:Math.max(.001,+s.width||1),length:Math.max(.001,+s.length||1),
    target,tol,maxCut,maxFill,points,hull,
    transform:prepareTransform(msg.fit||{}),
    row:0,chunkIndex:0,chunkRows:Math.max(4,+msg.chunkRows|0),
    cells:0
  };
  setTimeout(processNext,0);
}

function processNext(){
  const j=job;if(!j)return;
  if(j.row>=j.ny){
    postMessage({type:'complete',jobId:j.id,tier:j.tier,cells:j.cells});
    job=null;return;
  }
  const start=j.row,end=Math.min(j.ny,start+j.chunkRows),buckets=new Map();
  let cells=0;
  for(let iy=start;iy<end;iy++){
    const y=(iy+.5)/j.ny*j.length,y0=iy/j.ny*j.length,y1=(iy+1)/j.ny*j.length;
    for(let ix=0;ix<j.nx;ix++){
      const x=(ix+.5)/j.nx*j.width;
      if(!pointInConvex(x,y,j.hull))continue;
      const v=idw2(x,y,j.points);if(!Number.isFinite(v))continue;
      const color=surfaceColor(v-j.target,j.tol,j.maxCut,j.maxFill);
      const x0=ix/j.nx*j.width,x1=(ix+1)/j.nx*j.width;
      const a=coord(x0,y0,j.transform),b=coord(x1,y0,j.transform),c=coord(x1,y1,j.transform),d=coord(x0,y1,j.transform);
      let polygons=buckets.get(color);if(!polygons){polygons=[];buckets.set(color,polygons);}
      polygons.push([[a,b,c,d,a]]);cells++;
    }
  }
  const features=[];
  for(const [color,coordinates] of buckets){features.push({type:'Feature',properties:{color},geometry:{type:'MultiPolygon',coordinates}});}
  const chunkIndex=j.chunkIndex++;
  j.row=end;j.cells+=cells;
  postMessage({type:'chunk',jobId:j.id,tier:j.tier,chunkIndex,startRow:start,endRow:end,cells,data:{type:'FeatureCollection',features}});
  // Backpressure is deliberate. The main thread acknowledges only after the
  // chunk has been handed to MapLibre, so this worker cannot flood the UI queue.
}

self.onmessage=event=>{
  const msg=event.data||{};
  if(msg.type==='build'){
    job=null;
    try{startBuild(msg);}catch(error){postMessage({type:'error',jobId:msg.jobId,message:String(error&&error.message||error)});job=null;}
    return;
  }
  if(msg.type==='ack'&&job&&msg.jobId===job.id){setTimeout(processNext,0);return;}
  if(msg.type==='cancel'&&job&&msg.jobId===job.id){job=null;}
};
