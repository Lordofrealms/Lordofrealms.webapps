/* Pad Grade v0.6.3 DEV — authoritative finite grid, continuous GPS-map surface.
 *
 * The bottom grid never owns interpolation. The heat map is rendered to a PNG
 * data image and geographically pinned to the calibrated pad footprint. Laser
 * placement is also a GPS-map interaction and may be outside the pad.
 */
(function installPadGrade063MapSurface(){
  'use strict';

  const SURFACE_SOURCE='pad-grade-interpolated-surface';
  const SURFACE_LAYER='pad-grade-interpolated-surface-layer';
  const CANVAS_ID='padGradeGpsHeatmapCanvas';
  const RESOLUTION=240;
  const $=id=>document.getElementById(id);
  let lastSignature='';
  let syncTimer=null;
  let laserMapMarker=null;

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
    for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer'])$(id)?.remove();
    if(grid&&shell&&grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
  }

  // From here forward the production grid has no overlay children at all.
  window.pgEnsureGridLayers=cleanupLegacyGridLayers;

  function mapInstance(){return window.__padGradeMapInstance||null;}

  function setSurfaceStatus(text){
    const el=$('mapSurfaceStatus');
    if(el)el.textContent=text;
  }

  function surfaceCoordinates(){
    if(typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return null;
    const s=cfg();
    const nw=fitPointLatLon(0,s.length),ne=fitPointLatLon(s.width,s.length);
    const se=fitPointLatLon(s.width,0),sw=fitPointLatLon(0,0);
    if(!nw||!ne||!se||!sw)return null;
    return [[nw.lon,nw.lat],[ne.lon,ne.lat],[se.lon,se.lat],[sw.lon,sw.lat]];
  }

  function canvas(){
    let c=$(CANVAS_ID);
    if(c)return c;
    c=document.createElement('canvas');
    c.id=CANVAS_ID;c.width=RESOLUTION;c.height=RESOLUTION;
    c.setAttribute('aria-hidden','true');
    Object.assign(c.style,{position:'fixed',left:'-10000px',top:'-10000px',width:'1px',height:'1px',pointerEvents:'none'});
    document.body.appendChild(c);
    return c;
  }

  function removeMapSurface(){
    const map=mapInstance();
    if(map){
      try{if(map.getLayer(SURFACE_LAYER))map.removeLayer(SURFACE_LAYER);}catch(e){}
      try{if(map.getSource(SURFACE_SOURCE))map.removeSource(SURFACE_SOURCE);}catch(e){}
      try{map.triggerRepaint();}catch(e){}
    }
    $(CANVAS_ID)?.remove();
    lastSignature='';
  }

  function drawRaster(c){
    const ctx=c.getContext('2d',{alpha:true});
    if(!ctx)return {ok:false,count:0};
    ctx.clearRect(0,0,c.width,c.height);
    const s=cfg();
    const pts=typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];
    const tris=typeof pgDelaunay==='function'?pgDelaunay(pts):[];
    if(pts.length<3||!tris.length)return {ok:false,count:pts.length};

    const image=ctx.createImageData(c.width,c.height);
    const maxAbs=Math.max(s.tol*2,...pts.map(p=>Math.abs(p.v-s.target)),1);
    for(let py=0;py<c.height;py++){
      const y=(1-(py+.5)/c.height)*s.length;
      for(let px=0;px<c.width;px++){
        const x=(px+.5)/c.width*s.width;
        if(!pgTriangleAt(x,y,pts,tris))continue;
        const v=pgIdw2(x,y,pts);
        if(!Number.isFinite(v))continue;
        const col=pgSurfaceColor(v-s.target,maxAbs,s.tol);
        const i=(py*c.width+px)*4;
        image.data[i]=col[0];image.data[i+1]=col[1];image.data[i+2]=col[2];
        image.data[i+3]=Math.min(165,Math.max(115,col[3]||0));
      }
    }
    ctx.putImageData(image,0,0);
    return {ok:true,count:pts.length};
  }

  function installImageSource(c,coords){
    const map=mapInstance();
    if(!map||!map.isStyleLoaded())return false;
    try{
      // CanvasSource proved unreliable in Android WebView. Recreate a small
      // image source only when survey/calibration data actually changes.
      if(map.getLayer(SURFACE_LAYER))map.removeLayer(SURFACE_LAYER);
      if(map.getSource(SURFACE_SOURCE))map.removeSource(SURFACE_SOURCE);
      const url=c.toDataURL('image/png');
      map.addSource(SURFACE_SOURCE,{type:'image',url,coordinates:coords});
      const before=map.getLayer('pad-grade-error-fill')?'pad-grade-error-fill':
        (map.getLayer('pad-grade-grid-lines-layer')?'pad-grade-grid-lines-layer':undefined);
      map.addLayer({id:SURFACE_LAYER,type:'raster',source:SURFACE_SOURCE,paint:{'raster-opacity':0.78,'raster-fade-duration':0}},before);
      map.triggerRepaint();
      return true;
    }catch(e){
      console.warn('Pad Grade GPS heat map image update failed',e);
      setSurfaceStatus('Heat map error — see app log');
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
    if(!map||!map.isStyleLoaded()){
      setSurfaceStatus('Heat map waiting for GPS map');
      return;
    }
    const coords=surfaceCoordinates();
    if(!coords){
      removeMapSurface();
      setSurfaceStatus('Heat map needs four-corner calibration');
      return;
    }
    const sig=signature();
    if(!force&&sig===lastSignature)return;
    const c=canvas(),draw=drawRaster(c);
    if(!draw.ok){
      removeMapSurface();
      setSurfaceStatus(`Heat map needs 3+ measured points (${draw.count})`);
      return;
    }
    if(installImageSource(c,coords)){
      lastSignature=sig;
      setSurfaceStatus(`Heat map active • ${draw.count} measured points`);
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
    // Leave placement true through the current map click dispatch so the point
    // layer cannot also open a grade-entry dialog for the same tap.
    setTimeout(()=>{padGradePlacingLaser=false;},0);
    const map=mapInstance();if(map)map.getCanvas().style.cursor='';
    try{saveLocal();}catch(e){}
    try{pgUpdateLaserSummary();}catch(e){}
    syncLaserMarker();
    const status=$('laserMapStatus');
    if(status)status.textContent='Laser placed';
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

  // Guard all authoritative grid/map point entry while a map laser tap is armed.
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

  function boot(){
    cleanupLegacyGridLayers();
    installMapControls();
    relabelToggle();
    installMapClick();
    const toggle=$('heatmapToggle');if(toggle)toggle.addEventListener('change',()=>syncSurface(true));
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installMapClick();syncSurface(true);syncLaserMarker();},0));
    syncTimer=setInterval(()=>{installMapClick();syncSurface(false);syncLaserMarker();},700);
    window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer);syncTimer=null;removeMapSurface();if(laserMapMarker)try{laserMapMarker.remove();}catch(e){}},{once:true});
    window.__padGradeHeatmapLocation='gps-map-image-source';
    window.__padGradeLaserPlacementLocation='gps-map';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
