(()=>{
 function installGeometryRepair(){
  if(window.__TRACTOR_GEOMETRY_REPAIR_INSTALLED)return true;
  if(typeof updateMapData!=='function')return false;
  window.__TRACTOR_GEOMETRY_REPAIR_INSTALLED=true;

  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const pair=v=>Array.isArray(v)&&v.length>=2&&Number.isFinite(Number(v[0]))&&Number.isFinite(Number(v[1]))
    ?[Number(v[0]),Number(v[1])]:null;
  const same=(a,b)=>a&&b&&Math.abs(a[0]-b[0])<1e-12&&Math.abs(a[1]-b[1])<1e-12;

  function normalizeRing(raw){
   if(!Array.isArray(raw))return null;
   const pts=[];
   for(const p of raw){
    const q=pair(p);if(!q)continue;
    if(!pts.length||!same(pts[pts.length-1],q))pts.push(q);
   }
   if(pts.length>1&&same(pts[0],pts[pts.length-1]))pts.pop();
   const unique=new Set(pts.map(p=>`${p[0].toFixed(12)},${p[1].toFixed(12)}`));
   if(unique.size<3)return null;
   pts.push([...pts[0]]);
   return pts;
  }

  function normalizePolygonFeature(input,name='Region'){
   if(!input)return null;
   let feature;
   if(input.type==='Feature')feature=clone(input);
   else if(input.type==='Polygon'||input.type==='MultiPolygon')feature={type:'Feature',properties:{name},geometry:clone(input)};
   else if(Array.isArray(input))feature={type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:clone(input)}};
   else return null;

   feature.properties={...(feature.properties||{})};
   if(!feature.properties.name)feature.properties.name=name;
   const g=feature.geometry;
   if(!g)return null;

   if(g.type==='Polygon'){
    let coords=g.coordinates;
    if(!Array.isArray(coords))return null;
    if(coords.length&&pair(coords[0]))coords=[coords];
    const rings=[];
    for(const r of coords){const nr=normalizeRing(r);if(nr)rings.push(nr)}
    if(!rings.length)return null;
    feature.geometry={type:'Polygon',coordinates:rings};
    return feature;
   }

   if(g.type==='MultiPolygon'){
    const polys=[];
    for(const poly of (g.coordinates||[])){
     const rings=[];
     for(const r of (poly||[])){const nr=normalizeRing(r);if(nr)rings.push(nr)}
     if(rings.length)polys.push(rings);
    }
    if(!polys.length)return null;
    feature.geometry={type:'MultiPolygon',coordinates:polys};
    return feature;
   }
   return null;
  }

  function normalizeAllInMemory(){
   let changed=false;
   const nextBoundary=normalizePolygonFeature(boundary,currentPropertyName||'Property');
   if(JSON.stringify(nextBoundary)!==JSON.stringify(boundary)){boundary=nextBoundary;changed=true}

   const nextWork=(workRegions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Work Region ${i+1}`)).filter(Boolean);
   if(JSON.stringify(nextWork)!==JSON.stringify(workRegions)){workRegions=nextWork;changed=true}

   const nextEx=(exclusions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Exclusion ${i+1}`)).filter(Boolean);
   if(JSON.stringify(nextEx)!==JSON.stringify(exclusions)){exclusions=nextEx;changed=true}
   return changed;
  }

  async function fetchProperty(id){
   if(!id||!db||!db.objectStoreNames?.contains('properties'))return null;
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction('properties','readonly');
    const req=tx.objectStore('properties').get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
   });
  }

  async function persistNormalizedProperty(rec){
   if(!rec||!db)return;
   const fixed={...rec,boundary:normalizePolygonFeature(rec.boundary,rec.name||'Property'),
    workRegions:(rec.workRegions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Work Region ${i+1}`)).filter(Boolean),
    exclusions:(rec.exclusions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Exclusion ${i+1}`)).filter(Boolean)};
   if(!fixed.boundary)return;
   if(JSON.stringify(fixed)===JSON.stringify(rec))return;
   try{
    const tx=db.transaction('properties','readwrite');
    tx.objectStore('properties').put(fixed);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
    console.info('Normalized and repaired saved property geometry:',fixed.id);
   }catch(e){console.warn('Could not persist normalized property geometry',e)}
  }

  async function rehydrateReferencedProperty(force=false){
   const id=currentPropertyId||localStorage.getItem('tractorLastPropertyId');
   if(!id||!db)return false;
   try{
    const rec=await fetchProperty(id);
    if(!rec)return false;
    const fixedBoundary=normalizePolygonFeature(rec.boundary,rec.name||'Property');
    if(!fixedBoundary)return false;
    if(force||!boundary||!normalizePolygonFeature(boundary,currentPropertyName||'Property')){
     boundary=fixedBoundary;
     workRegions=(rec.workRegions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Work Region ${i+1}`)).filter(Boolean);
     exclusions=(rec.exclusions||[]).map((f,i)=>normalizePolygonFeature(f,f?.properties?.name||`Exclusion ${i+1}`)).filter(Boolean);
     currentPropertyId=rec.id;
     currentPropertyName=rec.name||currentPropertyName||'Property';
     localStorage.setItem('tractorLastPropertyId',rec.id);
    }else{
     normalizeAllInMemory();
    }
    await persistNormalizedProperty(rec);
    try{updateAll()}catch(e){try{updateMapData()}catch(_){} }
    return true;
   }catch(e){console.warn('Property geometry rehydrate failed',e);return false}
  }

  const originalUpdateMapData=updateMapData;
  updateMapData=function(){normalizeAllInMemory();return originalUpdateMapData.apply(this,arguments)};

  if(typeof savePropertyProfile==='function'){
   const original=savePropertyProfile;
   savePropertyProfile=async function(){normalizeAllInMemory();return await original.apply(this,arguments)};
  }
  if(typeof autoUpdateCurrentProperty==='function'){
   const original=autoUpdateCurrentProperty;
   autoUpdateCurrentProperty=async function(){normalizeAllInMemory();return await original.apply(this,arguments)};
  }
  if(typeof loadPropertyProfile==='function'){
   const original=loadPropertyProfile;
   loadPropertyProfile=async function(){const r=await original.apply(this,arguments);normalizeAllInMemory();try{updateAll()}catch(e){};return r};
  }
  if(typeof importProperty==='function'){
   const original=importProperty;
   importProperty=async function(){const r=await original.apply(this,arguments);normalizeAllInMemory();try{updateAll()}catch(e){};return r};
  }
  if(typeof loadPathing==='function'){
   const original=loadPathing;
   loadPathing=async function(){const r=await original.apply(this,arguments);await rehydrateReferencedProperty(false);normalizeAllInMemory();try{updateAll()}catch(e){};return r};
  }
  if(typeof loadSession==='function'){
   const original=loadSession;
   loadSession=async function(){const r=await original.apply(this,arguments);await rehydrateReferencedProperty(true);return r};
  }

  let tries=0;
  const timer=setInterval(async()=>{
   tries++;
   if(await rehydrateReferencedProperty(false)||tries>=24)clearInterval(timer);
  },250);

  normalizeAllInMemory();
  try{updateMapData()}catch(e){}
  window.TRACTOR_GEOMETRY_REPAIR={normalizePolygonFeature,rehydrateReferencedProperty};
  return true;
 }
 window.installTractorGeometryRepair=installGeometryRepair;
})();
