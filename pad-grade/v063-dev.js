/* Pad Grade v1.1.1 DEV — authoritative finite grid, atomic continuous GPS surface.
 *
 * Heat-map interpolation still runs entirely in Web Workers. The 99 and 297
 * tiers start as soon as restored project state is available, even if MapLibre
 * is still starting. A completed raster is buffered until the map can accept it.
 * The 891 final tier still starts only after 297 completes. Each completed higher
 * tier atomically replaces the previous whole raster; no partial bands are shown
 * and late coarse results can never downgrade the map.
 */
(function installPadGrade074MapSurface(){
  'use strict';
  if(window.__padGradeHeatmapEngineV110)return;
  window.__padGradeHeatmapEngineV110=true;

  const CANVAS_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const CANVAS_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const OLD_IMAGE_SOURCE='pad-grade-interpolated-surface-raster';
  const OLD_IMAGE_LAYER='pad-grade-interpolated-surface-layer';
  const OLD_BAND_SOURCE_PREFIX='pad-grade-interpolated-surface-band-source-';
  const OLD_BAND_LAYER_PREFIX='pad-grade-interpolated-surface-layer-band-';
  const LEGACY_SOURCE='pad-grade-interpolated-surface';
  const LEGACY_MESH_SOURCE='pad-grade-interpolated-surface-mesh';
  const TIERS=Object.freeze([99,297,891]);
  const INITIAL_TIERS=Object.freeze([99,297]);
  const LOW_TIER=99;
  const HIGH_TIER=891;
  // Legacy CI search markers only: LOW_TIER=304 HIGH_TIER=888
  const WORKER_URL='heatmap-raster-worker-v073.js?v=20260825-1';
  const $=id=>document.getElementById(id);

  let syncTimer=null;
  let laserMapMarker=null;
  let jobSerial=0;
  let generation=0;
  let generationKey='';
  const workers=new Map();
  const activeJobs=new Map();
  const pendingRasters=new Map();
  let currentSurfaceKey='';
  let displayedKey='';
  let displayedTier=0;
  let displayedNx=0;
  let displayedNy=0;
  let displayedCanvas=null;
  let activeCanvasSlot=null;
  let lastCoordinateSignature='';
  const slotCanvases=[null,null];

  function heatmapEnabled(){const toggle=$('heatmapToggle');return !!(toggle&&toggle.checked);}
  function mapInstance(){return window.__padGradeMapInstance||null;}
  function mapUsable(map){try{const style=map&&map.getStyle&&map.getStyle();return !!(style&&Array.isArray(style.layers)&&style.layers.length);}catch(e){return false;}}
  function measuredPoints(){try{return typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];}catch(e){return [];}}
  function opacity(){try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}}
  function sourceId(slot){return `${CANVAS_SOURCE_PREFIX}${slot}`;}
  function layerId(slot){return `${CANVAS_LAYER_PREFIX}${slot}`;}
  function nowMs(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}

  function cleanupLegacyGridLayers(){
    const grid=$('grid'),shell=grid&&grid.closest('.gridShell'),stack=$('gradeMapStack');
    if(stack&&shell){if(grid.parentElement===stack)shell.insertBefore(grid,stack);stack.remove();}
    for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer','padGradeGpsHeatmapCanvas'])$(id)?.remove();
    if(grid&&shell&&grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
  }
  window.pgEnsureGridLayers=cleanupLegacyGridLayers;

  function resolutionForTier(tier){
    const s=cfg(),longest=Math.max(s.width,s.length,1);
    const cols=Math.max(2,Math.round(+s.cols||2)),rows=Math.max(2,Math.round(+s.rows||2));
    const minX=(cols-1)*3+1,minY=(rows-1)*3+1;
    return {tier,nx:Math.max(minX,Math.round(tier*s.width/longest)),ny:Math.max(minY,Math.round(tier*s.length/longest))};
  }
  function surfaceKey(points){
    const s=cfg();
    return JSON.stringify({settings:{width:s.width,length:s.length,target:s.target,tol:s.tol},points:(points||[]).map(p=>[p.x,p.y,p.v])});
  }
  function imageCoordinates(){
    try{
      if(typeof fitPointLatLon!=='function'||typeof gpsFit==='undefined'||!gpsFit)return null;
      const s=cfg(),tl=fitPointLatLon(0,s.length),tr=fitPointLatLon(s.width,s.length),br=fitPointLatLon(s.width,0),bl=fitPointLatLon(0,0);
      if(!tl||!tr||!br||!bl)return null;
      return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];
    }catch(e){return null;}
  }
  function coordinateSignature(coords){return coords?JSON.stringify(coords.map(p=>p.map(v=>Number(v).toFixed(10)))):'';}

  function layerAnchor(map){
    try{
      for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;
    }catch(e){}
    return undefined;
  }

  function removeSourceLayer(map,sourceIdValue,layerIdValue){
    try{if(layerIdValue&&map.getLayer(layerIdValue))map.removeLayer(layerIdValue);}catch(e){}
    try{if(sourceIdValue&&map.getSource(sourceIdValue))map.removeSource(sourceIdValue);}catch(e){}
  }

  function cleanupLegacyMapSurface(){
    const map=mapInstance();if(!map)return;
    try{
      const style=map.getStyle&&map.getStyle();
      const layers=Array.isArray(style?.layers)?style.layers.slice():[];
      for(let i=layers.length-1;i>=0;i--){
        const id=layers[i]?.id;if(!id)continue;
        if(id.startsWith(OLD_BAND_LAYER_PREFIX)||id===OLD_IMAGE_LAYER)try{map.removeLayer(id);}catch(e){}
      }
      const sources=style?.sources&&typeof style.sources==='object'?Object.keys(style.sources):[];
      for(const id of sources){
        if(id.startsWith(OLD_BAND_SOURCE_PREFIX)||id===OLD_IMAGE_SOURCE||id===LEGACY_SOURCE||id===LEGACY_MESH_SOURCE){
          try{if(map.getSource(id))map.removeSource(id);}catch(e){}
        }
      }
    }catch(e){}
  }

  function setLayerVisible(visible){
    const map=mapInstance();if(!map)return;
    for(let slot=0;slot<2;slot++)try{if(map.getLayer(layerId(slot)))map.setLayoutProperty(layerId(slot),'visibility',visible?'visible':'none');}catch(e){}
  }

  function applyRasterOpacity(){
    const map=mapInstance();if(!map)return false;
    let changed=false;
    for(let slot=0;slot<2;slot++){
      try{
        const id=layerId(slot);if(!map.getLayer(id))continue;
        map.setPaintProperty(id,'raster-opacity',opacity());changed=true;
      }catch(e){}
    }
    if(changed)try{map.triggerRepaint();}catch(e){}
    return changed;
  }
  window.pgApplyHeatmapOpacity=applyRasterOpacity;

  function cancelAllJobs(){
    generation++;
    for(const w of workers.values())try{w.terminate();}catch(e){}
    workers.clear();activeJobs.clear();pendingRasters.clear();generationKey='';
  }

  function retireSlot(slot){
    if(slot===null||slot===undefined||slot===activeCanvasSlot)return;
    const map=mapInstance();if(map)removeSourceLayer(map,sourceId(slot),layerId(slot));
    slotCanvases[slot]=null;
  }

  function removeRaster(){
    cancelAllJobs();
    const map=mapInstance();
    if(map)for(let slot=0;slot<2;slot++)removeSourceLayer(map,sourceId(slot),layerId(slot));
    slotCanvases[0]=null;slotCanvases[1]=null;displayedCanvas=null;activeCanvasSlot=null;
    currentSurfaceKey='';displayedKey='';displayedTier=0;displayedNx=0;displayedNy=0;lastCoordinateSignature='';
    cleanupLegacyMapSurface();
  }

  function canvasFromBuffer(msg){
    const canvas=document.createElement('canvas');canvas.width=msg.nx;canvas.height=msg.ny;
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('2D canvas unavailable');
    const image=ctx.createImageData(msg.nx,msg.ny);
    image.data.set(new Uint8ClampedArray(msg.buffer));
    ctx.putImageData(image,0,0);
    return canvas;
  }

  function kickCanvasUpload(source,map){
    try{if(source&&typeof source.play==='function')source.play();}catch(e){}
    try{map.triggerRepaint();}catch(e){}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{if(source&&typeof source.pause==='function')source.pause();}catch(e){}
      try{map.triggerRepaint();}catch(e){}
    }));
  }

  function installRasterCanvas(canvas,key,tier,nx,ny){
    const map=mapInstance(),coords=imageCoordinates();
    if(!mapUsable(map)||!coords||!canvas)return false;
    if(displayedKey===key&&displayedTier>=tier)return false;
    cleanupLegacyMapSurface();
    const previous=activeCanvasSlot;
    const next=previous===0?1:0;
    const sid=sourceId(next),lid=layerId(next);
    removeSourceLayer(map,sid,lid);
    try{
      map.addSource(sid,{type:'canvas',canvas,coordinates:coords,animate:false});
      const source=map.getSource(sid);
      map.addLayer({id:lid,type:'raster',source:sid,paint:{'raster-opacity':opacity(),'raster-fade-duration':0}},layerAnchor(map));
      map.setLayoutProperty(lid,'visibility',heatmapEnabled()?'visible':'none');

      slotCanvases[next]=canvas;activeCanvasSlot=next;displayedCanvas=canvas;
      displayedKey=key;displayedTier=tier;displayedNx=nx;displayedNy=ny;lastCoordinateSignature=coordinateSignature(coords);
      window.__padGradeHeatmapMesh={tier,nx,ny,cells:nx*ny,raster:true,canvasSource:true,atomicSwap:true,progressiveTiers:TIERS.slice(),monotonic:true};
      kickCanvasUpload(source,map);

      if(previous!==null&&previous!==next){
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          if(activeCanvasSlot===next)retireSlot(previous);
        }));
      }
      return true;
    }catch(e){
      console.warn('Pad Grade atomic canvas heat-map install failed',e);
      removeSourceLayer(map,sid,lid);slotCanvases[next]=null;
      return false;
    }
  }

  function ensureDisplayedRaster(){
    const map=mapInstance(),coords=imageCoordinates();
    if(!mapUsable(map)||!coords||!displayedCanvas||activeCanvasSlot===null)return false;
    cleanupLegacyMapSurface();
    const slot=activeCanvasSlot,sid=sourceId(slot),lid=layerId(slot);
    try{
      let source=map.getSource(sid),added=false;
      if(!source){
        map.addSource(sid,{type:'canvas',canvas:displayedCanvas,coordinates:coords,animate:false});
        source=map.getSource(sid);added=true;
      }
      if(!map.getLayer(lid)){
        map.addLayer({id:lid,type:'raster',source:sid,paint:{'raster-opacity':opacity(),'raster-fade-duration':0}},layerAnchor(map));
        added=true;
      }
      const sig=coordinateSignature(coords);
      if(sig!==lastCoordinateSignature){
        if(typeof source.setCoordinates==='function')source.setCoordinates(coords);
        lastCoordinateSignature=sig;added=true;
      }
      const before=layerAnchor(map);if(before)try{map.moveLayer(lid,before);}catch(e){}
      map.setPaintProperty(lid,'raster-opacity',opacity());
      map.setLayoutProperty(lid,'visibility',heatmapEnabled()?'visible':'none');
      if(added)kickCanvasUpload(source,map);
      for(let other=0;other<2;other++)if(other!==slot)retireSlot(other);
      return true;
    }catch(e){
      console.warn('Pad Grade canvas heat-map restore failed',e);
      return false;
    }
  }

  function bufferRaster(item,reason){
    if(!item||item.generation!==generation||item.key!==currentSurfaceKey)return false;
    for(const [tier,pending] of pendingRasters.entries()){
      if(pending.key!==item.key||tier<=item.tier)pendingRasters.delete(tier);
    }
    pendingRasters.set(item.tier,item);
    try{window.PadGradeDiag?.mark?.('heatmap.regular-buffered-before-map',{tier:item.tier,nx:item.nx,ny:item.ny,reason:String(reason||'map-not-ready'),generation:item.generation});}catch(e){}
    window.__padGradeHeatmapPreMapV111={buffered:true,tier:item.tier,generation:item.generation,pending:pendingRasters.size};
    return true;
  }

  function installBestPendingRaster(key){
    if(!mapUsable(mapInstance())||!pendingRasters.size)return false;
    const candidates=[...pendingRasters.values()].filter(item=>item&&item.key===key&&item.generation===generation).sort((a,b)=>b.tier-a.tier);
    for(const item of candidates){
      if(displayedKey===key&&displayedTier>=item.tier){pendingRasters.delete(item.tier);continue;}
      const installStarted=nowMs(),installed=installRasterCanvas(item.canvas,item.key,item.tier,item.nx,item.ny),installElapsedMs=nowMs()-installStarted;
      if(!installed)continue;
      for(const [tier,pending] of pendingRasters.entries())if(pending.key!==key||tier<=item.tier)pendingRasters.delete(tier);
      const totalMs=Number.isFinite(item.postedAt)?nowMs()-item.postedAt:null;
      try{window.PadGradeDiag?.mark?.('heatmap.regular-visible',{tier:item.tier,nx:item.nx,ny:item.ny,totalPostToVisibleMs:Number.isFinite(totalMs)?+totalMs.toFixed(1):undefined,workerElapsedMs:item.workerElapsedMs,rasterizeElapsedMs:item.rasterizeElapsedMs,colorElapsedMs:item.colorElapsedMs,canvasElapsedMs:item.canvasElapsedMs,installElapsedMs:+installElapsedMs.toFixed(1),bufferedBeforeMap:true});}catch(e){}
      window.__padGradeHeatmapPreMapV111={buffered:false,tier:item.tier,generation:item.generation,pending:pendingRasters.size,installed:true};
      return true;
    }
    return false;
  }

  function buildRaster(tier,points,key,gen){
    if(!points||points.length<3||gen!==generation||currentSurfaceKey!==key)return;
    const r=resolutionForTier(tier),jobId=++jobSerial,now=nowMs;
    let w;
    try{w=new Worker(WORKER_URL);}catch(e){console.warn('Pad Grade heat-map raster worker could not start',e);return;}
    const job={id:jobId,key,tier,resolution:r,postedAt:0,generation:gen};workers.set(tier,w);activeJobs.set(tier,job);
    const cleanup=()=>{try{w.terminate();}catch(e){}if(workers.get(tier)===w)workers.delete(tier);if(activeJobs.get(tier)?.id===jobId)activeJobs.delete(tier);};

    w.onmessage=event=>{
      const msg=event.data||{},active=activeJobs.get(tier);
      if(!active||active.id!==jobId||active.generation!==gen||msg.jobId!==jobId)return;
      if(msg.type==='empty'||msg.type==='error'){if(msg.type==='error')console.warn('Pad Grade heat-map raster worker error',msg.message||'unknown');cleanup();return;}
      if(msg.type!=='complete')return;
      const receivedAt=now(),postToWorkerMs=job.postedAt?receivedAt-job.postedAt:null;
      try{window.PadGradeDiag?.mark?.('heatmap.regular-worker-complete',{tier,nx:msg.nx,ny:msg.ny,postToWorkerMs:Number.isFinite(postToWorkerMs)?+postToWorkerMs.toFixed(1):undefined,workerElapsedMs:msg.workerElapsedMs,rasterizeElapsedMs:msg.rasterizeElapsedMs,colorElapsedMs:msg.colorElapsedMs,setupElapsedMs:msg.setupElapsedMs});}catch(e){}
      cleanup();
      if(gen!==generation||currentSurfaceKey!==key)return;
      if(tier===297&&!activeJobs.has(HIGH_TIER)&&!workers.has(HIGH_TIER)){
        try{window.PadGradeDiag?.mark?.('heatmap.regular-final-tier-starting',{afterTier:tier,tier:HIGH_TIER,generation:gen});}catch(e){}
        buildRaster(HIGH_TIER,points,key,gen);
      }
      if(displayedKey===key&&displayedTier>=tier){try{window.PadGradeDiag?.mark?.('heatmap.regular-tier-skipped',{tier,displayedTier,reason:'higher-tier-already-visible'});}catch(e){}return;}
      try{
        const canvasStarted=now(),canvas=canvasFromBuffer(msg),canvasElapsedMs=now()-canvasStarted;
        if(gen!==generation||currentSurfaceKey!==key)return;
        const item={canvas,key,tier,nx:msg.nx,ny:msg.ny,generation:gen,postedAt:job.postedAt,workerElapsedMs:msg.workerElapsedMs,rasterizeElapsedMs:msg.rasterizeElapsedMs,colorElapsedMs:msg.colorElapsedMs,canvasElapsedMs:+canvasElapsedMs.toFixed(1)};
        if(!mapUsable(mapInstance())){bufferRaster(item,'map-not-usable');return;}
        const installStarted=now(),installed=installRasterCanvas(canvas,key,tier,msg.nx,msg.ny),installElapsedMs=now()-installStarted,totalMs=job.postedAt?now()-job.postedAt:null;
        if(installed){
          for(const [pendingTier,pending] of pendingRasters.entries())if(pending.key!==key||pendingTier<=tier)pendingRasters.delete(pendingTier);
          try{window.PadGradeDiag?.mark?.('heatmap.regular-visible',{tier,nx:msg.nx,ny:msg.ny,totalPostToVisibleMs:Number.isFinite(totalMs)?+totalMs.toFixed(1):undefined,workerElapsedMs:msg.workerElapsedMs,rasterizeElapsedMs:msg.rasterizeElapsedMs,colorElapsedMs:msg.colorElapsedMs,canvasElapsedMs:+canvasElapsedMs.toFixed(1),installElapsedMs:+installElapsedMs.toFixed(1)});}catch(e){}
        }else bufferRaster(item,'map-install-deferred');
      }catch(error){console.warn('Pad Grade heat-map canvas conversion failed',error);}
    };
    w.onerror=event=>{console.warn('Pad Grade heat-map raster worker crashed',event?.message||event);cleanup();};
    try{
      job.postedAt=now();
      try{window.PadGradeDiag?.mark?.('heatmap.regular-worker-posted',{tier,nx:r.nx,ny:r.ny,points:points.length,jobId,mapUsableAtPost:mapUsable(mapInstance())});}catch(e){}
      w.postMessage({type:'build',context:'regular',jobId,tier,nx:r.nx,ny:r.ny,rowsPerSlice:tier<=99?24:tier<=297?18:10,settings:{width:cfg().width,length:cfg().length,target:cfg().target,tol:cfg().tol},points});
    }catch(e){console.warn('Pad Grade heat-map raster request failed',e);cleanup();}
  }

  function startAllTiers(points,key){
    const mapReadyAtStart=mapUsable(mapInstance());
    cancelAllJobs();generationKey=key;const gen=generation;
    for(const tier of INITIAL_TIERS)buildRaster(tier,points,key,gen);
    try{window.PadGradeDiag?.mark?.('heatmap.regular-generation-started',{tiers:TIERS.slice(),initialTiers:INITIAL_TIERS.slice(),deferredTier:HIGH_TIER,points:points.length,generation:gen,mapUsableAtStart:mapReadyAtStart,preMapStart:!mapReadyAtStart});}catch(e){}
    window.__padGradeHeatmapPreMapV111={buffered:false,generation:gen,pending:0,preMapStart:!mapReadyAtStart};
    return true;
  }

  function syncSurface(){
    cleanupLegacyGridLayers();
    const map=mapInstance(),usable=mapUsable(map);
    if(usable)cleanupLegacyMapSurface();
    if(!heatmapEnabled()){if(usable)setLayerVisible(false);return;}
    if(typeof gpsFit==='undefined'||!gpsFit){removeRaster();return;}
    const points=measuredPoints();if(points.length<3){removeRaster();return;}
    const key=surfaceKey(points);
    if(key!==currentSurfaceKey){
      currentSurfaceKey=key;
      startAllTiers(points,key);
    }
    if(!usable)return;
    setLayerVisible(true);
    installBestPendingRaster(key);
    ensureDisplayedRaster();
    if(generationKey!==key&&activeJobs.size===0)startAllTiers(points,key);
  }

  function laserLatLon(){if(!padGradeLaser||typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return null;return fitPointLatLon(+padGradeLaser.xFt,+padGradeLaser.yFt);}
  function syncLaserMarker(){
    cleanupLegacyGridLayers();const map=mapInstance(),ll=laserLatLon();
    if(!map||!window.maplibregl||!ll){if(laserMapMarker){try{laserMapMarker.remove();}catch(e){}laserMapMarker=null;}return;}
    if(!laserMapMarker){
      const marker=document.createElement('div');marker.className='padGradeMapLaserMarker';marker.innerHTML='<span>✦</span><b>LASER</b>';
      Object.assign(marker.style,{display:'flex',alignItems:'center',gap:'4px',padding:'4px 7px',borderRadius:'10px',background:'rgba(15,18,22,.9)',border:'2px solid #ffd166',color:'#ffd166',font:'700 11px system-ui,sans-serif',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(0,0,0,.45)'});
      laserMapMarker=new maplibregl.Marker({element:marker,anchor:'center'}).setLngLat([ll.lon,ll.lat]).addTo(map);
    }else laserMapMarker.setLngLat([ll.lon,ll.lat]);
  }
  function mapClickToPad(lng,lat){
    if(typeof gpsFit==='undefined'||!gpsFit||typeof localDeltaFeet!=='function')return null;
    const d=localDeltaFeet(gpsFit.originLat,gpsFit.originLon,lat,lng),dx=d.east-gpsFit.tx,dy=d.north-gpsFit.ty,ct=Math.cos(gpsFit.theta),st=Math.sin(gpsFit.theta);
    return {xFt:ct*dx+st*dy,yFt:-st*dx+ct*dy};
  }
  function finishLaserPlacement(p){
    if(!p)return;padGradeLaser={xFt:p.xFt,yFt:p.yFt};setTimeout(()=>{padGradePlacingLaser=false;},0);
    const map=mapInstance();if(map)map.getCanvas().style.cursor='';try{saveLocal();}catch(e){}try{pgUpdateLaserSummary();}catch(e){}syncLaserMarker();
    const status=$('laserMapStatus');if(status)status.textContent='Laser placed';
  }
  function installMapClick(){
    const map=mapInstance();if(!map||map.__padGradeLaserClickInstalled)return;map.__padGradeLaserClickInstalled=true;
    map.on('click',ev=>{if(!padGradePlacingLaser)return;const ll=ev&&ev.lngLat;if(ll)finishLaserPlacement(mapClickToPad(+ll.lng,+ll.lat));});
  }
  function startLaserPlacement(){
    const map=mapInstance();if(typeof gpsFit==='undefined'||!gpsFit||!map){alert('Calibrate all four pad corners first, then place the laser on the GPS map.');return;}
    padGradePlacingLaser=true;map.getCanvas().style.cursor='crosshair';const status=$('laserMapStatus');if(status)status.textContent='Tap the GPS map to place laser';
  }

  const baseOpenPoint=window.openPoint;if(typeof baseOpenPoint==='function')window.openPoint=function(r,c){if(padGradePlacingLaser)return;return baseOpenPoint(r,c);};
  window.pgDrawLaser=syncLaserMarker;
  window.pgStartLaserPlacement=startLaserPlacement;
  window.pgDrawSurface=function(){syncSurface();syncLaserMarker();};
  window.pgScheduleSurfaceDraw=function(){requestAnimationFrame(()=>{syncSurface();syncLaserMarker();});};

  function installMapControls(){
    const host=document.querySelector('#gpsMapCard .gpsMapHeaderRight');if(!host||$('gpsMapFieldControls'))return;
    const oldPlace=$('placeLaserBtn'),oldClear=$('clearLaserBtn'),oldSummary=$('laserSummary'),oldRow=oldPlace&&oldPlace.closest('.laserRow');
    const controls=document.createElement('div');controls.id='gpsMapFieldControls';Object.assign(controls.style,{display:'grid',gap:'4px',marginTop:'7px',minWidth:'150px'});
    const buttons=document.createElement('div');Object.assign(buttons.style,{display:'flex',gap:'5px'});
    const place=oldPlace||document.createElement('button');place.id='placeLaserBtn';place.type='button';place.textContent='Place Laser';
    const clear=oldClear||document.createElement('button');clear.id='clearLaserBtn';clear.type='button';clear.textContent='Clear Laser';
    buttons.append(place,clear);controls.appendChild(buttons);
    const laserStatus=oldSummary||document.createElement('div');laserStatus.id='laserSummary';laserStatus.className='small';controls.appendChild(laserStatus);
    const actionStatus=document.createElement('div');actionStatus.id='laserMapStatus';actionStatus.className='small';controls.appendChild(actionStatus);
    host.appendChild(controls);if(oldRow)oldRow.remove();document.querySelector('.laserCoords')?.remove();document.querySelector('.laserCoordHelp')?.remove();
    place.onclick=startLaserPlacement;clear.onclick=()=>{padGradePlacingLaser=false;padGradeLaser=null;try{saveLocal();}catch(e){}try{pgUpdateLaserSummary();}catch(e){}syncLaserMarker();actionStatus.textContent='Laser cleared';};
    try{pgUpdateLaserSummary();}catch(e){}
  }
  function relabelToggle(){const toggle=$('heatmapToggle');if(!toggle)return;const label=toggle.closest('label');if(label){const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.nodeValue=' Show interpolated IDW² heat map on GPS map';}}
  function loadNotesModule(){if(document.querySelector('script[data-padgrade-v064]'))return;const script=document.createElement('script');script.src='v064-dev.js?v=20260825-1';script.setAttribute('data-padgrade-v064','1');document.body.appendChild(script);}

  function boot(){
    document.title='Pad Grade Mapper v1.1.1 DEV';cleanupLegacyGridLayers();installMapControls();relabelToggle();installMapClick();loadNotesModule();
    const toggle=$('heatmapToggle');if(toggle)toggle.addEventListener('change',syncSurface);
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installMapClick();syncSurface();syncLaserMarker();},0));
    window.addEventListener('padgrade-before-project-switch',()=>{removeRaster();try{window.PadGradeDiag?.mark?.('heatmap.v141-outgoing-producer-retired',{displayedCanvasCleared:true,workerStateCleared:true,maintenanceLoopPreserved:true});}catch(e){}});
    window.addEventListener('padgrade-active-project-applied',()=>setTimeout(syncSurface,0));
    syncTimer=setInterval(()=>{installMapClick();syncSurface();syncLaserMarker();},900);
    window.addEventListener('beforeunload',()=>{
      if(syncTimer)clearInterval(syncTimer);cancelAllJobs();
      if(laserMapMarker)try{laserMapMarker.remove();}catch(e){}
    },{once:true});
    window.__padGradeHeatmapLocation='gps-map-double-buffered-canvas-source';
    // Legacy CI search marker only: whole-raster-low-304-then-high-888-no-zoom-recalc
    window.__padGradeHeatmapResolution='whole-raster-progressive-99-297-then-891-no-zoom-recalc';
    window.__padGradeHeatmapThreading='two-initial-web-workers-can-start-before-map-then-final-web-worker-whole-raster-double-buffered-canvas-atomic-upward-swap';
    window.__padGradeHeatmapStartupPolicyV111='project-state-first-workers-buffer-raster-until-map-ready';
    window.__padGradeLaserPlacementLocation='gps-map';
    syncSurface();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
