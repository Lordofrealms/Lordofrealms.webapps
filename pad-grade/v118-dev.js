/* Pad Grade v1.1.8 DEV — corrected permanent heat images + informed location lifecycle.
 *
 * v1.1.8 keeps the v1.1.3 heat workers/cache and v1.1.4 diagnostics/cache guards,
 * but supersedes the v1.1.5-v1.1.7 presentation/background experiments. Both the
 * primary project map and Project Comparison virtualize their legacy heat CanvasSources
 * into one permanent MapLibre ImageSource/raster layer per map. A legacy canvas is
 * decoded only after it is complete; current-candidate selection is re-evaluated when
 * that decoded frame is ready, so routine visibility/repair chatter cannot invalidate a
 * valid frame before commit. The currently committed frame remains painted while a new
 * frame is prepared.
 *
 * Background behavior retains GPS suspension only. USGS imagery stays attached. Android
 * owns WebView timer pausing at Activity.onStop and the native host now guarantees the
 * process-global WebView timer pool is resumed on every Activity.onResume.
 */
(function installPadGrade118Dev(){
  'use strict';
  if(window.__padGradeDevV118)return;
  window.__padGradeDevV118=true;
  // v1.1.8 owns the post-v1.1.4 heat/background behavior. Keep v1.1.4 itself active
  // for its cache race protection and native-memory measurement, but stop the later
  // experimental handoff/ImageSource runtimes from installing after this file.
  window.__padGradeDevV115=true;
  window.__padGradeDevV116=true;
  window.__padGradeDevV117=true;
  window.__padGradeV118OwnsHeatPresentation=true;

  const VERSION='1.1.8';
  const PRIMARY_NORMAL_SOURCE='pad-grade-interpolated-surface-canvas-source-';
  const PRIMARY_NORMAL_LAYER='pad-grade-interpolated-surface-canvas-layer-';
  const PRIMARY_INSPECT_SOURCE='pad-grade-v113-inspect-source-';
  const PRIMARY_INSPECT_LAYER='pad-grade-v113-inspect-layer-';
  const COMPARE_SOURCE='pg-compare-heat-source-';
  const COMPARE_LAYER='pg-compare-heat-layer-';
  const MEMORY_KEY='padGradeLifecycleMemoryImportedSeqV118';
  const EXIT_KEY='padGradeLifecycleExitImportedSeqV118';
  let hidden=document.visibilityState==='hidden';
  let primaryProjectSerial=0;
  const heatStates=new Set();

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const memorySnapshot=reason=>{try{return window.pgDiagnosticMemorySnapshot?.(reason);}catch(e){return null;}};
  const primaryHeatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !t||!!t.checked;};
  const primaryOpacity=()=>{try{const n=typeof window.pgHeatmapOpacity==='function'?+window.pgHeatmapOpacity():.58;return Number.isFinite(n)?n:.58;}catch(e){return .58;}};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch(e){return v;}};

  function configFor(role){
    return role==='compare'?{
      role,
      canonicalSource:'pad-grade-v118-compare-heat-image-source',
      canonicalLayer:'pad-grade-v118-compare-heat-image-layer',
      sourceMatch:id=>String(id||'').startsWith(COMPARE_SOURCE),
      layerMatch:id=>String(id||'').startsWith(COMPARE_LAYER),
      inspectMatch:()=>false,
      opacity:()=>.62,
      anchors:['pg-compare-grid-layer']
    }:{
      role:'primary',
      canonicalSource:'pad-grade-v118-heat-image-source',
      canonicalLayer:'pad-grade-v118-heat-image-layer',
      sourceMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_SOURCE)||id.startsWith(PRIMARY_INSPECT_SOURCE);},
      layerMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_LAYER)||id.startsWith(PRIMARY_INSPECT_LAYER);},
      inspectMatch:id=>String(id||'').startsWith(PRIMARY_INSPECT_LAYER),
      opacity:primaryOpacity,
      anchors:['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer']
    };
  }

  function cloneCoords(coords){
    if(!Array.isArray(coords)||coords.length!==4)return null;
    const out=coords.map(p=>Array.isArray(p)&&p.length>=2?[+p[0],+p[1]]:null);
    return out.every(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?out:null;
  }
  function inferTier(role,id,canvas){
    const explicit=String(id||'').match(/(?:inspect-source-|heat-source-)(\d+)$/);
    if(explicit)return +explicit[1];
    const longest=Math.max(+canvas?.width||0,+canvas?.height||0);
    if(role==='compare')return longest;
    return [99,297,891].reduce((best,t)=>Math.abs(t-longest)<Math.abs(best-longest)?t:best,99);
  }
  function closeFrame(frame){try{frame?.bitmap?.close?.();}catch(e){}}
  async function decodeCompleteCanvas(canvas){
    if(!canvas)return null;
    if(typeof createImageBitmap==='function'){
      try{
        const bitmap=await createImageBitmap(canvas);
        return {image:bitmap,bitmap,kind:'ImageBitmap',width:+canvas.width||0,height:+canvas.height||0};
      }catch(e){mark('heatmap.v118-bitmap-fallback',{error:String(e?.message||e).slice(0,160)});}
    }
    return {image:canvas,bitmap:null,kind:'HTMLCanvasElement',width:+canvas.width||0,height:+canvas.height||0};
  }

  function layerAnchor(state){
    for(const id of state.cfg.anchors){try{if(state.baseGetLayer(id))return id;}catch(e){}}
    return undefined;
  }
  function canonicalVisible(state,visible){
    try{
      if(state.baseGetLayer(state.cfg.canonicalLayer))state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility',visible?'visible':'none');
      state.canonicalVisible=!!visible;
      state.map.triggerRepaint?.();
    }catch(e){}
  }
  function ensureCanonical(state,coords){
    try{
      if(!state.baseGetSource(state.cfg.canonicalSource)){
        state.baseAddSource(state.cfg.canonicalSource,{type:'image',coordinates:coords});
        mark('heatmap.v118-image-source-created',{map:state.role,source:state.cfg.canonicalSource});
      }
      if(!state.baseGetLayer(state.cfg.canonicalLayer)){
        const layer={id:state.cfg.canonicalLayer,type:'raster',source:state.cfg.canonicalSource,layout:{visibility:'none'},paint:{'raster-opacity':state.cfg.opacity(),'raster-fade-duration':0}};
        const before=layerAnchor(state);
        before?state.baseAddLayer(layer,before):state.baseAddLayer(layer);
        mark('heatmap.v118-image-layer-created',{map:state.role,layer:state.cfg.canonicalLayer});
      }
      const source=state.baseGetSource(state.cfg.canonicalSource);
      source?.setCoordinates?.(coords);
      state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-fade-duration',0);
      state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-opacity',state.cfg.opacity());
      return source||null;
    }catch(e){
      mark('heatmap.v118-canonical-create-failed',{map:state.role,error:String(e?.message||e).slice(0,180)});
      return null;
    }
  }

  function visibleCandidates(state){
    const out=[];
    for(const [id,layer] of state.layers){
      if(layer.layout.visibility==='none')continue;
      const source=state.sources.get(layer.source);
      if(!source||source.removed||!source.frame)continue;
      if(state.role==='primary'&&source.projectSerial!==primaryProjectSerial)continue;
      out.push({id,layer,source});
    }
    return out;
  }
  function chooseCandidate(state){
    const list=visibleCandidates(state);if(!list.length)return null;
    if(state.role==='primary'){
      const inspect=list.filter(x=>state.cfg.inspectMatch(x.id));
      if(inspect.length){inspect.sort((a,b)=>a.source.serial-b.source.serial);return inspect[inspect.length-1];}
      list.sort((a,b)=>(a.source.tier||0)-(b.source.tier||0)||a.source.serial-b.source.serial);
      return list[list.length-1];
    }
    list.sort((a,b)=>a.source.serial-b.source.serial);
    return list[list.length-1];
  }
  function shouldExplicitlyHide(state){
    if(state.role==='primary')return state.projectBlank||!primaryHeatEnabled();
    return false;
  }
  function commitCandidate(state,candidate,reason){
    if(!candidate||hidden||state.projectBlank)return false;
    const current=chooseCandidate(state);
    if(!current||current.id!==candidate.id||current.source.id!==candidate.source.id)return false;
    const frame=candidate.source.frame,coords=cloneCoords(candidate.source.coordinates);
    if(!frame||!coords)return false;
    const canonicalExists=!!state.baseGetSource(state.cfg.canonicalSource)&&!!state.baseGetLayer(state.cfg.canonicalLayer);
    if(state.currentFrame===frame&&canonicalExists){canonicalVisible(state,true);return true;}
    const imageSource=ensureCanonical(state,coords);if(!imageSource)return false;
    try{
      imageSource.updateImage({image:frame.image,coordinates:coords});
      const previous=state.currentFrame;
      state.currentFrame=frame;
      state.currentSource=candidate.source.id;
      state.currentLayer=candidate.id;
      state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-opacity',state.cfg.opacity());
      state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-fade-duration',0);
      canonicalVisible(state,true);
      mark('heatmap.v118-image-committed',{map:state.role,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,reason});
      if(previous&&previous!==frame){
        let released=false;
        const release=()=>{if(released)return;released=true;closeFrame(previous);};
        try{state.map.once('render',()=>requestAnimationFrame(release));state.map.triggerRepaint();setTimeout(release,400);}catch(e){setTimeout(release,0);}
      }
      return true;
    }catch(e){
      mark('heatmap.v118-image-commit-failed',{map:state.role,layer:candidate.id,error:String(e?.message||e).slice(0,180)});
      return false;
    }
  }
  function maybeCommit(state,reason){
    if(!state||hidden)return false;
    if(shouldExplicitlyHide(state)){canonicalVisible(state,false);return false;}
    const candidate=chooseCandidate(state);
    // Deliberately retain the previously committed image when there is temporarily no
    // candidate. Legacy double-buffer code removes an inactive/old slot before adding
    // the replacement; blanking here would recreate the visible flicker.
    if(!candidate)return false;
    return commitCandidate(state,candidate,reason);
  }

  function virtualSource(state,id,spec){
    const canvas=spec?.canvas;
    const record={id:String(id),canvas,coordinates:cloneCoords(spec?.coordinates),tier:inferTier(state.role,id,canvas),serial:++state.serial,projectSerial:primaryProjectSerial,frame:null,removed:false};
    const api={
      id:record.id,type:'canvas',getCanvas:()=>record.canvas,
      setCoordinates:coords=>{const next=cloneCoords(coords);if(next)record.coordinates=next;if(state.currentSource===record.id)maybeCommit(state,'coordinates');return api;},
      play:()=>api,pause:()=>api,loaded:()=>true,
      serialize:()=>({type:'canvas',canvas:record.canvas,coordinates:clone(record.coordinates),animate:false})
    };
    record.api=api;state.sources.set(record.id,record);
    decodeCompleteCanvas(canvas).then(frame=>{
      if(record.removed){closeFrame(frame);return;}
      record.frame=frame;
      mark('heatmap.v118-frame-ready',{map:state.role,source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none'});
      maybeCommit(state,'frame-ready');
    }).catch(e=>mark('heatmap.v118-frame-decode-failed',{map:state.role,source:record.id,error:String(e?.message||e).slice(0,160)}));
    mark('heatmap.v118-canvas-virtualized',{map:state.role,source:record.id,tier:record.tier||0,width:+canvas?.width||0,height:+canvas?.height||0});
    return api;
  }
  function virtualLayer(state,layer){
    const id=String(layer?.id||'');
    const record={id,type:layer?.type||'raster',source:String(layer?.source||''),layout:{...(layer?.layout||{}),visibility:layer?.layout?.visibility||'visible'},paint:{...(layer?.paint||{})}};
    record.paint['raster-fade-duration']=0;
    state.layers.set(id,record);maybeCommit(state,'layer-added');return record;
  }
  function mergeStyle(state){
    const style=clone(state.baseGetStyle?.()||{})||{};style.sources={...(style.sources||{})};
    for(const [id,source] of state.sources)style.sources[id]={type:'canvas',canvas:source.canvas,coordinates:clone(source.coordinates),animate:false};
    style.layers=Array.isArray(style.layers)?style.layers.slice():[];const actual=new Set(style.layers.map(x=>x?.id));
    for(const layer of state.layers.values())if(!actual.has(layer.id))style.layers.push({id:layer.id,type:layer.type,source:layer.source,layout:{...layer.layout},paint:{...layer.paint}});
    return style;
  }

  function patchHeatMap(map,role){
    if(!map||map.__padGradeV118HeatState)return !!map;
    const cfg=configFor(role);
    const state={map,role,cfg,sources:new Map(),layers:new Map(),serial:0,currentFrame:null,currentSource:'',currentLayer:'',canonicalVisible:false,projectBlank:false,
      baseAddSource:map.addSource.bind(map),baseGetSource:map.getSource.bind(map),baseRemoveSource:map.removeSource.bind(map),
      baseAddLayer:map.addLayer.bind(map),baseGetLayer:map.getLayer.bind(map),baseRemoveLayer:map.removeLayer.bind(map),
      baseSetLayoutProperty:map.setLayoutProperty.bind(map),baseGetLayoutProperty:map.getLayoutProperty.bind(map),
      baseSetPaintProperty:map.setPaintProperty.bind(map),baseGetPaintProperty:map.getPaintProperty.bind(map),
      baseMoveLayer:map.moveLayer?.bind(map),baseGetStyle:map.getStyle?.bind(map)};
    map.__padGradeV118HeatState=state;heatStates.add(state);
    if(role==='primary')window.__padGradeV118PrimaryHeatState=state;else window.__padGradeCompareMapInstance=map;

    map.addSource=function(id,spec){if(cfg.sourceMatch(id)&&spec?.type==='canvas'){virtualSource(state,id,spec);return this;}return state.baseAddSource(id,spec);};
    map.getSource=function(id){return state.sources.get(String(id||''))?.api||state.baseGetSource(id);};
    map.removeSource=function(id){
      id=String(id||'');const record=state.sources.get(id);
      if(record){record.removed=true;state.sources.delete(id);if(record.frame&&record.frame!==state.currentFrame)closeFrame(record.frame);maybeCommit(state,'source-removed');return this;}
      return state.baseRemoveSource(id);
    };
    map.addLayer=function(layer,before){const id=String(layer?.id||'');if(cfg.layerMatch(id)||state.sources.has(String(layer?.source||''))){virtualLayer(state,layer);return this;}return before===undefined?state.baseAddLayer(layer):state.baseAddLayer(layer,before);};
    map.getLayer=function(id){const l=state.layers.get(String(id||''));return l?{id:l.id,type:l.type,source:l.source}:state.baseGetLayer(id);};
    map.removeLayer=function(id){id=String(id||'');if(state.layers.has(id)){state.layers.delete(id);maybeCommit(state,'layer-removed');return this;}return state.baseRemoveLayer(id);};
    map.setLayoutProperty=function(id,name,value){id=String(id||'');const l=state.layers.get(id);if(l){l.layout[name]=value;maybeCommit(state,`layout-${name}`);return this;}return state.baseSetLayoutProperty(id,name,value);};
    map.getLayoutProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.layout[name]:state.baseGetLayoutProperty(id,name);};
    map.setPaintProperty=function(id,name,value){
      id=String(id||'');const l=state.layers.get(id);
      if(l){l.paint[name]=value;if(id===state.currentLayer&&name==='raster-opacity'&&Number.isFinite(+value)&&+value>.02){try{state.baseSetPaintProperty(cfg.canonicalLayer,'raster-opacity',cfg.opacity());}catch(e){}}maybeCommit(state,`paint-${name}`);return this;}
      return state.baseSetPaintProperty(id,name,value);
    };
    map.getPaintProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.paint[name]:state.baseGetPaintProperty(id,name);};
    map.moveLayer=function(id,before){if(state.layers.has(String(id||'')))return this;return state.baseMoveLayer?state.baseMoveLayer(id,before):this;};
    map.getStyle=function(){return mergeStyle(state);};
    try{map.on('style.load',()=>setTimeout(()=>maybeCommit(state,'style-load'),0));map.on('remove',()=>{for(const s of state.sources.values())if(s.frame&&s.frame!==state.currentFrame)closeFrame(s.frame);closeFrame(state.currentFrame);heatStates.delete(state);});}catch(e){}
    mark('heatmap.v118-map-patched',{map:role,source:cfg.canonicalSource,layer:cfg.canonicalLayer});
    return true;
  }

  function containerId(options){const c=options?.container;return typeof c==='string'?c:(c&&c.id)||'';}
  function installMapConstructorHook(){
    const gl=window.maplibregl;if(!gl||typeof gl.Map!=='function')return false;
    const Original=gl.Map;if(Original.__padGradeV118HeatCtor)return true;
    class PadGradeV118Map extends Original{
      constructor(options){
        super(options);
        const id=containerId(options);
        if(id==='gpsMap')patchHeatMap(this,'primary');
        else if(id==='pgCompareMap')patchHeatMap(this,'compare');
      }
    }
    try{Object.setPrototypeOf(PadGradeV118Map,Original);}catch(e){}
    PadGradeV118Map.__padGradeV118HeatCtor=true;PadGradeV118Map.__padGradeV118Original=Original;
    gl.Map=PadGradeV118Map;mark('heatmap.v118-constructor-hook-installed',{maps:['primary','compare']});return true;
  }

  // Export-safe memory/lifecycle telemetry retained from v1.1.7, without polling.
  function finite(v){return Number.isFinite(+v)?+v:undefined;}
  function putNumber(out,key,v){const n=finite(v);if(n!==undefined)out[key]=n;}
  function putBoolean(out,key,v){if(typeof v==='boolean')out[key]=v;}
  function flattenNativeMemory(memory,out={}){
    const m=memory&&typeof memory==='object'?memory:{};
    for(const key of ['totalPssKb','totalPrivateDirtyKb','totalSharedDirtyKb','javaHeapPssKb','nativeHeapPssKb','codePssKb','stackPssKb','graphicsPssKb','privateOtherPssKb','systemPssKb','totalSwapPssKb','javaUsedKb','javaCommittedKb','javaMaxKb','nativeAllocatedKb','nativeHeapSizeKb','nativeHeapFreeKb','deviceAvailKb','deviceThresholdKb','memoryClassMb','largeMemoryClassMb','importance','lastTrimLevel','lru'])putNumber(out,key,m[key]);
    putBoolean(out,'deviceLowMemory',m.deviceLowMemory);return out;
  }
  function flattenMemorySnapshot(details){
    const d=details&&typeof details==='object'?details:{},out={version:VERSION,reason:String(d.reason||'snapshot').slice(0,100)};flattenNativeMemory(d.native,out);
    const js=d.jsHeap||{};putNumber(out,'jsUsedKb',finite(js.usedJSHeapSize)!==undefined?Math.round(+js.usedJSHeapSize/1024):undefined);putNumber(out,'jsCommittedKb',finite(js.totalJSHeapSize)!==undefined?Math.round(+js.totalJSHeapSize/1024):undefined);putNumber(out,'jsLimitKb',finite(js.jsHeapSizeLimit)!==undefined?Math.round(+js.jsHeapSizeLimit/1024):undefined);
    const canvases=d.canvases||{},byKind=canvases.byKind||{};putNumber(out,'canvasCount',canvases.count);putNumber(out,'canvasTotalKb',finite(canvases.totalBytes)!==undefined?Math.round(+canvases.totalBytes/1024):undefined);putNumber(out,'mapCanvasKb',finite(byKind.map)!==undefined?Math.round(+byKind.map/1024):undefined);putNumber(out,'domCanvasKb',finite(byKind.dom)!==undefined?Math.round(+byKind.dom/1024):undefined);putNumber(out,'normalHeatCanvasKb',finite(byKind['normal-heat-source'])!==undefined?Math.round(+byKind['normal-heat-source']/1024):undefined);putNumber(out,'inspectorHeatCanvasKb',finite(byKind['inspector-heat-source'])!==undefined?Math.round(+byKind['inspector-heat-source']/1024):undefined);
    const tiers=d.tierCacheEstimate||{},decoded=d.decodedCacheEstimate||{},workers=d.workers||{},heat=d.heat||{};putNumber(out,'tierCacheEstimatedKb',finite(tiers.estimatedBytes)!==undefined?Math.round(+tiers.estimatedBytes/1024):undefined);putNumber(out,'decodedCacheEstimatedKb',finite(decoded.estimatedBytes)!==undefined?Math.round(+decoded.estimatedBytes/1024):undefined);putNumber(out,'decodedCacheCount',decoded.count);putNumber(out,'foregroundWorkerCount',workers.foregroundCount);putBoolean(out,'backgroundWorkerActive',workers.backgroundActive);if(typeof heat.inspectorMode==='string')out.inspectorMode=heat.inspectorMode.slice(0,20);putBoolean(out,'cacheAuthority',heat.cacheAuthority);return out;
  }
  function importLifecycleRows(){
    try{
      const bridge=window.PadGradeLifecycle;if(!bridge?.getEvents)return;
      const events=JSON.parse(bridge.getEvents()||'[]');if(!Array.isArray(events))return;
      let memLast=Number(localStorage.getItem(MEMORY_KEY)||0),exitLast=Number(localStorage.getItem(EXIT_KEY)||0),memMax=memLast,exitMax=exitLast;
      for(const item of events){
        const seq=Number(item?.seq)||0;
        if(seq>memLast&&item?.memory&&typeof item.memory==='object'){
          memMax=Math.max(memMax,seq);const out={seq,pid:Number(item?.pid)||0,event:String(item?.event||'lifecycle').slice(0,80),savedState:item?.savedState===true};if(Number.isFinite(+item?.trimLevel))out.trimLevel=+item.trimLevel;if(typeof item?.rendererCrash==='boolean')out.rendererCrash=item.rendererCrash;flattenNativeMemory(item.memory,out);mark('android.memory.lifecycle',out);
        }
        if(seq>exitLast&&item?.event==='process.previous-exit'){
          exitMax=Math.max(exitMax,seq);mark('android.process.exit-reason',{seq,previousPid:Number(item?.previousPid)||0,processName:String(item?.processName||'').slice(0,120),exitReason:Number(item?.exitReason)||0,exitReasonName:String(item?.exitReasonName||'UNKNOWN').slice(0,80),exitStatus:Number(item?.exitStatus)||0,exitImportance:Number(item?.exitImportance)||0,exitPssKb:Number(item?.exitPssKb)||0,exitRssKb:Number(item?.exitRssKb)||0,exitTimestamp:Number(item?.exitTimestamp)||0,lowMemoryKillReportSupported:item?.lowMemoryKillReportSupported===true,detail:String(item?.detail||'').slice(0,180)});
        }
      }
      if(memMax>memLast)localStorage.setItem(MEMORY_KEY,String(memMax));if(exitMax>exitLast)localStorage.setItem(EXIT_KEY,String(exitMax));
    }catch(e){mark('android.lifecycle-import-failed',{version:VERSION,error:String(e?.message||e).slice(0,160)});}
  }
  function wrapDiagnostics(){
    const diag=window.PadGradeDiag;if(!diag||typeof diag.mark!=='function'||diag.__padGradeV118Wrapped)return false;
    const original=diag.mark.bind(diag);diag.__padGradeV118Wrapped=true;
    diag.mark=function(name,details){
      const next=name==='memory.snapshot'?flattenMemorySnapshot(details):details;const result=original(name,next);
      try{
        const primary=window.__padGradeV118PrimaryHeatState;
        if(name==='project.switch-v113-start'){
          primaryProjectSerial++;if(primary){primary.projectBlank=true;canonicalVisible(primary,false);}
        }else if(name==='project.switch-v113-complete'){
          if(primary){primary.projectBlank=false;maybeCommit(primary,'project-switch-complete');}
        }
      }catch(e){}
      return result;
    };
    original('memory.export-repair-installed',{version:VERSION,format:'flat-scalar-fields-v118-no-polling'});return true;
  }

  // Suspend real geolocation subscriptions while hidden, but retain virtual watch IDs
  // so the existing survey and map subsystems resume exactly what they were using.
  let geoInstalled=false,geoSuspended=false,nextWatch=1100000,geoBase=null;const geoWatches=new Map();
  function installSuspendableGeolocation(){
    if(geoInstalled)return true;const geo=navigator.geolocation;if(!geo||typeof geo.watchPosition!=='function'||typeof geo.clearWatch!=='function')return false;
    geoInstalled=true;geoBase={watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo)};
    const start=record=>{if(!record||geoSuspended||record.underlyingId!=null)return;try{record.underlyingId=geoBase.watch(pos=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(record.virtualId))record.error?.(err);},record.options);}catch(e){record.underlyingId=null;try{record.error?.(e);}catch(_){}}};
    try{
      geo.watchPosition=function(success,error,options){const virtualId=nextWatch++,record={virtualId,underlyingId:null,success,error,options:options||{}};geoWatches.set(virtualId,record);start(record);mark('background.gps-watch-registered',{virtualId,activeUnderlying:record.underlyingId!=null,totalVirtual:geoWatches.size});return virtualId;};
      geo.clearWatch=function(id){const record=geoWatches.get(id);if(!record)return geoBase.clear(id);geoWatches.delete(id);if(record.underlyingId!=null){try{geoBase.clear(record.underlyingId);}catch(e){}record.underlyingId=null;}mark('background.gps-watch-cleared',{virtualId:id,totalVirtual:geoWatches.size});};
    }catch(e){geoInstalled=false;geoBase=null;return false;}
    return true;
  }
  function suspendGps(){installSuspendableGeolocation();geoSuspended=true;let stopped=0;if(geoBase)for(const r of geoWatches.values())if(r.underlyingId!=null){try{geoBase.clear(r.underlyingId);}catch(e){}r.underlyingId=null;stopped++;}mark('background.gps-suspended',{stopped,registered:geoWatches.size});return stopped;}
  function resumeGps(){if(!geoInstalled||!geoBase)return 0;geoSuspended=false;let restarted=0;for(const r of geoWatches.values())if(r.underlyingId==null){try{r.underlyingId=geoBase.watch(pos=>{if(!geoSuspended&&geoWatches.has(r.virtualId))r.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(r.virtualId))r.error?.(err);},r.options);restarted++;}catch(e){r.underlyingId=null;}}mark('background.gps-resumed',{restarted,registered:geoWatches.size});return restarted;}
  function cancelCornerCapture(){let cancelled=false;try{if(typeof activeCornerCapture!=='undefined'&&activeCornerCapture){activeCornerCapture=null;cancelled=true;if(typeof captureProgressTimer!=='undefined'&&captureProgressTimer){clearInterval(captureProgressTimer);captureProgressTimer=null;}if(typeof updateGpsUi==='function')updateGpsUi();}}catch(e){}if(cancelled)mark('background.corner-capture-cancelled',{reason:'hidden'});return cancelled;}

  function onHidden(){
    if(hidden&&window.__padGradeV118BackgroundSuspended)return;hidden=true;window.__padGradeV118BackgroundSuspended=true;
    memorySnapshot('v118-background-before-gps-suspend');const cornerCancelled=cancelCornerCapture(),gpsStopped=suspendGps();memorySnapshot('v118-background-after-gps-suspend');
    mark('background.suspend-complete',{version:VERSION,gpsStopped,cornerCancelled,imagery:'retained',next:'native-webview-pause'});
  }
  function onVisible(){
    hidden=false;if(window.__padGradeV118BackgroundSuspended){window.__padGradeV118BackgroundSuspended=false;const restarted=resumeGps();memorySnapshot('v118-resume-after-gps-restore');mark('background.resume-complete',{version:VERSION,gpsRestarted:restarted,imagery:'retained'});}
    for(const state of heatStates)maybeCommit(state,'visibility-visible');importLifecycleRows();
  }

  function install(){
    installSuspendableGeolocation();wrapDiagnostics();importLifecycleRows();installMapConstructorHook();
    window.addEventListener('padgrade-maplibre-ready',installMapConstructorHook,{once:true});
    document.addEventListener('visibilitychange',()=>document.visibilityState==='hidden'?onHidden():onVisible(),true);
    if(document.visibilityState==='hidden')onHidden();
    const stamp=()=>{document.title='Pad Grade Mapper v1.1.8 DEV';};stamp();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stamp,{once:true});setTimeout(stamp,500);
    mark('v118.installed',{version:VERSION,policy:'primary-and-compare-permanent-image-source-current-candidate-commit-gps-suspend-imagery-retained'});
  }
  install();
})();
