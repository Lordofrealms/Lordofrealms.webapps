/* Pad Grade v1.1.6 DEV — background GPS/imagery suspension + two-barrier heat handoff.
 *
 * Background policy is intentionally narrow: pause active geolocation watches and remove
 * only USGS raster imagery layers/sources. Keep MapLibre instances, project/grid/heat
 * state, cached heat rasters, and all authoritative project data intact.
 */
(function installPadGrade116Dev(){
  'use strict';
  if(window.__padGradeDevV116)return;
  window.__padGradeDevV116=true;

  const VERSION='1.1.6';
  const STAGE_OPACITY=0.000001;
  const HOLD_LAYER_ID='pad-grade-v116-heat-handoff-hold';
  const NORMAL_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const IMAGERY={
    primary:{sources:['usgs-cached-imagery','usgs-naip-plus'],layers:['usgs-cached','usgs-highres']},
    compare:{sources:['pg-compare-usgs-cached','pg-compare-usgs-naip'],layers:['pg-compare-usgs-cached-layer','pg-compare-usgs-highres-layer']}
  };

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const memorySnapshot=reason=>{try{return window.pgDiagnosticMemorySnapshot?.(reason);}catch(e){return null;}};
  const primaryMap=()=>window.__padGradeMapInstance||null;
  const compareMap=()=>window.__padGradeCompareMapInstance||null;
  const isNormalLayer=id=>String(id||'').startsWith(NORMAL_LAYER_PREFIX);
  const isInspectLayer=id=>String(id||'').startsWith(INSPECT_LAYER_PREFIX);
  const isHeatLayer=id=>isNormalLayer(id)||isInspectLayer(id);
  const isImagerySource=id=>IMAGERY.primary.sources.includes(String(id||''))||IMAGERY.compare.sources.includes(String(id||''));
  const isImageryLayer=id=>IMAGERY.primary.layers.includes(String(id||''))||IMAGERY.compare.layers.includes(String(id||''));
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(e){return null;}};

  let heatTransition=null;
  let heatSerial=0;
  let syntheticInspectorClick=false;
  let hidden=false;
  let compareCtorPatched=false;
  const suspendedMapImagery=new Map();

  // Suspendable geolocation watch wrapper. The app keeps stable virtual watch IDs,
  // while real underlying Android/WebView/Precision Location subscriptions can be
  // released completely whenever the document is hidden.
  let geoInstalled=false;
  let geoSuspended=false;
  let nextVirtualWatchId=1000000;
  const geoWatches=new Map();
  let geoBase=null;

  function installSuspendableGeolocation(){
    if(geoInstalled)return true;
    const geo=navigator.geolocation;
    if(!geo||typeof geo.watchPosition!=='function'||typeof geo.clearWatch!=='function')return false;
    geoInstalled=true;
    geoBase={object:geo,watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo)};
    function startUnderlying(record){
      if(!record||geoSuspended||record.underlyingId!=null)return;
      try{
        record.underlyingId=geoBase.watch(
          pos=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.success?.(pos);},
          err=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.error?.(err);},
          record.options
        );
      }catch(e){record.underlyingId=null;try{record.error?.(e);}catch(_){} }
    }
    try{
      geo.watchPosition=function(success,error,options){
        const virtualId=nextVirtualWatchId++;
        const record={virtualId,underlyingId:null,success,error,options:options||{}};
        geoWatches.set(virtualId,record);
        startUnderlying(record);
        mark('background.gps-watch-registered',{virtualId,activeUnderlying:record.underlyingId!=null,totalVirtual:geoWatches.size});
        return virtualId;
      };
      geo.clearWatch=function(id){
        const record=geoWatches.get(id);
        if(!record)return geoBase.clear(id);
        geoWatches.delete(id);
        if(record.underlyingId!=null){try{geoBase.clear(record.underlyingId);}catch(e){}record.underlyingId=null;}
        mark('background.gps-watch-cleared',{virtualId:id,totalVirtual:geoWatches.size});
      };
    }catch(e){geoInstalled=false;geoBase=null;return false;}
    window.__padGradeV116GpsWatchState=()=>({installed:geoInstalled,suspended:geoSuspended,virtualWatches:geoWatches.size,activeUnderlying:[...geoWatches.values()].filter(r=>r.underlyingId!=null).length});
    mark('background.gps-wrapper-installed',{version:VERSION});
    return true;
  }

  function suspendGpsWatches(){
    installSuspendableGeolocation();
    geoSuspended=true;
    let stopped=0;
    if(geoBase){
      for(const record of geoWatches.values())if(record.underlyingId!=null){
        try{geoBase.clear(record.underlyingId);}catch(e){}
        record.underlyingId=null;stopped++;
      }
    }
    mark('background.gps-suspended',{stopped,registered:geoWatches.size});
    return stopped;
  }

  function resumeGpsWatches(){
    if(!geoInstalled||!geoBase)return 0;
    geoSuspended=false;
    let restarted=0;
    for(const record of geoWatches.values()){
      if(record.underlyingId==null){
        try{
          record.underlyingId=geoBase.watch(
            pos=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.success?.(pos);},
            err=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.error?.(err);},
            record.options
          );
          restarted++;
        }catch(e){record.underlyingId=null;}
      }
    }
    mark('background.gps-resumed',{restarted,registered:geoWatches.size});
    return restarted;
  }

  function cancelCornerCaptureForBackground(){
    let cancelled=false;
    try{
      if(typeof activeCornerCapture!=='undefined'&&activeCornerCapture){
        activeCornerCapture=null;cancelled=true;
        if(typeof captureProgressTimer!=='undefined'&&captureProgressTimer){clearInterval(captureProgressTimer);captureProgressTimer=null;}
        if(typeof gpsErrorText!=='undefined')gpsErrorText='Corner capture paused because Pad Grade was minimized. Capture the corner again.';
        try{typeof updateGpsUI==='function'&&updateGpsUI();}catch(e){}
      }
    }catch(e){}
    if(cancelled)mark('background.corner-capture-cancelled',{});
    return cancelled;
  }

  // Imagery suspend / restore. This deliberately removes raster layers and their
  // raster sources rather than destroying either MapLibre instance.
  function patchMapForSuspension(map,label){
    if(!map||map.__padGradeV116BackgroundPatched)return false;
    map.__padGradeV116BackgroundPatched=true;
    const addSource=map.addSource?.bind(map),addLayer=map.addLayer?.bind(map);
    if(addSource)map.addSource=function(id,source){
      if(window.__padGradeImagerySuspendedV116===true&&isImagerySource(id)){
        mark('background.imagery-add-blocked',{map:label,kind:'source',id:String(id)});return this;
      }
      return addSource(id,source);
    };
    if(addLayer)map.addLayer=function(layer,before){
      const id=String(layer?.id||'');
      if(window.__padGradeImagerySuspendedV116===true&&isImageryLayer(id)){
        mark('background.imagery-add-blocked',{map:label,kind:'layer',id});return this;
      }
      return before===undefined?addLayer(layer):addLayer(layer,before);
    };
    mark('background.map-suspend-patched',{map:label});
    return true;
  }

  function styleLayer(map,id){try{return clone((map.getStyle?.()?.layers||[]).find(layer=>layer?.id===id)||null);}catch(e){return null;}}
  function styleSource(map,id){try{return clone(map.getStyle?.()?.sources?.[id]||null);}catch(e){return null;}}
  function firstNonImageryLayer(map){try{return (map.getStyle?.()?.layers||[]).find(layer=>layer?.id&&!isImageryLayer(layer.id))?.id||undefined;}catch(e){return undefined;}}

  function suspendImageryForMap(map,label){
    if(!map)return null;
    patchMapForSuspension(map,label);
    const ids=IMAGERY[label];if(!ids)return null;
    const record={label,map,anchor:firstNonImageryLayer(map),sources:{},layers:{},removedSources:0,removedLayers:0};
    for(const id of ids.sources){const def=styleSource(map,id);if(def)record.sources[id]=def;}
    for(const id of ids.layers){const def=styleLayer(map,id);if(def)record.layers[id]=def;}
    for(const id of [...ids.layers].reverse())try{if(map.getLayer?.(id)){map.removeLayer(id);record.removedLayers++;}}catch(e){}
    for(const id of [...ids.sources].reverse())try{if(map.getSource?.(id)){map.removeSource(id);record.removedSources++;}}catch(e){}
    try{map.triggerRepaint?.();}catch(e){}
    suspendedMapImagery.set(map,record);
    mark('background.imagery-unloaded',{map:label,removedLayers:record.removedLayers,removedSources:record.removedSources});
    return record;
  }

  function restoreImageryRecord(record,currentMap){
    if(!record||!currentMap||record.map!==currentMap)return false;
    const {label}=record,ids=IMAGERY[label];if(!ids)return false;
    patchMapForSuspension(currentMap,label);
    let sources=0,layers=0;
    for(const id of ids.sources){
      if(currentMap.getSource?.(id))continue;
      const def=record.sources[id];if(!def)continue;
      try{currentMap.addSource(id,clone(def));sources++;}catch(e){}
    }
    const before=record.anchor&&currentMap.getLayer?.(record.anchor)?record.anchor:firstNonImageryLayer(currentMap);
    for(const id of ids.layers){
      if(currentMap.getLayer?.(id))continue;
      const def=record.layers[id];if(!def||!currentMap.getSource?.(def.source))continue;
      try{before?currentMap.addLayer(clone(def),before):currentMap.addLayer(clone(def));layers++;}catch(e){}
    }
    try{currentMap.triggerRepaint?.();}catch(e){}
    mark('background.imagery-restored',{map:label,sources,layers});
    return true;
  }

  function suspendAllImagery(){
    window.__padGradeImagerySuspendedV116=true;
    const p=primaryMap(),c=compareMap();
    if(p)suspendImageryForMap(p,'primary');
    if(c&&c!==p)suspendImageryForMap(c,'compare');
  }
  function restoreAllImagery(){
    window.__padGradeImagerySuspendedV116=false;
    const p=primaryMap(),c=compareMap();
    for(const [map,record] of [...suspendedMapImagery.entries()]){
      const current=record.label==='primary'?p:c;
      restoreImageryRecord(record,current);
      suspendedMapImagery.delete(map);
    }
  }

  // The primary map remains owned by the existing map-instance hook. This wrapper
  // only exposes the deliberately separate comparison map so both imagery stacks
  // can be suspended without creating or retaining any extra map instance.
  function installCompareMapCapture(){
    if(compareCtorPatched||!window.maplibregl?.Map)return false;
    compareCtorPatched=true;
    const Base=window.maplibregl.Map;
    class PadGradeV116Map extends Base{
      constructor(options){
        super(options);
        const container=options?.container,containerId=typeof container==='string'?container:container?.id;
        if(containerId==='pgCompareMap'){
          window.__padGradeCompareMapInstance=this;
          patchMapForSuspension(this,'compare');
          const baseRemove=this.remove?.bind(this);
          if(baseRemove)this.remove=()=>{if(window.__padGradeCompareMapInstance===this)window.__padGradeCompareMapInstance=null;return baseRemove();};
          mark('background.compare-map-captured',{});
        }else if(containerId==='gpsMap')patchMapForSuspension(this,'primary');
      }
    }
    try{Object.setPrototypeOf(PadGradeV116Map,Base);}catch(e){}
    try{window.maplibregl.Map=PadGradeV116Map;}catch(e){compareCtorPatched=false;return false;}
    mark('background.map-constructor-capture-installed',{});
    return true;
  }

  // Two-render-barrier exact heat resolution handoff.
  function layoutVisible(map,id){try{return !!map?.getLayer?.(id)&&map.getLayoutProperty(id,'visibility')!=='none';}catch(e){return false;}}
  function opacity(map,id,fallback=.58){try{const value=map.getPaintProperty(id,'raster-opacity');if(Number.isFinite(+value))return +value;}catch(e){}return fallback;}
  function heatOpacity(){try{const value=typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;return Number.isFinite(+value)?+value:.58;}catch(e){return .58;}}
  function heatLayerIds(map){try{return (map.getStyle?.()?.layers||[]).map(layer=>layer?.id||'').filter(isHeatLayer);}catch(e){return [];}}
  function currentHeatLayer(map){const visible=heatLayerIds(map).filter(id=>layoutVisible(map,id)&&opacity(map,id,0)>.02);return visible[visible.length-1]||'';}
  function targetLayer(map,mode){
    if(mode!=='auto'){const id=`${INSPECT_LAYER_PREFIX}${mode}`;return map?.getLayer?.(id)&&layoutVisible(map,id)?id:'';}
    const visible=heatLayerIds(map).filter(isNormalLayer).filter(id=>layoutVisible(map,id));
    return visible[visible.length-1]||'';
  }
  function nextLayerId(map,id){try{const layers=map.getStyle?.()?.layers||[],index=layers.findIndex(layer=>layer?.id===id);return index>=0&&index+1<layers.length?layers[index+1]?.id||undefined:undefined;}catch(e){return undefined;}}
  function waitRender(map,callback,timeout=220){
    let done=false,timer=null;
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);requestAnimationFrame(callback);};
    try{map.once?.('render',finish);map.triggerRepaint?.();timer=setTimeout(finish,timeout);}catch(e){requestAnimationFrame(callback);}
  }
  function rememberOpacity(state,map,id){if(!id||!map?.getLayer?.(id)||state.opacities.has(id))return;state.opacities.set(id,opacity(map,id,heatOpacity()));}
  function stageLayer(state,map,id){if(!id||!map?.getLayer?.(id))return false;rememberOpacity(state,map,id);try{map.setPaintProperty(id,'raster-fade-duration',0);map.setPaintProperty(id,'raster-opacity',STAGE_OPACITY);return true;}catch(e){return false;}}
  function shouldStageTarget(state,id){return state&&((state.mode==='auto'&&isNormalLayer(id))||id===`${INSPECT_LAYER_PREFIX}${state.mode}`);}

  function patchPrimaryHeatAddLayer(map){
    if(!map||map.__padGradeV116HeatPatched)return false;
    map.__padGradeV116HeatPatched=true;
    const addLayer=map.addLayer.bind(map);
    map.addLayer=function(layer,before){
      let next=layer,id=String(layer?.id||'');
      if(heatTransition&&heatTransition.map===this&&heatTransition.targetPhase&&shouldStageTarget(heatTransition,id)){
        const original=Number.isFinite(+layer?.paint?.['raster-opacity'])?+layer.paint['raster-opacity']:heatOpacity();
        heatTransition.opacities.set(id,original);
        next={...layer,paint:{...(layer?.paint||{}),'raster-opacity':STAGE_OPACITY,'raster-fade-duration':0}};
        mark('heatmap.v116-target-added-staged',{mode:heatTransition.mode,layer:id});
      }
      return before===undefined?addLayer(next):addLayer(next,before);
    };
    return true;
  }

  function cleanupHeatTransition(state,keepTarget){
    const map=state?.map;if(!map)return;
    if(state.poll){clearTimeout(state.poll);state.poll=null;}
    for(const [id,value] of state.opacities){
      if(id===keepTarget||!map.getLayer?.(id))continue;
      try{map.setPaintProperty(id,'raster-fade-duration',0);map.setPaintProperty(id,'raster-opacity',value);}catch(e){}
    }
    try{if(map.getLayer(HOLD_LAYER_ID))map.removeLayer(HOLD_LAYER_ID);}catch(e){}
    if(state.oldSource&&String(state.oldSource).startsWith(INSPECT_SOURCE_PREFIX)){
      try{const used=(map.getStyle?.()?.layers||[]).some(layer=>layer?.source===state.oldSource);if(!used&&map.getSource?.(state.oldSource))map.removeSource(state.oldSource);}catch(e){}
    }
    try{map.triggerRepaint?.();}catch(e){}
  }

  function cancelHeatTransition(reason){
    const state=heatTransition;if(!state)return;
    heatTransition=null;
    const map=state.map;
    if(map){
      try{if(state.oldId&&map.getLayer?.(state.oldId))map.setPaintProperty(state.oldId,'raster-opacity',state.oldOpacity);}catch(e){}
      cleanupHeatTransition(state,'');
    }
    mark('heatmap.v116-handoff-cancelled',{reason,mode:state.mode,elapsedMs:+(now()-state.startedAt).toFixed(1)});
  }

  function stageExistingTargetCandidates(state){
    const map=state.map;
    if(state.mode==='auto')for(const id of heatLayerIds(map).filter(isNormalLayer))stageLayer(state,map,id);
    else stageLayer(state,map,`${INSPECT_LAYER_PREFIX}${state.mode}`);
  }

  function dispatchInspectorTarget(state){
    if(heatTransition!==state)return;
    state.targetPhase=true;
    stageExistingTargetCandidates(state);
    syntheticInspectorClick=true;
    try{
      // v1.1.5's capture handler treats an already-primary button as a no-op.
      // Marking it here suppresses that superseded handoff while letting v1.1.3's
      // real target renderer run normally on this delayed synthetic click.
      state.button.classList.add('primary');
      state.button.click();
    }finally{syntheticInspectorClick=false;}
    stageExistingTargetCandidates(state);
    mark('heatmap.v116-target-requested',{mode:state.mode});
    waitForTarget(state);
  }

  function waitForTarget(state){
    if(heatTransition!==state)return;
    const map=state.map,target=targetLayer(map,state.mode);
    if(target){
      stageLayer(state,map,target);
      if(state.warmingTarget===target)return;
      state.warmingTarget=target;
      mark('heatmap.v116-target-warm-start',{mode:state.mode,target});
      waitRender(map,()=>{
        if(heatTransition!==state||!map.getLayer?.(target))return;
        const targetOpacity=state.opacities.get(target)??heatOpacity();
        try{
          map.setPaintProperty(target,'raster-fade-duration',0);
          map.setPaintProperty(target,'raster-opacity',targetOpacity);
          if(map.getLayer(HOLD_LAYER_ID))map.setPaintProperty(HOLD_LAYER_ID,'raster-opacity',0);
          map.triggerRepaint?.();
        }catch(e){cancelHeatTransition('target-commit-error');return;}
        mark('heatmap.v116-target-committed',{mode:state.mode,target,elapsedMs:+(now()-state.startedAt).toFixed(1)});
        waitRender(map,()=>{
          if(heatTransition!==state)return;
          heatTransition=null;cleanupHeatTransition(state,target);
          mark('heatmap.v116-handoff-complete',{mode:state.mode,target,elapsedMs:+(now()-state.startedAt).toFixed(1)});
        });
      });
      return;
    }
    if(now()-state.lastWaitingMark>1000){state.lastWaitingMark=now();mark('heatmap.v116-target-waiting',{mode:state.mode});}
    state.poll=setTimeout(()=>waitForTarget(state),24);
  }

  function beginTwoBarrierHandoff(mode,button){
    const map=primaryMap();if(!map||!button)return false;
    cancelHeatTransition('superseded');
    patchPrimaryHeatAddLayer(map);
    const oldId=currentHeatLayer(map);
    if(!oldId){syntheticInspectorClick=true;try{button.classList.add('primary');button.click();}finally{syntheticInspectorClick=false;}return true;}
    const oldLayer=map.getLayer(oldId),oldSource=oldLayer?.source;if(!oldSource)return false;
    const state={serial:++heatSerial,map,mode:String(mode),button,oldId,oldSource:String(oldSource),oldOpacity:opacity(map,oldId,heatOpacity()),opacities:new Map(),targetPhase:false,warmingTarget:'',startedAt:now(),lastWaitingMark:0,poll:null};
    heatTransition=state;rememberOpacity(state,map,oldId);
    try{if(map.getLayer(HOLD_LAYER_ID))map.removeLayer(HOLD_LAYER_ID);}catch(e){}
    try{
      const before=nextLayerId(map,oldId);
      const hold={id:HOLD_LAYER_ID,type:'raster',source:oldSource,paint:{'raster-opacity':STAGE_OPACITY,'raster-fade-duration':0}};
      before?map.addLayer(hold,before):map.addLayer(hold);
      map.triggerRepaint?.();
    }catch(e){heatTransition=null;return false;}
    mark('heatmap.v116-hold-warm-start',{mode:state.mode,from:oldId});
    // Barrier 1: render the same-source hold once while the original remains fully visible.
    waitRender(map,()=>{
      if(heatTransition!==state)return;
      try{
        map.setPaintProperty(HOLD_LAYER_ID,'raster-opacity',state.oldOpacity);
        if(map.getLayer(oldId))map.setPaintProperty(oldId,'raster-opacity',0);
        map.triggerRepaint?.();
      }catch(e){cancelHeatTransition('hold-commit-error');return;}
      mark('heatmap.v116-hold-committed',{mode:state.mode,from:oldId});
      // Barrier 2: confirm the full-opacity hold painted before the real inspector
      // click is allowed to hide/remove the original or create/show the target tier.
      waitRender(map,()=>{if(heatTransition===state)dispatchInspectorTarget(state);});
    });
    return true;
  }

  // Register synchronously while parsing. v1.1.5 installs its capture listener only
  // at DOMContentLoaded, so this can delay the real inspector click until both hold
  // render barriers have completed.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#pg113ResolutionInspector button[data-mode]');
    if(!button)return;
    if(syntheticInspectorClick){button.classList.add('primary');return;}
    if(button.classList.contains('primary')&&!heatTransition)return;
    event.preventDefault();event.stopImmediatePropagation();
    beginTwoBarrierHandoff(button.dataset.mode||'auto',button);
  },true);

  // Visibility lifecycle: measure baseline, suspend GPS, then unload imagery. No heat
  // canvases/caches, grid layers, project state, or MapLibre instances are discarded.
  function onHidden(){
    if(hidden)return;hidden=true;
    cancelHeatTransition('background-hidden');
    memorySnapshot('v116-background-before-suspend');
    const cornerCancelled=cancelCornerCaptureForBackground();
    const gpsStopped=suspendGpsWatches();
    memorySnapshot('v116-background-after-gps-suspend');
    suspendAllImagery();
    memorySnapshot('v116-background-after-imagery-unload');
    setTimeout(()=>memorySnapshot('v116-background-after-imagery-unload-settled'),900);
    mark('background.suspend-complete',{gpsStopped,cornerCancelled,primaryImagery:!!primaryMap(),compareImagery:!!compareMap()});
  }
  function onVisible(){
    if(!hidden)return;hidden=false;
    memorySnapshot('v116-resume-before-restore');
    restoreAllImagery();
    memorySnapshot('v116-resume-after-imagery-restore');
    const gpsRestarted=resumeGpsWatches();
    memorySnapshot('v116-resume-after-gps-restore');
    setTimeout(()=>memorySnapshot('v116-resume-restored-settled'),900);
    mark('background.resume-complete',{gpsRestarted,primaryImagery:!!primaryMap(),compareImagery:!!compareMap()});
  }

  function boot(){
    document.title=`Pad Grade Mapper v${VERSION} DEV`;
    installSuspendableGeolocation();
    patchMapForSuspension(primaryMap(),'primary');
    patchPrimaryHeatAddLayer(primaryMap());
    window.addEventListener('padgrade-primary-map-captured',event=>{const map=event?.detail?.map||primaryMap();patchMapForSuspension(map,'primary');setTimeout(()=>patchPrimaryHeatAddLayer(map),0);});
    window.addEventListener('padgrade-map-created',event=>{const map=event?.detail?.map||primaryMap();patchMapForSuspension(map,'primary');setTimeout(()=>patchPrimaryHeatAddLayer(map),0);});
    window.addEventListener('padgrade-map-runtime-ready',()=>{installCompareMapCapture();patchMapForSuspension(primaryMap(),'primary');patchPrimaryHeatAddLayer(primaryMap());});
    window.addEventListener('padgrade-active-project-applied',()=>cancelHeatTransition('project-applied'));
    document.addEventListener('click',event=>{if(event.target?.closest?.('button[data-act="open"]'))cancelHeatTransition('project-switch-start');},true);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')onHidden();else onVisible();});
    window.addEventListener('beforeunload',()=>{cancelHeatTransition('beforeunload');suspendGpsWatches();},{once:true});
    window.__padGradeV116BackgroundPolicy='pause-active-geolocation-watches-unload-usgs-raster-sources-layers-keep-map-project-grid-heat-state-restore-on-visible';
    window.__padGradeV116HeatPolicy='block-real-inspector-click-warm-same-source-hold-render-old-to-hold-render-request-target-stage-render-hold-to-target-no-crossfade';
    mark('v116.installed',{version:VERSION,backgroundPolicy:window.__padGradeV116BackgroundPolicy,heatPolicy:window.__padGradeV116HeatPolicy});
    if(document.visibilityState==='hidden')onHidden();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
