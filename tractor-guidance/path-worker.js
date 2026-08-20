importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@7.4.0/turf.min.js');

const FT_PER_M=3.280839895;
const SQFT_PER_ACRE=43560;
function progress(jobId,pct,stage){postMessage({type:'progress',jobId,pct:Math.max(0,Math.min(100,pct)),stage})}
function featurePolygons(feature){
  if(!feature||!feature.geometry)return[];
  if(feature.type==='FeatureCollection')return feature.features.flatMap(featurePolygons);
  if(feature.geometry.type==='Polygon')return[feature.geometry.coordinates];
  if(feature.geometry.type==='MultiPolygon')return feature.geometry.coordinates;
  return[];
}
function clone(x){return JSON.parse(JSON.stringify(x))}
function originForPolygon(poly){const c=turf.centroid(poly).geometry.coordinates;return{lon:c[0],lat:c[1]}}
function toXY(coord,o){const lat0=o.lat*Math.PI/180;return{x:(coord[0]-o.lon)*Math.PI/180*6371000*Math.cos(lat0),y:(coord[1]-o.lat)*Math.PI/180*6371000}}
function toLL(p,o){return[o.lon+p.x/(6371000*Math.cos(o.lat*Math.PI/180))*180/Math.PI,o.lat+p.y/6371000*180/Math.PI]}
function unionAll(features,jobId){
  if(!features.length)return null;
  let u=clone(features[0]);
  for(let i=1;i<features.length;i++){
    const n=turf.union(turf.featureCollection([u,features[i]])); if(n)u=n;
    progress(jobId,5+10*i/Math.max(1,features.length-1),'Combining selected work regions…');
  }
  return u;
}
function subtractExclusions(work,exclusions,jobId){
  let out=work;
  for(let i=0;i<exclusions.length;i++){
    let overlap=null;
    try{overlap=turf.intersect(turf.featureCollection([exclusions[i],out]))}catch(e){}
    if(overlap){const d=turf.difference(turf.featureCollection([out,overlap]));if(d)out=d}
    progress(jobId,16+18*(i+1)/Math.max(1,exclusions.length),'Applying exclusion zones…');
  }
  return out;
}
function scanlineSegments(poly,headingDeg,spacingM,startOrder,currentFix,jobId,coveragePriority='coverage'){
  const polygons=featurePolygons(poly); if(!polygons.length)return[];
  const o=originForPolygon(poly),th=headingDeg*Math.PI/180;
  const u={x:Math.sin(th),y:Math.cos(th)},n={x:Math.cos(th),y:-Math.sin(th)};
  const allPS=[];
  const localPolys=polygons.map(rings=>rings.map(ring=>ring.map(c=>{const q=toXY(c,o),p={t:q.x*u.x+q.y*u.y,s:q.x*n.x+q.y*n.y};allPS.push(p);return p})));
  const minS=Math.min(...allPS.map(p=>p.s)),maxS=Math.max(...allPS.map(p=>p.s)),range=Math.max(0,maxS-minS);

  let count,actual,startS;
  if(range<=0||spacingM<=0){
    count=1;actual=0;startS=(minS+maxS)/2;
  }else if(coveragePriority==='no-extra-overlap'){
    count=Math.max(1,Math.floor(range/spacingM)+1);
    actual=spacingM;
    const used=(count-1)*actual;
    startS=minS+(range-used)/2;
  }else{
    count=Math.max(1,Math.ceil(range/spacingM)+1);
    actual=count===1?0:range/(count-1);
    startS=minS;
  }

  let sVals=Array.from({length:count},(_,i)=>count===1?(minS+maxS)/2:startS+i*actual);
  if(startOrder==='high')sVals.reverse();
  if(startOrder==='near'&&currentFix&&sVals.length>1){
    const q=toXY([currentFix.lon,currentFix.lat],o),sCur=q.x*n.x+q.y*n.y;
    if(Math.abs(sCur-sVals.at(-1))<Math.abs(sCur-sVals[0]))sVals.reverse();
  }
  const out=[];let lastPct=-1;
  for(let row=0;row<sVals.length;row++){
    const s0=sVals[row];let xs=[];
    for(const rings of localPolys)for(const ps of rings)for(let i=0;i<ps.length-1;i++){
      const a=ps[i],b=ps[i+1];
      if((a.s<=s0&&b.s>s0)||(b.s<=s0&&a.s>s0))xs.push(a.t+(s0-a.s)*(b.t-a.t)/(b.s-a.s));
    }
    xs.sort((a,b)=>a-b);xs=xs.filter((v,i)=>i===0||Math.abs(v-xs[i-1])>0.01);
    let pairs=[];for(let i=0;i+1<xs.length;i+=2)pairs.push([xs[i],xs[i+1]]);
    if(row%2===1)pairs=pairs.reverse().map(([a,b])=>[b,a]);
    for(const [ta,tb] of pairs){
      if(Math.abs(tb-ta)<0.25)continue;
      const pa={x:u.x*ta+n.x*s0,y:u.y*ta+n.y*s0},pb={x:u.x*tb+n.x*s0,y:u.y*tb+n.y*s0};
      out.push({kind:'parallel',pass:row+1,coords:[toLL(pa,o),toLL(pb,o)]});
    }
    const pct=Math.floor(46+45*(row+1)/Math.max(1,sVals.length));
    if(pct!==lastPct){progress(jobId,pct,'Generating parallel passes…');lastPct=pct}
  }
  return {segments:out,fitInfo:{coveragePriority,count,actualSpacingM:actual,rangeM:range}};
}
function contourSegments(poly,spacingFt,jobId){
  const out=[];let idx=1,cur=poly;
  for(let guard=0;guard<250&&cur;guard++){
    const polys=featurePolygons(cur);let any=false;
    for(const rings of polys)for(const ring of rings)if(ring&&ring.length>3){out.push({kind:'contour',pass:idx++,coords:ring});any=true}
    if(!any)break;
    progress(jobId,46+Math.min(44,44*(1-Math.exp(-(guard+1)/18))),'Generating inward contour loops…');
    try{cur=turf.buffer(cur,-spacingFt,{units:'feet',steps:8})}catch(e){break}
  }
  return out;
}
function pathMiles(segments,jobId){
  let miles=0;
  for(let i=0;i<segments.length;i++){
    if(segments[i].coords?.length>1)miles+=turf.length(turf.lineString(segments[i].coords),{units:'miles'});
    if(i&&i%50===0)progress(jobId,92+5*i/Math.max(1,segments.length),'Calculating route totals…');
  }
  return miles;
}
self.onmessage=e=>{
  const msg=e.data||{};if(msg.type!=='generate')return;
  const {jobId,boundary,inclusions,exclusions,settings,currentFix}=msg;
  try{
    progress(jobId,2,'Combining selected work regions…');
    let work=unionAll(inclusions||[],jobId);if(!work)throw new Error('No selected work/inclusion region.');
    progress(jobId,14,'Clipping work area to property…');
    const clipped=turf.intersect(turf.featureCollection([work,boundary]));if(clipped)work=clipped;
    progress(jobId,16,'Applying exclusion zones…');
    work=subtractExclusions(work,exclusions||[],jobId);if(!work)throw new Error('Exclusions remove the entire selected work area.');
    const activeAreaAcres=turf.area(work)*10.7639104167/SQFT_PER_ACRE;
    const insetFt=settings.implementWidthFt/2+settings.boundaryMarginFt;
    let safe=work;
    if(insetFt>0){progress(jobId,35,'Applying implement-edge clearance…');safe=turf.buffer(work,-insetFt,{units:'feet',steps:8})}
    if(!safe)throw new Error('No usable area remains after implement half-width and boundary margin.');
    const effWidth=Math.max(.1,settings.implementWidthFt-settings.overlapFt);
    let segments,fitInfo=null;
    if(settings.pathType==='parallel'){
      progress(jobId,45,'Generating parallel passes…');
      const result=scanlineSegments(safe,settings.parallelHeading,effWidth/FT_PER_M,settings.startOrder,currentFix,jobId,settings.coveragePriority||'coverage');
      segments=result.segments;fitInfo=result.fitInfo;
    }else{
      progress(jobId,45,'Generating inward contour loops…');segments=contourSegments(safe,effWidth,jobId);
    }
    if(!segments.length)throw new Error('No usable path could be generated.');
    progress(jobId,92,'Calculating route totals…');
    const plannedMiles=pathMiles(segments,jobId),passGroups=new Set(segments.map(s=>s.pass)).size;
    postMessage({type:'result',jobId,segments,plannedMiles,passGroups,activeAreaAcres,planMeta:{type:settings.pathType,heading:settings.pathType==='parallel'?settings.parallelHeading:null,effectiveSpacingFt:effWidth,insetFt,coveragePriority:settings.coveragePriority||'coverage',actualSpacingFt:fitInfo?.actualSpacingM?fitInfo.actualSpacingM*FT_PER_M:null}});
  }catch(err){postMessage({type:'error',jobId,pct:0,message:err?.message||String(err)})}
};
