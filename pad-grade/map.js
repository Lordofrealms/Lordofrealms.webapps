/* Pad Grade live GPS map — shared web/Android source.
 *
 * Uses the same progressive USGS imagery stack as Tractor Guidance: cached
 * imagery underneath, with dynamic NAIP Plus imagery layered above at close
 * zoom. Saved calibrated project geometry frames the pad immediately; live GPS
 * only moves the current-position marker/follow view after it arrives.
 */
(function installPadGradeGpsMap(){
  'use strict';

  const CACHED_TILE_URL='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
  const CACHED_SOURCE='usgs-cached-imagery';
  const HIGH_RES_SOURCE='usgs-naip-plus';
  const FIX_SOURCE='pad-grade-current-fix';
  const ERROR_SOURCE='pad-grade-error-circle';
  const FIX_LAYER='pad-grade-current-fix-layer';
  const ERROR_FILL_LAYER='pad-grade-error-fill';
  const ERROR_LINE_LAYER='pad-grade-error-line';
  const FOLLOW_ZOOM=19;
  const UPDATE_MS=350;
  const CIRCLE_SEGMENTS=64;
  const EARTH_RADIUS_M=6378137;

  let map=null;
  let mapReady=false;
  let mapInitAttempted=false;
  let follow=true;
  let firstFix=true;
  let framedSavedPad=false;
  let lastFixSignature='';
  let lastModeVisible=null;
  let pollTimer=null;
  let companionWatchId=null;
  let companionMapPosition=null;

  function el(id){ return document.getElementById(id); }

  function highResTileUrl(){
    const renderingRule=encodeURIComponent(JSON.stringify({rasterFunction:'NaturalColor'}));
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage'
      +'?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256'
      +'&format=jpgpng&transparent=false&f=image&renderingRule='+renderingRule;
  }

  function imageryStyle(){
    return {
      version:8,
      sources:{
        [CACHED_SOURCE]:{
          type:'raster',
          tiles:[CACHED_TILE_URL],
          tileSize:256,
          minzoom:0,
          maxzoom:16,
          attribution:'USGS, USDA, The National Map'
        },
        [HIGH_RES_SOURCE]:{
          type:'raster',
          tiles:[highResTileUrl()],
          tileSize:256,
          minzoom:14,
          maxzoom:22,
          attribution:'USGS, USDA, The National Map'
        }
      },
      layers:[
        {id:'usgs-cached',type:'raster',source:CACHED_SOURCE},
        {id:'usgs-highres',type:'raster',source:HIGH_RES_SOURCE,minzoom:14,paint:{'raster-opacity':1}}
      ]
    };
  }

  function positionSample(pos){
    if(!pos || !pos.coords || !Number.isFinite(+pos.coords.latitude) || !Number.isFinite(+pos.coords.longitude)) return null;
    return {
      lat:+pos.coords.latitude,
      lon:+pos.coords.longitude,
      accuracy:Number.isFinite(+pos.coords.accuracy)?+pos.coords.accuracy:NaN,
      heading:Number.isFinite(+pos.coords.heading)?+pos.coords.heading:null,
      speed:Number.isFinite(+pos.coords.speed)?+pos.coords.speed:null,
      timestamp:Number.isFinite(+pos.timestamp)?+pos.timestamp:Date.now()
    };
  }

  function getGpsPosition(){
    try{
      if(typeof gpsPos!=='undefined' && gpsPos && Number.isFinite(+gpsPos.lat) && Number.isFinite(+gpsPos.lon)) return gpsPos;
    }catch(e){}
    if(companionMapPosition && Number.isFinite(+companionMapPosition.lat) && Number.isFinite(+companionMapPosition.lon)) return companionMapPosition;
    return null;
  }

  function isGpsMode(){
    try{ return typeof measureMode!=='undefined' && measureMode==='gps'; }
    catch(e){ return false; }
  }

  function currentMeta(){
    const platform=window.PadGradePlatform||{};
    const meta=platform.lastLocationMeta||{};
    if(meta.provider==='precision-location'){
      return {provider:'precision-location',mode:String(meta.solutionMode||'Precision Location'),state:String(meta.solutionState||'UNKNOWN')};
    }
    return {provider:'native',mode:'Native GPS',state:'ACTIVE'};
  }

  function friendlyMode(value){
    const raw=String(value||'').trim();
    if(!raw) return 'Precision Location';
    const normalized=raw.replace(/_/g,' ').replace(/\s+/g,' ').trim();
    if(/^AUTO$/i.test(normalized)) return 'Automatic';
    return normalized;
  }

  function sourceLabel(meta){
    if(meta.provider!=='precision-location') return 'Native GPS';
    const mode=friendlyMode(meta.mode);
    if(/^precision location$/i.test(mode)) return 'Precision Location';
    return `Precision Location • ${mode}`;
  }

  function updateSourceUi(pos){
    const meta=currentMeta();
    const badge=el('gpsSourceBadge');
    const state=el('gpsSourceState');
    const accuracy=el('gpsMapAccuracy');
    if(badge){
      badge.textContent=sourceLabel(meta);
      badge.classList.toggle('precision',meta.provider==='precision-location');
      badge.classList.toggle('native',meta.provider!=='precision-location');
    }
    if(state){
      const stateText=meta.provider==='precision-location'?friendlyMode(meta.state):(pos?'ACTIVE':'WAITING');
      state.textContent=stateText;
      state.classList.toggle('ready',/READY/i.test(stateText));
      state.classList.toggle('working',!/READY|ERROR|DEGRADED|NO DATA/i.test(stateText));
      state.classList.toggle('bad',/ERROR|DEGRADED|NO DATA/i.test(stateText));
    }
    if(accuracy){
      const a=pos && Number.isFinite(+pos.accuracy) ? +pos.accuracy : NaN;
      accuracy.textContent=Number.isFinite(a)?`±${(a*3.280839895).toFixed(a*3.280839895<10?1:0)} ft`:'—';
    }
  }

  function pointGeoJson(pos){
    return {type:'FeatureCollection',features:pos?[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[+pos.lon,+pos.lat]}}]:[]};
  }

  function accuracyPolygon(pos){
    const accuracy=pos && Number.isFinite(+pos.accuracy)?Math.max(0,+pos.accuracy):NaN;
    if(!pos || !Number.isFinite(accuracy) || accuracy<=0) return {type:'FeatureCollection',features:[]};
    const latRad=+pos.lat*Math.PI/180;
    const points=[];
    for(let i=0;i<=CIRCLE_SEGMENTS;i++){
      const theta=2*Math.PI*i/CIRCLE_SEGMENTS;
      const north=accuracy*Math.cos(theta),east=accuracy*Math.sin(theta);
      const lat=+pos.lat+(north/EARTH_RADIUS_M)*180/Math.PI;
      const cosLat=Math.max(0.15,Math.cos(latRad));
      const lon=+pos.lon+(east/(EARTH_RADIUS_M*cosLat))*180/Math.PI;
      points.push([lon,lat]);
    }
    return {type:'FeatureCollection',features:[{type:'Feature',properties:{accuracyMeters:accuracy},geometry:{type:'Polygon',coordinates:[points]}}]};
  }

  function setGeoJson(id,data){
    if(!mapReady || !map) return;
    const source=map.getSource(id);
    if(source && typeof source.setData==='function') source.setData(data);
  }

  function setCompanionState(state){
    const platform=window.PadGradePlatform||{};
    if(!platform.nativePrecisionLocation) return;
    const meta=platform.lastLocationMeta||{};
    platform.lastLocationMeta={provider:'precision-location',solutionMode:meta.solutionMode||'Precision Location',solutionState:state,fixAgeMs:Number.isFinite(+meta.fixAgeMs)?+meta.fixAgeMs:0,timestamp:Number.isFinite(+meta.timestamp)?+meta.timestamp:Date.now()};
  }

  function syncCompanionWatch(visible){
    const platform=window.PadGradePlatform||{};
    const shouldWatch=!!(visible&&platform.target==='android'&&platform.nativePrecisionLocation&&navigator.geolocation&&typeof navigator.geolocation.watchPosition==='function');

    if(shouldWatch && companionWatchId==null){
      setCompanionState('STARTING');
      try{
        companionWatchId=navigator.geolocation.watchPosition(
          pos=>{const sample=positionSample(pos);if(sample) companionMapPosition=sample;updateMap();},
          err=>{
            companionMapPosition=null;setCompanionState('ERROR');
            const message=el('gpsMapMessage');
            if(message){const detail=err&&err.message?String(err.message):'Precision Location data connection failed.';message.textContent=detail;message.classList.remove('hidden');}
            updateSourceUi(getGpsPosition());
          },
          {enableHighAccuracy:true,maximumAge:500,timeout:15000}
        );
      }catch(e){companionWatchId=null;setCompanionState('ERROR');}
      return;
    }

    if(!shouldWatch && companionWatchId!=null){
      try{ navigator.geolocation.clearWatch(companionWatchId); }catch(e){}
      companionWatchId=null;companionMapPosition=null;
    }
  }

  function savedPadCorners(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function'||typeof cfg!=='function')return null;
      const s=cfg();
      const pts=[[0,0],[s.width,0],[s.width,s.length],[0,s.length]].map(([x,y])=>fitPointLatLon(x,y));
      return pts.every(p=>p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon))?pts:null;
    }catch(e){return null;}
  }

  function frameSavedPad(force=false){
    if(!map||!mapReady||(!force&&framedSavedPad))return false;
    const corners=savedPadCorners();if(!corners)return false;
    try{
      let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
      for(const p of corners){minLon=Math.min(minLon,+p.lon);maxLon=Math.max(maxLon,+p.lon);minLat=Math.min(minLat,+p.lat);maxLat=Math.max(maxLat,+p.lat);}
      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:{top:46,right:46,bottom:46,left:46},maxZoom:20.5,duration:0});
      framedSavedPad=true;
      follow=false;
      try{window.dispatchEvent(new CustomEvent('padgrade-saved-pad-framed'));}catch(e){}
      return true;
    }catch(e){return false;}
  }
  window.__padGradeFrameSavedPad=frameSavedPad;

  function updateMap(){
    const card=el('gpsMapCard');
    const visible=isGpsMode();
    if(card) card.classList.toggle('show',visible);

    syncCompanionWatch(visible);
    if(visible && !map && !mapInitAttempted) initMap();

    if(lastModeVisible!==visible){
      lastModeVisible=visible;
      if(visible && map) setTimeout(()=>{try{map.resize();frameSavedPad(false);}catch(e){}},0);
    }

    // Saved project geometry is authoritative for initial framing. Never make the
    // grid wait for a fresh GPS fix just to know where the calibrated pad lives.
    if(visible&&mapReady&&!framedSavedPad)frameSavedPad(false);

    const pos=getGpsPosition();
    updateSourceUi(pos);
    const message=el('gpsMapMessage');
    if(!pos){
      if(message){message.textContent=visible?'Waiting for current GPS position…':'';message.classList.toggle('hidden',!visible);}
      setGeoJson(FIX_SOURCE,pointGeoJson(null));setGeoJson(ERROR_SOURCE,accuracyPolygon(null));return;
    }
    if(message) message.classList.add('hidden');

    const signature=[(+pos.lat).toFixed(8),(+pos.lon).toFixed(8),Number.isFinite(+pos.accuracy)?(+pos.accuracy).toFixed(2):'na'].join('|');
    if(signature===lastFixSignature) return;
    lastFixSignature=signature;

    setGeoJson(FIX_SOURCE,pointGeoJson(pos));setGeoJson(ERROR_SOURCE,accuracyPolygon(pos));

    if(mapReady && map && (firstFix || follow)){
      firstFix=false;
      try{if(follow)map.easeTo({center:[+pos.lon,+pos.lat],zoom:Math.max(map.getZoom(),FOLLOW_ZOOM),duration:300});}catch(e){}
    }
  }

  function centerNow(){
    const pos=getGpsPosition();
    if(pos){follow=true;try{map?.easeTo({center:[+pos.lon,+pos.lat],zoom:FOLLOW_ZOOM,duration:350});}catch(e){}return;}
    // With no current fix, Center still does something useful: return to the pad.
    follow=false;frameSavedPad(true);
  }

  function initMap(){
    mapInitAttempted=true;
    const container=el('gpsMap');if(!container)return;
    if(!window.maplibregl){
      const message=el('gpsMapMessage');if(message){message.textContent='Map library unavailable. GPS guidance still works.';message.classList.remove('hidden');}return;
    }

    try{
      map=new maplibregl.Map({container:'gpsMap',center:[-97.5,35.5],zoom:5,minZoom:3,maxZoom:22,attributionControl:true,style:imageryStyle()});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('load',()=>{
        map.addSource(ERROR_SOURCE,{type:'geojson',data:accuracyPolygon(null)});
        map.addLayer({id:ERROR_FILL_LAYER,type:'fill',source:ERROR_SOURCE,paint:{'fill-color':'#63b7ff','fill-opacity':0.18}});
        map.addLayer({id:ERROR_LINE_LAYER,type:'line',source:ERROR_SOURCE,paint:{'line-color':'#8fd4ff','line-width':2,'line-opacity':0.9}});
        map.addSource(FIX_SOURCE,{type:'geojson',data:pointGeoJson(null)});
        map.addLayer({id:FIX_LAYER,type:'circle',source:FIX_SOURCE,paint:{'circle-radius':7,'circle-color':'#8fd14f','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
        mapReady=true;lastFixSignature='';
        frameSavedPad(false);
        updateMap();
      });
      map.on('dragstart',()=>{follow=false;});
      map.on('zoomstart',e=>{if(e&&e.originalEvent)follow=false;});
      map.on('error',ev=>{
        const detail=ev&&ev.error&&ev.error.message?String(ev.error.message):String(ev&&ev.error||'');
        if(/naip|exportimage|imagery\.nationalmap/i.test(detail)) return;
        const message=el('gpsMapMessage');if(message&&!mapReady){message.textContent='Map imagery unavailable. GPS guidance still works.';message.classList.remove('hidden');}
      });
    }catch(e){
      map=null;const message=el('gpsMapMessage');if(message){message.textContent='Map unavailable. GPS guidance still works.';message.classList.remove('hidden');}
    }
  }

  function boot(){
    const recenter=el('gpsMapRecenter');if(recenter)recenter.addEventListener('click',centerNow);
    updateMap();
    pollTimer=setInterval(updateMap,UPDATE_MS);
    window.addEventListener('padgrade-active-project-applied',()=>setTimeout(()=>{framedSavedPad=false;frameSavedPad(true);},0));
    window.addEventListener('beforeunload',()=>{
      if(pollTimer)clearInterval(pollTimer);pollTimer=null;
      if(companionWatchId!=null){try{navigator.geolocation.clearWatch(companionWatchId);}catch(e){}companionWatchId=null;}
      if(map){try{map.remove();}catch(e){}map=null;}
    },{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
