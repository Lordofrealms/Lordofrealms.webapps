/* Pad Grade v1.1.10 DEV — permanent heat ImageSource cutover + GPS permission retry behavior.
 *
 * v1.1.10 makes one ImageSource/raster layer per MapLibre map authoritative. Existing
 * workers/cache still build complete canvases, but those canvases never become real
 * MapLibre CanvasSources. They are only offscreen frame inputs. The permanent source is
 * created only after the current style is fully loaded, then updated in-place with a
 * complete PNG data URL using the URL-only ImageSource.updateImage contract in pinned MapLibre 5.16.0. Main and Project Comparison use the same controller.
 */
(function installPadGrade120Dev(){
  'use strict';
  if(window.__padGradeDevV120)return;
  window.__padGradeDevV120=true;
  window.__padGradeDevV119=true;
  window.__padGradeV120OwnsHeatPresentation=true;
  // Do not execute the superseded heat/background presentation experiments after this.
  window.__padGradeDevV114=true;
  window.__padGradeDevV115=true;
  window.__padGradeDevV116=true;
  window.__padGradeDevV117=true;
  window.__padGradeDevV118=true;

  const VERSION='1.1.10';
  const PRIMARY_NORMAL_SOURCE='pad-grade-interpolated-surface-canvas-source-';
  const PRIMARY_NORMAL_LAYER='pad-grade-interpolated-surface-canvas-layer-';
  const PRIMARY_INSPECT_SOURCE='pad-grade-v113-inspect-source-';
  const PRIMARY_INSPECT_LAYER='pad-grade-v113-inspect-layer-';
  const COMPARE_SOURCE='pg-compare-heat-source-';
  const COMPARE_LAYER='pg-compare-heat-layer-';
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
      canonicalSource:'pad-grade-v120-compare-heat-image-source',
      canonicalLayer:'pad-grade-v120-compare-heat-image-layer',
      sourceMatch:id=>String(id||'').startsWith(COMPARE_SOURCE),
      layerMatch:id=>String(id||'').startsWith(COMPARE_LAYER),
      inspectMatch:()=>false,
      opacity:()=>.62,
      anchors:['pg-compare-grid-layer']
    }:{
      role:'primary',
      canonicalSource:'pad-grade-v120-heat-image-source',
      canonicalLayer:'pad-grade-v120-heat-image-layer',
      sourceMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_SOURCE)||id.startsWith(PRIMARY_INSPECT_SOURCE);},
      layerMatch:id=>{id=String(id||'');return id.startsWith(PRIMARY_NORMAL_LAYER)||id.startsWith(PRIMARY_INSPECT_LAYER);},
      inspectMatch:id=>String(id||'').startsWith(PRIMARY_INSPECT_LAYER),
      opacity:primaryOpacity,
      anchors:['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer']
    };
  }
  function inferTier(role,id,canvas){
    const longest=Math.max(+canvas?.width||0,+canvas?.height||0);
    const nearest=[99,297,891].reduce((best,t)=>Math.abs(t-longest)<Math.abs(best-longest)?t:best,99);
    if(role==='compare')return nearest;
    const explicit=String(id||'').match(/inspect-source-(\d+)$/);
    return explicit?+explicit[1]:nearest;
  }
  function sampleFrame(canvas){
    try{
      const probe=document.createElement('canvas');probe.width=16;probe.height=16;
      const ctx=probe.getContext('2d',{alpha:true});if(!ctx)return null;
      ctx.drawImage(canvas,0,0,probe.width,probe.height);
      const data=ctx.getImageData(0,0,probe.width,probe.height).data;
      let nonTransparent=0,maxAlpha=0,minAlpha=255;
      for(let i=3;i<data.length;i+=4){const a=data[i];if(a>0)nonTransparent++;if(a>maxAlpha)maxAlpha=a;if(a<minAlpha)minAlpha=a;}
      return {samplePixels:data.length/4,sampleNonTransparent:nonTransparent,sampleMinAlpha:minAlpha,sampleMaxAlpha:maxAlpha};
    }catch(e){return null;}
  }
  async function encodeCompleteCanvas(canvas){
    if(!canvas||typeof canvas.toDataURL!=='function')return null;
    const started=performance.now?.()||Date.now();
    try{
      const url=canvas.toDataURL('image/png');
      if(!url||!url.startsWith('data:image/png'))return null;
      const stats=sampleFrame(canvas)||{};
      return {url,kind:'PNGDataURL',width:+canvas.width||0,height:+canvas.height||0,encodedChars:url.length,encodeMs:Math.max(0,(performance.now?.()||Date.now())-started),...stats};
    }catch(e){mark('heatmap.v120-frame-encode-failed',{error:String(e?.message||e).slice(0,160)});return null;}
  }
  function canMutateStyle(state){try{return state.styleEpoch>0||!!state.map.isStyleLoaded?.();}catch(e){return state.styleEpoch>0;}}
  function anchor(state){for(const id of state.cfg.anchors){try{if(state.baseGetLayer(id))return id;}catch(e){}}return undefined;}
  function hideCanonical(state,reason){
    try{if(state.baseGetLayer(state.cfg.canonicalLayer))state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','none');state.visible=false;state.map.triggerRepaint?.();}catch(e){}
    if(reason)mark('heatmap.v120-hidden',{map:state.role,reason});
  }
  function showCanonical(state){
    try{if(state.baseGetLayer(state.cfg.canonicalLayer)){state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-opacity',state.cfg.opacity());state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','visible');state.visible=true;state.map.triggerRepaint?.();return true;}}catch(e){}
    return false;
  }
  function ensureCanonical(state,coords,frame){
    if(!canMutateStyle(state)||!coords||!frame?.url)return null;
    try{
      let source=state.baseGetSource(state.cfg.canonicalSource),created=false;
      if(!source){
        state.baseAddSource(state.cfg.canonicalSource,{type:'image',url:frame.url,coordinates:coords});
        source=state.baseGetSource(state.cfg.canonicalSource);created=true;
        mark('heatmap.v120-image-source-created',{map:state.role,styleEpoch:state.styleEpoch,source:state.cfg.canonicalSource,transport:'url',initialFrame:true});
      }
      if(!state.baseGetLayer(state.cfg.canonicalLayer)){
        const layer={id:state.cfg.canonicalLayer,type:'raster',source:state.cfg.canonicalSource,layout:{visibility:'none'},paint:{'raster-opacity':state.cfg.opacity(),'raster-fade-duration':0}};
        const before=anchor(state);before?state.baseAddLayer(layer,before):state.baseAddLayer(layer);
        mark('heatmap.v120-image-layer-created',{map:state.role,styleEpoch:state.styleEpoch,layer:state.cfg.canonicalLayer,before:before||null});
      }
      source=state.baseGetSource(state.cfg.canonicalSource);
      state.canonicalReady=!!source&&!!state.baseGetLayer(state.cfg.canonicalLayer);
      return state.canonicalReady?{source,created}:null;
    }catch(e){
      state.canonicalReady=false;
      let actual=false;try{actual=!!state.map.isStyleLoaded?.();}catch(_){}
      mark('heatmap.v120-canonical-create-wait',{map:state.role,styleReady:canMutateStyle(state),actualStyleLoaded:actual,styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180)});
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
  function imageDims(source){
    try{const image=source?.image;return {width:+image?.width||0,height:+image?.height||0};}catch(e){return {width:0,height:0};}
  }
  function verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,attempt=0){
    if(request!==state.requestSerial)return;
    let loaded=false;try{loaded=source.loaded?.()===true;}catch(e){}
    const dims=imageDims(source),changed=!!source?.image&&source.image!==previousImage;
    if(loaded&&changed&&dims.width===frame.width&&dims.height===frame.height){
      const previous=state.currentFrame;
      state.currentFrame=frame;state.currentSource=candidate.source.id;state.currentLayer=candidate.id;state.committedStyleEpoch=state.styleEpoch;
      showCanonical(state);
      mark('heatmap.v120-image-committed',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,transport:'url',sourceLoaded:true,verifiedImageWidth:dims.width,verifiedImageHeight:dims.height,verifyMs:Math.max(0,(performance.now?.()||Date.now())-started),reason});
      if(previous&&previous!==frame)previous.url='';
      return;
    }
    if(attempt<200){state.verifyTimer=setTimeout(()=>verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,attempt+1),25);return;}
    mark('heatmap.v120-image-verify-failed',{map:state.role,styleEpoch:state.styleEpoch,loaded,changed,verifiedImageWidth:dims.width,verifiedImageHeight:dims.height,expectedWidth:frame.width,expectedHeight:frame.height,reason});
  }
  function commit(state,candidate,reason){
    if(!candidate||hidden||shouldHide(state)||!canMutateStyle(state))return false;
    const current=chooseCandidate(state);if(!current||current.id!==candidate.id||current.source.id!==candidate.source.id)return false;
    const frame=candidate.source.frame,coords=cloneCoords(candidate.source.coordinates);if(!frame?.url||!coords)return false;
    if(state.currentFrame===frame&&state.committedStyleEpoch===state.styleEpoch){showCanonical(state);return true;}
    const ensured=ensureCanonical(state,coords,frame);if(!ensured)return false;
    const source=ensured.source,previousImage=ensured.created?null:(source.image||null),request=++state.requestSerial,started=performance.now?.()||Date.now();
    if(state.verifyTimer){clearTimeout(state.verifyTimer);state.verifyTimer=null;}
    try{
      if(!ensured.created)source.updateImage({url:frame.url,coordinates:coords});
      mark('heatmap.v120-image-requested',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,kind:frame.kind,transport:'url',encodedChars:frame.encodedChars||0,encodeMs:frame.encodeMs||0,sampleNonTransparent:frame.sampleNonTransparent??null,samplePixels:frame.samplePixels??null,reason,initialSource:ensured.created});
      verifyRequestedFrame(state,request,source,previousImage,candidate,frame,reason,started,0);
      return true;
    }catch(e){
      mark('heatmap.v120-image-commit-failed',{map:state.role,styleEpoch:state.styleEpoch,error:String(e?.message||e).slice(0,180),reason,transport:'url'});
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
    encodeCompleteCanvas(canvas).then(frame=>{
      if(record.removed)return;if(!frame){mark('heatmap.v120-frame-encode-failed',{map:state.role,source:record.id});return;}
      record.frame=frame;mark('heatmap.v120-frame-ready',{map:state.role,source:record.id,tier:record.tier||0,width:frame?.width||0,height:frame?.height||0,kind:frame?.kind||'none',encodedChars:frame?.encodedChars||0,encodeMs:frame?.encodeMs||0,sampleNonTransparent:frame?.sampleNonTransparent??null,samplePixels:frame?.samplePixels??null});scheduleCommit(state,'frame-ready');
    }).catch(e=>mark('heatmap.v120-frame-decode-failed',{map:state.role,source:record.id,error:String(e?.message||e).slice(0,160)}));
    mark('heatmap.v120-canvas-intercepted',{map:state.role,source:record.id,tier:record.tier||0,width:+canvas?.width||0,height:+canvas?.height||0});return api;
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
    if(!map||map.__padGradeV120HeatState)return !!map;
    const cfg=configFor(role),state={map,role,cfg,sources:new Map(),layers:new Map(),serial:0,styleEpoch:0,canonicalReady:false,currentFrame:null,currentSource:'',currentLayer:'',committedStyleEpoch:-1,visible:false,projectBlank:false,commitTimer:null,requestSerial:0,verifyTimer:null,
      baseAddSource:map.addSource.bind(map),baseGetSource:map.getSource.bind(map),baseRemoveSource:map.removeSource.bind(map),baseAddLayer:map.addLayer.bind(map),baseGetLayer:map.getLayer.bind(map),baseRemoveLayer:map.removeLayer.bind(map),baseSetLayoutProperty:map.setLayoutProperty.bind(map),baseGetLayoutProperty:map.getLayoutProperty.bind(map),baseSetPaintProperty:map.setPaintProperty.bind(map),baseGetPaintProperty:map.getPaintProperty.bind(map),baseMoveLayer:map.moveLayer?.bind(map),baseGetStyle:map.getStyle?.bind(map)};
    map.__padGradeV120HeatState=state;controllers.add(state);if(role==='primary')window.__padGradeV120PrimaryHeatState=state;else window.__padGradeCompareMapInstance=map;
    map.addSource=function(id,spec){if(cfg.sourceMatch(id)&&spec?.type==='canvas'){virtualSource(state,id,spec);return this;}return state.baseAddSource(id,spec);};
    map.getSource=function(id){return state.sources.get(String(id||''))?.api||state.baseGetSource(id);};
    map.removeSource=function(id){id=String(id||'');const r=state.sources.get(id);if(r){r.removed=true;state.sources.delete(id);scheduleCommit(state,'source-removed');return this;}return state.baseRemoveSource(id);};
    map.addLayer=function(layer,before){const id=String(layer?.id||'');if(cfg.layerMatch(id)||state.sources.has(String(layer?.source||''))){virtualLayer(state,layer);return this;}return before===undefined?state.baseAddLayer(layer):state.baseAddLayer(layer,before);};
    map.getLayer=function(id){const l=state.layers.get(String(id||''));return l?{id:l.id,type:l.type,source:l.source}:state.baseGetLayer(id);};
    map.removeLayer=function(id){id=String(id||'');if(state.layers.has(id)){state.layers.delete(id);scheduleCommit(state,'layer-removed');return this;}return state.baseRemoveLayer(id);};
    map.setLayoutProperty=function(id,name,value){id=String(id||'');const l=state.layers.get(id);if(l){l.layout[name]=value;scheduleCommit(state,`layout-${name}`);return this;}return state.baseSetLayoutProperty(id,name,value);};
    map.getLayoutProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.layout[name]:state.baseGetLayoutProperty(id,name);};
    map.setPaintProperty=function(id,name,value){id=String(id||'');const l=state.layers.get(id);if(l){l.paint[name]=value;scheduleCommit(state,`paint-${name}`);return this;}return state.baseSetPaintProperty(id,name,value);};
    map.getPaintProperty=function(id,name){const l=state.layers.get(String(id||''));return l?l.paint[name]:state.baseGetPaintProperty(id,name);};
    map.moveLayer=function(id,before){if(state.layers.has(String(id||'')))return this;return state.baseMoveLayer?state.baseMoveLayer(id,before):this;};
    map.getStyle=function(){return mergedStyle(state);};
    const styleReady=reason=>{state.styleEpoch++;state.canonicalReady=false;state.committedStyleEpoch=-1;mark('heatmap.v120-style-ready',{map:role,styleEpoch:state.styleEpoch,reason});setTimeout(()=>maybeCommit(state,reason),0);};
    try{map.on('style.load',()=>styleReady('style-load'));map.on('load',()=>{if(state.styleEpoch===0)styleReady('map-load');});map.on('idle',()=>{if(chooseCandidate(state))maybeCommit(state,'map-idle');});map.on('remove',()=>{if(state.commitTimer)clearTimeout(state.commitTimer);if(state.verifyTimer)clearTimeout(state.verifyTimer);controllers.delete(state);});}catch(e){}
    mark('heatmap.v120-map-controller-installed',{map:role,source:cfg.canonicalSource,layer:cfg.canonicalLayer});return true;
  }
  function containerId(options){const c=options?.container;return typeof c==='string'?c:(c&&c.id)||'';}
  function installConstructorHook(){
    const gl=window.maplibregl;if(!gl||typeof gl.Map!=='function')return false;const Original=gl.Map;if(Original.__padGradeV120HeatCtor)return true;
    class PadGradeV120Map extends Original{constructor(options){super(options);const id=containerId(options);if(id==='gpsMap')patchMap(this,'primary');else if(id==='pgCompareMap')patchMap(this,'compare');}}
    try{Object.setPrototypeOf(PadGradeV120Map,Original);}catch(e){}PadGradeV120Map.__padGradeV120HeatCtor=true;PadGradeV120Map.__padGradeV120Original=Original;gl.Map=PadGradeV120Map;mark('heatmap.v120-constructor-hook-installed',{maps:['primary','compare']});return true;
  }

  // Preserve the useful v1.1.8 project boundary behavior: never show an outgoing project's heat.
  function wrapDiagnostics(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV120Wrapped)return false;const original=d.mark.bind(d);d.__padGradeV120Wrapped=true;
    d.mark=function(name,details){const result=original(name,details);try{const p=window.__padGradeV120PrimaryHeatState;if(name==='project.switch-v113-start'){primaryProjectSerial++;if(p){p.projectBlank=true;hideCanonical(p,'project-switch-start');}}else if(name==='project.switch-v113-complete'){if(p){p.projectBlank=false;scheduleCommit(p,'project-switch-complete');}}}catch(e){}return result;};
    original('heatmap.v120-diagnostics-installed',{version:VERSION,presentation:'single-style-owned-imagesource'});return true;
  }

  // GPS stays suspended while minimized, but no satellite imagery is unloaded.
  let geoInstalled=false,geoSuspended=false,nextWatch=1200000,geoBase=null;const geoWatches=new Map();
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
  window.addEventListener('padgrade-project-grid-ready',()=>{const p=window.__padGradeV120PrimaryHeatState;if(p)scheduleCommit(p,'project-grid-ready');});
  window.addEventListener('padgrade-active-project-applied',()=>{const p=window.__padGradeV120PrimaryHeatState;if(p){p.projectBlank=false;scheduleCommit(p,'active-project-applied');}});
  setTimeout(()=>{wrapDiagnostics();installSuspendableGps();installConstructorHook();},0);
  mark('heatmap.v120-runtime-installed',{version:VERSION,legacyMapLibreCanvasSources:false,mainAndCompare:true,gpsSuspend:true,imagerySuspend:false});
})();
