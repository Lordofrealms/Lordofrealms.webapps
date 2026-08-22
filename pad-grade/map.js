/* Pad Grade live GPS map — shared web/Android source.
 *
 * Uses the same MapLibre/USGS hybrid imagery approach as Tractor Guidance.
 * The map intentionally contains only the current location and the reported
 * horizontal uncertainty circle. Grading/calibration geometry remains in the
 * existing Pad Grade UI rather than being duplicated here.
 */
(function installPadGradeGpsMap(){
  'use strict';

  const TILE_URL='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}';
  const SOURCE_ID='usgs-imagery-topo';
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
  let follow=true;
  let firstFix=true;
  let lastFixSignature='';
  let lastModeVisible=null;
  let pollTimer=null;

  function el(id){ return document.getElementById(id); }

  function getGpsPosition(){
    try{
      if(typeof gpsPos!=='undefined' && gpsPos && Number.isFinite(+gpsPos.lat) && Number.isFinite(+gpsPos.lon)){
        return gpsPos;
      }
    }catch(e){}
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
      return {
        provider:'precision-location',
        mode:String(meta.solutionMode||'Precision Location'),
        state:String(meta.solutionState||'UNKNOWN')
      };
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
      const stateText=meta.provider==='precision-location'
        ? friendlyMode(meta.state)
        : (pos?'ACTIVE':'WAITING');
      state.textContent=stateText;
      state.classList.toggle('ready',/READY/i.test(stateText));
      state.classList.toggle('working',!/READY|ERROR|DEGRADED/i.test(stateText));
      state.classList.toggle('bad',/ERROR|DEGRADED/i.test(stateText));
    }
    if(accuracy){
      const a=pos && Number.isFinite(+pos.accuracy) ? +pos.accuracy : NaN;
      accuracy.textContent=Number.isFinite(a)
        ? `±${(a*3.280839895).toFixed(a*3.280839895<10?1:0)} ft`
        : '—';
    }
  }

  function pointGeoJson(pos){
    return {
      type:'FeatureCollection',
      features:pos?[{
        type:'Feature',
        properties:{},
        geometry:{type:'Point',coordinates:[+pos.lon,+pos.lat]}
      }]:[]
    };
  }

  function accuracyPolygon(pos){
    const accuracy=pos && Number.isFinite(+pos.accuracy)?Math.max(0,+pos.accuracy):NaN;
    if(!pos || !Number.isFinite(accuracy) || accuracy<=0){
      return {type:'FeatureCollection',features:[]};
    }
    const latRad=+pos.lat*Math.PI/180;
    const points=[];
    for(let i=0;i<=CIRCLE_SEGMENTS;i++){
      const theta=2*Math.PI*i/CIRCLE_SEGMENTS;
      const north=accuracy*Math.cos(theta);
      const east=accuracy*Math.sin(theta);
      const lat=+pos.lat+(north/EARTH_RADIUS_M)*180/Math.PI;
      const cosLat=Math.max(0.15,Math.cos(latRad));
      const lon=+pos.lon+(east/(EARTH_RADIUS_M*cosLat))*180/Math.PI;
      points.push([lon,lat]);
    }
    return {
      type:'FeatureCollection',
      features:[{
        type:'Feature',properties:{accuracyMeters:accuracy},
        geometry:{type:'Polygon',coordinates:[points]}
      }]
    };
  }

  function setGeoJson(id,data){
    if(!mapReady || !map) return;
    const source=map.getSource(id);
    if(source && typeof source.setData==='function') source.setData(data);
  }

  function updateMap(){
    const card=el('gpsMapCard');
    const visible=isGpsMode();
    if(card) card.classList.toggle('show',visible);
    if(lastModeVisible!==visible){
      lastModeVisible=visible;
      if(visible && map) setTimeout(()=>{ try{map.resize();}catch(e){} },0);
    }

    const pos=getGpsPosition();
    updateSourceUi(pos);
    const message=el('gpsMapMessage');
    if(!pos){
      if(message){
        message.textContent=visible?'Enable GPS to show current position.':'';
        message.classList.toggle('hidden',!visible);
      }
      setGeoJson(FIX_SOURCE,pointGeoJson(null));
      setGeoJson(ERROR_SOURCE,accuracyPolygon(null));
      return;
    }
    if(message) message.classList.add('hidden');

    const signature=[
      (+pos.lat).toFixed(8),
      (+pos.lon).toFixed(8),
      Number.isFinite(+pos.accuracy)?(+pos.accuracy).toFixed(2):'na'
    ].join('|');
    if(signature===lastFixSignature) return;
    lastFixSignature=signature;

    setGeoJson(FIX_SOURCE,pointGeoJson(pos));
    setGeoJson(ERROR_SOURCE,accuracyPolygon(pos));

    if(mapReady && map && (firstFix || follow)){
      firstFix=false;
      try{
        if(follow){
          map.easeTo({center:[+pos.lon,+pos.lat],zoom:Math.max(map.getZoom(),FOLLOW_ZOOM),duration:300});
        }
      }catch(e){}
    }
  }

  function centerNow(){
    follow=true;
    const pos=getGpsPosition();
    if(!map || !pos) return;
    try{ map.easeTo({center:[+pos.lon,+pos.lat],zoom:FOLLOW_ZOOM,duration:350}); }catch(e){}
  }

  function initMap(){
    const container=el('gpsMap');
    if(!container) return;
    if(!window.maplibregl){
      const message=el('gpsMapMessage');
      if(message){
        message.textContent='Map library unavailable. GPS guidance still works.';
        message.classList.remove('hidden');
      }
      return;
    }

    try{
      map=new maplibregl.Map({
        container:'gpsMap',
        center:[-97.5,35.5],
        zoom:5,
        minZoom:3,
        maxZoom:22,
        attributionControl:true,
        style:{
          version:8,
          sources:{
            [SOURCE_ID]:{
              type:'raster',
              tiles:[TILE_URL],
              tileSize:256,
              attribution:'USGS The National Map'
            }
          },
          layers:[{id:'usgs-hybrid',type:'raster',source:SOURCE_ID,minzoom:0,maxzoom:22}]
        }
      });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('load',()=>{
        map.addSource(ERROR_SOURCE,{type:'geojson',data:accuracyPolygon(null)});
        map.addLayer({
          id:ERROR_FILL_LAYER,type:'fill',source:ERROR_SOURCE,
          paint:{'fill-color':'#63b7ff','fill-opacity':0.18}
        });
        map.addLayer({
          id:ERROR_LINE_LAYER,type:'line',source:ERROR_SOURCE,
          paint:{'line-color':'#8fd4ff','line-width':2,'line-opacity':0.9}
        });
        map.addSource(FIX_SOURCE,{type:'geojson',data:pointGeoJson(null)});
        map.addLayer({
          id:FIX_LAYER,type:'circle',source:FIX_SOURCE,
          paint:{
            'circle-radius':7,
            'circle-color':'#8fd14f',
            'circle-stroke-color':'#ffffff',
            'circle-stroke-width':2
          }
        });
        mapReady=true;
        updateMap();
      });
      map.on('dragstart',()=>{follow=false;});
      map.on('zoomstart',e=>{
        if(e && e.originalEvent) follow=false;
      });
      map.on('error',()=>{
        const message=el('gpsMapMessage');
        if(message && !mapReady){
          message.textContent='Map imagery unavailable. GPS guidance still works.';
          message.classList.remove('hidden');
        }
      });
    }catch(e){
      const message=el('gpsMapMessage');
      if(message){
        message.textContent='Map unavailable. GPS guidance still works.';
        message.classList.remove('hidden');
      }
    }
  }

  function boot(){
    const recenter=el('gpsMapRecenter');
    if(recenter) recenter.addEventListener('click',centerNow);
    initMap();
    updateMap();
    pollTimer=setInterval(updateMap,UPDATE_MS);
    window.addEventListener('beforeunload',()=>{
      if(pollTimer) clearInterval(pollTimer);
      pollTimer=null;
      if(map){ try{map.remove();}catch(e){} map=null; }
    },{once:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
