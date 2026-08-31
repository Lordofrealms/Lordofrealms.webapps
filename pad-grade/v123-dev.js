/* Pad Grade v1.2.3 DEV — resolution-inspector consistency repair.
 *
 * Field diagnostics from v1.2.2 proved the no-flicker canonical canvas path is
 * healthy, but the DEV resolution inspector could keep an older 99/297/891
 * canvas while Auto had already advanced to a newer completed raster of the same
 * nominal tier. v1.2.3 does not change interpolation or color math. It captures
 * the exact regular/Auto canvases as v1.2.0 intercepts them and, in manual mode,
 * binds the inspector virtual source to that exact completed canvas. The real
 * v1.2.2 canonical MapLibre source/layer is never removed or recreated.
 */
(function installPadGrade123Dev(){
  'use strict';
  if(window.__padGradeDevV123)return;
  window.__padGradeDevV123=true;

  const VERSION='1.2.3';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const REGULAR_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const TIERS=new Set([99,297,891]);
  const exactTiers=new Map();
  let selectedMode='auto';
  let diagOriginal=null;

  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const state=()=>window.__padGradeV120PrimaryHeatState||null;
  const cloneCoords=coords=>Array.isArray(coords)?coords.map(p=>Array.isArray(p)?[+p[0],+p[1]]:p):null;
  const rawMark=(name,details)=>{try{(diagOriginal||window.PadGradeDiag?.mark?.bind(window.PadGradeDiag))?.(name,details);}catch(e){}};
  const heatEnabled=()=>{const toggle=document.getElementById('heatmapToggle');return !toggle||!!toggle.checked;};
  const heatOpacity=()=>{try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}};
  function layerAnchor(map){try{for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;}catch(e){}return undefined;}

  function currentEntry(tier){
    const item=exactTiers.get(+tier);
    if(!item||item.projectId!==activeId()||!item.canvas)return null;
    return item;
  }

  function bindExactTier(tier,reason){
    tier=+tier;if(!TIERS.has(tier))return false;
    const item=currentEntry(tier),s=state();if(!item||!s?.map)return false;
    const map=s.map,sid=`${INSPECT_SOURCE_PREFIX}${tier}`,lid=`${INSPECT_LAYER_PREFIX}${tier}`;
    const existing=s.sources?.get?.(sid);
    const sameCanvas=existing?.canvas===item.canvas&&!existing?.removed;
    try{
      if(!sameCanvas){
        // These are v1.2.0 virtual inspector objects only. Removing/recreating
        // them cannot blank the v1.2.2 canonical source/layer; that permanent
        // GPU-backed presentation remains visible until this complete canvas is
        // encoded and copied into it.
        if(map.getLayer(lid))map.removeLayer(lid);
        if(map.getSource(sid))map.removeSource(sid);
        map.addSource(sid,{type:'canvas',canvas:item.canvas,coordinates:cloneCoords(item.coordinates),animate:false});
        map.addLayer({id:lid,type:'raster',source:sid,paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}},layerAnchor(map));
      }else{
        map.getSource(sid)?.setCoordinates?.(cloneCoords(item.coordinates));
      }
      map.setLayoutProperty(lid,'visibility',heatEnabled()?'visible':'none');
      map.triggerRepaint?.();
      rawMark('heatmap.v123-inspector-bound-to-auto-tier',{tier,projectId:item.projectId,source:item.source,regularSerial:item.serial||0,sourceRebound:!sameCanvas,reason:String(reason||'sync')});
      return true;
    }catch(e){
      rawMark('heatmap.v123-inspector-bind-failed',{tier,projectId:item.projectId,error:String(e?.message||e).slice(0,160),reason:String(reason||'sync')});
      return false;
    }
  }

  function captureRegular(details){
    if(details?.map&&details.map!=='primary')return false;
    const sourceId=String(details?.source||'');
    const tier=+details?.tier;
    if(!sourceId.startsWith(REGULAR_SOURCE_PREFIX)||!TIERS.has(tier))return false;
    const s=state(),record=s?.sources?.get?.(sourceId);
    if(!record?.canvas||record.removed)return false;
    const item={tier,projectId:activeId(),source:sourceId,serial:+record.serial||0,projectSerial:+record.projectSerial||0,canvas:record.canvas,coordinates:cloneCoords(record.coordinates)};
    exactTiers.set(tier,item);
    rawMark('heatmap.v123-auto-tier-captured',{tier,projectId:item.projectId,source:sourceId,regularSerial:item.serial,width:+item.canvas.width||0,height:+item.canvas.height||0});
    if(selectedMode===String(tier))bindExactTier(tier,'auto-tier-updated');
    return true;
  }

  function handle(name,details){
    if(name==='project.switch-v113-start'){
      exactTiers.clear();
      rawMark('heatmap.v123-tier-cache-cleared',{reason:'project-switch-start'});
      return;
    }
    if(name==='heatmap.v120-canvas-intercepted'){
      captureRegular(details);
      return;
    }
    if(name==='heatmap.inspector-mode'){
      selectedMode=String(details?.mode||'auto');
      if(TIERS.has(+selectedMode))bindExactTier(+selectedMode,'manual-selection');
    }
  }

  function installDiagnosticHook(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV123Wrapped)return false;
    const original=d.mark.bind(d);diagOriginal=original;d.__padGradeV123Wrapped=true;
    d.mark=function(name,details){const result=original(name,details);try{handle(name,details);}catch(e){}return result;};
    original('heatmap.v123-diagnostics-hook-installed',{version:VERSION});
    return true;
  }

  function rescanRegularSources(){
    const s=state();if(!s?.sources)return false;
    for(const [id,record] of s.sources){
      if(!String(id).startsWith(REGULAR_SOURCE_PREFIX)||record?.removed||!record?.canvas)continue;
      const tier=+record.tier;if(!TIERS.has(tier))continue;
      exactTiers.set(tier,{tier,projectId:activeId(),source:String(id),serial:+record.serial||0,projectSerial:+record.projectSerial||0,canvas:record.canvas,coordinates:cloneCoords(record.coordinates)});
    }
    if(TIERS.has(+selectedMode))bindExactTier(+selectedMode,'rescan');
    return true;
  }

  window.__padGradeV123InspectorState={version:VERSION,exactTiers,selectedMode:()=>selectedMode,bindExactTier,rescanRegularSources};
  window.pgV123InspectorSync=()=>{installDiagnosticHook();return rescanRegularSources();};
  installDiagnosticHook();rescanRegularSources();
  setInterval(()=>{installDiagnosticHook();},1000);
  window.addEventListener('padgrade-active-project-applied',()=>setTimeout(rescanRegularSources,0));
  rawMark('heatmap.v123-runtime-installed',{version:VERSION,policy:'manual-picker-uses-exact-auto-completed-tier',canonicalSourceRecreate:false,canonicalLayerRecreate:false});
})();
