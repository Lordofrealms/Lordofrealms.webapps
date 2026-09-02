/* Pad Grade v1.1.5 DEV — frame-synchronized heat handoff + exportable memory telemetry.
 *
 * This module does not change IDW math, color scaling, raster dimensions, cache format,
 * or memory-management behavior. It fixes presentation/export paths only.
 */
(function installPadGrade115Dev(){
  'use strict';
  if(window.__padGradeDevV115)return;
  window.__padGradeDevV115=true;

  const VERSION='1.1.5';
  const NORMAL_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const NORMAL_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const HOLD_LAYER_ID='pad-grade-v115-heat-handoff-hold';
  const STAGE_OPACITY=0.000001;
  const LIFECYCLE_MEMORY_KEY='padGradeLifecycleMemoryImportedSeqV115';

  let patchedMap=null;
  let transition=null;
  let transitionSerial=0;
  let pollTimer=null;
  let lifecycleTimer=null;
  let diagWrapped=false;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mapInstance=()=>window.__padGradeMapInstance||null;
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const isNormalLayer=id=>String(id||'').startsWith(NORMAL_LAYER_PREFIX);
  const isInspectLayer=id=>String(id||'').startsWith(INSPECT_LAYER_PREFIX);
  const isHeatLayer=id=>isNormalLayer(id)||isInspectLayer(id);
  const isInspectSource=id=>String(id||'').startsWith(INSPECT_SOURCE_PREFIX);

  function layoutVisible(map,id){
    try{return !!map?.getLayer?.(id)&&map.getLayoutProperty(id,'visibility')!=='none';}catch(e){return false;}
  }
  function numericOpacity(map,id,fallback){
    try{const value=map.getPaintProperty(id,'raster-opacity');if(Number.isFinite(+value))return +value;}catch(e){}
    return Number.isFinite(+fallback)?+fallback:.58;
  }
  function defaultHeatOpacity(){
    try{const value=typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;return Number.isFinite(+value)?+value:.58;}catch(e){return .58;}
  }
  function heatLayerIds(map){
    try{return (map.getStyle?.()?.layers||[]).map(layer=>layer?.id||'').filter(isHeatLayer);}catch(e){return [];}
  }
  function normalLayerIds(map){return heatLayerIds(map).filter(isNormalLayer);}
  function currentVisualLayer(map){
    try{
      const ids=heatLayerIds(map),visible=ids.filter(id=>layoutVisible(map,id)&&numericOpacity(map,id,0)>.02);
      return visible[visible.length-1]||'';
    }catch(e){return '';}
  }
  function targetLayerForMode(map,mode){
    if(String(mode)!=='auto'){
      const id=`${INSPECT_LAYER_PREFIX}${mode}`;
      return map?.getLayer?.(id)&&layoutVisible(map,id)?id:'';
    }
    const visible=normalLayerIds(map).filter(id=>layoutVisible(map,id));
    return visible[visible.length-1]||'';
  }
  function nextLayerId(map,id){
    try{const layers=map.getStyle?.()?.layers||[],index=layers.findIndex(layer=>layer?.id===id);return index>=0&&index+1<layers.length?layers[index+1]?.id||undefined:undefined;}catch(e){return undefined;}
  }
  function rememberOpacity(state,map,id,fallback){
    if(!id||!map?.getLayer?.(id)||state.originalOpacities.has(id))return;
    state.originalOpacities.set(id,numericOpacity(map,id,fallback));
  }
  function stageLayerOpacity(state,map,id){
    if(!id||!map?.getLayer?.(id))return false;
    rememberOpacity(state,map,id,defaultHeatOpacity());
    try{map.setPaintProperty(id,'raster-fade-duration',0);map.setPaintProperty(id,'raster-opacity',STAGE_OPACITY);return true;}catch(e){return false;}
  }
  function stageExistingTargets(state,map){
    if(!state||!map)return;
    if(state.mode==='auto')for(const id of normalLayerIds(map))stageLayerOpacity(state,map,id);
    else stageLayerOpacity(state,map,`${INSPECT_LAYER_PREFIX}${state.mode}`);
  }

  function installHoldLayer(state,map,oldId){
    if(!oldId||!map?.getLayer?.(oldId))return false;
    try{if(map.getLayer(HOLD_LAYER_ID))map.removeLayer(HOLD_LAYER_ID);}catch(e){}
    const oldLayer=map.getLayer(oldId),source=oldLayer?.source;if(!source)return false;
    const opacity=numericOpacity(map,oldId,defaultHeatOpacity());
    state.oldId=oldId;state.oldSource=String(source||'');state.oldOpacity=opacity;
    rememberOpacity(state,map,oldId,opacity);
    const before=nextLayerId(map,oldId);
    const hold={id:HOLD_LAYER_ID,type:'raster',source,paint:{'raster-opacity':0,'raster-fade-duration':0}};
    map.addLayer(hold,before);
    // These paint changes are queued in the same JavaScript turn. The next map
    // render therefore sees one visual raster: the hold, not hold + old.
    map.setPaintProperty(oldId,'raster-opacity',0);
    map.setPaintProperty(HOLD_LAYER_ID,'raster-opacity',opacity);
    map.triggerRepaint?.();
    mark('heatmap.frame-handoff-hold-installed',{from:oldId,opacity});
    return true;
  }

  function cleanupOrphanInspectSource(map,source){
    if(!source||!isInspectSource(source)||!map?.getSource?.(source))return;
    try{const used=(map.getStyle?.()?.layers||[]).some(layer=>layer?.source===source);if(!used)map.removeSource(source);}catch(e){}
  }
  function restoreStagedOpacities(state,map,targetId){
    if(!state||!map)return;
    for(const [id,opacity] of state.originalOpacities){
      if(id===targetId||!map.getLayer?.(id))continue;
      try{map.setPaintProperty(id,'raster-fade-duration',0);map.setPaintProperty(id,'raster-opacity',opacity);}catch(e){}
    }
  }
  function removeHold(map,state){
    try{if(map?.getLayer?.(HOLD_LAYER_ID))map.removeLayer(HOLD_LAYER_ID);}catch(e){}
    cleanupOrphanInspectSource(map,state?.oldSource||'');
  }
  function cancelTransition(reason,restore=true){
    if(!transition)return;
    const state=transition,map=mapInstance();transition=null;
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
    if(map){
      if(restore)restoreStagedOpacities(state,map,'');
      removeHold(map,state);
      try{map.triggerRepaint?.();}catch(e){}
    }
    mark('heatmap.frame-handoff-cancelled',{reason,mode:state.mode,elapsedMs:+(now()-state.startedAt).toFixed(1)});
  }

  function commitTransition(serial,targetId){
    const state=transition,map=mapInstance();
    if(!state||state.serial!==serial||!map||!map.getLayer?.(targetId))return;
    const targetOpacity=state.originalOpacities.has(targetId)?state.originalOpacities.get(targetId):defaultHeatOpacity();
    // Hard paint handoff: no fade and no intentional visible blend. The target
    // was already rendered at effectively transparent opacity before this turn.
    try{
      map.setPaintProperty(targetId,'raster-fade-duration',0);
      map.setPaintProperty(targetId,'raster-opacity',targetOpacity);
      if(map.getLayer(HOLD_LAYER_ID))map.setPaintProperty(HOLD_LAYER_ID,'raster-opacity',0);
      map.triggerRepaint?.();
    }catch(e){cancelTransition('commit-error');return;}
    mark('heatmap.frame-handoff-committed',{from:state.oldId||'',to:targetId,mode:state.mode,waitMs:+(now()-state.startedAt).toFixed(1),stageOpacity:STAGE_OPACITY});

    let cleaned=false;
    const finish=()=>{
      if(cleaned)return;cleaned=true;
      const current=transition;if(!current||current.serial!==serial)return;
      transition=null;
      restoreStagedOpacities(current,map,targetId);
      removeHold(map,current);
      try{map.triggerRepaint?.();}catch(e){}
      mark('heatmap.frame-handoff-cleanup',{to:targetId,mode:current.mode});
    };
    try{map.once?.('render',()=>requestAnimationFrame(finish));map.triggerRepaint?.();setTimeout(finish,180);}catch(e){requestAnimationFrame(finish);}
  }

  function waitForTarget(serial){
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
    const state=transition,map=mapInstance();if(!state||state.serial!==serial||!map)return;
    stageExistingTargets(state,map);
    const target=targetLayerForMode(map,state.mode);
    if(target){
      if(state.targetId!==target){state.targetId=target;state.warmRequested=false;}
      stageLayerOpacity(state,map,target);
      if(!state.warmRequested){
        state.warmRequested=true;
        mark('heatmap.frame-handoff-target-staged',{to:target,mode:state.mode,stageOpacity:STAGE_OPACITY});
        let fired=false;
        const warm=()=>{if(fired)return;fired=true;if(transition?.serial===serial)requestAnimationFrame(()=>commitTransition(serial,target));};
        try{map.once?.('render',warm);map.triggerRepaint?.();setTimeout(warm,140);}catch(e){requestAnimationFrame(warm);}
        return;
      }
    }
    if(now()-state.startedAt>60000){mark('heatmap.frame-handoff-waiting-long',{mode:state.mode,elapsedMs:+(now()-state.startedAt).toFixed(1)});state.startedAt=now();}
    pollTimer=setTimeout(()=>waitForTarget(serial),24);
  }

  function beginTransition(mode){
    const map=mapInstance();if(!map)return;
    const requested=String(mode||'auto');
    if(!['auto','99','297','891'].includes(requested))return;
    if(!transition){
      const state={serial:++transitionSerial,mode:requested,startedAt:now(),oldId:'',oldSource:'',oldOpacity:defaultHeatOpacity(),targetId:'',warmRequested:false,originalOpacities:new Map()};
      transition=state;
      const old=currentVisualLayer(map);
      if(old)installHoldLayer(state,map,old);
    }else{
      transition.serial=++transitionSerial;transition.mode=requested;transition.startedAt=now();transition.targetId='';transition.warmRequested=false;
    }
    stageExistingTargets(transition,map);
    mark('heatmap.frame-handoff-start',{mode:requested,from:transition.oldId||'',serial:transition.serial});
    waitForTarget(transition.serial);
  }

  function shouldStageAddedLayer(id){
    if(!transition)return false;
    if(transition.mode==='auto')return isNormalLayer(id);
    return id===`${INSPECT_LAYER_PREFIX}${transition.mode}`;
  }
  function patchMap(map){
    if(!map||map.__padGradeV115HandoffPatched)return false;
    if(patchedMap&&patchedMap!==map)cancelTransition('map-replaced',false);
    patchedMap=map;map.__padGradeV115HandoffPatched=true;
    const baseAddLayer=map.addLayer.bind(map);
    map.addLayer=function(layer,before){
      let next=layer;
      const id=String(layer?.id||'');
      if(transition&&shouldStageAddedLayer(id)){
        const original=Number.isFinite(+layer?.paint?.['raster-opacity'])?+layer.paint['raster-opacity']:defaultHeatOpacity();
        transition.originalOpacities.set(id,original);
        next={...layer,paint:{...(layer?.paint||{}),'raster-opacity':STAGE_OPACITY,'raster-fade-duration':0}};
        mark('heatmap.frame-handoff-added-layer-staged',{layer:id,mode:transition.mode,stageOpacity:STAGE_OPACITY});
      }
      return before===undefined?baseAddLayer(next):baseAddLayer(next,before);
    };
    mark('heatmap.frame-handoff-map-patched',{});return true;
  }

  function finite(value){return Number.isFinite(+value)?+value:undefined;}
  function putNumber(out,key,value){const n=finite(value);if(n!==undefined)out[key]=n;}
  function putBoolean(out,key,value){if(typeof value==='boolean')out[key]=value;}
  function flattenNativeMemory(memory,out={}){
    const m=memory&&typeof memory==='object'?memory:{};
    for(const key of ['totalPssKb','totalPrivateDirtyKb','totalSharedDirtyKb','javaHeapPssKb','nativeHeapPssKb','codePssKb','stackPssKb','graphicsPssKb','privateOtherPssKb','systemPssKb','totalSwapPssKb','javaUsedKb','javaCommittedKb','javaMaxKb','nativeAllocatedKb','nativeHeapSizeKb','nativeHeapFreeKb','deviceAvailKb','deviceThresholdKb','memoryClassMb','largeMemoryClassMb','importance','lastTrimLevel','lru'])putNumber(out,key,m[key]);
    putBoolean(out,'deviceLowMemory',m.deviceLowMemory);
    if(typeof m.error==='string'&&m.error)out.nativeMemoryError=m.error.slice(0,160);
    return out;
  }
  function flattenMemorySnapshot(details){
    const d=details&&typeof details==='object'?details:{},out={version:VERSION,reason:String(d.reason||'snapshot').slice(0,100)};
    flattenNativeMemory(d.native,out);
    const js=d.jsHeap||{};putNumber(out,'jsUsedKb',finite(js.usedJSHeapSize)!==undefined?Math.round(+js.usedJSHeapSize/1024):undefined);putNumber(out,'jsCommittedKb',finite(js.totalJSHeapSize)!==undefined?Math.round(+js.totalJSHeapSize/1024):undefined);putNumber(out,'jsLimitKb',finite(js.jsHeapSizeLimit)!==undefined?Math.round(+js.jsHeapSizeLimit/1024):undefined);
    const canvases=d.canvases||{},byKind=canvases.byKind||{};putNumber(out,'canvasCount',canvases.count);putNumber(out,'canvasTotalKb',finite(canvases.totalBytes)!==undefined?Math.round(+canvases.totalBytes/1024):undefined);putNumber(out,'mapCanvasKb',finite(byKind.map)!==undefined?Math.round(+byKind.map/1024):undefined);putNumber(out,'domCanvasKb',finite(byKind.dom)!==undefined?Math.round(+byKind.dom/1024):undefined);putNumber(out,'normalHeatCanvasKb',finite(byKind['normal-heat-source'])!==undefined?Math.round(+byKind['normal-heat-source']/1024):undefined);putNumber(out,'inspectorHeatCanvasKb',finite(byKind['inspector-heat-source'])!==undefined?Math.round(+byKind['inspector-heat-source']/1024):undefined);
    const tiers=d.tierCacheEstimate||{},decoded=d.decodedCacheEstimate||{},workers=d.workers||{},heat=d.heat||{};putNumber(out,'tierCacheEstimatedKb',finite(tiers.estimatedBytes)!==undefined?Math.round(+tiers.estimatedBytes/1024):undefined);putNumber(out,'decodedCacheEstimatedKb',finite(decoded.estimatedBytes)!==undefined?Math.round(+decoded.estimatedBytes/1024):undefined);putNumber(out,'decodedCacheCount',decoded.count);putNumber(out,'foregroundWorkerCount',workers.foregroundCount);putBoolean(out,'backgroundWorkerActive',workers.backgroundActive);if(typeof heat.inspectorMode==='string')out.inspectorMode=heat.inspectorMode.slice(0,20);putBoolean(out,'cacheAuthority',heat.cacheAuthority);
    return out;
  }
  function wrapDiagnostics(){
    const diag=window.PadGradeDiag;if(!diag||typeof diag.mark!=='function'||diag.__padGradeV115MemoryWrapped)return false;
    const original=diag.mark.bind(diag);diag.__padGradeV115MemoryWrapped=true;
    diag.mark=function(name,details){
      if(name==='memory.snapshot')return original(name,flattenMemorySnapshot(details));
      return original(name,details);
    };
    diagWrapped=true;mark('memory.export-repair-installed',{version:VERSION,format:'flat-scalar-fields'});return true;
  }
  function importLifecycleMemory(){
    try{
      const bridge=window.PadGradeLifecycle;if(!bridge?.getEvents)return false;
      const events=JSON.parse(bridge.getEvents()||'[]');if(!Array.isArray(events))return false;
      let last=Number(localStorage.getItem(LIFECYCLE_MEMORY_KEY)||0),max=last;
      for(const item of events){
        const seq=Number(item?.seq)||0;if(seq<=last)continue;max=Math.max(max,seq);
        if(!item?.memory||typeof item.memory!=='object')continue;
        const out={seq,pid:Number(item?.pid)||0,event:String(item?.event||'lifecycle').slice(0,80),savedState:item?.savedState===true};
        if(Number.isFinite(+item?.trimLevel))out.trimLevel=+item.trimLevel;
        if(typeof item?.rendererCrash==='boolean')out.rendererCrash=item.rendererCrash;
        flattenNativeMemory(item.memory,out);
        mark('android.memory.lifecycle',out);
      }
      if(max>last)localStorage.setItem(LIFECYCLE_MEMORY_KEY,String(max));
      return true;
    }catch(e){mark('android.memory.lifecycle-import-failed',{error:String(e?.message||e).slice(0,140)});return false;}
  }

  function handleCaptureClick(event){
    const inspector=event.target?.closest?.('#pg113ResolutionInspector button[data-mode]');
    if(inspector){
      const mode=String(inspector.dataset.mode||'auto');
      if(inspector.classList.contains('primary')&&!transition)return;
      beginTransition(mode);return;
    }
    const projectOpen=event.target?.closest?.('button[data-act="open"]');
    if(projectOpen&&transition)cancelTransition('project-switch-start',false);
  }

  function attach(){patchMap(mapInstance());wrapDiagnostics();importLifecycleMemory();}
  function boot(){
    document.title=`Pad Grade Mapper v${VERSION} DEV`;
    attach();
    document.addEventListener('click',handleCaptureClick,true);
    document.addEventListener('change',event=>{if(event.target?.id==='heatmapToggle'&&!event.target.checked)cancelTransition('heatmap-disabled',true);},true);
    window.addEventListener('padgrade-primary-map-captured',event=>{cancelTransition('map-captured',false);patchMap(event?.detail?.map||mapInstance());});
    window.addEventListener('padgrade-map-created',event=>{cancelTransition('map-created',false);patchMap(event?.detail?.map||mapInstance());});
    window.addEventListener('padgrade-active-project-applied',()=>cancelTransition('project-applied',false));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancelTransition('hidden',true);else setTimeout(importLifecycleMemory,0);});
    setTimeout(()=>{attach();try{window.pgDiagnosticMemorySnapshot?.('v115-export-check');}catch(e){}},250);
    lifecycleTimer=setInterval(()=>{attach();importLifecycleMemory();},1500);
    window.addEventListener('beforeunload',()=>{if(pollTimer)clearTimeout(pollTimer);if(lifecycleTimer)clearInterval(lifecycleTimer);cancelTransition('beforeunload',false);},{once:true});
    window.__padGradeV115HeatHandoffPolicy='reuse-current-raster-as-hold-stage-target-near-zero-render-once-hard-paint-swap-no-crossfade-no-bare-map';
    window.__padGradeV115MemoryPolicy='flatten-v114-current-snapshots-and-persisted-android-lifecycle-memory-into-export-safe-scalars-no-auto-trim';
    mark('v115.installed',{version:VERSION,heatPolicy:window.__padGradeV115HeatHandoffPolicy,memoryPolicy:window.__padGradeV115MemoryPolicy});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
