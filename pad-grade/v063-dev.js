/* Pad Grade v0.6.5 DEV — authoritative finite grid, continuous GPS-map surface.
 *
 * The bottom grid never owns interpolation. The GPS heat map is rendered as a
 * persistent georeferenced GeoJSON mesh so it survives zoom/pan without relying
 * on MapLibre image-source loading state. Laser placement is a GPS-map action.
 */
(function installPadGrade063MapSurface(){
  'use strict';

  const SURFACE_SOURCE='pad-grade-interpolated-surface-mesh';
  const SURFACE_LAYER='pad-grade-interpolated-surface-layer';
  const LEGACY_SOURCE='pad-grade-interpolated-surface';
  const MESH_MAX=64;
  const $=id=>document.getElementById(id);
  let lastSignature='';
  let syncTimer=null;
  let laserMapMarker=null;
  let lastPointCount=0;
  let lastCellCount=0;

  function heatmapEnabled(){
    const toggle=$('heatmapToggle');
    return !!(toggle&&toggle.checked);
  }

  function cleanupLegacyGridLayers(){
    const grid=$('grid');
    const shell=grid&&grid.closest('.gridShell');
    const stack=$('gradeMapStack');
    if(stack&&shell){
      if(grid.parentElement===stack)shell.insertBefore(grid,stack);
      stack.remove();
    }
    for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer','padGradeGpsHeatmapCanvas'])$(id)?.remove();
    if(grid&&shell&&grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
  }

  window.pgEnsureGridLayers=cleanupLegacyGridLayers;

  function mapInstance(){return window.__padGradeMapInstance||null;}

  function mapUsable(map){
    if(!map)return false;
    try{
      // Do not use isStyleLoaded(): MapLibre can report false again while zoomed
      // imagery tiles are loading even though the existing style/layers are alive.
      const style=map.getStyle&&map.getStyle();
      return !!(style&&Array.isArray(style.layers)&&style.layers.length);
    }catch(e){return false;}
  }

  function setSurfaceStatus(text){
    const el=$('mapSurfaceStatus');
    if(el)el.textContent=text;
  }

  function colorHex(col){
    return '#'+col.slice(0,3).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  }

  function removeSourceAndLayer(map,sourceId,layerId){
    if(!map)return;
    try{if(layerId&&map.getLayer(layerId))map.removeLayer(layerId);}catch(e){}
    try{if(sourceId&&map.getSource(sourceId))map.removeSource(sourceId);}catch(e){}
  }

  function removeMapSurface(){
    const map=mapInstance();
    if(map){
      removeSourceAndLayer(map,SURFACE_SOURCE,SURFACE_LAYER);
      // Clean up the v0.6.3/v0.6.4 image source if an upgraded process still has it.
      try{if(map.getSource(LEGACY_SOURCE))map.removeSource(LEGACY_SOURCE);}catch(e){}
      try{map.triggerRepaint();}catch(e){}
    }
    lastSignature='';
    lastPointCount=0;
    lastCellCount=0;
  }

  function buildSurfaceMesh(){
    const s=cfg();
    const pts=typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];
    const tris=typeof pgDelaunay==='function'?pgDelaunay(pts):[];
    if(pts.length<3||!tris.length)return {ok:false,count:pts.length,cells:0,data:null};
    if(typeof fitPointLatLon!=='function'||typeof gpsFit==='undefined'||!gpsFit)return {ok:false,count:pts.length,cells:0,data:null,needsCalibration:true};

    const longest=Math.max(s.width,s.length,1);
    const nx=Math.max(24,Math.round(MESH_MAX*s.width/longest));
    const ny=Math.max(24,Math.round(MESH_MAX*s.length/longest));
    const maxAbs=Math.max(s.tol*2,...pts.map(p=>Math.abs(p.v-s.target)),1);

    // Precompute georeferenced mesh vertices once. This is much cheaper than
    // converting four corners independently for every colored cell.
    const verts=Array.from({length:ny+1},()=>Array(nx+1));
    for(let iy=0;iy<=ny;iy++){
      const y=iy/ny*s.length;
      for(let ix=0;ix<=nx;ix++){
        const x=ix/nx*s.width,ll=fitPointLatLon(x,y);
        if(!ll)return {ok:false,count:pts.length,cells:0,data:null,needsCalibration:true};
        verts[iy][ix]=[ll.lon,ll.lat];
      }
    }

    const features=[];
    for(let iy=0;iy<ny;iy++){
      const y=(iy+.5)/ny*s.length;
      for(let ix=0;ix<nx;ix++){
        const x=(ix+.5)/nx*s.width;
        if(!pgTriangleAt(x,y,pts,tris))continue;
        const v=pgIdw2(x,y,pts);
        if(!Number.isFinite(v))continue;
        const col=pgSurfaceColor(v-s.target,maxAbs,s.tol);
        const a=verts[iy][ix],b=verts[iy][ix+1],c=verts[iy+1][ix+1],d=verts[iy+1][ix];
        features.push({
          type:'Feature',
          properties:{color:colorHex(col)},
          geometry:{type:'Polygon',coordinates:[[a,b,c,d,a]]}
        });
      }
    }
    return {ok:features.length>0,count:pts.length,cells:features.length,data:{type:'FeatureCollection',features}};
  }

  function layerAnchor(map){
    try{
      if(map.getLayer('pad-grade-error-fill'))return 'pad-grade-error-fill';
      if(map.getLayer('pad-grade-grid-lines-layer'))return 'pad-grade-grid-lines-layer';
      if(map.getLayer('pad-grade-current-fix-layer'))return 'pad-grade-current-fix-layer';
    }catch(e){}
    return undefined;
  }

  function installOrUpdateMesh(data){
    const map=mapInstance();
    if(!mapUsable(map))return false;
    try{
      // Remove only the old image source. The layer id is reused by the mesh, so
      // remove it first if it is still attached to the old source type.
      const existingLayer=map.getLayer(SURFACE_LAYER);
      const meshSource=map.getSource(SURFACE_SOURCE);
      if(existingLayer&&!meshSource)map.removeLayer(SURFACE_LAYER);
      if(map.getSource(LEGACY_SOURCE))map.removeSource(LEGACY_SOURCE);

      let source=map.getSource(SURFACE_SOURCE);
      if(!source){
        map.addSource(SURFACE_SOURCE,{type:'geojson',data});
        source=map.getSource(SURFACE_SOURCE);
      }else if(typeof source.setData==='function'){
        source.setData(data);
      }

      const before=layerAnchor(map);
      if(!map.getLayer(SURFACE_LAYER)){
        map.addLayer({
          id:SURFACE_LAYER,
          type:'fill',
          source:SURFACE_SOURCE,
          paint:{
            'fill-color':['get','color'],
            'fill-opacity':0.58,
            'fill-outline-color':['get','color'],
            'fill-antialias':false
          }
        },before);
      }else if(before){
        try{map.moveLayer(SURFACE_LAYER,before);}catch(e){}
      }
      map.triggerRepaint();
      return !!(map.getSource(SURFACE_SOURCE)&&map.getLayer(SURFACE_LAYER));
    }catch(e){
      console.warn('Pad Grade GPS heat map mesh update failed',e);
      setSurfaceStatus('Heat map map-layer error — retrying');
      return false;
    }
  }

  function signature(){
    let fitSig='none';
    try{if(gpsFit)fitSig=[gpsFit.tx,gpsFit.ty,gpsFit.theta,gpsFit.originLat,gpsFit.originLon].map(v=>Number(v).toFixed(8)).join(',');}catch(e){}
    return JSON.stringify({enabled:heatmapEnabled(),fit:fitSig,readings,settings:cfg()});
  }

  function syncSurface(force=false){
    cleanupLegacyGridLayers();
    if(!heatmapEnabled()){
      removeMapSurface();
      setSurfaceStatus('Heat map off');
      return;
    }
    const map=mapInstance();
    if(!mapUsable(map)){
      setSurfaceStatus('Heat map waiting for GPS map');
      return;
    }
    if(typeof gpsFit==='undefined'||!gpsFit){
      removeMapSurface();
      setSurfaceStatus('Heat map needs four-corner calibration');
      return;
    }

    const sig=signature();
    const layerAlive=(()=>{try{return !!(map.getSource(SURFACE_SOURCE)&&map.getLayer(SURFACE_LAYER));}catch(e){return false;}})();
    if(!force&&sig===lastSignature&&layerAlive){
      setSurfaceStatus(`Heat map active • ${lastPointCount} measured points • ${lastCellCount} cells`);
      return;
    }

    const mesh=buildSurfaceMesh();
    if(!mesh.ok){
      removeMapSurface();
      if(mesh.needsCalibration)setSurfaceStatus('Heat map needs four-corner calibration');
      else setSurfaceStatus(`Heat map needs 3+ measured points (${mesh.count})`);
      return;
    }
    if(installOrUpdateMesh(mesh.data)){
      lastSignature=sig;
      lastPointCount=mesh.count;
      lastCellCount=mesh.cells;
      setSurfaceStatus(`Heat map active • ${mesh.count} measured points • ${mesh.cells} cells`);
    }
  }

  function laserLatLon(){
    if(!padGradeLaser||typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return null;
    return fitPointLatLon(+padGradeLaser.xFt,+padGradeLaser.yFt);
  }

  function syncLaserMarker(){
    cleanupLegacyGridLayers();
    const map=mapInstance(),ll=laserLatLon();
    if(!map||!window.maplibregl||!ll){
      if(laserMapMarker){try{laserMapMarker.remove();}catch(e){}laserMapMarker=null;}
      return;
    }
    if(!laserMapMarker){
      const marker=document.createElement('div');
      marker.className='padGradeMapLaserMarker';
      marker.innerHTML='<span>✦</span><b>LASER</b>';
      Object.assign(marker.style,{display:'flex',alignItems:'center',gap:'4px',padding:'4px 7px',borderRadius:'10px',background:'rgba(15,18,22,.9)',border:'2px solid #ffd166',color:'#ffd166',font:'700 11px system-ui,sans-serif',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(0,0,0,.45)'});
      laserMapMarker=new maplibregl.Marker({element:marker,anchor:'center'}).setLngLat([ll.lon,ll.lat]).addTo(map);
    }else laserMapMarker.setLngLat([ll.lon,ll.lat]);
  }

  function mapClickToPad(lng,lat){
    if(typeof gpsFit==='undefined'||!gpsFit||typeof localDeltaFeet!=='function')return null;
    const d=localDeltaFeet(gpsFit.originLat,gpsFit.originLon,lat,lng);
    const dx=d.east-gpsFit.tx,dy=d.north-gpsFit.ty;
    const ct=Math.cos(gpsFit.theta),st=Math.sin(gpsFit.theta);
    return {xFt:ct*dx+st*dy,yFt:-st*dx+ct*dy};
  }

  function finishLaserPlacement(p){
    if(!p)return;
    padGradeLaser={xFt:p.xFt,yFt:p.yFt};
    setTimeout(()=>{padGradePlacingLaser=false;},0);
    const map=mapInstance();if(map)map.getCanvas().style.cursor='';
    try{saveLocal();}catch(e){}
    try{pgUpdateLaserSummary();}catch(e){}
    syncLaserMarker();
    const status=$('laserMapStatus');if(status)status.textContent='Laser placed';
  }

  function installMapClick(){
    const map=mapInstance();
    if(!map||map.__padGradeLaserClickInstalled)return;
    map.__padGradeLaserClickInstalled=true;
    map.on('click',ev=>{
      if(!padGradePlacingLaser)return;
      const ll=ev&&ev.lngLat;if(!ll)return;
      finishLaserPlacement(mapClickToPad(+ll.lng,+ll.lat));
    });
  }

  function startLaserPlacement(){
    const map=mapInstance();
    if(typeof gpsFit==='undefined'||!gpsFit||!map){
      alert('Calibrate all four pad corners first, then place the laser on the GPS map.');
      return;
    }
    padGradePlacingLaser=true;
    map.getCanvas().style.cursor='crosshair';
    const status=$('laserMapStatus');if(status)status.textContent='Tap the GPS map to place laser';
  }

  const baseOpenPoint=window.openPoint;
  if(typeof baseOpenPoint==='function')window.openPoint=function(r,c){if(padGradePlacingLaser)return;return baseOpenPoint(r,c);};

  window.pgDrawLaser=syncLaserMarker;
  window.pgStartLaserPlacement=startLaserPlacement;
  window.pgDrawSurface=function(){syncSurface(true);syncLaserMarker();};
  window.pgScheduleSurfaceDraw=function(){requestAnimationFrame(()=>{syncSurface(false);syncLaserMarker();});};

  function installMapControls(){
    const host=document.querySelector('#gpsMapCard .gpsMapHeaderRight');
    if(!host||$('gpsMapFieldControls'))return;
    const oldPlace=$('placeLaserBtn'),oldClear=$('clearLaserBtn'),oldSummary=$('laserSummary');
    const oldRow=oldPlace&&oldPlace.closest('.laserRow');
    const controls=document.createElement('div');
    controls.id='gpsMapFieldControls';
    Object.assign(controls.style,{display:'grid',gap:'4px',marginTop:'7px',minWidth:'150px'});
    const buttons=document.createElement('div');Object.assign(buttons.style,{display:'flex',gap:'5px'});
    const place=oldPlace||document.createElement('button');place.id='placeLaserBtn';place.type='button';place.textContent='Place Laser';
    const clear=oldClear||document.createElement('button');clear.id='clearLaserBtn';clear.type='button';clear.textContent='Clear Laser';
    buttons.append(place,clear);controls.appendChild(buttons);
    const laserStatus=oldSummary||document.createElement('div');laserStatus.id='laserSummary';laserStatus.className='small';controls.appendChild(laserStatus);
    const actionStatus=document.createElement('div');actionStatus.id='laserMapStatus';actionStatus.className='small';controls.appendChild(actionStatus);
    const surfaceStatus=document.createElement('div');surfaceStatus.id='mapSurfaceStatus';surfaceStatus.className='small';controls.appendChild(surfaceStatus);
    host.appendChild(controls);
    if(oldRow)oldRow.remove();
    document.querySelector('.laserCoords')?.remove();
    document.querySelector('.laserCoordHelp')?.remove();
    place.onclick=startLaserPlacement;
    clear.onclick=()=>{padGradePlacingLaser=false;padGradeLaser=null;try{saveLocal();}catch(e){}try{pgUpdateLaserSummary();}catch(e){}syncLaserMarker();actionStatus.textContent='Laser cleared';};
    try{pgUpdateLaserSummary();}catch(e){}
  }

  function relabelToggle(){
    const toggle=$('heatmapToggle');if(!toggle)return;
    const label=toggle.closest('label');
    if(label){const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.nodeValue=' Show interpolated IDW² heat map on GPS map';}
  }

  function loadNotesModule(){
    if(document.querySelector('script[data-padgrade-v064]'))return;
    const script=document.createElement('script');
    script.src='v064-dev.js?v=20260825-1';
    script.setAttribute('data-padgrade-v064','1');
    document.body.appendChild(script);
  }

  function boot(){
    document.title='Pad Grade Mapper v0.6.5 DEV';
    cleanupLegacyGridLayers();
    installMapControls();
    relabelToggle();
    installMapClick();
    loadNotesModule();
    const toggle=$('heatmapToggle');if(toggle)toggle.addEventListener('change',()=>syncSurface(true));
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installMapClick();syncSurface(true);syncLaserMarker();},0));
    syncTimer=setInterval(()=>{installMapClick();syncSurface(false);syncLaserMarker();},700);
    window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer);syncTimer=null;removeMapSurface();if(laserMapMarker)try{laserMapMarker.remove();}catch(e){}},{once:true});
    window.__padGradeHeatmapLocation='gps-map-geojson-mesh';
    window.__padGradeLaserPlacementLocation='gps-map';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
