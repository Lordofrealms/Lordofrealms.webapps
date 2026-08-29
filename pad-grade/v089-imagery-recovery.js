/* Pad Grade v0.8.8 DEV — recover transient blank USGS imagery without
 * restarting the project UI.
 *
 * A MapLibre map can be healthy while its raster requests fail, leaving the
 * controls visible over a blank canvas. Detect that state with an independent
 * tile probe, keep project overlays usable, and rebuild only the raster sources
 * with bounded/backoff retries. The live project, GPS state, grid and heat map
 * stay in place.
 */
(function installPadGrade089ImageryRecovery(){
  'use strict';

  const CACHED_SOURCE='usgs-cached-imagery';
  const HIGH_RES_SOURCE='usgs-naip-plus';
  const CACHED_LAYER='usgs-cached';
  const HIGH_RES_LAYER='usgs-highres';
  const CACHED_TEMPLATE='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
  const STATUS_ID='pgImageryRecoveryStatus';
  const RETRY_DELAYS=[1500,3500,8000,15000,30000];

  let map=null;
  let retryTimer=null;
  let probeTimer=null;
  let probeGeneration=0;
  let failures=0;
  let attachedMap=null;
  let lastHealthyAt=0;

  function highResTileUrl(){
    const renderingRule=encodeURIComponent(JSON.stringify({rasterFunction:'NaturalColor'}));
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage'
      +'?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256'
      +'&format=jpgpng&transparent=false&f=image&renderingRule='+renderingRule;
  }

  function ensureStatus(){
    const wrap=document.querySelector('#gpsMapCard .gpsMapWrap');
    if(!wrap)return null;
    let el=document.getElementById(STATUS_ID);
    if(el)return el;
    el=document.createElement('div');
    el.id=STATUS_ID;
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    Object.assign(el.style,{
      position:'absolute',left:'10px',right:'10px',bottom:'10px',zIndex:'8',
      display:'none',padding:'8px 10px',borderRadius:'8px',
      background:'rgba(11,15,20,.88)',border:'1px solid rgba(255,255,255,.18)',
      color:'#d7e0e8',fontSize:'12px',fontWeight:'700',pointerEvents:'none'
    });
    wrap.appendChild(el);
    return el;
  }

  function showStatus(text){const el=ensureStatus();if(el){el.textContent=text;el.style.display='block';}}
  function hideStatus(){const el=document.getElementById(STATUS_ID);if(el)el.style.display='none';}

  function cachedSourceDef(){return {type:'raster',tiles:[CACHED_TEMPLATE],tileSize:256,minzoom:0,maxzoom:16,attribution:'USGS, USDA, The National Map'};}
  function highResSourceDef(){return {type:'raster',tiles:[highResTileUrl()],tileSize:256,minzoom:14,maxzoom:22,attribution:'USGS, USDA, The National Map'};}
  function cachedLayerDef(){return {id:CACHED_LAYER,type:'raster',source:CACHED_SOURCE};}
  function highResLayerDef(){return {id:HIGH_RES_LAYER,type:'raster',source:HIGH_RES_SOURCE,minzoom:14,paint:{'raster-opacity':1}};}

  function firstForegroundLayer(m){
    try{
      const layers=m.getStyle()?.layers||[];
      return layers.find(l=>l&&l.id!==CACHED_LAYER&&l.id!==HIGH_RES_LAYER&&(/^(pad-grade-|pg-)/.test(l.id)))?.id||null;
    }catch(e){return null;}
  }

  function retryImagerySources(){
    if(!map)return;
    try{
      if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded()){
        scheduleRetry(750);return;
      }
      showStatus('Map imagery unavailable — retrying…');
      const before=firstForegroundLayer(map);
      for(const id of [HIGH_RES_LAYER,CACHED_LAYER])try{if(map.getLayer(id))map.removeLayer(id);}catch(e){}
      for(const id of [HIGH_RES_SOURCE,CACHED_SOURCE])try{if(map.getSource(id))map.removeSource(id);}catch(e){}
      map.addSource(CACHED_SOURCE,cachedSourceDef());
      map.addSource(HIGH_RES_SOURCE,highResSourceDef());
      map.addLayer(cachedLayerDef(),before||undefined);
      map.addLayer(highResLayerDef(),before||undefined);
      try{map.triggerRepaint();}catch(e){}
      scheduleProbe(1800);
    }catch(e){scheduleRetry();}
  }

  function scheduleRetry(delayOverride=null){
    if(retryTimer||!map)return;
    const index=Math.min(failures,RETRY_DELAYS.length-1);
    const delay=delayOverride==null?RETRY_DELAYS[index]:Math.max(250,Number(delayOverride)||0);
    retryTimer=setTimeout(()=>{retryTimer=null;retryImagerySources();},delay);
  }

  function tileXY(lon,lat,z){
    const n=Math.pow(2,z),x=Math.floor((Number(lon)+180)/360*n);
    const clamped=Math.max(-85.05112878,Math.min(85.05112878,Number(lat)))*Math.PI/180;
    const y=Math.floor((1-Math.asinh(Math.tan(clamped))/Math.PI)/2*n);
    return {x:Math.max(0,Math.min(n-1,x)),y:Math.max(0,Math.min(n-1,y))};
  }

  function probeUrl(){
    if(!map)return null;
    try{
      const c=map.getCenter();if(!c||!Number.isFinite(+c.lng)||!Number.isFinite(+c.lat))return null;
      const z=Math.max(3,Math.min(16,Math.floor(Number(map.getZoom())||16))),p=tileXY(c.lng,c.lat,z);
      return CACHED_TEMPLATE.replace('{z}',z).replace('{x}',p.x).replace('{y}',p.y)+`?pg_probe=${Date.now()}`;
    }catch(e){return null;}
  }

  function markHealthy(){
    failures=0;lastHealthyAt=Date.now();hideStatus();
    window.__padGradeImageryRecoveryState={healthy:true,lastHealthyAt,failures:0};
  }

  function markFailed(){
    failures++;
    showStatus(failures<3?'Map imagery unavailable — retrying…':'Map imagery is temporarily unavailable. Grid and grade data remain usable; retrying automatically.');
    window.__padGradeImageryRecoveryState={healthy:false,lastHealthyAt,failures};
    scheduleRetry();
  }

  function probeImagery(){
    if(!map)return;
    const url=probeUrl();if(!url)return;
    const generation=++probeGeneration,img=new Image();let finished=false;
    const done=ok=>{
      if(finished||generation!==probeGeneration)return;
      finished=true;clearTimeout(timeout);
      if(ok)markHealthy();else markFailed();
    };
    const timeout=setTimeout(()=>done(false),6500);
    img.onload=()=>done(img.naturalWidth>0&&img.naturalHeight>0);
    img.onerror=()=>done(false);
    img.referrerPolicy='no-referrer';
    img.src=url;
  }

  function scheduleProbe(delay=3500){
    if(probeTimer)clearTimeout(probeTimer);
    probeTimer=setTimeout(()=>{probeTimer=null;probeImagery();},Math.max(250,delay));
  }

  function imageryError(ev){
    const source=String(ev?.sourceId||ev?.source?.id||'');
    const detail=String(ev?.error?.message||ev?.error||'');
    return source===CACHED_SOURCE||source===HIGH_RES_SOURCE||/nationalmap|usgsimagery|naip|exportimage/i.test(detail);
  }

  function attach(next){
    if(!next||next===attachedMap)return;
    attachedMap=map=next;failures=0;probeGeneration++;
    try{
      map.on('style.load',()=>scheduleProbe(2200));
      map.on('error',ev=>{if(imageryError(ev))scheduleProbe(350);});
      map.on('sourcedata',ev=>{
        if((ev?.sourceId===CACHED_SOURCE||ev?.sourceId===HIGH_RES_SOURCE)&&ev?.isSourceLoaded) scheduleProbe(200);
      });
      const canvas=map.getCanvas?.();
      canvas?.addEventListener?.('webglcontextlost',()=>{
        showStatus('Map renderer interrupted — recovering…');
        scheduleRetry(1000);
      });
    }catch(e){}
    scheduleProbe(2500);
  }

  window.addEventListener('padgrade-map-created',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
  window.addEventListener('padgrade-map-runtime-ready',()=>setTimeout(()=>attach(window.__padGradeMapInstance),0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&map)scheduleProbe(500);});
  window.addEventListener('online',()=>{if(map){failures=0;scheduleProbe(250);}});

  if(window.__padGradeMapInstance)attach(window.__padGradeMapInstance);
  window.__padGradeImageryRecoveryPolicyV089='probe-real-tile-retry-raster-sources-backoff-preserve-project-overlays';
})();
