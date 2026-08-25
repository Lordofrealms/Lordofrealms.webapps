/* Pad Grade v0.7.1 DEV — authoritative finite grid, progressive continuous GPS surface.
 *
 * Heat-map interpolation runs in a dedicated Web Worker. The currently completed
 * surface remains visible while the worker calculates a sharper one in bounded
 * row bands. Each band is handed to MapLibre separately, so the map stays usable
 * and visibly refines over time rather than freezing for one giant GeoJSON build.
 *
 * Resolution is ~3x the v0.7.0 cell density at the same zoom. For an unchanged
 * survey, completed resolution is monotonic: zooming out never replaces an
 * already-calculated sharper surface with a lower-resolution one.
 */
(function installPadGrade071MapSurface(){
  'use strict';

  const SOURCE_PREFIX='pad-grade-interpolated-surface-mesh';
  const LAYER_PREFIX='pad-grade-interpolated-surface-layer';
  const LEGACY_SOURCE='pad-grade-interpolated-surface';
  const LEGACY_EXACT_SOURCE='pad-grade-interpolated-surface-mesh';
  const LEGACY_EXACT_LAYER='pad-grade-interpolated-surface-layer';
  const BASE_TIER=304;
  // sqrt(3) × the old 304–512 long-axis tiers gives ~3x as many cells.
  const MESH_TIERS=[528,608,696,792,888];
  const TARGET_CELL_PX=.90;
  const WORKER_URL='heatmap-worker-v071.js?v=20260825-1';
  const $=id=>document.getElementById(id);

  let syncTimer=null;
  let resolutionTimer=null;
  let laserMapMarker=null;
  let worker=null;
  let activeJob=null;
  let completedGroup=null;
  let jobSerial=0;
  let groupSerial=0;
  let currentDataKey='';
  let desiredTier=BASE_TIER;

  function heatmapEnabled(){const toggle=$('heatmapToggle');return !!(toggle&&toggle.checked);}
  function mapInstance(){return window.__padGradeMapInstance||null;}
  function mapUsable(map){try{const style=map&&map.getStyle&&map.getStyle();return !!(style&&Array.isArray(style.layers)&&style.layers.length);}catch(e){return false;}}

  function cleanupLegacyGridLayers(){
    const grid=$('grid'),shell=grid&&grid.closest('.gridShell'),stack=$('gradeMapStack');
    if(stack&&shell){if(grid.parentElement===stack)shell.insertBefore(grid,stack);stack.remove();}
    for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer','padGradeGpsHeatmapCanvas'])$(id)?.remove();
    if(grid&&shell&&grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
  }
  window.pgEnsureGridLayers=cleanupLegacyGridLayers;

  function screenDistance(a,b){if(!a||!b)return 0;const dx=Number(b.x)-Number(a.x),dy=Number(b.y)-Number(a.y);return Number.isFinite(dx)&&Number.isFinite(dy)?Math.hypot(dx,dy):0;}
  function resolutionForTier(tier){const s=cfg(),longest=Math.max(s.width,s.length,1);return {tier,nx:Math.max(64,Math.round(tier*s.width/longest)),ny:Math.max(64,Math.round(tier*s.length/longest))};}
  function zoomDesiredTier(){
    const s=cfg(),map=mapInstance();let desired=MESH_TIERS[0];
    try{
      if(map&&typeof map.project==='function'&&typeof fitPointLatLon==='function'&&typeof gpsFit!=='undefined'&&gpsFit){
        const ll00=fitPointLatLon(0,0),ll10=fitPointLatLon(s.width,0),ll01=fitPointLatLon(0,s.length),ll11=fitPointLatLon(s.width,s.length);
        if(ll00&&ll10&&ll01&&ll11){
          const p00=map.project([ll00.lon,ll00.lat]),p10=map.project([ll10.lon,ll10.lat]),p01=map.project([ll01.lon,ll01.lat]),p11=map.project([ll11.lon,ll11.lat]);
          const widthPx=(screenDistance(p00,p10)+screenDistance(p01,p11))/2;
          const lengthPx=(screenDistance(p00,p01)+screenDistance(p10,p11))/2;
          const raw=Math.ceil(Math.max(widthPx,lengthPx)/TARGET_CELL_PX);
          desired=MESH_TIERS.find(v=>v>=raw)||MESH_TIERS[MESH_TIERS.length-1];
        }
      }
    }catch(e){}
    return desired;
  }

  function measuredPoints(){try{return typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];}catch(e){return [];}}
  function fitSignature(){try{return gpsFit?[gpsFit.tx,gpsFit.ty,gpsFit.theta,gpsFit.originLat,gpsFit.originLon].map(v=>Number(v).toFixed(10)).join(','):'none';}catch(e){return 'none';}}
  function dataKey(points){
    const s=cfg();
    return JSON.stringify({fit:fitSignature(),settings:{width:s.width,length:s.length,target:s.target,tol:s.tol},points:(points||[]).map(p=>[p.x,p.y,p.v])});
  }

  function layerAnchor(map){
    try{
      for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;
    }catch(e){}
    return undefined;
  }
  function opacity(){try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}}

  function removeSourceLayer(map,sourceId,layerId){
    try{if(layerId&&map.getLayer(layerId))map.removeLayer(layerId);}catch(e){}
    try{if(sourceId&&map.getSource(sourceId))map.removeSource(sourceId);}catch(e){}
  }
  function removeGroup(group){
    const map=mapInstance();if(!group||!map)return;
    for(let i=group.parts.length-1;i>=0;i--){const p=group.parts[i];removeSourceLayer(map,p.sourceId,p.layerId);}
    try{map.triggerRepaint();}catch(e){}
  }
  function cleanupLegacyMapSurface(){
    const map=mapInstance();if(!map)return;
    try{if(map.getLayer(LEGACY_EXACT_LAYER))map.removeLayer(LEGACY_EXACT_LAYER);}catch(e){}
    try{if(map.getSource(LEGACY_EXACT_SOURCE))map.removeSource(LEGACY_EXACT_SOURCE);}catch(e){}
    try{if(map.getSource(LEGACY_SOURCE))map.removeSource(LEGACY_SOURCE);}catch(e){}
  }
  function cancelActiveJob(removePartial=true){
    if(worker){try{worker.terminate();}catch(e){}worker=null;}
    if(activeJob&&removePartial)removeGroup(activeJob.group);
    activeJob=null;
  }
  function removeMapSurface(){
    cancelActiveJob(true);
    if(completedGroup){removeGroup(completedGroup);completedGroup=null;}
    cleanupLegacyMapSurface();
    currentDataKey='';desiredTier=BASE_TIER;
  }

  function installChunk(group,msg){
    const map=mapInstance();if(!mapUsable(map)||!group||!msg?.data)return false;
    const sourceId=`${SOURCE_PREFIX}-${group.token}-${msg.chunkIndex}`;
    const layerId=`${LAYER_PREFIX}-${group.token}-${msg.chunkIndex}`;
    try{
      map.addSource(sourceId,{type:'geojson',data:msg.data});
      map.addLayer({id:layerId,type:'fill',source:sourceId,paint:{'fill-color':['get','color'],'fill-opacity':opacity(),'fill-antialias':false}},layerAnchor(map));
      group.parts.push({sourceId,layerId,cells:msg.cells||0});
      group.cells+=(msg.cells||0);
      map.triggerRepaint();
      return true;
    }catch(e){
      console.warn('Pad Grade progressive heat-map chunk install failed',e);
      removeSourceLayer(map,sourceId,layerId);
      return false;
    }
  }

  function nextTierAfter(tier,target){
    if(tier<BASE_TIER)return BASE_TIER;
    for(const v of MESH_TIERS)if(v>tier&&v<=target)return v;
    return target>tier?target:null;
  }

  function buildTier(tier,points,key){
    if(activeJob||!heatmapEnabled())return;
    const map=mapInstance();if(!mapUsable(map))return;
    const r=resolutionForTier(tier),token=`g${++groupSerial}t${tier}`;
    const group={token,tier,key,parts:[],cells:0,complete:false};
    const jobId=++jobSerial;
    let w;
    try{w=new Worker(WORKER_URL);}catch(e){console.warn('Pad Grade heat-map worker could not start',e);return;}
    worker=w;activeJob={id:jobId,key,tier,resolution:r,group};

    w.onmessage=event=>{
      const msg=event.data||{};
      if(!activeJob||msg.jobId!==activeJob.id)return;
      if(msg.type==='chunk'){
        installChunk(group,msg);
        try{w.postMessage({type:'ack',jobId});}catch(e){}
        return;
      }
      if(msg.type==='empty'||msg.type==='error'){
        if(msg.type==='error')console.warn('Pad Grade heat-map worker error',msg.message||'unknown');
        cancelActiveJob(true);return;
      }
      if(msg.type==='complete'){
        group.complete=true;group.cells=msg.cells||group.cells;
        try{w.terminate();}catch(e){}worker=null;activeJob=null;
        const previous=completedGroup;
        completedGroup=group;
        if(previous&&previous!==group)removeGroup(previous);
        window.__padGradeHeatmapMesh={tier,rnx:r.nx,rny:r.ny,nx:r.nx,ny:r.ny,cells:group.cells,progressive:true};
        const next=nextTierAfter(tier,desiredTier);
        if(next&&next>tier)setTimeout(()=>buildTier(next,measuredPoints(),currentDataKey),80);
      }
    };
    w.onerror=event=>{console.warn('Pad Grade heat-map worker crashed',event?.message||event);cancelActiveJob(true);};

    const chunkRows=Math.max(8,Math.ceil(r.ny/24));
    try{
      w.postMessage({type:'build',jobId,tier,nx:r.nx,ny:r.ny,chunkRows,settings:{width:cfg().width,length:cfg().length,target:cfg().target,tol:cfg().tol},points,fit:{originLat:gpsFit.originLat,originLon:gpsFit.originLon,theta:gpsFit.theta,tx:gpsFit.tx,ty:gpsFit.ty}});
    }catch(e){console.warn('Pad Grade heat-map worker request failed',e);cancelActiveJob(true);}
  }

  function syncSurface(){
    cleanupLegacyGridLayers();
    if(!heatmapEnabled()){removeMapSurface();return;}
    const map=mapInstance();if(!mapUsable(map))return;
    cleanupLegacyMapSurface();
    if(typeof gpsFit==='undefined'||!gpsFit){removeMapSurface();return;}
    const points=measuredPoints();
    if(points.length<3){removeMapSurface();return;}

    const key=dataKey(points),zoomTier=zoomDesiredTier();
    if(key!==currentDataKey){
      // Keep the last completed surface visible as a temporary visual placeholder
      // while the new survey state is recalculated. Recompute at least the same
      // completed tier, so a data edit never forces a visible resolution downgrade.
      cancelActiveJob(true);
      currentDataKey=key;
      desiredTier=Math.max(zoomTier,completedGroup?.tier||BASE_TIER);
      const firstTier=completedGroup?.tier||BASE_TIER;
      buildTier(firstTier,points,key);
      return;
    }

    desiredTier=Math.max(desiredTier,zoomTier,completedGroup?.tier||BASE_TIER);
    if(activeJob)return;
    if(!completedGroup||completedGroup.key!==key){buildTier(BASE_TIER,points,key);return;}
    if(completedGroup.tier>=desiredTier)return; // Never downgrade a completed surface.
    const next=nextTierAfter(completedGroup.tier,desiredTier);
    if(next)buildTier(next,points,key);
  }

  function scheduleResolutionRefresh(){clearTimeout(resolutionTimer);resolutionTimer=setTimeout(syncSurface,140);}
  function installResolutionHooks(){
    const map=mapInstance();if(!map||map.__padGradeAdaptiveHeatmapHooksV071)return;
    map.__padGradeAdaptiveHeatmapHooksV071=true;
    map.on('zoomend',scheduleResolutionRefresh);map.on('resize',scheduleResolutionRefresh);
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
    document.title='Pad Grade Mapper v0.7.1 DEV';cleanupLegacyGridLayers();installMapControls();relabelToggle();installMapClick();installResolutionHooks();loadNotesModule();
    const toggle=$('heatmapToggle');if(toggle)toggle.addEventListener('change',syncSurface);
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installMapClick();installResolutionHooks();syncSurface();syncLaserMarker();},0));
    syncTimer=setInterval(()=>{installMapClick();installResolutionHooks();syncSurface();syncLaserMarker();},900);
    window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer);if(resolutionTimer)clearTimeout(resolutionTimer);cancelActiveJob(true);if(completedGroup)removeGroup(completedGroup);if(laserMapMarker)try{laserMapMarker.remove();}catch(e){}},{once:true});
    window.__padGradeHeatmapLocation='gps-map-progressive-geojson-worker';
    window.__padGradeHeatmapResolution='progressive-adaptive-528-888-long-axis-about-3x-v070-cells';
    window.__padGradeHeatmapThreading='web-worker-banded-backpressure-progressive-no-downgrade';
    window.__padGradeLaserPlacementLocation='gps-map';
    syncSurface();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();