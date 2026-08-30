/* Pad Grade v1.1.1 DEV — resilient project overlays and earlier usable startup.
 *
 * Project-owned map overlays are repaired by a generation-scoped, bounded retry
 * sequence instead of relying on a single MapLibre style-ready moment. A stale
 * retry from an older project can never repaint the newly active project.
 *
 * During durable recovery, the existing recovery/write lock remains authoritative.
 * Once the active project and lower measurement grid are painted, the full-screen
 * curtain becomes visually transparent so the app is usable while the GPS-map
 * card finishes its own grid/heat restoration behind a small local veil.
 */
(function installPadGrade111Resilience(){
  'use strict';

  const VERSION='1.1.1';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const RETRY_DELAYS=Object.freeze([0,16,60,160,350,700,1200,2200,4000,6500]);
  const GRID_LAYERS=Object.freeze(['pad-grade-grid-lines-layer','pad-grade-grid-points-layer']);
  const GRID_SOURCES=Object.freeze(['pad-grade-grid-lines','pad-grade-grid-points']);
  const HEAT_LAYERS=Object.freeze(['pad-grade-interpolated-surface-canvas-layer-0','pad-grade-interpolated-surface-canvas-layer-1']);
  const HEAT_SOURCES=Object.freeze(['pad-grade-interpolated-surface-canvas-source-0','pad-grade-interpolated-surface-canvas-source-1']);
  const STARTUP_CLASS='pg111RuntimeReady';
  const MAP_VEIL_ID='pg111MapRestoreVeil';

  let repairSerial=0;
  let repair=null;
  let attachedMap=null;
  let startupPoll=null;
  let startupPartialRevealed=false;
  let providerTimer=null;
  let lastProviderSignature='';
  let styleEventSerial=0;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const nowMs=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  function setTitle(){try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}}

  function activeProject(){
    const id=activeId();if(!id)return null;
    try{const p=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);return p&&p.id===id&&p.settings?p:null;}catch(e){return null;}
  }
  function projectApplied(project){
    if(!project)return false;
    return window.__padGradeProjectStartupSettledV091===project.id||window.__padGradePreloadedProjectId===project.id;
  }
  function lowerGridReady(project){
    if(!project?.settings)return false;
    const rows=Math.max(1,Number(project.settings.rows)||0),cols=Math.max(1,Number(project.settings.cols)||0),expected=rows*cols;
    return expected>0&&document.querySelectorAll('#grid .cell').length===expected;
  }
  function projectNeedsMapGrid(project){
    if(!project||project.measureMode!=='gps')return false;
    const gps=project.gps||{},cornerCount=gps.corners&&typeof gps.corners==='object'?Object.keys(gps.corners).length:0;
    return cornerCount>=2||!!(gps.reference&&gps.opposite);
  }
  function measuredCount(project){
    try{if(typeof pgMeasuredSurfacePoints==='function')return pgMeasuredSurfacePoints().length;}catch(e){}
    let count=0;for(const v of Object.values(project?.readings||{}))if(Number.isFinite(+v))count++;return count;
  }
  function heatExpected(project){
    if(!projectNeedsMapGrid(project))return false;
    const toggle=document.getElementById('heatmapToggle');if(toggle&&!toggle.checked)return false;
    try{if(typeof gpsFit!=='undefined'&&!gpsFit)return false;}catch(e){}
    return measuredCount(project)>=3;
  }
  function styleState(map){
    if(!map)return {mapPresent:false,stylePresent:false,styleLoaded:false};
    let stylePresent=false,styleLoaded=false;
    try{const style=map.getStyle?.();stylePresent=!!(style&&Array.isArray(style.layers));}catch(e){}
    try{styleLoaded=typeof map.isStyleLoaded==='function'?!!map.isStyleLoaded():stylePresent;}catch(e){styleLoaded=false;}
    return {mapPresent:true,stylePresent,styleLoaded};
  }
  function mapGridState(project){
    const map=window.__padGradeMapInstance||null,needs=projectNeedsMapGrid(project),style=styleState(map);
    if(!needs)return {...style,needed:false,ready:true,layers:true,sources:true,owner:true};
    if(!map)return {...style,needed:true,ready:false,layers:false,sources:false,owner:false};
    let layers=false,sources=false;
    try{layers=GRID_LAYERS.every(id=>!!map.getLayer?.(id));}catch(e){}
    try{sources=GRID_SOURCES.every(id=>!!map.getSource?.(id));}catch(e){}
    const fast=window.__padGradeMapGridFastPathV095||null,owner=window.__padGradeProjectGridSourceOwnerV094||'';
    const ownerReady=owner===project.id||fast?.projectId===project.id;
    return {...style,needed:true,ready:!!(layers&&sources&&ownerReady),layers,sources,owner:ownerReady,sourceOwner:String(owner||''),fastProjectId:String(fast?.projectId||'')};
  }
  const fc=features=>({type:'FeatureCollection',features:features||[]});
  function gridPointFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof cfg!=='function'||typeof targetLatLon!=='function')return [];
      const s=cfg(),pid=activeId(),out=[];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=targetLatLon(idx);if(!ll)continue;
        const val=readings[k(r,c)];let status='empty';
        if(Number.isFinite(val)){const diff=diffFor(val);status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';}
        if(idx===gpsTargetIndex)status='target';
        out.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status,projectId:pid},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
      }
      return out;
    }catch(e){return [];}
  }
  function gridLineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit)return [];
      const s=cfg(),out=[];
      for(let r=0;r<s.rows;r++){const coords=[];for(let c=0;c<s.cols;c++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});}
      for(let c=0;c<s.cols;c++){const coords=[];for(let r=0;r<s.rows;r++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});}
      return out;
    }catch(e){return [];}
  }
  function gridOutlineFeatures(){
    try{if(typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return [];const s=cfg(),pts=[[0,0],[s.width,0],[s.width,s.length],[0,s.length],[0,0]].map(([x,y])=>fitPointLatLon(x,y)).filter(Boolean).map(p=>[p.lon,p.lat]);return pts.length===5?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts}}]:[];}catch(e){return [];}
  }
  function gridRouteFeatures(){
    try{if(typeof gpsFit==='undefined'||!gpsFit||gpsTargetIndex==null||typeof gpsRoute!=='function')return [];const route=gpsRoute(),start=Math.max(0,route.indexOf(gpsTargetIndex)),coords=[];for(let i=start;i<route.length&&coords.length<6;i++){const idx=route[i],p=pointFromIndex(idx);if(Number.isFinite(readings[k(p.r,p.c)]))continue;const ll=targetLatLon(idx);if(ll)coords.push([ll.lon,ll.lat]);}return coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[];}catch(e){return [];}
  }
  function directInstallGrid(projectId){
    const map=window.__padGradeMapInstance||null;if(!map||projectId!==activeId())return false;
    let style=null;try{style=map.getStyle?.()||null;}catch(e){}if(!style)return false;
    try{
      const ensureSource=(id,data)=>{const source=map.getSource?.(id);if(source?.setData)source.setData(data);else if(!source)map.addSource(id,{type:'geojson',data});};
      const ensureLayer=layer=>{if(!map.getLayer?.(layer.id))map.addLayer(layer);};
      ensureSource('pad-grade-grid-lines',fc(gridLineFeatures()));
      ensureLayer({id:'pad-grade-grid-lines-layer',type:'line',source:'pad-grade-grid-lines',paint:{'line-color':'#d8f2ff','line-width':1,'line-opacity':0.55}});
      ensureSource('pad-grade-pad-outline',fc(gridOutlineFeatures()));
      ensureLayer({id:'pad-grade-pad-outline-layer',type:'line',source:'pad-grade-pad-outline',paint:{'line-color':'#ffffff','line-width':3,'line-opacity':0.95}});
      ensureSource('pad-grade-route',fc(gridRouteFeatures()));
      ensureLayer({id:'pad-grade-route-layer',type:'line',source:'pad-grade-route',paint:{'line-color':'#ffd166','line-width':3,'line-opacity':0.8,'line-dasharray':[2,2]}});
      ensureSource('pad-grade-grid-points',fc(gridPointFeatures()));
      ensureLayer({id:'pad-grade-grid-points-layer',type:'circle',source:'pad-grade-grid-points',paint:{'circle-radius':['case',['==',['get','status'],'target'],9,6],'circle-color':['match',['get','status'],'target','#ffd166','cut','#a83a2b','fill','#315fa8','grade','#4f8f3a','#66717d'],'circle-stroke-color':'#ffffff','circle-stroke-width':['case',['==',['get','status'],'target'],3,1]}});
      ensureLayer({id:'pad-grade-grid-labels',type:'symbol',source:'pad-grade-grid-points',minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
      window.__padGradeProjectGridSourceOwnerV094=projectId;window.__padGradeProjectGridReadyV094=true;
      try{map.triggerRepaint?.();}catch(e){}
      try{window.dispatchEvent(new CustomEvent('padgrade-project-grid-ready',{detail:{map,projectId,repairFallback:'v111'}}));}catch(e){}
      mark('map.overlay-direct-grid-install',{projectId,styleLoaded:styleState(map).styleLoaded,success:true});
      return true;
    }catch(e){mark('map.overlay-direct-grid-install',{projectId,styleLoaded:styleState(map).styleLoaded,success:false,error:String(e?.message||e).slice(0,120)});return false;}
  }

  function heatLayerState(project){
    const expected=heatExpected(project),map=window.__padGradeMapInstance||null;
    if(!expected)return {expected:false,ready:true,layer:false,source:false,tier:Number(window.__padGradeHeatmapMesh?.tier)||0};
    if(!map)return {expected:true,ready:false,layer:false,source:false,tier:Number(window.__padGradeHeatmapMesh?.tier)||0};
    let layer=false,source=false;
    try{layer=HEAT_LAYERS.some(id=>!!map.getLayer?.(id));}catch(e){}
    try{source=HEAT_SOURCES.some(id=>!!map.getSource?.(id));}catch(e){}
    return {expected:true,ready:!!(layer&&source),layer,source,tier:Number(window.__padGradeHeatmapMesh?.tier)||0};
  }
  function overlayState(project){return {grid:mapGridState(project),heat:heatLayerState(project)};}

  function ensureStartupStyle(){
    if(document.getElementById('pg111StartupStyle'))return;
    const style=document.createElement('style');style.id='pg111StartupStyle';
    style.textContent=`html.padGradeRecoveryHold.${STARTUP_CLASS} body>*{visibility:visible!important}html.padGradeRecoveryHold.${STARTUP_CLASS} body::before{display:none!important}#${MAP_VEIL_ID}{position:absolute;inset:0;z-index:18;display:flex;align-items:center;justify-content:center;background:rgba(11,15,20,.72);color:#d7e0e8;font:700 13px system-ui,sans-serif;pointer-events:none;backdrop-filter:blur(1px)}`;
    document.head.appendChild(style);
  }
  function showMapVeil(project){
    if(!projectNeedsMapGrid(project)||mapGridState(project).ready){hideMapVeil();return;}
    const wrap=document.querySelector('#gpsMapCard .gpsMapWrap');if(!wrap)return;
    if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';
    let veil=document.getElementById(MAP_VEIL_ID);if(!veil){veil=document.createElement('div');veil.id=MAP_VEIL_ID;veil.textContent='Restoring project map…';wrap.appendChild(veil);}
  }
  function hideMapVeil(){try{document.getElementById(MAP_VEIL_ID)?.remove();}catch(e){}}
  function updatePartialReveal(){
    ensureStartupStyle();setTitle();
    const root=document.documentElement,hold=root.classList.contains('padGradeRecoveryHold'),project=activeProject();
    if(!hold){
      root.classList.remove(STARTUP_CLASS);hideMapVeil();
      return false;
    }
    if(!project||!projectApplied(project)||!lowerGridReady(project))return false;
    if(!root.classList.contains(STARTUP_CLASS)){
      root.classList.add(STARTUP_CLASS);startupPartialRevealed=true;
      mark('recovery.partial-reveal',{projectId:project.id,mapStillIndependent:projectNeedsMapGrid(project),lowerGridReady:true});
      try{window.pgDrawSurface?.();}catch(e){}
    }
    if(projectNeedsMapGrid(project)&&!mapGridState(project).ready){showMapVeil(project);ensureRepair('startup-map-veil');}
    else hideMapVeil();
    return true;
  }

  function clearRepairTimers(current=repair){
    if(!current)return;
    for(const timer of current.timers)clearTimeout(timer);
    current.timers.clear();
  }
  function finishRepair(current,status,state){
    if(!current||repair!==current)return;
    clearRepairTimers(current);
    const elapsed=nowMs()-current.startedAt;
    mark(status==='verified'?'map.overlay-repair-verified':'map.overlay-repair-exhausted',{projectId:current.projectId,reason:current.reason,attempts:current.attempts,elapsedMs:+elapsed.toFixed(1),gridReady:!!state?.grid?.ready,heatExpected:!!state?.heat?.expected,heatReady:!!state?.heat?.ready,styleLoaded:!!state?.grid?.styleLoaded});
    if(status==='verified')hideMapVeil();
    repair=null;
  }
  function verifyRepair(current){
    if(!current||repair!==current||activeId()!==current.projectId)return false;
    const project=activeProject();if(!project)return false;
    const state=overlayState(project),ready=state.grid.ready&&state.heat.ready;
    if(ready){finishRepair(current,'verified',state);return true;}
    return false;
  }
  function repairAttempt(current,index){
    if(!current||repair!==current||activeId()!==current.projectId)return;
    const project=activeProject();if(!project){finishRepair(current,'exhausted',null);return;}
    current.attempts++;
    const before=overlayState(project);
    let gridRefreshResult=null;
    if(before.grid.needed&&!before.grid.ready){
      try{gridRefreshResult=typeof window.__padGradeRefreshMapGridNow==='function'?!!window.__padGradeRefreshMapGridNow(true):null;}catch(e){gridRefreshResult=false;}
      if(gridRefreshResult!==true&&before.grid.stylePresent&&index>=2)gridRefreshResult=directInstallGrid(project.id)||gridRefreshResult;
    }
    try{window.pgDrawSurface?.();}catch(e){}
    try{window.__padGradeFrameSavedPad?.(false);}catch(e){}
    const after=overlayState(project);
    mark('map.overlay-repair-attempt',{projectId:project.id,reason:current.reason,attempt:index+1,delayMs:RETRY_DELAYS[index],stylePresent:after.grid.stylePresent,styleLoaded:after.grid.styleLoaded,gridNeeded:after.grid.needed,gridReady:after.grid.ready,gridLayers:after.grid.layers,gridSources:after.grid.sources,gridOwner:after.grid.owner,heatExpected:after.heat.expected,heatReady:after.heat.ready,heatTier:after.heat.tier,gridRefreshResult});
    requestAnimationFrame(()=>{
      if(verifyRepair(current))return;
      if(index===RETRY_DELAYS.length-1){const latest=activeProject();finishRepair(current,'exhausted',latest?overlayState(latest):null);}
    });
  }
  function beginRepair(reason){
    const project=activeProject();if(!project||!projectNeedsMapGrid(project))return false;
    if(repair&&repair.projectId===project.id)return true;
    if(repair)clearRepairTimers(repair);
    const current={serial:++repairSerial,projectId:project.id,reason:String(reason||'overlay-check'),startedAt:nowMs(),attempts:0,timers:new Set()};repair=current;
    mark('map.overlay-repair-started',{projectId:project.id,reason:current.reason,retryCount:RETRY_DELAYS.length,maxRetryDelayMs:RETRY_DELAYS[RETRY_DELAYS.length-1]});
    RETRY_DELAYS.forEach((delay,index)=>{
      const timer=setTimeout(()=>{current.timers.delete(timer);repairAttempt(current,index);},delay);current.timers.add(timer);
    });
    return true;
  }
  function ensureRepair(reason){
    const project=activeProject();if(!project||!projectNeedsMapGrid(project))return false;
    const state=overlayState(project);if(state.grid.ready&&state.heat.ready){hideMapVeil();return false;}
    if(repair&&repair.projectId===project.id)return true;
    return beginRepair(reason);
  }
  function invalidateRepair(reason){
    if(repair){clearRepairTimers(repair);repair=null;}
    repairSerial++;
    mark('map.overlay-repair-generation-invalidated',{reason:String(reason||'project-boundary'),projectId:activeId()});
  }

  function logStyleEvent(name){
    const project=activeProject(),map=window.__padGradeMapInstance||null,state=project?overlayState(project):{grid:styleState(map),heat:{}};
    mark(`map.${name}`,{serial:++styleEventSerial,projectId:project?.id||'',stylePresent:!!state.grid.stylePresent,styleLoaded:!!state.grid.styleLoaded,gridReady:!!state.grid.ready,heatReady:!!state.heat.ready});
    if(project&&projectNeedsMapGrid(project)&&(!state.grid.ready||!state.heat.ready))ensureRepair(name);
    updatePartialReveal();
  }
  function attachMap(map){
    if(!map||map===attachedMap)return;
    attachedMap=map;setTitle();
    try{map.on('style.load',()=>logStyleEvent('style-load'));}catch(e){}
    try{map.on('styledata',()=>{const project=activeProject();if(!project)return;const state=overlayState(project);if(!state.grid.ready&&!repair)logStyleEvent('styledata-missing-overlay');});}catch(e){}
    try{map.on('load',()=>logStyleEvent('load'));}catch(e){}
    try{
      const canvas=map.getCanvas?.();
      canvas?.addEventListener?.('webglcontextlost',()=>{mark('map.webgl-context-lost',{projectId:activeId()});invalidateRepair('webgl-context-lost');});
      canvas?.addEventListener?.('webglcontextrestored',()=>{mark('map.webgl-context-restored',{projectId:activeId()});beginRepair('webgl-context-restored');});
    }catch(e){}
    ensureRepair('map-attached');
  }

  function sampleProviderState(){
    try{
      if(!window.PadGradeDiag?.enabled?.())return;
      const meta=window.PadGradePlatform?.lastLocationMeta||{},sig=[meta.provider||'',meta.solutionMode||'',meta.solutionState||''].join('|');
      if(sig===lastProviderSignature)return;lastProviderSignature=sig;
      mark('gps.provider-state',{sourceProvider:String(meta.provider||''),solutionMode:String(meta.solutionMode||''),solutionState:String(meta.solutionState||'')});
    }catch(e){}
  }

  window.addEventListener('padgrade-before-project-switch',ev=>{invalidateRepair('before-project-switch');mark('project.overlay-boundary',{from:String(ev?.detail?.from||''),to:String(ev?.detail?.to||'')});});
  window.addEventListener('padgrade-active-project-applied',ev=>{
    setTitle();updatePartialReveal();
    try{window.pgDrawSurface?.();}catch(e){}
    invalidateRepair('active-project-applied');beginRepair('active-project-applied');
    mark('project.overlay-state-applied',{projectId:String(ev?.detail?.id||activeId())});
  });
  window.addEventListener('padgrade-after-project-switch',()=>{setTitle();updatePartialReveal();ensureRepair('after-project-switch');});
  window.addEventListener('padgrade-project-grid-ready',()=>{updatePartialReveal();if(repair)verifyRepair(repair);});
  window.addEventListener('padgrade-map-created',ev=>{attachMap(ev?.detail?.map||window.__padGradeMapInstance);setTitle();ensureRepair('map-created');});
  window.addEventListener('padgrade-primary-map-captured',ev=>{attachMap(ev?.detail?.map||window.__padGradeMapInstance);ensureRepair('primary-map-captured');});
  window.addEventListener('padgrade-map-runtime-ready',()=>{attachMap(window.__padGradeMapInstance);ensureRepair('map-runtime-ready');});
  window.addEventListener('padgrade-location-fallback',ev=>{mark('gps.provider-fallback',{from:String(ev?.detail?.from||''),to:String(ev?.detail?.to||''),reason:String(ev?.detail?.reason||'')});ensureRepair('gps-provider-fallback');});
  window.addEventListener('online',()=>ensureRepair('online'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ensureRepair('visibility-resume');});
  window.addEventListener('padgrade-recovery-visual-released',()=>{document.documentElement.classList.remove(STARTUP_CLASS);hideMapVeil();mark('recovery.logical-hold-released',{partialRevealWasUsed:startupPartialRevealed});});

  function boot(){
    ensureStartupStyle();setTitle();attachMap(window.__padGradeMapInstance);updatePartialReveal();
    startupPoll=setInterval(()=>{updatePartialReveal();attachMap(window.__padGradeMapInstance);},40);
    setTimeout(()=>{if(startupPoll){clearInterval(startupPoll);startupPoll=null;}updatePartialReveal();},8000);
    providerTimer=setInterval(sampleProviderState,500);sampleProviderState();
    window.__padGradeOverlayRepairPolicyV111='generation-scoped-style-event-plus-bounded-retry-project-owner-verification';
    window.__padGradeStartupRevealPolicyV111='lower-grid-visible-early-map-card-local-veil-logical-recovery-lock-unchanged';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('beforeunload',()=>{
    invalidateRepair('beforeunload');if(startupPoll)clearInterval(startupPoll);if(providerTimer)clearInterval(providerTimer);
  },{once:true});
})();
