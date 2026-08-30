/* Pad Grade v1.1.4 DEV — single-authority heat display + memory instrumentation.
 *
 * This module intentionally does NOT trim memory. It measures first so the next
 * diagnostic export can show whether Android process reclamation correlates with
 * Java/native/graphics/PSS growth, JS heap, MapLibre canvases, heat rasters, or
 * decoded project heat caches.
 */
(function installPadGrade114Dev(){
  'use strict';
  if(window.__padGradeDevV114)return;
  window.__padGradeDevV114=true;

  const VERSION='1.1.4';
  const NORMAL_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const NORMAL_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const MEMORY_MIN_INTERVAL_MS=700;
  const PERIODIC_MS=15000;

  let inspectorMode='auto';
  let activeNormalLayer='';
  let protectedCacheLayer='';
  let protectedCacheSource='';
  let cacheAuthority=false;
  let patchedMap=null;
  let memoryTimer=null;
  let memoryScheduled=null;
  let lastMemoryAt=0;
  let lastMemoryReason='';
  const decodedCacheCanvases=new Map();
  const foregroundWorkers=new Map();
  let backgroundWorkerActive=false;

  const rawMark=()=>window.PadGradeDiag&&typeof window.PadGradeDiag.mark==='function'?window.PadGradeDiag.mark.bind(window.PadGradeDiag):null;
  function mark(name,details){try{const fn=rawMark();if(fn)fn(name,details);}catch(e){}}
  const isNormalLayer=id=>String(id||'').startsWith(NORMAL_LAYER_PREFIX);
  const isNormalSource=id=>String(id||'').startsWith(NORMAL_SOURCE_PREFIX);
  const isInspectLayer=id=>String(id||'').startsWith(INSPECT_LAYER_PREFIX);
  const isInspectSource=id=>String(id||'').startsWith(INSPECT_SOURCE_PREFIX);
  const mapInstance=()=>window.__padGradeMapInstance||null;
  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};

  function visible(map,id){
    try{return !!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';}catch(e){return false;}
  }
  function normalLayers(map){
    try{return (map.getStyle?.()?.layers||[]).map(x=>x?.id||'').filter(isNormalLayer);}catch(e){return [];}
  }
  function inspectLayers(map){
    try{return (map.getStyle?.()?.layers||[]).map(x=>x?.id||'').filter(isInspectLayer);}catch(e){return [];}
  }
  function chooseNormal(map){
    const ids=normalLayers(map);
    const currentlyVisible=ids.filter(id=>visible(map,id));
    activeNormalLayer=currentlyVisible[currentlyVisible.length-1]||activeNormalLayer||ids[ids.length-1]||'';
    return activeNormalLayer;
  }
  function selectedInspectLayer(){return inspectorMode==='auto'?'':`${INSPECT_LAYER_PREFIX}${inspectorMode}`;}

  function releaseCacheAuthority(reason){
    if(!cacheAuthority&&!protectedCacheLayer&&!protectedCacheSource)return;
    mark('heatmap.cache-authority-released',{reason,layer:protectedCacheLayer,source:protectedCacheSource});
    cacheAuthority=false;protectedCacheLayer='';protectedCacheSource='';
  }

  function enforceOneHeat(map,reason){
    if(!map)return;
    const selected=selectedInspectLayer();
    if(inspectorMode!=='auto'){
      for(const id of normalLayers(map))try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');}catch(e){}
      for(const id of inspectLayers(map))try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',id===selected?'visible':'none');}catch(e){}
      mark('heatmap.exclusive-state',{reason,mode:inspectorMode,visible:selected||''});
      return;
    }
    for(const id of inspectLayers(map))try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');}catch(e){}
    let keep='';
    if(cacheAuthority&&protectedCacheLayer&&map.getLayer(protectedCacheLayer))keep=protectedCacheLayer;
    else keep=chooseNormal(map);
    for(const id of normalLayers(map))try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',id===keep?'visible':'none');}catch(e){}
    mark('heatmap.exclusive-state',{reason,mode:'auto',visible:keep,cacheAuthority});
  }

  function protectCurrentCache(){
    const map=mapInstance();if(!map)return;
    const ids=normalLayers(map);
    const shown=ids.filter(id=>visible(map,id));
    const keep=shown[shown.length-1]||activeNormalLayer||ids[ids.length-1]||'';
    if(!keep)return;
    let source='';try{source=map.getLayer(keep)?.source||'';}catch(e){}
    activeNormalLayer=keep;protectedCacheLayer=keep;protectedCacheSource=source;cacheAuthority=true;
    enforceOneHeat(map,'cache-visible');
    mark('heatmap.cache-authority-set',{layer:keep,source});
  }

  function patchMap(map){
    if(!map||map.__padGradeV114HeatPatched)return false;
    map.__padGradeV114HeatPatched=true;patchedMap=map;
    const addLayer=map.addLayer.bind(map);
    const removeLayer=map.removeLayer.bind(map);
    const removeSource=map.removeSource.bind(map);
    const setLayoutProperty=map.setLayoutProperty.bind(map);

    map.addLayer=function(layer,before){
      const id=layer?.id||'';
      const result=addLayer(layer,before);
      if(isNormalLayer(id)){
        if(!(cacheAuthority&&protectedCacheLayer&&this.getLayer(protectedCacheLayer)))activeNormalLayer=id;
        try{setLayoutProperty(id,'visibility','none');}catch(e){}
        enforceOneHeat(this,'normal-layer-added');
      }else if(isInspectLayer(id)){
        try{setLayoutProperty(id,'visibility','none');}catch(e){}
        enforceOneHeat(this,'inspect-layer-added');
      }
      return result;
    };

    map.setLayoutProperty=function(id,name,value){
      if(name==='visibility'&&value==='visible'){
        if(isNormalLayer(id)){
          if(inspectorMode!=='auto'){
            try{setLayoutProperty(id,'visibility','none');}catch(e){}
            mark('heatmap.stale-raster-show-suppressed',{requested:id,reason:'manual-inspector',mode:inspectorMode});
            return this;
          }
          if(cacheAuthority&&protectedCacheLayer&&id!==protectedCacheLayer){
            try{setLayoutProperty(id,'visibility','none');}catch(e){}
            mark('heatmap.stale-raster-show-suppressed',{requested:id,active:protectedCacheLayer,reason:'final-cache-authority'});
            return this;
          }
          if(!cacheAuthority&&activeNormalLayer&&id!==activeNormalLayer){
            try{setLayoutProperty(id,'visibility','none');}catch(e){}
            mark('heatmap.stale-raster-show-suppressed',{requested:id,active:activeNormalLayer,reason:'retired-normal-slot'});
            return this;
          }
          const result=setLayoutProperty(id,name,value);
          for(const other of normalLayers(this))if(other!==id)try{setLayoutProperty(other,'visibility','none');}catch(e){}
          for(const other of inspectLayers(this))try{setLayoutProperty(other,'visibility','none');}catch(e){}
          return result;
        }
        if(isInspectLayer(id)){
          const selected=selectedInspectLayer();
          if(inspectorMode==='auto'||id!==selected){
            try{setLayoutProperty(id,'visibility','none');}catch(e){}
            return this;
          }
          const result=setLayoutProperty(id,name,value);
          for(const other of inspectLayers(this))if(other!==id)try{setLayoutProperty(other,'visibility','none');}catch(e){}
          for(const other of normalLayers(this))try{setLayoutProperty(other,'visibility','none');}catch(e){}
          return result;
        }
      }
      return setLayoutProperty(id,name,value);
    };

    map.removeLayer=function(id){
      if(cacheAuthority&&id===protectedCacheLayer&&this.getLayer(id)){
        mark('heatmap.cache-layer-retirement-suppressed',{layer:id});
        return this;
      }
      const result=removeLayer(id);
      if(id===activeNormalLayer)activeNormalLayer='';
      return result;
    };
    map.removeSource=function(id){
      if(cacheAuthority&&id===protectedCacheSource&&this.getSource(id)){
        mark('heatmap.cache-source-retirement-suppressed',{source:id});
        return this;
      }
      return removeSource(id);
    };

    chooseNormal(map);enforceOneHeat(map,'map-patched');
    mark('heatmap.single-authority-guard-installed',{activeNormalLayer});
    return true;
  }

  function canvasBytes(canvas){
    try{return Math.max(0,+canvas.width||0)*Math.max(0,+canvas.height||0)*4;}catch(e){return 0;}
  }
  function formatNativeMemory(){
    try{
      if(!window.PadGradeLifecycle||typeof window.PadGradeLifecycle.getMemorySnapshot!=='function')return null;
      const raw=window.PadGradeLifecycle.getMemorySnapshot();
      return raw?JSON.parse(raw):null;
    }catch(e){return {error:String(e?.message||e).slice(0,120)};}
  }
  function resolutionFor(tier){
    try{
      if(typeof cfg!=='function')return null;const s=cfg(),longest=Math.max(+s.width||0,+s.length||0,1),cols=Math.max(2,Math.round(+s.cols||2)),rows=Math.max(2,Math.round(+s.rows||2));
      return {nx:Math.max((cols-1)*3+1,Math.round(tier*(+s.width||0)/longest)),ny:Math.max((rows-1)*3+1,Math.round(tier*(+s.length||0)/longest))};
    }catch(e){return null;}
  }
  function inspectorTierEstimate(){
    const result={tiers:[],estimatedBytes:0};
    try{
      const host=document.getElementById('pg113ResolutionInspector');if(!host)return result;
      const texts=[...host.querySelectorAll('.small')].map(n=>n.textContent||'').join(' ');
      for(const tier of [99,297,891])if(new RegExp(`(?:ready|cached)[^•]*\\b${tier}\\b|\\b${tier}\\b(?:,|\\s|$)`).test(texts)){
        const r=resolutionFor(tier);if(r){result.tiers.push(tier);result.estimatedBytes+=r.nx*r.ny*4;}
      }
    }catch(e){}
    return result;
  }
  function canvasInventory(){
    const map=mapInstance(),seen=new Set(),items=[];
    function add(label,canvas,kind){
      if(!canvas||seen.has(canvas))return;seen.add(canvas);items.push({label,kind,width:+canvas.width||0,height:+canvas.height||0,bytes:canvasBytes(canvas)});
    }
    try{for(const c of document.querySelectorAll('canvas'))add(c.id||c.className||'dom-canvas',c,'dom');}catch(e){}
    if(map){
      try{add('primary-map-canvas',map.getCanvas?.(),'map');}catch(e){}
      try{
        const sources=Object.keys(map.getStyle?.()?.sources||{});
        for(const id of sources){
          if(!isNormalSource(id)&&!isInspectSource(id))continue;
          const source=map.getSource(id),canvas=source&&typeof source.getCanvas==='function'?source.getCanvas():null;
          add(id,canvas,isNormalSource(id)?'normal-heat-source':'inspector-heat-source');
        }
      }catch(e){}
    }
    const byKind={};let totalBytes=0;
    for(const item of items){totalBytes+=item.bytes;byKind[item.kind]=(byKind[item.kind]||0)+item.bytes;}
    return {count:items.length,totalBytes,byKind,items};
  }
  function cacheInventory(){
    let estimatedBytes=0;const projects=[];
    for(const [projectId,item] of decodedCacheCanvases.entries()){estimatedBytes+=item.bytes;projects.push({projectId,nx:item.nx,ny:item.ny,bytes:item.bytes});}
    return {count:projects.length,estimatedBytes,projects};
  }
  function jsHeapSnapshot(){
    try{const m=performance&&performance.memory;if(!m)return null;return {usedJSHeapSize:+m.usedJSHeapSize||0,totalJSHeapSize:+m.totalJSHeapSize||0,jsHeapSizeLimit:+m.jsHeapSizeLimit||0};}catch(e){return null;}
  }
  function workerInventory(){return {foregroundCount:foregroundWorkers.size,foreground:[...foregroundWorkers.values()],backgroundActive:backgroundWorkerActive};}

  function takeMemorySnapshot(reason,extra){
    const t=now();lastMemoryAt=t;lastMemoryReason=reason||'manual';
    const snapshot={version:VERSION,reason:lastMemoryReason,native:formatNativeMemory(),jsHeap:jsHeapSnapshot(),canvases:canvasInventory(),tierCacheEstimate:inspectorTierEstimate(),decodedCacheEstimate:cacheInventory(),workers:workerInventory(),heat:{inspectorMode,activeNormalLayer,cacheAuthority,protectedCacheLayer},extra:extra||null};
    mark('memory.snapshot',snapshot);
    window.__padGradeMemorySnapshotV114=snapshot;
    return snapshot;
  }
  function scheduleMemorySnapshot(reason,extra,delay=180){
    if(memoryScheduled)clearTimeout(memoryScheduled);
    memoryScheduled=setTimeout(()=>{
      memoryScheduled=null;
      const elapsed=now()-lastMemoryAt;
      if(elapsed<MEMORY_MIN_INTERVAL_MS){memoryScheduled=setTimeout(()=>{memoryScheduled=null;takeMemorySnapshot(reason,extra);},MEMORY_MIN_INTERVAL_MS-elapsed);return;}
      takeMemorySnapshot(reason,extra);
    },Math.max(0,delay));
  }
  window.pgDiagnosticMemorySnapshot=reason=>takeMemorySnapshot(reason||'manual-call');

  function observeDiagnosticMarks(){
    const diag=window.PadGradeDiag;if(!diag||typeof diag.mark!=='function'||diag.__padGradeV114Wrapped)return false;
    const original=diag.mark.bind(diag);diag.__padGradeV114Wrapped=true;
    diag.mark=function(name,details){
      const result=original(name,details);
      try{
        if(name==='heatmap.inspector-mode'){
          inspectorMode=String(details?.mode||'auto');
          enforceOneHeat(mapInstance(),'inspector-mode');
          scheduleMemorySnapshot(`after-${name}`,details);
        }else if(name==='heatmap.cache-visible'){
          protectCurrentCache();
          if(details?.projectId&&Number.isFinite(+details?.nx)&&Number.isFinite(+details?.ny))decodedCacheCanvases.set(String(details.projectId),{nx:+details.nx,ny:+details.ny,bytes:(+details.nx)*(+details.ny)*4});
          scheduleMemorySnapshot(`after-${name}`,details);
        }else if(name==='heatmap.cache-hit'){
          if(details?.projectId&&Number.isFinite(+details?.nx)&&Number.isFinite(+details?.ny))decodedCacheCanvases.set(String(details.projectId),{nx:+details.nx,ny:+details.ny,bytes:(+details.nx)*(+details.ny)*4});
          scheduleMemorySnapshot(`after-${name}`,details,350);
        }else if(name==='heatmap.cache-invalidated'){
          releaseCacheAuthority(details?.reason||'cache-invalidated');
          scheduleMemorySnapshot(`after-${name}`,details);
        }else if(name==='heatmap.regular-worker-posted'){
          const key=`regular:${details?.tier||'?'}:${details?.jobId||Date.now()}`;foregroundWorkers.set(key,{kind:'regular',tier:+details?.tier||0,jobId:details?.jobId||null,nx:+details?.nx||0,ny:+details?.ny||0});
        }else if(name==='heatmap.regular-worker-complete'){
          for(const [key,item] of foregroundWorkers)if(item.kind==='regular'&&item.tier===+details?.tier){foregroundWorkers.delete(key);break;}
          scheduleMemorySnapshot(`after-${name}`,details,250);
        }else if(name==='heatmap.background-cache-start'){
          backgroundWorkerActive=true;scheduleMemorySnapshot(`after-${name}`,details,250);
        }else if(name==='heatmap.cache-written'){
          backgroundWorkerActive=false;scheduleMemorySnapshot(`after-${name}`,details,350);
        }else if(name==='project.switch-v113-complete'||name==='project.active-applied'){
          releaseCacheAuthority('project-change');
          scheduleMemorySnapshot(`after-${name}`,details,300);
        }else if(name==='map.load'||name==='map.created'||name==='compare.overlay-visible'){
          scheduleMemorySnapshot(`after-${name}`,details,450);
        }
      }catch(e){}
      return result;
    };
    return true;
  }

  function boot(){
    document.title='Pad Grade Mapper v1.1.4 DEV';
    observeDiagnosticMarks();
    const attach=()=>{const map=mapInstance();if(map)patchMap(map);};
    attach();
    window.addEventListener('padgrade-primary-map-captured',e=>patchMap(e?.detail?.map||mapInstance()));
    window.addEventListener('padgrade-map-created',e=>{patchMap(e?.detail?.map||mapInstance());scheduleMemorySnapshot('after-map-created',null,500);});
    window.addEventListener('padgrade-active-project-applied',()=>{releaseCacheAuthority('active-project-event');scheduleMemorySnapshot('after-active-project-applied',null,350);});
    document.addEventListener('visibilitychange',()=>scheduleMemorySnapshot(`visibility-${document.visibilityState}`,null,0));
    window.addEventListener('pagehide',()=>takeMemorySnapshot('pagehide'));
    setTimeout(()=>{observeDiagnosticMarks();attach();scheduleMemorySnapshot('v114-boot',null,0);},0);
    setTimeout(()=>{observeDiagnosticMarks();attach();},1000);
    memoryTimer=setInterval(()=>{observeDiagnosticMarks();attach();if(document.visibilityState==='visible')scheduleMemorySnapshot('periodic-visible',null,0);},PERIODIC_MS);
    window.addEventListener('beforeunload',()=>{if(memoryTimer)clearInterval(memoryTimer);if(memoryScheduled)clearTimeout(memoryScheduled);},{once:true});
    window.__padGradeV114Policy='single-visible-heat-authority-cache-protected-memory-measurement-no-auto-trim';
    mark('v114.installed',{version:VERSION,policy:window.__padGradeV114Policy});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
