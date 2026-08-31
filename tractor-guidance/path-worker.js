importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@7.4.0/turf.min.js');

const FT_PER_M=3.280839895;
const SQFT_PER_ACRE=43560;
function progress(jobId,pct,stage){postMessage({type:'progress',jobId,pct:Math.max(0,Math.min(100,pct)),stage})}
function featurePolygons(feature){if(!feature||!feature.geometry)return[];if(feature.type==='FeatureCollection')return feature.features.flatMap(featurePolygons);if(feature.geometry.type==='Polygon')return[feature.geometry.coordinates];if(feature.geometry.type==='MultiPolygon')return feature.geometry.coordinates;return[]}
function clone(x){return JSON.parse(JSON.stringify(x))}
function originForPolygon(poly){const c=turf.centroid(poly).geometry.coordinates;return{lon:c[0],lat:c[1]}}
function toXY(coord,o){const lat0=o.lat*Math.PI/180;return{x:(coord[0]-o.lon)*Math.PI/180*6371000*Math.cos(lat0),y:(coord[1]-o.lat)*Math.PI/180*6371000}}
function toLL(p,o){return[o.lon+p.x/(6371000*Math.cos(o.lat*Math.PI/180))*180/Math.PI,o.lat+p.y/6371000*180/Math.PI]}
function unionAll(features,jobId){if(!features.length)return null;let u=clone(features[0]);for(let i=1;i<features.length;i++){const n=turf.union(turf.featureCollection([u,features[i]]));if(n)u=n;progress(jobId,5+10*i/Math.max(1,features.length-1),'Combining selected work regions…')}return u}
function subtractExclusions(work,exclusions,jobId){let out=work;for(let i=0;i<exclusions.length;i++){let overlap=null;try{overlap=turf.intersect(turf.featureCollection([exclusions[i],out]))}catch(e){}if(overlap){const d=turf.difference(turf.featureCollection([out,overlap]));if(d)out=d}progress(jobId,16+18*(i+1)/Math.max(1,exclusions.length),'Applying exclusion zones…')}return out}
function makeDriveOrder(count,skipRows=0){
  const step=Math.max(1,Math.floor(Number(skipRows)||0)+1),order=[];
  for(let residue=0;residue<step;residue++){
    let group=[];for(let i=residue;i<count;i+=step)group.push(i);
    if(residue%2===1)group.reverse();
    order.push(...group);
  }
  return order;
}
function annotateTurns(segments,spacingM,skipRows,turningRadiusFt){
  const straight=segments.filter(s=>s.kind==='parallel'||s.kind==='skip-parallel');
  for(let i=0;i<straight.length-1;i++){
    const a=straight[i],b=straight[i+1];if(!a.coords?.length||!b.coords?.length)continue;
    const a0=a.coords[0],a1=a.coords[a.coords.length-1],b0=b.coords[0];
    const o={lon:a1[0],lat:a1[1]},p0=toXY(a0,o),p1=toXY(a1,o),q=toXY(b0,o),vx=p1.x-p0.x,vy=p1.y-p0.y,L=Math.hypot(vx,vy)||1;
    const ux=vx/L,uy=vy/L,rx=uy,ry=-ux,dx=q.x-p1.x,dy=q.y-p1.y,lateral=dx*rx+dy*ry;
    a.nextPass=b.pass;a.nextDriveOrder=b.driveOrder;a.turnDirection=lateral>=0?'right':'left';a.turnSkipRows=Math.max(0,Math.abs((b.pass||0)-(a.pass||0))-1);a.turnLateralFt=Math.abs(lateral)*FT_PER_M;a.turningRadiusFt=turningRadiusFt;a.turnStyle='bulb';
  }
}
function scanlineSegments(poly,headingDeg,spacingM,startOrder,currentFix,jobId,coveragePriority='coverage',skipRows=0,turningRadiusFt=18){
  const polygons=featurePolygons(poly);if(!polygons.length)return{segments:[],fitInfo:{}};
  const o=originForPolygon(poly),th=headingDeg*Math.PI/180,u={x:Math.sin(th),y:Math.cos(th)},n={x:Math.cos(th),y:-Math.sin(th)},allPS=[];
  const localPolys=polygons.map(rings=>rings.map(ring=>ring.map(c=>{const q=toXY(c,o),p={t:q.x*u.x+q.y*u.y,s:q.x*n.x+q.y*n.y};allPS.push(p);return p})));
  const minS=Math.min(...allPS.map(p=>p.s)),maxS=Math.max(...allPS.map(p=>p.s)),range=Math.max(0,maxS-minS);let count,actual,startS;
  if(range<=0||spacingM<=0){count=1;actual=0;startS=(minS+maxS)/2}else if(coveragePriority==='no-extra-overlap'){count=Math.max(1,Math.floor(range/spacingM)+1);actual=spacingM;const used=(count-1)*actual;startS=minS+(range-used)/2}else{count=Math.max(1,Math.ceil(range/spacingM)+1);actual=count===1?0:range/(count-1);startS=minS}
  let sVals=Array.from({length:count},(_,i)=>count===1?(minS+maxS)/2:startS+i*actual);if(startOrder==='high')sVals.reverse();if(startOrder==='near'&&currentFix&&sVals.length>1){const q=toXY([currentFix.lon,currentFix.lat],o),sCur=q.x*n.x+q.y*n.y;if(Math.abs(sCur-sVals.at(-1))<Math.abs(sCur-sVals[0]))sVals.reverse()}
  const rows=[];for(let row=0;row<sVals.length;row++){const s0=sVals[row];let xs=[];for(const rings of localPolys)for(const ps of rings)for(let i=0;i<ps.length-1;i++){const a=ps[i],b=ps[i+1];if((a.s<=s0&&b.s>s0)||(b.s<=s0&&a.s>s0))xs.push(a.t+(s0-a.s)*(b.t-a.t)/(b.s-a.s))}xs.sort((a,b)=>a-b);xs=xs.filter((v,i)=>i===0||Math.abs(v-xs[i-1])>0.01);const pairs=[];for(let i=0;i+1<xs.length;i+=2)if(Math.abs(xs[i+1]-xs[i])>=0.25)pairs.push([xs[i],xs[i+1]]);rows.push({row,s0,pairs})}
  const order=makeDriveOrder(rows.length,skipRows),out=[];let lastPct=-1;
  for(let driveIdx=0;driveIdx<order.length;driveIdx++){const r=rows[order[driveIdx]];let pairs=r.pairs.slice(),reverse=driveIdx%2===1;if(reverse)pairs=pairs.reverse().map(([a,b])=>[b,a]);for(const [ta,tb] of pairs){const pa={x:u.x*ta+n.x*r.s0,y:u.y*ta+n.y*r.s0},pb={x:u.x*tb+n.x*r.s0,y:u.y*tb+n.y*r.s0};out.push({kind:skipRows>0?'skip-parallel':'parallel',pass:r.row+1,driveOrder:driveIdx+1,coords:[toLL(pa,o),toLL(pb,o)]})}const pct=Math.floor(46+45*(driveIdx+1)/Math.max(1,order.length));if(pct!==lastPct){progress(jobId,pct,skipRows>0?'Generating skip-row route…':'Generating parallel passes…');lastPct=pct}}
  annotateTurns(out,actual,skipRows,turningRadiusFt);
  return{segments:out,fitInfo:{coveragePriority,count,actualSpacingM:actual,rangeM:range,skipRows}}
}
function headlandSegments(poly,passes,spacingFt,jobId){
  const out=[];let cur=poly,pass=1;
  for(let i=0;i<passes&&cur;i++){
    for(const rings of featurePolygons(cur))for(const ring of rings)if(ring?.length>3)out.push({kind:'headland',pass:pass++,headlandPass:i+1,coords:ring});
    progress(jobId,38+Math.min(7,7*(i+1)/Math.max(1,passes)),'Generating headland passes…');
    try{cur=turf.buffer(cur,-spacingFt,{units:'feet',steps:8})}catch(e){cur=null}
  }
  return out;
}
function contourSegments(poly,spacingFt,jobId){const out=[];let idx=1,cur=poly;for(let guard=0;guard<250&&cur;guard++){const polys=featurePolygons(cur);let any=false;for(const rings of polys)for(const ring of rings)if(ring&&ring.length>3){out.push({kind:'contour',pass:idx++,coords:ring});any=true}if(!any)break;progress(jobId,46+Math.min(44,44*(1-Math.exp(-(guard+1)/18))),'Generating inward contour loops…');try{cur=turf.buffer(cur,-spacingFt,{units:'feet',steps:8})}catch(e){break}}return out}
function pathMiles(segments,jobId){let miles=0;for(let i=0;i<segments.length;i++){if(segments[i].coords?.length>1)miles+=turf.length(turf.lineString(segments[i].coords),{units:'miles'});if(i&&i%50===0)progress(jobId,92+5*i/Math.max(1,segments.length),'Calculating route totals…')}return miles}
self.onmessage=e=>{
  const msg=e.data||{};if(msg.type!=='generate')return;const{jobId,boundary,inclusions,exclusions,settings,currentFix}=msg;
  try{
    progress(jobId,2,'Combining selected work regions…');let work=unionAll(inclusions||[],jobId);if(!work)throw new Error('No selected work/inclusion region.');progress(jobId,14,'Clipping work area to property…');const clipped=turf.intersect(turf.featureCollection([work,boundary]));if(clipped)work=clipped;progress(jobId,16,'Applying exclusion zones…');work=subtractExclusions(work,exclusions||[],jobId);if(!work)throw new Error('Exclusions remove the entire selected work area.');
    const activeAreaAcres=turf.area(work)*10.7639104167/SQFT_PER_ACRE,insetFt=settings.implementWidthFt/2+settings.boundaryMarginFt;let safe=work;if(insetFt>0){progress(jobId,35,'Applying implement-edge clearance…');safe=turf.buffer(work,-insetFt,{units:'feet',steps:8})}if(!safe)throw new Error('No usable area remains after implement half-width and boundary margin.');
    const effWidth=Math.max(.1,settings.implementWidthFt-settings.overlapFt),parallelLike=settings.pathType==='parallel'||settings.pathType==='skip-parallel',headlandOn=parallelLike&&Boolean(settings.headlandEnabled),headlandPassesCount=headlandOn?Math.max(0,Math.floor(Number(settings.headlandPasses)||0)):0,skipRows=Math.max(0,Math.floor(Number(settings.turnSkipRows)||0)),turningRadiusFt=Math.max(1,Number(settings.turningRadiusFt)||18);
    let segments=[],fitInfo=null,interior=safe;
    if(headlandPassesCount>0){segments.push(...headlandSegments(safe,headlandPassesCount,effWidth,jobId));try{interior=turf.buffer(safe,-headlandPassesCount*effWidth,{units:'feet',steps:8})}catch(e){interior=null}if(!interior)throw new Error('Headland passes consume the entire usable area. Reduce headland passes or implement width.')}
    if(parallelLike){progress(jobId,45,skipRows>0?'Generating skip-row route…':'Generating parallel passes…');const result=scanlineSegments(interior,settings.parallelHeading,effWidth/FT_PER_M,settings.startOrder,currentFix,jobId,settings.coveragePriority||'coverage',skipRows,turningRadiusFt);segments.push(...result.segments);fitInfo=result.fitInfo}else{progress(jobId,45,'Generating inward contour loops…');segments=contourSegments(safe,effWidth,jobId)}
    if(!segments.length)throw new Error('No usable path could be generated.');progress(jobId,92,'Calculating route totals…');const plannedMiles=pathMiles(segments,jobId),passGroups=new Set(segments.map(s=>s.pass)).size;
    postMessage({type:'result',jobId,segments,plannedMiles,passGroups,activeAreaAcres,planMeta:{type:settings.pathType,heading:parallelLike?settings.parallelHeading:null,effectiveSpacingFt:effWidth,insetFt,coveragePriority:settings.coveragePriority||'coverage',actualSpacingFt:fitInfo?.actualSpacingM?fitInfo.actualSpacingM*FT_PER_M:null,skipPass:skipRows>0,turnSkipRows:skipRows,headlandEnabled:headlandOn,headlandPasses:headlandPassesCount,turningRadiusFt,turnStyle:'bulb'}})
  }catch(err){postMessage({type:'error',jobId,pct:0,message:err?.message||String(err)})}
};
