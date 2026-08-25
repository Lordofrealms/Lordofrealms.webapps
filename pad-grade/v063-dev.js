/* Pad Grade v0.6.2 DEV — finite grid, continuous GPS-map surface.
 *
 * The lower survey grid is authoritative and discrete: it shows only measured
 * cut/fill/on-grade points. Interpolation belongs exclusively on the GPS map.
 * The map surface is transparent outside the Delaunay-supported measured area
 * and uses the existing inverse-distance-squared interpolation inside it.
 */
(function installPadGrade063MapSurface(){
  'use strict';

  const SURFACE_SOURCE='pad-grade-interpolated-surface';
  const SURFACE_LAYER='pad-grade-interpolated-surface-layer';
  const CANVAS_ID='padGradeGpsHeatmapCanvas';
  const RESOLUTION=220;
  const $=id=>document.getElementById(id);
  let lastSignature='';
  let syncTimer=null;

  function heatmapEnabled(){
    const toggle=$('heatmapToggle');
    return !!(toggle&&toggle.checked);
  }

  function cleanupGridHeatmap(){
    const grid=$('grid');
    const shell=grid&&grid.closest('.gridShell');
    const stack=$('gradeMapStack');
    if(stack&&shell){
      if(grid.parentElement===stack)shell.insertBefore(grid,stack);
      for(const id of ['laserMarker','laserPlacementLayer']){
        const el=$(id);if(el&&el.parentElement===stack)shell.appendChild(el);
      }
      stack.remove();
    }
    $('gradeHeatmap')?.remove();
  }

  function ensureLaserLayersOnly(){
    cleanupGridHeatmap();
    const grid=$('grid'),shell=grid&&grid.closest('.gridShell');
    if(!grid||!shell)return;
    shell.classList.add('gradeLayerHost');
    if(!$('laserMarker')){
      const marker=document.createElement('div');
      marker.id='laserMarker';marker.className='laserMarker';
      marker.innerHTML='<span>✦</span><b>LASER</b>';
      shell.appendChild(marker);
    }
    if(!$('laserPlacementLayer')){
      const layer=document.createElement('div');
      layer.id='laserPlacementLayer';layer.className='laserPlacementLayer';
      shell.appendChild(layer);
      layer.addEventListener('pointerdown',ev=>{
        if(!padGradePlacingLaser)return;
        const rect=layer.getBoundingClientRect(),s=cfg();
        const x=Math.max(0,Math.min(1,(ev.clientX-rect.left)/Math.max(1,rect.width)));
        const y=Math.max(0,Math.min(1,(ev.clientY-rect.top)/Math.max(1,rect.height)));
        padGradeLaser={xFt:x*s.width,yFt:(1-y)*s.length};
        padGradePlacingLaser=false;
        layer.classList.remove('active');
        pgUpdateLaserSummary();saveLocal();renderGrid();
      });
    }
  }

  // From this version forward pgEnsureGridLayers means only the optional laser
  // placement affordance. It must never create a heat-map canvas under the grid.
  window.pgEnsureGridLayers=ensureLaserLayersOnly;

  function mapInstance(){return window.__padGradeMapInstance||null;}

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
    if(!ctx)return false;
    ctx.clearRect(0,0,c.width,c.height);
    const s=cfg();
    const pts=typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];
    const tris=typeof pgDelaunay==='function'?pgDelaunay(pts):[];
    if(pts.length<3||!tris.length)return false;

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
        // Slightly stronger than the old grid overlay because satellite imagery
        // is visually busy, while still remaining transparent.
        image.data[i+3]=Math.min(150,Math.max(105,col[3]||0));
      }
    }
    ctx.putImageData(image,0,0);
    return true;
  }

  function installOrUpdateMapSource(c,coords){
    const map=mapInstance();
    if(!map||!map.isStyleLoaded())return false;
    let source=map.getSource(SURFACE_SOURCE);
    try{
      if(!source){
        map.addSource(SURFACE_SOURCE,{type:'canvas',canvas:c,coordinates:coords,animate:false});
        const before=map.getLayer('pad-grade-grid-lines-layer')?'pad-grade-grid-lines-layer':undefined;
        map.addLayer({id:SURFACE_LAYER,type:'raster',source:SURFACE_SOURCE,paint:{'raster-opacity':0.82,'raster-fade-duration':0}},before);
        source=map.getSource(SURFACE_SOURCE);
      }else if(typeof source.setCoordinates==='function'){
        source.setCoordinates(coords);
      }
      if(map.getLayer('pad-grade-grid-lines-layer')&&map.getLayer(SURFACE_LAYER)){
        map.moveLayer(SURFACE_LAYER,'pad-grade-grid-lines-layer');
      }
      map.triggerRepaint();
      return true;
    }catch(e){
      console.warn('Pad Grade GPS heat map update failed',e);
      return false;
    }
  }

  function signature(){
    let fitSig='none';
    try{if(gpsFit)fitSig=[gpsFit.tx,gpsFit.ty,gpsFit.theta,gpsFit.originLat,gpsFit.originLon].map(v=>Number(v).toFixed(8)).join(',');}catch(e){}
    return JSON.stringify({enabled:heatmapEnabled(),fit:fitSig,readings,settings:cfg()});
  }

  function syncSurface(force=false){
    cleanupGridHeatmap();
    if(!heatmapEnabled()){
      removeMapSurface();
      return;
    }
    const map=mapInstance(),coords=surfaceCoordinates();
    if(!map||!coords||!map.isStyleLoaded())return;
    const sig=signature();
    if(!force&&sig===lastSignature)return;
    const c=canvas();
    if(!drawRaster(c)){
      removeMapSurface();
      return;
    }
    if(installOrUpdateMapSource(c,coords))lastSignature=sig;
  }

  // Redirect the legacy surface hooks to the GPS map. Grid renders may request a
  // refresh, but no interpolation element is ever inserted into the grid.
  window.pgDrawSurface=function(){syncSurface(true);};
  window.pgScheduleSurfaceDraw=function(){requestAnimationFrame(()=>syncSurface(false));};

  function relabelToggle(){
    const toggle=$('heatmapToggle');
    if(!toggle)return;
    const label=toggle.closest('label');
    if(label){
      const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(text)text.nodeValue=' Show interpolated IDW² heat map on GPS map';
    }
  }

  function boot(){
    cleanupGridHeatmap();
    relabelToggle();
    const toggle=$('heatmapToggle');
    if(toggle)toggle.addEventListener('change',()=>syncSurface(true));
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>syncSurface(true),0));
    // Cheap while disabled; when enabled it only redraws on a changed data/calibration signature.
    syncTimer=setInterval(()=>syncSurface(false),600);
    window.addEventListener('beforeunload',()=>{if(syncTimer)clearInterval(syncTimer);syncTimer=null;removeMapSurface();},{once:true});
    window.__padGradeHeatmapLocation='gps-map';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
