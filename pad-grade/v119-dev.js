/* Pad Grade v1.1.9 DEV — permanent heat ImageSource cutover + GPS permission retry behavior.
 *
 * v1.1.9 makes one ImageSource/raster layer per MapLibre map authoritative. Existing
 * workers/cache still build complete canvases, but those canvases never become real
 * MapLibre CanvasSources. They are only offscreen frame inputs. The permanent source is
 * created only after the current style is fully loaded, then updated in-place with a
 * complete ImageBitmap. Main and Project Comparison use the same controller.
 */
(function installPadGrade119Dev(){
  'use strict';
  if(window.__padGradeDevV119)return;
  window.__padGradeDevV119=true;
  window.__padGradeV119OwnsHeatPresentation=true;
  // Do not execute the superseded heat/background presentation experiments after this.
  window.__padGradeDevV114=true;
  window.__padGradeDevV115=true;
  window.__padGradeDevV116=true;
  window.__padGradeDevV117=true;
  window.__padGradeDevV118=true;

  const VERSION='1.1.9';
  const PRIMARY_NORMAL_SOURCE='pad-grade-interpolated-surface-canvas-source-';
  const PRIMARY_NORMAL_LAYER='pad-grade-interpolated-surface-canvas-layer-';
  const PRIMARY_INSPECT_SOURCE='pad-grade-v113-inspect-source-';
  const PRIMARY_INSPECT_LAYER='pad-grade-v113-inspect-layer-';
  const COMPARE_SOURCE='pg-compare-heat-source-';
  const COMPARE_LAYER='pg-compare-heat-layer-';
  const TRANSPARENT_PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
  const controllers=new Set();
  let primaryProjectSerial=0;
  let hidden=document.visibilityState==='hidden';

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch(e){return v;}};
  const primaryHeatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !t||!!t.checked;};
  const primaryOpacity=()=>{try{const n=typeof window.pgHeatmapOpacity==='function'?+window.pgHeatmapOpacity():.58;return Number.isFinite(n)?n:.58;}catch(e){return .58;}};

  function cloneCoords(coords){
    if(!Array.isArray(coords)||coords.length!==4)return null;
    const out=coords.map(p=>Array.isArray(p)&&p.length>=2?[+p[0],+p[1]]:null);
    return out.every(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?out:null;
  }
  function configFor(role){
    return role==='compare'?{
      role,
      canonicalSource:'pad-grade-v119-compare-heat-image-source',
      canonicalLayer:'pad-grade-v119-compare-heat-image-layer',
      sourceMatch:id=>String(id||'').startsWith(COMPARE_SOURCE),
      layerMatch:id=>String(id||'').startsWith(COMPARE_LAYER),
      inspectMatch:()=>false,
      opacity:()=>.62,
      anchors:['pg-compare-grid-layer']
    }:{
      role:'primary',
      canonicalSource:'pad-grade-v119-heat-image-source',
      canonicalLayer:'pad-grade-v119-heat-image-layer',
      sourceMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_SOURCE)||id.startsWith(PRIMARY_INSPECT_SOURCE);},
      layerMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_LAYER)||id.startsWith(PRIMARY_INSPECT_LAYER);},
      inspectMatch:id=>String(id||'').startsWith(PRIMARY_INSPECT_LAYER),
      opacity:primaryOpacity,
      anchors:['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer']
    };
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
      }catch(e){mark('heatmap.v119-bitmap-fallback',{error:String(e?.message||e).slice(0,160)});}
    }
    return {image:canvas,bitmap:null,kind:'HTMLCanvasElement',width:+canvas.width||0,height:+canvas.height||0};
  }
  function styleLoaded(state){try{return !!state.map.isStyleLoaded?.();}catch(e){return false;}}
  function anchor(state){for(const id of state.cfg.anchors){try{if(state.baseGetLayer(id))return id;}catch(e){}}return undefined;}
  function hideCanonical(state,reason){
    try{if(state.baseGetLayer(state.cfg.canonicalLayer))state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','none');state.visible=false;state.map.triggerRepaint?.();}catch(e){}
    if(reason)mark('heatmap.v119-hidden',{map:state.role,reason});
  }
  function showCanonical(state){
    try{if(state.baseGetLayer(state.cfg.canonicalLayer)){state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-opacity',state.cfg.opacity());state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','visible');state.visible=true;state.map.triggerRepaint?.();return true;}}catch(e){}
    return false;
  }
  function ensureCanonical(state,coords){
    if(!styleLoaded(state)||!coords)return null;
    try{
      let source=state.baseGetSource(state.cfg.canonicalSource);
      if(!source){
        state.baseAddSource(state.cfg.canonicalSource,{type:'image',url:TRANSPARENT_PIXEL,coordinates:coords});
        source=state.baseGetSource(state.cfg.canonicalSource);
        mark('heatmap.v119-image-source-created',{map:state.role,styleEpoch:state.styleEpoch,source:state.cfg.canonicalSource});
      }
      if(!state.baseGetLayer(state.cfg.canonicalLayer)){
        const layer={id:state.cfg.canonicalLayer,type:'raster',source:state.cfg.canonicalSource,layout:{visibility:'none'},paint:{'raster-opacity':state.cfg.opacity(),'raster-fade-duration':0}};
        const before=anchor(state);before?state.baseAddLayer(layer,before):state.baseAddLayer(layer);
        mark('heatmap.v119-image-layer-created',{map:state.role,styleEpoch:state.styleEpoch,layer:state.cfg.canonicalLayer});
      }
      source=state.baseGetSource(state.cfg.canonicalSource);
      state.canonicalReady=!!source&&!!state.baseGetLayer(state.cfg.canonicalLayer);
      return state.canonicalReady?source:null;
    }catch(e){
      state.canonicalReady=false;
      mark('heatmap.v119-canonical-create-wait',{map:state.role,styleLoaded:styleLoaded(state),styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180)});
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
    list.sort((a,b)=>a.source.serial-b.source.serial);return list[list.length-1];
  }
  function shouldHide(state){return state.projectBlank||(state.role==='primary'&&!primaryHeatEnabled());}
  function commit(state,candidate,reason){
    if(!candidate||hidden||shouldHide(state)||!styleLoaded(state))return false;
    const current=chooseCandidate(state);if(!current||current.id!==candidate.id||current.source.id!==candidate.source.id)return false;
    const frame=candidate.source.frame,coords=cloneCoords(candidate.source.coordinates);if(!frame||!coords)return false;
    const source=ensureCanonical(state,coords);if(!source)return false;
    if(state.currentFrame===frame&&state.committedStyleEpoch===state.styleEpoch){showCanonical(state);return true;}
    try{
      source.updateImage({image:frame.image,coordinates:coords});
      const previous=state.currentFrame;
      state.currentFrame=frame;state.currentSource=candidate.source.id;state.currentLayer=candidate.id;state.committedStyleEpoch=state.styleEpoch;
      showCanonical(state);
      mark('heatmap.v119-image-committed',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,reason});
      if(previous&&previous!==frame){let released=false;const release=()=>{if(released)return;released=true;closeFrame(previous);};try{state.map.once('render',()=>requestAnimationFrame(release));state.map.triggerRepaint();setTimeout(release,500);}catch(e){setTimeout(release,0);}}
      return true;
    }catch(e){
      mark('heatmap.v119-image-commit-failed',{map:state.role,styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180),reason});
      return false;
    }
  }
  function maybeCommit(state,reason){
    if(!state||hidden)return false;
    if(shouldHide(state)){hideCanonical(state,reason);return false;}
    const candidate=chooseCandidate(state);
    // No candidate can be a normal double-buffer transition. Keep the old complete image.
    if(!candidate)return false;
    return commit(state,candidate,reason);
  }
  function scheduleCommit(state,reason){
    if(state.commitTimer)return;
    state.commitTimer=setTimeout(()=>{state.commitTimer=null;maybeCommit(state,reason);},0);
  }
  function virtualSource(state,id,spec){
    const canvas=spec?.canvas,record={id:String(id),canvas,coordinates:cloneCoords(spec?.coordinates),tier:inferTier(state.role,id,canvas),serial:++state.serial,projectSerial:primaryProjectSerial,frame:null,removed:false};
    const api={id:record.id,type:'canvas',getCanvas:()=>record.canvas,setCoordinates:coords=>{const c=cloneCoords(coords);if(c)record.coordinates=c;scheduleCommit(state,'coordinates');return api;},play:()=>api,pause:()=>api,loaded:()=>true,serialize:()=>({type:'canvas',canvas:record.canvas,coordinates:clone(record.coordinates),animate:false})};
    record.api=api;state.sources.set(record.id,record);
    decodeCompleteCanvas(canvas).then(frame=>{
      if(record.removed){closeFrame(frame);return;}
      record.frame=frame;mark('heatmap.v119-frame-ready',{map:state.role,source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none'});scheduleCommit(state,'frame-ready');
    }).catch(e=>mark('heatmap.v119-frame-decode-failed',{map:state.role,source:record.id,error:String(e?.message||e).slice(0,160)}));
    mark('heatmap.v119-canvas-intercepted',{map:state.role,source:record.id,tier:record.tier||0,width:+canvas?.width||0,height:+canvas?.height||0});return api;
  }
  function virtualLayer(state,layer){
    const id=String(layer?.id||''),record={id,type:layer?.type||'raster',source:String(layer?.source||''),layout:{...(layer?.layout||{}),visibility:layer?.layout?.visibility||'visible'},paint:{...(layer?.paint||{})}};
    record.paint['raster-fade-duration']=0;state.layers.set(id,record);scheduleCommit(state,'layer-added');return record;
  }
  function mergedStyle(state){
    const style=clone(state.baseGetStyle?.()||{})||{};style.sources={...(style.sources||{})};
    for(const [id,s] of state.sources)style.sources[id]={type:'canvas',canvas:s.canvas,coordinates:clone(s.coordinates),animate:false};
    style.layers=Array.isArray(style.layers)?style.layers.slice():[];const actual=new Set(style.layers.map(x=>x?.id));
    for(const l of state.layers.values())if(!actual.has(l.id))style.layers.push({id:l.id,type:l.type,source:l.source,layout:{...l.layout},paint:{...l.paint}});
    return style;
  }
  function patchMap(map,role){
    if(!map||map.__padGradeV119HeatState)return !!map;
    const cfg=configFor(role),state={map,role,cfg,sources:new Map(),layers:new Map(),serial:0,styleEpoch:0,canonicalReady:false,currentFrame:null,currentSource:'',currentLayer:'',committedStyleEpoch:-1,visible:false,projectBlank:false,commitTimer:null,
      baseAddSource:map.addSource.bind(map),baseGetSource:map.getSource.bind(map),baseRemoveSource:map.removeSource.bind(map),baseAddLayer:map.addLayer.bind(map),baseGetLayer:map.getLayer.bind(map),baseRemoveLayer:map.removeLayer.bind(map),baseSetLayoutProperty:map.setLayoutProperty.bind(map),baseGetLayoutProperty:map.getLayoutProperty.bind(map),baseSetPaintProperty:map.setPaintProperty.bind(map),baseGetPaintProperty:map.getPaintProperty.bind(map),baseMoveLayer:map.moveLayer?.bind(map),baseGetStyle:map.getStyle?.bind(map)};
    map.__padGradeV119HeatState=state;controllers.add(state);if(role==='primary')window.__padGradeV119PrimaryHeatState=state;else window.__padGradeCompareMapInstance=map;
    map.addSource=function(id,spec){if(cfg.sourceMatch(id)&&spec?.type==='canvas'){virtualSource(state,id,spec);return this;}return state.baseAddSource(id,spec);};
    map.getSource=function(id){return state.sources.get(String(id||''))?.api||state.baseGetSource(id);};
    map.removeSource=function(id){id=String(id||'');const r=state.sources.get(id);if(r){r.removed=true;state.sources.delete(id);if(r.frame&&r.frame!==state.currentFrame)closeFrame(r.frame);scheduleCommit(state,'source-removed');return this;}return state.baseRemoveSource(id);};
    map.addLayer=function(layer,before){const id=String(layer?.id||'');if(cfg.layerMatch(id)||state.sources.has(String(layer?.source||''))){virtualLayer(state,layer);return this;}return before===undefined?state.baseAddLayer(layer):state.baseAddLayer(layer,before);};
    map.getLayer=function(id){const l=state.layers.get(String(id||''));return l?{id:l.id,type:l.type,source:l.source}:state.baseGetLayer(id);};
    map.removeLayer=function(id){id=String(id||'');if(state.layers.has(id)){state.layers.delete(id);scheduleCommit(state,'layer-removed');return this;}return state.baseRemoveLayer(id);};
    map.setLayoutProperty=function(id,name,value){id=String(id||'');const l=state.layers.get(id);if(l){l.layout[name]=value;scheduleCommit(state,`layout-${name}`);return this;}return state.baseSetLayoutProperty(id,name,value);};
    map.getLayoutProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.layout[name]:state.baseGetLayoutProperty(id,name);};
    map.setPaintProperty=function(id,name,value){id=String(id||'');const l=state.layers.get(id);if(l){l.paint[name]=value;scheduleCommit(state,`paint-${name}`);return this;}return state.baseSetPaintProperty(id,name,value);};
    map.getPaintProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.paint[name]:state.baseGetPaintProperty(id,name);};
    map.moveLayer=function(id,before){if(state.layers.has(String(id||'')))return this;return state.baseMoveLayer?state.baseMoveLayer(id,before):this;};
    map.getStyle=function(){return mergedStyle(state);};
    const styleReady=reason=>{state.styleEpoch++;state.canonicalReady=false;state.committedStyleEpoch=-1;mark('heatmap.v119-style-ready',{map:role,styleEpoch:state.styleEpoch,reason});setTimeout(()=>maybeCommit(state,reason),0);};
    try{map.on('style.load',()=>styleReady('style-load'));map.on('load',()=>{if(state.styleEpoch===0)styleReady('map-load');});map.on('idle',()=>{if(!state.canonicalReady&&chooseCandidate(state))maybeCommit(state,'map-idle');});map.on('remove',()=>{if(state.commitTimer)clearTimeout(state.commitTimer);for(const s of state.sources.values())if(s.frame&&s.frame!==state.currentFrame)closeFrame(s.frame);closeFrame(state.currentFrame);controllers.delete(state);});}catch(e){}
    mark('heatmap.v119-map-controller-installed',{map:role,source:cfg.canonicalSource,layer:cfg.canonicalLayer});return true;
  }
  function containerId(options){const c=options?.container;return typeof c==='string'?c:(c&&c.id)||'';}
  function installConstructorHook(){
    const gl=window.maplibregl;if(!gl||typeof gl.Map!=='function')return false;const Original=gl.Map;if(Original.__padGradeV119HeatCtor)return true;
    class PadGradeV119Map extends Original{constructor(options){super(options);const id=containerId(options);if(id==='gpsMap')patchMap(this,'primary');else if(id==='pgCompareMap')patchMap(this,'compare');}}
    try{Object.setPrototypeOf(PadGradeV119Map,Original);}catch(e){}PadGradeV119Map.__padGradeV119HeatCtor=true;PadGradeV119Map.__padGradeV119Original=Original;gl.Map=PadGradeV119Map;mark('heatmap.v119-constructor-hook-installed',{maps:['primary','compare']});return true;
  }

  // Preserve the useful v1.1.8 project boundary behavior: never show an outgoing project's heat.
  function wrapDiagnostics(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV119Wrapped)return false;const original=d.mark.bind(d);d.__padGradeV119Wrapped=true;
    d.mark=function(name,details){const result=original(name,details);try{const p=window.__padGradeV119PrimaryHeatState;if(name==='project.switch-v113-start'){primaryProjectSerial++;if(p){p.projectBlank=true;hideCanonical(p,'project-switch-start');}}else if(name==='project.switch-v113-complete'){if(p){p.projectBlank=false;scheduleCommit(p,'project-switch-complete');}}}catch(e){}return result;};
    original('heatmap.v119-diagnostics-installed',{version:VERSION,presentation:'single-style-owned-imagesource'});return true;
  }

  // GPS stays suspended while minimized, but no satellite imagery is unloaded.
  let geoInstalled=false,geoSuspended=false,nextWatch=1190000,geoBase=null;const geoWatches=new Map();
  function manualFallbackFromPermission(){
    try{const manual=document.getElementById('manualModeBtn');if(manual&&!manual.classList.contains('activeMode'))manual.click();const i=document.getElementById('gpsInstruction');if(i)i.textContent='Location permission was not granted. Select GPS Guided to try again.';mark('gps.permission-denied-manual-fallback',{version:VERSION});}catch(e){}
  }
  function installSuspendableGps(){
    if(geoInstalled)return true;const geo=navigator.geolocation;if(!geo||typeof geo.watchPosition!=='function'||typeof geo.clearWatch!=='function')return false;geoInstalled=true;geoBase={watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo),get:typeof geo.getCurrentPosition==='function'?geo.getCurrentPosition.bind(geo):null};
    const start=r=>{if(!r||geoSuspended||r.underlyingId!=null)return;try{r.underlyingId=geoBase.watch(pos=>{if(!geoSuspended&&geoWatches.has(r.virtualId))r.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(r.virtualId)){if(+err?.code===1)setTimeout(manualFallbackFromPermission,0);r.error?.(err);}},r.options);}catch(e){r.underlyingId=null;try{r.error?.(e);}catch(_){}}};
    try{
      if(geoBase.get)geo.getCurrentPosition=function(success,error,options){return geoBase.get(success,err=>{if(+err?.code===1)setTimeout(manualFallbackFromPermission,0);try{error?.(err);}catch(_){}},options);};
      geo.watchPosition=function(success,error,options){const virtualId=nextWatch++,r={virtualId,underlyingId:null,success,error,options:options||{}};geoWatches.set(virtualId,r);start(r);mark('background.gps-watch-registered',{virtualId,activeUnderlying:r.underlyingId!=null,totalVirtual:geoWatches.size});return virtualId;};
      geo.clearWatch=function(id){const r=geoWatches.get(id);if(!r)return geoBase.clear(id);geoWatches.delete(id);if(r.underlyingId!=null){try{geoBase.clear(r.underlyingId);}catch(e){}r.underlyingId=null;}mark('background.gps-watch-cleared',{virtualId:id,totalVirtual:geoWatches.size});};
    }catch(e){return false;}
    return true;
  }
  function suspendGps(){
    if(geoSuspended)return;geoSuspended=true;let stopped=0;for(const r of geoWatches.values())if(r.underlyingId!=null){try{geoBase?.clear(r.underlyingId);}catch(e){}r.underlyingId=null;stopped++;}mark('background.gps-suspended',{stopped,registered:geoWatches.size,version:VERSION});
  }
  function resumeGps(){
    if(!geoSuspended)return;geoSuspended=false;let restarted=0;for(const r of geoWatches.values())if(r.underlyingId==null){try{r.underlyingId=geoBase?.watch(pos=>{if(!geoSuspended&&geoWatches.has(r.virtualId))r.success?.(pos);},err=>{if(!geoSuspended&&geoWatches.has(r.virtualId)){if(+err?.code===1)setTimeout(manualFallbackFromPermission,0);r.error?.(err);}},r.options);if(r.underlyingId!=null)restarted++;}catch(e){r.underlyingId=null;}}mark('background.gps-resumed',{restarted,registered:geoWatches.size,version:VERSION});
  }
  function onVisibility(){
    hidden=document.visibilityState==='hidden';if(hidden){suspendGps();mark('background.suspend-complete',{version:VERSION,imagery:'retained',heat:'retained-permanent-image'});}else{resumeGps();for(const s of controllers)scheduleCommit(s,'visibility-visible');mark('background.resume-complete',{version:VERSION,imagery:'retained'});}
  }

  wrapDiagnostics();installSuspendableGps();
  window.addEventListener('padgrade-maplibre-ready',()=>installConstructorHook(),{once:false});
  if(window.maplibregl)installConstructorHook();
  document.addEventListener('visibilitychange',onVisibility,true);
  window.addEventListener('padgrade-project-grid-ready',()=>{const p=window.__padGradeV119PrimaryHeatState;if(p)scheduleCommit(p,'project-grid-ready');});
  window.addEventListener('padgrade-active-project-applied',()=>{const p=window.__padGradeV119PrimaryHeatState;if(p){p.projectBlank=false;scheduleCommit(p,'active-project-applied');}});
  setTimeout(()=>{wrapDiagnostics();installSuspendableGps();installConstructorHook();},0);
  mark('heatmap.v119-runtime-installed',{version:VERSION,legacyMapLibreCanvasSources:false,mainAndCompare:true,gpsSuspend:true,imagerySuspend:false});
})();
