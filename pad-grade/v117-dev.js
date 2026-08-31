/* Pad Grade v1.1.7 DEV — completed ImageSource heat presentation + true background WebView idle.
 *
 * Existing workers still build complete 99/297/891 rasters. This layer virtualizes the
 * legacy CanvasSource IDs so MapLibre only sees one permanent ImageSource/raster layer.
 * A completed canvas is converted to an ImageBitmap offscreen and committed atomically
 * with ImageSource.updateImage(); no live canvas is exposed while it is being painted.
 *
 * Background handling keeps the v1.1.6 GPS/USGS suspension experiment, then relies on
 * the Android host to pause the WebView/timers once Activity.onStop() is reached.
 */
(function installPadGrade117Dev(){
  'use strict';
  if(window.__padGradeDevV117)return;
  window.__padGradeDevV117=true;
  // v1.1.7 replaces the superseded v1.1.5/v1.1.6 heat handoff runtimes.
  // Their script tags remain for compatibility/CI history, but their IIFEs see
  // these guards and return before installing click/timer/map wrappers.
  window.__padGradeDevV115=true;
  window.__padGradeDevV116=true;
  window.__padGradeV117OwnsHeatPresentation=true;

  const VERSION='1.1.7';
  const NORMAL_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const NORMAL_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const LEGACY_HOLD_IDS=new Set(['pad-grade-v115-heat-handoff-hold','pad-grade-v116-heat-handoff-hold']);
  const IMAGE_SOURCE_ID='pad-grade-v117-heat-image-source';
  const IMAGE_LAYER_ID='pad-grade-v117-heat-image-layer';
  const TIERS=Object.freeze([99,297,891]);
  const LIFECYCLE_MEMORY_KEY='padGradeLifecycleMemoryImportedSeqV117';
  const EXIT_IMPORT_KEY='padGradeLifecycleExitImportedSeqV117';
  const IMAGERY={
    primary:{sources:['usgs-cached-imagery','usgs-naip-plus'],layers:['usgs-cached','usgs-highres']},
    compare:{sources:['pg-compare-usgs-cached','pg-compare-usgs-naip'],layers:['pg-compare-usgs-cached-layer','pg-compare-usgs-highres-layer']}
  };

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const rawMark=()=>window.PadGradeDiag&&typeof window.PadGradeDiag.mark==='function'?window.PadGradeDiag.mark.bind(window.PadGradeDiag):null;
  function mark(name,details){try{rawMark()?.(name,details);}catch(e){}}
  const memorySnapshot=reason=>{try{return window.pgDiagnosticMemorySnapshot?.(reason);}catch(e){return null;}};
  const primaryMap=()=>window.__padGradeMapInstance||null;
  const compareMap=()=>window.__padGradeCompareMapInstance||null;
  const heatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !t||!!t.checked;};
  const heatOpacity=()=>{try{const n=typeof window.pgHeatmapOpacity==='function'?+window.pgHeatmapOpacity():.58;return Number.isFinite(n)?n:.58;}catch(e){return .58;}};
  const isNormalSource=id=>String(id||'').startsWith(NORMAL_SOURCE_PREFIX);
  const isNormalLayer=id=>String(id||'').startsWith(NORMAL_LAYER_PREFIX);
  const isInspectSource=id=>String(id||'').startsWith(INSPECT_SOURCE_PREFIX);
  const isInspectLayer=id=>String(id||'').startsWith(INSPECT_LAYER_PREFIX);
  const isVirtualHeatSource=id=>isNormalSource(id)||isInspectSource(id);
  const isVirtualHeatLayer=id=>isNormalLayer(id)||isInspectLayer(id)||LEGACY_HOLD_IDS.has(String(id||''));
  const clone=value=>{try{return JSON.parse(JSON.stringify(value));}catch(e){return value;}};

  let inspectorMode='auto';
  let normalGeneration=0;
  let bestNormalTier=0;
  let projectSerial=0;
  let hidden=document.visibilityState==='hidden';
  let compareCtorPatched=false;
  let diagnosticsWrapped=false;
  const suspendedMapImagery=new Map();

  function resolutionFor(tier){
    try{
      if(typeof cfg!=='function')return null;
      const s=cfg(),longest=Math.max(+s.width||0,+s.length||0,1);
      const cols=Math.max(2,Math.round(+s.cols||2)),rows=Math.max(2,Math.round(+s.rows||2));
      return {
        nx:Math.max((cols-1)*3+1,Math.round(tier*(+s.width||0)/longest)),
        ny:Math.max((rows-1)*3+1,Math.round(tier*(+s.length||0)/longest))
      };
    }catch(e){return null;}
  }
  function inferTier(sourceId,canvas){
    const inspect=String(sourceId||'').match(/inspect-source-(99|297|891)$/);
    if(inspect)return +inspect[1];
    const w=+canvas?.width||0,h=+canvas?.height||0;
    let best=0,score=Infinity;
    for(const tier of TIERS){
      const r=resolutionFor(tier);if(!r)continue;
      const d=Math.abs(r.nx-w)+Math.abs(r.ny-h);
      if(d<score){score=d;best=tier;}
    }
    return best;
  }
  function cloneCoords(coords){
    if(!Array.isArray(coords)||coords.length!==4)return null;
    const out=coords.map(p=>Array.isArray(p)&&p.length>=2?[+p[0],+p[1]]:null);
    return out.every(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?out:null;
  }
  function layerAnchor(map){
    try{
      for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer']){
        if(map.__padGradeV117BaseGetLayer?.(id))return id;
      }
    }catch(e){}
    return undefined;
  }

  function closeFrame(frame){
    try{if(frame?.bitmap&&typeof frame.bitmap.close==='function')frame.bitmap.close();}catch(e){}
  }
  async function decodeCompletedCanvas(canvas){
    if(!canvas)return null;
    if(typeof createImageBitmap==='function'){
      try{
        const bitmap=await createImageBitmap(canvas);
        return {image:bitmap,bitmap,kind:'ImageBitmap',width:+canvas.width||0,height:+canvas.height||0};
      }catch(e){
        mark('heatmap.v117-bitmap-fallback',{error:String(e?.message||e).slice(0,140)});
      }
    }
    return {image:canvas,bitmap:null,kind:'HTMLCanvasElement',width:+canvas.width||0,height:+canvas.height||0};
  }

  function mapState(map){
    if(!map)return null;
    if(map.__padGradeV117HeatState)return map.__padGradeV117HeatState;
    return patchPrimaryMap(map)?map.__padGradeV117HeatState:null;
  }

  function canonicalVisible(state,visible){
    const map=state?.map;if(!map)return;
    try{
      if(state.baseGetLayer(IMAGE_LAYER_ID))state.baseSetLayoutProperty(IMAGE_LAYER_ID,'visibility',visible?'visible':'none');
      state.canonicalVisible=!!visible;
      map.triggerRepaint?.();
    }catch(e){}
  }

  function ensureCanonical(state,coords){
    const map=state.map;
    try{
      if(!state.baseGetSource(IMAGE_SOURCE_ID)){
        state.baseAddSource(IMAGE_SOURCE_ID,{type:'image',coordinates:coords});
        mark('heatmap.v117-image-source-created',{source:IMAGE_SOURCE_ID});
      }
      if(!state.baseGetLayer(IMAGE_LAYER_ID)){
        const layer={id:IMAGE_LAYER_ID,type:'raster',source:IMAGE_SOURCE_ID,layout:{visibility:'none'},paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}};
        const before=layerAnchor(map);
        before?state.baseAddLayer(layer,before):state.baseAddLayer(layer);
        mark('heatmap.v117-image-layer-created',{layer:IMAGE_LAYER_ID});
      }
      const source=state.baseGetSource(IMAGE_SOURCE_ID);
      source?.setCoordinates?.(coords);
      state.baseSetPaintProperty(IMAGE_LAYER_ID,'raster-fade-duration',0);
      state.baseSetPaintProperty(IMAGE_LAYER_ID,'raster-opacity',heatOpacity());
      return source||null;
    }catch(e){
      mark('heatmap.v117-canonical-create-failed',{error:String(e?.message||e).slice(0,160)});
      return null;
    }
  }

  function layerEligible(state,layerId){
    const layer=state.virtualLayers.get(layerId);if(!layer||layer.layout.visibility==='none')return false;
    if(!heatEnabled()||hidden)return false;
    if(isInspectLayer(layerId))return inspectorMode!=='auto'&&layerId===`${INSPECT_LAYER_PREFIX}${inspectorMode}`;
    if(isNormalLayer(layerId))return inspectorMode==='auto';
    return false;
  }

  function candidateLayers(state){
    const list=[];
    for(const [id,layer] of state.virtualLayers){
      if(!layerEligible(state,id))continue;
      const source=state.virtualSources.get(layer.source);if(!source?.framePromise)continue;
      list.push({id,layer,source});
    }
    return list;
  }

  function chooseCandidate(state){
    const list=candidateLayers(state);if(!list.length)return null;
    if(inspectorMode!=='auto'){
      return list.find(x=>x.id===`${INSPECT_LAYER_PREFIX}${inspectorMode}`)||null;
    }
    list.sort((a,b)=>(a.source.tier||0)-(b.source.tier||0)||a.source.serial-b.source.serial);
    return list[list.length-1]||null;
  }

  function requestCanonicalCommit(state,reason){
    const candidate=chooseCandidate(state);
    if(!candidate){
      if(!heatEnabled()||hidden||state.projectBlank)canonicalVisible(state,false);
      return false;
    }
    const {id,source}=candidate;
    const request=++state.commitSerial;
    const expectedProject=projectSerial,expectedGeneration=normalGeneration;
    source.framePromise.then(frame=>{
      if(!frame)return;
      if(request!==state.commitSerial||expectedProject!==projectSerial||!state.virtualLayers.has(id)||!layerEligible(state,id)){
        if(frame!==source.frame)closeFrame(frame);
        mark('heatmap.v117-frame-stale',{layer:id,tier:source.tier||0,reason:'authority-moved'});
        return;
      }
      if(isNormalLayer(id)&&source.generation===expectedGeneration&&bestNormalTier&&source.tier&&source.tier<bestNormalTier){
        mark('heatmap.v117-frame-stale',{layer:id,tier:source.tier,reason:'monotonic-tier'});
        return;
      }
      const coords=cloneCoords(source.coordinates);if(!coords)return;
      const imageSource=ensureCanonical(state,coords);if(!imageSource)return;
      try{
        imageSource.updateImage({image:frame.image,coordinates:coords});
        state.baseSetPaintProperty(IMAGE_LAYER_ID,'raster-fade-duration',0);
        state.baseSetPaintProperty(IMAGE_LAYER_ID,'raster-opacity',heatOpacity());
        const previous=state.currentFrame;
        state.currentFrame=frame;state.activeVirtualLayer=id;state.activeVirtualSource=source.id;state.projectBlank=false;
        if(isNormalLayer(id)&&source.generation===normalGeneration&&source.tier)bestNormalTier=Math.max(bestNormalTier,source.tier);
        canonicalVisible(state,true);
        mark('heatmap.v117-image-committed',{layer:id,source:source.id,tier:source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,reason});
        if(previous&&previous!==frame){
          let closed=false;
          const release=()=>{if(closed)return;closed=true;closeFrame(previous);};
          try{map.once?.('render',()=>requestAnimationFrame(release));map.triggerRepaint?.();setTimeout(release,300);}catch(e){setTimeout(release,0);}
        }
      }catch(e){
        mark('heatmap.v117-image-commit-failed',{layer:id,error:String(e?.message||e).slice(0,160)});
      }
    }).catch(e=>mark('heatmap.v117-frame-decode-failed',{layer:id,error:String(e?.message||e).slice(0,160)}));
    return true;
  }

  function makeVirtualSource(state,id,spec){
    const canvas=spec?.canvas;
    const record={
      id:String(id),type:'canvas',canvas,coordinates:cloneCoords(spec?.coordinates),
      animate:spec?.animate===true,tier:inferTier(id,canvas),serial:++state.sourceSerial,
      generation:normalGeneration,frame:null,framePromise:null,removed:false
    };
    record.framePromise=decodeCompletedCanvas(canvas).then(frame=>{
      if(record.removed){closeFrame(frame);return null;}
      record.frame=frame;
      mark('heatmap.v117-frame-ready',{source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none'});
      requestCanonicalCommit(state,'frame-ready');
      return frame;
    });
    const api={
      id:record.id,type:'canvas',
      getCanvas:()=>record.canvas,
      setCoordinates:coords=>{const next=cloneCoords(coords);if(next)record.coordinates=next;if(state.activeVirtualSource===record.id)requestCanonicalCommit(state,'coordinates');return api;},
      play:()=>api,pause:()=>api,loaded:()=>true,
      serialize:()=>({type:'canvas',canvas:record.canvas,coordinates:clone(record.coordinates),animate:false})
    };
    record.api=api;
    state.virtualSources.set(record.id,record);
    mark('heatmap.v117-canvas-virtualized',{source:record.id,tier:record.tier||0,width:+canvas?.width||0,height:+canvas?.height||0});
    return api;
  }

  function makeVirtualLayer(state,layer){
    const id=String(layer?.id||'');
    const record={
      id,type:layer?.type||'raster',source:String(layer?.source||''),
      minzoom:layer?.minzoom,maxzoom:layer?.maxzoom,
      layout:{...(layer?.layout||{}),visibility:layer?.layout?.visibility||'visible'},
      paint:{...(layer?.paint||{})}
    };
    record.paint['raster-fade-duration']=0;
    state.virtualLayers.set(id,record);
    requestCanonicalCommit(state,'layer-added');
    return record;
  }

  function mergeVirtualStyle(state){
    const style=clone(state.baseGetStyle?.()||{})||{};
    style.sources={...(style.sources||{})};
    for(const [id,source] of state.virtualSources){
      style.sources[id]={type:'canvas',canvas:source.canvas,coordinates:clone(source.coordinates),animate:false};
    }
    style.layers=Array.isArray(style.layers)?style.layers.slice():[];
    const actual=new Set(style.layers.map(x=>x?.id));
    for(const layer of state.virtualLayers.values())if(!actual.has(layer.id)){
      style.layers.push({id:layer.id,type:layer.type,source:layer.source,layout:{...layer.layout},paint:{...layer.paint}});
    }
    return style;
  }

  function patchPrimaryMap(map){
    if(!map||map.__padGradeV117HeatState)return !!map;
    const state={
      map,virtualSources:new Map(),virtualLayers:new Map(),sourceSerial:0,commitSerial:0,
      activeVirtualLayer:'',activeVirtualSource:'',currentFrame:null,canonicalVisible:false,projectBlank:false,
      baseAddSource:map.addSource.bind(map),baseGetSource:map.getSource.bind(map),baseRemoveSource:map.removeSource.bind(map),
      baseAddLayer:map.addLayer.bind(map),baseGetLayer:map.getLayer.bind(map),baseRemoveLayer:map.removeLayer.bind(map),
      baseSetLayoutProperty:map.setLayoutProperty.bind(map),baseGetLayoutProperty:map.getLayoutProperty.bind(map),
      baseSetPaintProperty:map.setPaintProperty.bind(map),baseGetPaintProperty:map.getPaintProperty.bind(map),
      baseMoveLayer:map.moveLayer?.bind(map),baseGetStyle:map.getStyle?.bind(map)
    };
    map.__padGradeV117HeatState=state;
    map.__padGradeV117BaseGetLayer=state.baseGetLayer;

    map.addSource=function(id,spec){
      if(isVirtualHeatSource(id)&&spec?.type==='canvas'){makeVirtualSource(state,id,spec);return this;}
      return state.baseAddSource(id,spec);
    };
    map.getSource=function(id){
      return state.virtualSources.get(String(id||''))?.api||state.baseGetSource(id);
    };
    map.removeSource=function(id){
      id=String(id||'');
      const virtual=state.virtualSources.get(id);
      if(virtual){
        virtual.removed=true;state.virtualSources.delete(id);
        if(state.activeVirtualSource===id){state.activeVirtualSource='';state.activeVirtualLayer='';}
        if(virtual.frame&&virtual.frame!==state.currentFrame)closeFrame(virtual.frame);
        requestCanonicalCommit(state,'source-removed');
        return this;
      }
      return state.baseRemoveSource(id);
    };
    map.addLayer=function(layer,before){
      const id=String(layer?.id||'');
      if(isVirtualHeatLayer(id)||state.virtualSources.has(String(layer?.source||''))){
        makeVirtualLayer(state,layer);return this;
      }
      return before===undefined?state.baseAddLayer(layer):state.baseAddLayer(layer,before);
    };
    map.getLayer=function(id){
      const virtual=state.virtualLayers.get(String(id||''));
      if(virtual)return {id:virtual.id,type:virtual.type,source:virtual.source,minzoom:virtual.minzoom,maxzoom:virtual.maxzoom};
      return state.baseGetLayer(id);
    };
    map.removeLayer=function(id){
      id=String(id||'');
      if(state.virtualLayers.has(id)){
        state.virtualLayers.delete(id);
        if(state.activeVirtualLayer===id){state.activeVirtualLayer='';state.activeVirtualSource='';}
        requestCanonicalCommit(state,'layer-removed');
        return this;
      }
      return state.baseRemoveLayer(id);
    };
    map.setLayoutProperty=function(id,name,value){
      id=String(id||'');
      const layer=state.virtualLayers.get(id);
      if(layer){
        layer.layout[name]=value;
        requestCanonicalCommit(state,`layout-${name}`);
        return this;
      }
      return state.baseSetLayoutProperty(id,name,value);
    };
    map.getLayoutProperty=function(id,name){
      const layer=state.virtualLayers.get(String(id||''));
      if(layer)return layer.layout[name];
      return state.baseGetLayoutProperty(id,name);
    };
    map.setPaintProperty=function(id,name,value){
      id=String(id||'');
      const layer=state.virtualLayers.get(id);
      if(layer){
        layer.paint[name]=value;
        if(id===state.activeVirtualLayer&&name==='raster-opacity'&&Number.isFinite(+value)&&+value>.02){
          try{if(state.baseGetLayer(IMAGE_LAYER_ID))state.baseSetPaintProperty(IMAGE_LAYER_ID,'raster-opacity',heatOpacity());}catch(e){}
        }
        requestCanonicalCommit(state,`paint-${name}`);
        return this;
      }
      return state.baseSetPaintProperty(id,name,value);
    };
    map.getPaintProperty=function(id,name){
      const layer=state.virtualLayers.get(String(id||''));
      if(layer)return layer.paint[name];
      return state.baseGetPaintProperty(id,name);
    };
    map.moveLayer=function(id,before){
      if(state.virtualLayers.has(String(id||'')))return this;
      return state.baseMoveLayer?state.baseMoveLayer(id,before):this;
    };
    map.getStyle=function(){return mergeVirtualStyle(state);};

    // Migrate any legacy heat presentation that reached MapLibre before this module
    // attached. New work is virtualized; old actual slots are retired after capture.
    try{
      const style=state.baseGetStyle?.(),legacyLayers=(style?.layers||[]).filter(x=>isVirtualHeatLayer(x?.id));
      for(const layer of legacyLayers)try{state.baseSetLayoutProperty(layer.id,'visibility','none');}catch(e){}
    }catch(e){}
    mark('heatmap.v117-map-patched',{source:IMAGE_SOURCE_ID,layer:IMAGE_LAYER_ID});
    return true;
  }

  // --- Export-safe memory/lifecycle telemetry, carried forward from v1.1.5. ---
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
    const js=d.jsHeap||{};
    putNumber(out,'jsUsedKb',finite(js.usedJSHeapSize)!==undefined?Math.round(+js.usedJSHeapSize/1024):undefined);
    putNumber(out,'jsCommittedKb',finite(js.totalJSHeapSize)!==undefined?Math.round(+js.totalJSHeapSize/1024):undefined);
    putNumber(out,'jsLimitKb',finite(js.jsHeapSizeLimit)!==undefined?Math.round(+js.jsHeapSizeLimit/1024):undefined);
    const canvases=d.canvases||{},byKind=canvases.byKind||{};
    putNumber(out,'canvasCount',canvases.count);
    putNumber(out,'canvasTotalKb',finite(canvases.totalBytes)!==undefined?Math.round(+canvases.totalBytes/1024):undefined);
    putNumber(out,'mapCanvasKb',finite(byKind.map)!==undefined?Math.round(+byKind.map/1024):undefined);
    putNumber(out,'domCanvasKb',finite(byKind.dom)!==undefined?Math.round(+byKind.dom/1024):undefined);
    putNumber(out,'normalHeatCanvasKb',finite(byKind['normal-heat-source'])!==undefined?Math.round(+byKind['normal-heat-source']/1024):undefined);
    putNumber(out,'inspectorHeatCanvasKb',finite(byKind['inspector-heat-source'])!==undefined?Math.round(+byKind['inspector-heat-source']/1024):undefined);
    const tiers=d.tierCacheEstimate||{},decoded=d.decodedCacheEstimate||{},workers=d.workers||{},heat=d.heat||{};
    putNumber(out,'tierCacheEstimatedKb',finite(tiers.estimatedBytes)!==undefined?Math.round(+tiers.estimatedBytes/1024):undefined);
    putNumber(out,'decodedCacheEstimatedKb',finite(decoded.estimatedBytes)!==undefined?Math.round(+decoded.estimatedBytes/1024):undefined);
    putNumber(out,'decodedCacheCount',decoded.count);
    putNumber(out,'foregroundWorkerCount',workers.foregroundCount);
    putBoolean(out,'backgroundWorkerActive',workers.backgroundActive);
    if(typeof heat.inspectorMode==='string')out.inspectorMode=heat.inspectorMode.slice(0,20);
    putBoolean(out,'cacheAuthority',heat.cacheAuthority);
    return out;
  }
  function wrapDiagnostics(){
    const diag=window.PadGradeDiag;if(!diag||typeof diag.mark!=='function'||diag.__padGradeV117Wrapped)return false;
    const original=diag.mark.bind(diag);diag.__padGradeV117Wrapped=true;
    diag.mark=function(name,details){
      const next=name==='memory.snapshot'?flattenMemorySnapshot(details):details;
      const result=original(name,next);
      try{
        const map=primaryMap(),state=map?.__padGradeV117HeatState||null;
        if(name==='heatmap.regular-generation-started'){
          normalGeneration++;bestNormalTier=0;if(state)state.commitSerial++;
        }else if(name==='heatmap.inspector-mode'){
          inspectorMode=String(details?.mode||'auto');
          if(state)requestCanonicalCommit(state,'inspector-mode');
        }else if(name==='heatmap.cache-invalidated'){
          normalGeneration++;bestNormalTier=0;if(state)state.commitSerial++;
        }else if(name==='project.switch-v113-start'){
          projectSerial++;bestNormalTier=0;
          if(state){state.projectBlank=true;state.commitSerial++;canonicalVisible(state,false);}
        }else if(name==='project.switch-v113-complete'){
          if(state){state.projectBlank=false;requestCanonicalCommit(state,'project-switch-complete');}
        }
      }catch(e){}
      return result;
    };
    diagnosticsWrapped=true;
    original('memory.export-repair-installed',{version:VERSION,format:'flat-scalar-fields-v117'});
    return true;
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

  function importHistoricalExits(){
    try{
      const bridge=window.PadGradeLifecycle;if(!bridge?.getEvents)return false;
      const events=JSON.parse(bridge.getEvents()||'[]');if(!Array.isArray(events))return false;
      let last=Number(localStorage.getItem(EXIT_IMPORT_KEY)||0),max=last;
      for(const item of events){
        const seq=Number(item?.seq)||0;if(seq<=last||item?.event!=='process.previous-exit')continue;
        max=Math.max(max,seq);
        const out={
          seq,previousPid:Number(item?.previousPid)||0,processName:String(item?.processName||'').slice(0,120),
          exitReason:Number(item?.exitReason)||0,exitReasonName:String(item?.exitReasonName||'UNKNOWN').slice(0,80),
          exitStatus:Number(item?.exitStatus)||0,exitImportance:Number(item?.exitImportance)||0,
          exitPssKb:Number(item?.exitPssKb)||0,exitRssKb:Number(item?.exitRssKb)||0,
          exitTimestamp:Number(item?.exitTimestamp)||0,lowMemoryKillReportSupported:item?.lowMemoryKillReportSupported===true,
          detail:String(item?.detail||'').slice(0,180)
        };
        mark('android.process.exit-reason',out);
      }
      if(max>last)localStorage.setItem(EXIT_IMPORT_KEY,String(max));
      return true;
    }catch(e){mark('android.process.exit-reason-import-failed',{error:String(e?.message||e).slice(0,140)});return false;}
  }

  // --- v1.1.6 background GPS/imagery suspension, without its heat handoff. ---
  let geoInstalled=false,geoSuspended=false,nextVirtualWatchId=1000000,geoBase=null;
  const geoWatches=new Map();
  function installSuspendableGeolocation(){
    if(geoInstalled)return true;
    const geo=navigator.geolocation;if(!geo||typeof geo.watchPosition!=='function'||typeof geo.clearWatch!=='function')return false;
    geoInstalled=true;geoBase={watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo)};
    function start(record){
      if(!record||geoSuspended||record.underlyingId!=null)return;
      try{record.underlyingId=geoBase.watch(pos=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.error?.(err);},record.options);}
      catch(e){record.underlyingId=null;try{record.error?.(e);}catch(_){}}
    }
    try{
      geo.watchPosition=function(success,error,options){const virtualId=nextVirtualWatchId++,record={virtualId,underlyingId:null,success,error,options:options||{}};geoWatches.set(virtualId,record);start(record);mark('background.gps-watch-registered',{virtualId,activeUnderlying:record.underlyingId!=null,totalVirtual:geoWatches.size});return virtualId;};
      geo.clearWatch=function(id){const record=geoWatches.get(id);if(!record)return geoBase.clear(id);geoWatches.delete(id);if(record.underlyingId!=null){try{geoBase.clear(record.underlyingId);}catch(e){}record.underlyingId=null;}mark('background.gps-watch-cleared',{virtualId:id,totalVirtual:geoWatches.size});};
    }catch(e){geoInstalled=false;geoBase=null;return false;}
    return true;
  }
  function suspendGpsWatches(){
    installSuspendableGeolocation();geoSuspended=true;let stopped=0;
    if(geoBase)for(const record of geoWatches.values())if(record.underlyingId!=null){try{geoBase.clear(record.underlyingId);}catch(e){}record.underlyingId=null;stopped++;}
    mark('background.gps-suspended',{stopped,registered:geoWatches.size});return stopped;
  }
  function resumeGpsWatches(){
    if(!geoInstalled||!geoBase)return 0;geoSuspended=false;let restarted=0;
    for(const record of geoWatches.values())if(record.underlyingId==null){try{record.underlyingId=geoBase.watch(pos=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.error?.(err);},record.options);restarted++;}catch(e){record.underlyingId=null;}}
    mark('background.gps-resumed',{restarted,registered:geoWatches.size});return restarted;
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
    if(cancelled)mark('background.corner-capture-cancelled',{});return cancelled;
  }
  const isImagerySource=id=>IMAGERY.primary.sources.includes(String(id||''))||IMAGERY.compare.sources.includes(String(id||''));
  const isImageryLayer=id=>IMAGERY.primary.layers.includes(String(id||''))||IMAGERY.compare.layers.includes(String(id||''));
  function patchMapForSuspension(map,label){
    if(!map||map.__padGradeV117BackgroundPatched)return false;
    map.__padGradeV117BackgroundPatched=true;
    const addSource=map.addSource?.bind(map),addLayer=map.addLayer?.bind(map);
    if(addSource)map.addSource=function(id,source){if(window.__padGradeImagerySuspendedV117===true&&isImagerySource(id)){mark('background.imagery-add-blocked',{map:label,kind:'source',id:String(id)});return this;}return addSource(id,source);};
    if(addLayer)map.addLayer=function(layer,before){const id=String(layer?.id||'');if(window.__padGradeImagerySuspendedV117===true&&isImageryLayer(id)){mark('background.imagery-add-blocked',{map:label,kind:'layer',id});return this;}return before===undefined?addLayer(layer):addLayer(layer,before);};
    return true;
  }
  function styleLayer(map,id){try{return clone((map.getStyle?.()?.layers||[]).find(layer=>layer?.id===id)||null);}catch(e){return null;}}
  function styleSource(map,id){try{return clone(map.getStyle?.()?.sources?.[id]||null);}catch(e){return null;}}
  function firstNonImageryLayer(map){try{return (map.getStyle?.()?.layers||[]).find(layer=>layer?.id&&!isImageryLayer(layer.id))?.id||undefined;}catch(e){return undefined;}}
  function suspendImageryForMap(map,label){
    if(!map)return null;patchMapForSuspension(map,label);const ids=IMAGERY[label];if(!ids)return null;
    const record={label,map,anchor:firstNonImageryLayer(map),sources:{},layers:{},removedSources:0,removedLayers:0};
    for(const id of ids.sources){const def=styleSource(map,id);if(def)record.sources[id]=def;}
    for(const id of ids.layers){const def=styleLayer(map,id);if(def)record.layers[id]=def;}
    for(const id of [...ids.layers].reverse())try{if(map.getLayer?.(id)){map.removeLayer(id);record.removedLayers++;}}catch(e){}
    for(const id of [...ids.sources].reverse())try{if(map.getSource?.(id)){map.removeSource(id);record.removedSources++;}}catch(e){}
    try{map.triggerRepaint?.();}catch(e){}suspendedMapImagery.set(map,record);mark('background.imagery-unloaded',{map:label,removedLayers:record.removedLayers,removedSources:record.removedSources});return record;
  }
  function restoreImageryRecord(record,currentMap){
    if(!record||!currentMap||record.map!==currentMap)return false;const ids=IMAGERY[record.label];if(!ids)return false;patchMapForSuspension(currentMap,record.label);
    let sources=0,layers=0;
    for(const id of ids.sources){if(currentMap.getSource?.(id))continue;const def=record.sources[id];if(!def)continue;try{currentMap.addSource(id,clone(def));sources++;}catch(e){}}
    const before=record.anchor&&currentMap.getLayer?.(record.anchor)?record.anchor:firstNonImageryLayer(currentMap);
    for(const id of ids.layers){if(currentMap.getLayer?.(id))continue;const def=record.layers[id];if(!def||!currentMap.getSource?.(def.source))continue;try{before?currentMap.addLayer(clone(def),before):currentMap.addLayer(clone(def));layers++;}catch(e){}}
    try{currentMap.triggerRepaint?.();}catch(e){}mark('background.imagery-restored',{map:record.label,sources,layers});return true;
  }
  function suspendAllImagery(){
    window.__padGradeImagerySuspendedV117=true;const p=primaryMap(),c=compareMap();if(p)suspendImageryForMap(p,'primary');if(c&&c!==p)suspendImageryForMap(c,'compare');
  }
  function restoreAllImagery(){
    window.__padGradeImagerySuspendedV117=false;const p=primaryMap(),c=compareMap();
    for(const [map,record] of [...suspendedMapImagery.entries()]){restoreImageryRecord(record,record.label==='primary'?p:c);suspendedMapImagery.delete(map);}
  }
  function installCompareMapCapture(){
    if(compareCtorPatched||!window.maplibregl?.Map)return false;compareCtorPatched=true;const Base=window.maplibregl.Map;
    class PadGradeV117Map extends Base{
      constructor(options){super(options);const container=options?.container,containerId=typeof container==='string'?container:container?.id;
        if(containerId==='pgCompareMap'){window.__padGradeCompareMapInstance=this;patchMapForSuspension(this,'compare');const baseRemove=this.remove?.bind(this);if(baseRemove)this.remove=()=>{if(window.__padGradeCompareMapInstance===this)window.__padGradeCompareMapInstance=null;return baseRemove();};}
        else if(containerId==='gpsMap'){patchPrimaryMap(this);patchMapForSuspension(this,'primary');}
      }
    }
    try{Object.setPrototypeOf(PadGradeV117Map,Base);}catch(e){}try{window.maplibregl.Map=PadGradeV117Map;}catch(e){compareCtorPatched=false;return false;}return true;
  }

  function onHidden(){
    if(hidden&&window.__padGradeV117BackgroundSuspended)return;
    hidden=true;window.__padGradeV117BackgroundSuspended=true;
    const state=mapState(primaryMap());if(state){state.commitSerial++;canonicalVisible(state,false);}
    memorySnapshot('v117-background-before-suspend');
    const cornerCancelled=cancelCornerCaptureForBackground(),gpsStopped=suspendGpsWatches();
    memorySnapshot('v117-background-after-gps-suspend');suspendAllImagery();memorySnapshot('v117-background-after-imagery-unload');
    mark('background.suspend-complete',{version:VERSION,gpsStopped,cornerCancelled,primaryImagery:!!primaryMap(),compareImagery:!!compareMap(),next:'native-webview-pause'});
  }
  function onVisible(){
    if(!window.__padGradeV117BackgroundSuspended){hidden=false;return;}
    hidden=false;window.__padGradeV117BackgroundSuspended=false;
    memorySnapshot('v117-resume-before-restore');restoreAllImagery();memorySnapshot('v117-resume-after-imagery-restore');
    const gpsRestarted=resumeGpsWatches();memorySnapshot('v117-resume-after-gps-restore');
    importLifecycleMemory();importHistoricalExits();
    const state=mapState(primaryMap());if(state)requestCanonicalCommit(state,'visibility-resume');
    mark('background.resume-complete',{version:VERSION,gpsRestarted,primaryImagery:!!primaryMap(),compareImagery:!!compareMap()});
  }

  function attach(){
    wrapDiagnostics();patchPrimaryMap(primaryMap());patchMapForSuspension(primaryMap(),'primary');installCompareMapCapture();
  }
  function boot(){
    document.title=`Pad Grade Mapper v${VERSION} DEV`;
    attach();installSuspendableGeolocation();importLifecycleMemory();importHistoricalExits();
    window.addEventListener('padgrade-primary-map-captured',event=>{const map=event?.detail?.map||primaryMap();patchPrimaryMap(map);patchMapForSuspension(map,'primary');});
    window.addEventListener('padgrade-map-created',event=>{const map=event?.detail?.map||primaryMap();patchPrimaryMap(map);patchMapForSuspension(map,'primary');});
    window.addEventListener('padgrade-map-runtime-ready',()=>attach());
    window.addEventListener('padgrade-active-project-applied',()=>{projectSerial++;bestNormalTier=0;const state=mapState(primaryMap());if(state){state.projectBlank=false;state.commitSerial++;requestCanonicalCommit(state,'active-project-applied');}});
    document.addEventListener('click',event=>{if(event.target?.closest?.('button[data-act="open113"],button[data-act="open"]')){projectSerial++;bestNormalTier=0;const state=mapState(primaryMap());if(state){state.projectBlank=true;state.commitSerial++;canonicalVisible(state,false);}}},true);
    document.addEventListener('change',event=>{if(event.target?.id==='heatmapToggle'){const state=mapState(primaryMap());if(!state)return;if(event.target.checked)requestCanonicalCommit(state,'heatmap-enabled');else{state.commitSerial++;canonicalVisible(state,false);}}},true);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')onHidden();else onVisible();});
    window.addEventListener('beforeunload',()=>{suspendGpsWatches();const state=mapState(primaryMap());if(state){state.commitSerial++;canonicalVisible(state,false);}},{once:true});
    window.__padGradeV117Policy='single-permanent-image-source-complete-imagebitmap-hard-swap-background-webview-idle-application-exit-info';
    mark('v117.installed',{version:VERSION,policy:window.__padGradeV117Policy});
    if(document.visibilityState==='hidden')onHidden();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
