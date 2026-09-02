/* Pad Grade v1.3.0 DEV — authoritative heat mutation lifecycle, cache render proof,
 * lazy exact-891 cache admission, and diagnostic-only imagery health instrumentation.
 *
 * IMPORTANT — PROTECTED v1.2.2 PRESENTATION CONTRACT
 * ---------------------------------------------------
 * This layer does NOT remove/recreate the permanent v1.2.2 canonical MapLibre heat
 * source/layer. Point changes still cancel obsolete calculation first, then mutate
 * authoritative point state, then retire the legacy producer's obsolete presentation
 * ownership, then hide the now-invalid canonical heat. Exact 891 cache returns feed
 * the existing v1.2.0/v1.2.2 virtual->canonical path and only re-activate visibility,
 * opacity and the existing CanvasSource texture after the completed cached frame has
 * been committed. Any re-architecture of the protected presenter still requires
 * explicit developer agreement and the dedicated no-flicker regression.
 * ---------------------------------------------------
 */
(function installPadGrade130Dev(){
  'use strict';
  if(window.__padGradeDevV130)return;
  window.__padGradeDevV130=true;

  const VERSION='1.3.0';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const HEAT_WORKER_RE=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const CANONICAL_SOURCE='pad-grade-v120-heat-image-source';
  const CANONICAL_LAYER='pad-grade-v120-heat-image-layer';
  const CACHE_FORMAT='PadGradeHeatCache';
  const CACHE_VERSION=2;
  const CACHE_ENGINE='local-surface-v078-edge-locked';
  const SNAPSHOT_LIMIT=2;
  const BASE_SOURCE='usgs-cached-imagery';
  const HIGH_SOURCE='usgs-naip-plus';
  const BASE_LAYER='usgs-cached';
  const HIGH_LAYER='usgs-highres';
  const WEB_MERCATOR_HALF=20037508.342789244;
  const WORLD_METERS=WEB_MERCATOR_HALF*2;

  const snapshots=new Map();
  const preflightGroups=new Map();
  const cacheBypass=new Set();
  let mutationSerial=0;
  let preflightEpoch=0;
  let pendingRender=null;
  let attachTimer=null;
  let mapPatched=null;
  let lazyParentWorker=null;
  let imageryMap=null;
  let imageryProbeAt=0;
  let imageryProbeSerial=0;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeProjectId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const identity=(projectId,key)=>`${projectId}\u0000${key}`;
  function currentSurfaceKey(){
    try{
      if(typeof window.pgMeasuredSurfacePoints!=='function'||typeof window.cfg!=='function')return '';
      const s=window.cfg(),points=window.pgMeasuredSurfacePoints();
      return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(points||[]).map(p=>[+p.x,+p.y,+p.v])});
    }catch(e){return '';}
  }
  function buildKey(message){
    const s=message?.settings||{};
    return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(message?.points||[]).map(p=>[+p.x,+p.y,+p.v])});
  }
  const cacheFilename=id=>`Pad-Grade-Heat-${String(id||'unknown').replace(/[^A-Za-z0-9._-]/g,'_')}.pgheatcache`;
  const snapshotToken=(projectId,key)=>identity(projectId,key);
  const heatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !t||!!t.checked;};
  const heatOpacity=()=>{try{const n=typeof window.pgHeatmapOpacity==='function'?+window.pgHeatmapOpacity():.58;return Number.isFinite(n)?n:.58;}catch(e){return .58;}};

  function cloneCanvas(canvas,width,height){
    try{
      const out=document.createElement('canvas');out.width=width;out.height=height;
      const ctx=out.getContext('2d',{alpha:true});if(!ctx)return null;
      ctx.drawImage(canvas,0,0,width,height);return out;
    }catch(e){return null;}
  }
  function releaseCanvas(canvas){try{if(canvas){canvas.width=1;canvas.height=1;}}catch(e){}}
  function imageCoordinates(){
    try{
      if(typeof window.fitPointLatLon!=='function'||typeof window.cfg!=='function'||typeof gpsFit==='undefined'||!gpsFit)return null;
      const s=window.cfg(),tl=window.fitPointLatLon(0,s.length),tr=window.fitPointLatLon(s.width,s.length),br=window.fitPointLatLon(s.width,0),bl=window.fitPointLatLon(0,0);
      if(!tl||!tr||!br||!bl)return null;
      return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];
    }catch(e){return null;}
  }
  function layerAnchor(map){
    try{for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;}catch(e){}
    return undefined;
  }

  function currentFinalCanvas(){
    const map=window.__padGradeMapInstance||mapPatched;
    try{
      if(!map||!heatEnabled()||map.getLayoutProperty?.(CANONICAL_LAYER,'visibility')==='none')return null;
      const mesh=window.__padGradeHeatmapMesh;if(+mesh?.tier!==891)return null;
      const canonical=map.getSource?.(CANONICAL_SOURCE),cc=canonical?.canvas;
      if(cc&&Math.max(+cc.width||0,+cc.height||0)===891)return cc;
    }catch(e){}
    try{
      const state=window.__padGradeV120PrimaryHeatState;if(!state?.sources)return null;
      let record=state.currentSource?state.sources.get(state.currentSource):null;
      if(!record?.canvas||record.removed||Math.max(+record.canvas.width||0,+record.canvas.height||0)!==891){
        record=[...state.sources.values()].filter(r=>r?.canvas&&!r.removed&&Math.max(+r.canvas.width||0,+r.canvas.height||0)===891).sort((a,b)=>(+a.serial||0)-(+b.serial||0)).pop()||null;
      }
      return record?.canvas||null;
    }catch(e){return null;}
  }
  function captureFinalSnapshot(projectId,key,reason){
    if(!projectId||!key)return false;
    const canvas=currentFinalCanvas(),nx=+canvas?.width||0,ny=+canvas?.height||0;
    if(!canvas||Math.max(nx,ny)!==891)return false;
    const copy=cloneCanvas(canvas,nx,ny);if(!copy)return false;
    const token=snapshotToken(projectId,key),prior=snapshots.get(token);if(prior)releaseCanvas(prior.canvas);
    snapshots.delete(token);snapshots.set(token,{projectId,key,nx,ny,canvas:copy,createdAt:now()});
    while(snapshots.size>SNAPSHOT_LIMIT){const first=snapshots.keys().next().value,old=snapshots.get(first);snapshots.delete(first);releaseCanvas(old?.canvas);}
    mark('heatmap.v130-final-snapshot-captured',{projectId,tier:891,nx,ny,reason,entries:snapshots.size,boundedLimit:SNAPSHOT_LIMIT});
    return true;
  }
  function decodePng(dataUrl,width,height){
    return new Promise(resolve=>{
      try{
        const image=new Image();
        image.onload=()=>{
          try{
            if(+image.naturalWidth!==width||+image.naturalHeight!==height){resolve(null);return;}
            const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
            const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){resolve(null);return;}
            ctx.drawImage(image,0,0,width,height);resolve(canvas);
          }catch(e){resolve(null);}
        };
        image.onerror=()=>resolve(null);image.src=dataUrl;
      }catch(e){resolve(null);}
    });
  }
  async function resolveExactCache(projectId,key){
    const token=snapshotToken(projectId,key),snap=snapshots.get(token);
    if(snap?.canvas&&Math.max(+snap.canvas.width||0,+snap.canvas.height||0)===891){
      const canvas=cloneCanvas(snap.canvas,snap.nx,snap.ny);
      if(canvas){snapshots.delete(token);releaseCanvas(snap.canvas);mark('heatmap.v130-cache-hit',{projectId,tier:891,source:'bounded-transition-snapshot'});return {projectId,key,nx:snap.nx,ny:snap.ny,canvas,source:'bounded-transition-snapshot'};}
    }
    const files=window.PadGradeFiles;if(!files?.read)return null;
    let text=null;try{text=await files.read(cacheFilename(projectId));}catch(e){return null;}
    if(!text)return null;
    let raw=null;try{raw=JSON.parse(text);}catch(e){return null;}
    if(raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.engine!==CACHE_ENGINE||raw.projectId!==projectId||raw.surfaceKey!==key||+raw.tier!==891||typeof raw.png!=='string')return null;
    const nx=+raw.nx||0,ny=+raw.ny||0;if(Math.max(nx,ny)!==891||nx<2||ny<2)return null;
    const canvas=await decodePng(raw.png,nx,ny);if(!canvas)return null;
    mark('heatmap.v130-cache-hit',{projectId,tier:891,source:'durable-exact-cache'});
    return {projectId,key,nx,ny,canvas,source:'durable-exact-cache'};
  }

  function clearVirtualSlot(map,slot){
    const lid=`${LAYER_PREFIX}${slot}`,sid=`${SOURCE_PREFIX}${slot}`;
    for(let pass=0;pass<2;pass++){
      try{if(map.getLayer?.(lid))map.removeLayer?.(lid);}catch(e){}
      try{if(map.getSource?.(sid))map.removeSource?.(sid);}catch(e){}
    }
  }
  function cancelPendingRender(reason){
    const p=pendingRender;if(!p)return;
    pendingRender=null;
    if(p.timeout)clearTimeout(p.timeout);
    mark('heatmap.v130-cache-render-cancelled',{projectId:p.projectId,reason});
  }
  function renderStateMatches(p){
    if(!p||p.projectId!==activeProjectId()||p.key!==currentSurfaceKey())return false;
    const state=window.__padGradeV120PrimaryHeatState;
    return !!state?.currentFrame&&state.currentSource===p.sourceId&&+window.__padGradeHeatmapMesh?.tier===891;
  }
  function canonicalVisible(map){try{return !!map.getLayer?.(CANONICAL_LAYER)&&map.getLayoutProperty?.(CANONICAL_LAYER,'visibility')!=='none';}catch(e){return false;}}
  function confirmOnRender(p,attempt){
    if(!p||pendingRender!==p)return;
    const map=window.__padGradeMapInstance||mapPatched;if(!map)return;
    let handled=false;
    const check=()=>{
      if(handled||pendingRender!==p)return;handled=true;
      const visible=canonicalVisible(map),current=renderStateMatches(p);
      if(visible&&current){
        pendingRender=null;if(p.timeout)clearTimeout(p.timeout);
        mark('heatmap.v130-cache-render-confirmed',{projectId:p.projectId,tier:891,attempt,elapsedMs:+Math.max(0,now()-p.startedAt).toFixed(1),canonicalLayerVisible:true,projectAndSurfaceCurrent:true});
        return;
      }
      if(attempt<2){activateCanonicalAfterCommit(p,2);return;}
      pendingRender=null;if(p.timeout)clearTimeout(p.timeout);
      mark('heatmap.v130-cache-render-failed',{projectId:p.projectId,tier:891,canonicalLayerVisible:visible,projectAndSurfaceCurrent:current,recoveryAttempts:1});
      cacheBypass.add(identity(p.projectId,p.key));
      retireLegacyOwner('cache-render-confirmation-failed');hideCanonicalHeat('cache-render-confirmation-failed');
      queueMicrotask(()=>{try{window.pgDrawSurface?.();}catch(e){}});
    };
    try{map.once?.('render',check);map.triggerRepaint?.();}catch(e){setTimeout(check,0);}
    setTimeout(check,450);
  }
  function activateCanonicalAfterCommit(p,attempt=1){
    if(!p||pendingRender!==p||!renderStateMatches(p))return false;
    const map=window.__padGradeMapInstance||mapPatched;if(!map)return false;
    let visible=false;
    try{
      if(map.getLayer?.(CANONICAL_LAYER)){
        map.setPaintProperty?.(CANONICAL_LAYER,'raster-opacity',heatOpacity());
        map.setLayoutProperty?.(CANONICAL_LAYER,'visibility',heatEnabled()?'visible':'none');
        const source=map.getSource?.(CANONICAL_SOURCE);
        try{source?.play?.();}catch(e){}
        map.triggerRepaint?.();
        requestAnimationFrame(()=>{try{source?.pause?.();map.triggerRepaint?.();}catch(e){}});
        visible=heatEnabled();
      }
    }catch(e){}
    mark(attempt===1?'heatmap.v130-canonical-layer-reactivated':'heatmap.v130-canonical-layer-reactivation-retry',{projectId:p.projectId,tier:891,visible,protectedCanonicalPreserved:true,attempt});
    confirmOnRender(p,attempt);return visible;
  }
  function onV122Committed(details){
    const p=pendingRender;if(!p||+details?.tier!==891||details?.map!=='primary'||String(details?.source||'')!==p.sourceId)return;
    if(p.committed)return;p.committed=true;
    mark('heatmap.v130-cache-frame-committed',{projectId:p.projectId,tier:891,source:p.cacheSource,elapsedMs:+Math.max(0,now()-p.startedAt).toFixed(1),protectedCanonicalPreserved:true});
    activateCanonicalAfterCommit(p,1);
  }
  function installDiagnosticObserver(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function')return false;
    if(d.mark.__padGradeV130Observer)return true;
    const base=d.mark.bind(d);
    const wrapped=function(name,details){const result=base(name,details);if(name==='heatmap.v122-canvas-committed')try{onV122Committed(details||{});}catch(e){}return result;};
    wrapped.__padGradeV130Observer=true;wrapped.__padGradeV130Base=base;d.mark=wrapped;
    base('heatmap.v130-diagnostic-observer-installed',{renderProofAfterV122Commit:true});return true;
  }
  function presentExactCache(item){
    const map=window.__padGradeMapInstance||mapPatched,coords=imageCoordinates();
    if(!map||!coords||!item||item.projectId!==activeProjectId()||item.key!==currentSurfaceKey())return false;
    const fresh=cloneCanvas(item.canvas,item.nx,item.ny);releaseCanvas(item.canvas);if(!fresh)return false;
    const sid=`${SOURCE_PREFIX}0`,lid=`${LAYER_PREFIX}0`;
    cancelPendingRender('new-cache-presentation');
    const p={projectId:item.projectId,key:item.key,sourceId:sid,cacheSource:item.source,startedAt:now(),committed:false,timeout:null};pendingRender=p;
    try{
      clearVirtualSlot(map,0);clearVirtualSlot(map,1);
      map.addSource(sid,{type:'canvas',canvas:fresh,coordinates:coords,animate:false});
      const layer={id:lid,type:'raster',source:sid,paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}};
      const before=layerAnchor(map);before?map.addLayer(layer,before):map.addLayer(layer);
      map.setLayoutProperty?.(lid,'visibility',heatEnabled()?'visible':'none');
      window.__padGradeHeatmapMesh={tier:891,nx:item.nx,ny:item.ny,cells:item.nx*item.ny,raster:true,canvasSource:true,atomicSwap:true,cached:true,progressiveTiers:[99,297,891],monotonic:true};
      map.triggerRepaint?.();
      mark('heatmap.v130-cache-frame-submitted',{projectId:item.projectId,tier:891,nx:item.nx,ny:item.ny,source:item.source,workersCreated:0,protectedCanonicalPreserved:true});
      p.timeout=setTimeout(()=>{
        if(pendingRender!==p)return;
        if(renderStateMatches(p)){
          if(!p.committed)mark('heatmap.v130-cache-frame-commit-inferred',{projectId:p.projectId,tier:891,reason:'presenter-state-current-before-diagnostic-marker'});
          p.committed=true;activateCanonicalAfterCommit(p,1);return;
        }
        mark('heatmap.v130-cache-frame-commit-timeout',{projectId:p.projectId,tier:891,elapsedMs:+Math.max(0,now()-p.startedAt).toFixed(1)});
        pendingRender=null;cacheBypass.add(identity(p.projectId,p.key));
        retireLegacyOwner('cache-frame-commit-timeout');hideCanonicalHeat('cache-frame-commit-timeout');queueMicrotask(()=>{try{window.pgDrawSurface?.();}catch(e){}});
      },1200);
      return true;
    }catch(e){pendingRender=null;releaseCanvas(fresh);mark('heatmap.v130-cache-frame-submit-failed',{projectId:item.projectId,error:String(e?.message||e).slice(0,160)});return false;}
  }

  function dispatchSynthetic(shim,message){
    try{shim.__dispatch(new MessageEvent('message',{data:message}));}catch(e){shim.__dispatch({type:'message',data:message});}
  }
  function cancelPreflights(reason){
    preflightEpoch++;
    for(const group of preflightGroups.values()){
      group.cancelled=true;
      for(const waiter of group.waiters){
        if(waiter.shim.__actual||waiter.shim.__terminated)continue;
        dispatchSynthetic(waiter.shim,{type:'empty',jobId:waiter.message.jobId,tier:waiter.message.tier,cancelled:true,cancelReason:reason});
      }
    }
    preflightGroups.clear();cancelPendingRender(reason);
    mark('heatmap.v130-preflight-cancelled',{reason});
  }
  function activateWaiter(waiter){
    if(waiter.shim.__terminated)return false;
    waiter.shim.__activateActual();
    waiter.shim.__forward(waiter.message,waiter.transfer,waiter.transferProvided);return true;
  }
  function flushGroup(group,hit){
    if(group.cancelled)return;
    const waiters=group.waiters.slice().sort((a,b)=>(+a.message.tier||0)-(+b.message.tier||0));
    if(hit){
      group.state='hit';
      for(const waiter of waiters)if(!waiter.shim.__terminated)dispatchSynthetic(waiter.shim,{type:'empty',jobId:waiter.message.jobId,tier:waiter.message.tier,cacheHit:true,cachePreflight:true});
      mark('heatmap.v130-exact-cache-short-circuit',{projectId:group.projectId,tiers:waiters.map(w=>+w.message.tier||0),workersCreated:0});
      return;
    }
    group.state='miss';
    for(const waiter of waiters)activateWaiter(waiter);
    mark('heatmap.v130-cache-preflight-miss',{projectId:group.projectId,tiers:waiters.map(w=>+w.message.tier||0),workersCreatedAfterMiss:waiters.length});
  }
  function beginPreflight(group){
    const epoch=preflightEpoch;group.promise=(async()=>{
      if(cacheBypass.has(group.identity))return null;
      const item=await resolveExactCache(group.projectId,group.key);
      if(group.cancelled||epoch!==preflightEpoch||group.projectId!==activeProjectId()||group.key!==currentSurfaceKey()){releaseCanvas(item?.canvas);return null;}
      if(item&&!presentExactCache(item))return null;
      return item;
    })().then(item=>{if(group.cancelled||epoch!==preflightEpoch)return;flushGroup(group,!!item);}).catch(e=>{mark('heatmap.v130-cache-preflight-error',{projectId:group.projectId,error:String(e?.message||e).slice(0,140)});if(!group.cancelled&&epoch===preflightEpoch)flushGroup(group,false);});
  }
  function queueRegularPreflight(shim,message,transfer,transferProvided){
    const projectId=activeProjectId(),key=buildKey(message),id=identity(projectId,key);
    let group=preflightGroups.get(id);
    if(!group){group={identity:id,projectId,key,state:'pending',waiters:[],cancelled:false,promise:null};preflightGroups.set(id,group);}
    const waiter={shim,message,transfer,transferProvided};group.waiters.push(waiter);
    if(group.state==='hit'){queueMicrotask(()=>dispatchSynthetic(shim,{type:'empty',jobId:message.jobId,tier:message.tier,cacheHit:true,cachePreflight:true}));return;}
    if(group.state==='miss'){queueMicrotask(()=>activateWaiter(waiter));return;}
    if(!group.promise)beginPreflight(group);
  }

  function installLazyWorker(){
    const Parent=window.Worker;if(typeof Parent!=='function')return false;
    if(Parent.__padGradeV130Lazy)return true;
    if(!Parent.__padGradeV127Lifecycle)return false;
    lazyParentWorker=Parent;
    class PadGrade130LazyWorker{
      constructor(url,options){
        this.__url=url;this.__options=options;this.__heat=HEAT_WORKER_RE.test(String(url||''));this.__actual=null;this.__terminated=false;
        this.__listeners=new Map();this.onmessage=null;this.onerror=null;this.onmessageerror=null;
        if(!this.__heat)this.__activateActual();
      }
      __dispatch(event){
        const type=event?.type||'message',prop=type==='message'?'onmessage':type==='error'?'onerror':'onmessageerror';
        try{if(typeof this[prop]==='function')this[prop].call(this,event);}catch(e){setTimeout(()=>{throw e;},0);}
        const list=(this.__listeners.get(type)||[]).slice();for(const entry of list){try{typeof entry.listener==='function'?entry.listener.call(this,event):entry.listener?.handleEvent?.(event);}catch(e){setTimeout(()=>{throw e;},0);}if(entry.once)this.removeEventListener(type,entry.listener);}
        return true;
      }
      __activateActual(){
        if(this.__actual||this.__terminated)return this.__actual;
        const actual=this.__options===undefined?new lazyParentWorker(this.__url):new lazyParentWorker(this.__url,this.__options);this.__actual=actual;
        actual.addEventListener('message',e=>this.__dispatch(e));actual.addEventListener('error',e=>this.__dispatch(e));actual.addEventListener('messageerror',e=>this.__dispatch(e));return actual;
      }
      __forward(message,transfer,transferProvided){const actual=this.__activateActual();if(!actual)return;if(transferProvided)actual.postMessage(message,transfer);else actual.postMessage(message);}
      postMessage(message,transfer){
        if(this.__terminated)return;
        const transferProvided=arguments.length>1;
        if(!this.__heat||message?.type!=='build'||String(message.context||'')!=='regular'){this.__forward(message,transfer,transferProvided);return;}
        queueRegularPreflight(this,message,transfer,transferProvided);
      }
      terminate(){this.__terminated=true;if(this.__actual)try{this.__actual.terminate();}catch(e){}}
      addEventListener(type,listener,options){if(!listener)return;const list=this.__listeners.get(type)||[];list.push({listener,once:!!(typeof options==='object'&&options?.once)});this.__listeners.set(type,list);}
      removeEventListener(type,listener){const list=this.__listeners.get(type)||[];this.__listeners.set(type,list.filter(x=>x.listener!==listener));}
      dispatchEvent(event){return this.__dispatch(event);}
    }
    try{Object.setPrototypeOf(PadGrade130LazyWorker,Parent);}catch(e){}
    PadGrade130LazyWorker.__padGradeV130Lazy=true;PadGrade130LazyWorker.__padGradeV130Parent=Parent;
    window.Worker=PadGrade130LazyWorker;
    mark('heatmap.v130-lazy-worker-installed',{exact891BeforeWorkerCreation:true,parentLifecycle:'v1.2.7'});return true;
  }

  function pointValueWillChange(){
    try{
      if(typeof pointFromIndex!=='function'||typeof k!=='function'||typeof readings==='undefined'||typeof currentIndex==='undefined')return true;
      const rc=pointFromIndex(currentIndex),key=k(rc.r,rc.c),old=readings[key],raw=document.getElementById('readingInput')?.value??'',next=raw===''?undefined:+raw;
      if((old===undefined)!==(next===undefined))return true;
      if(old===undefined&&next===undefined)return false;
      return !(Number.isFinite(+old)&&Number.isFinite(+next)&&Math.abs(+old-+next)<1e-12);
    }catch(e){return true;}
  }
  function retireLegacyOwner(reason){
    const draw=window.pgDrawSurface,basePoints=window.pgMeasuredSurfacePoints;if(typeof draw!=='function'||typeof basePoints!=='function')return false;
    let ok=false;
    try{
      window.pgMeasuredSurfacePoints=()=>[];
      draw();ok=true;
    }catch(e){mark('heatmap.v130-legacy-owner-retire-error',{reason,error:String(e?.message||e).slice(0,140)});}
    finally{window.pgMeasuredSurfacePoints=basePoints;}
    if(ok)mark('heatmap.v130-legacy-owner-retired',{reason,producerDisplayedCanvasCleared:true,pendingRastersCleared:true,legacy900msRetryHasNoRaster:true});
    return ok;
  }
  function hideCanonicalHeat(reason){
    const map=window.__padGradeMapInstance||mapPatched;let hidden=false;
    try{if(map?.getLayer?.(CANONICAL_LAYER)){map.setLayoutProperty(CANONICAL_LAYER,'visibility','none');map.triggerRepaint?.();hidden=true;}}catch(e){}
    mark('heatmap.v130-invalid-display-cleared',{reason,hidden,canonicalSourcePreserved:true,canonicalLayerPreserved:true});return hidden;
  }
  function installAuthoritativeMutation(){
    const base=window.__padGradeBaseSaveCurrentV130;if(typeof base!=='function')return false;
    if(window.saveCurrent?.__padGradeV130AuthoritativeMutation)return true;
    if(!window.PadGradeHeatGenerationV127?.beforeSurfaceMutation)return false;
    const wrapped=function(){
      if(!pointValueWillChange())return base.apply(this,arguments);
      const serial=++mutationSerial,projectId=activeProjectId(),beforeKey=currentSurfaceKey();
      // FIRST: cancel every pending cache preflight/lazy worker and every physically
      // running v1.2.7 generation before the authoritative reading can change.
      cancelPreflights('point-save');
      try{window.PadGradeHeatGenerationV127.beforeSurfaceMutation('point-save');}catch(e){}
      mark('heatmap.v130-mutation-start',{serial,projectId,order:['cancel','snapshot','mutate','retire-owner','clear','resolve']});
      captureFinalSnapshot(projectId,beforeKey,'point-save-after-cancel-before-mutation');
      const result=base.apply(this,arguments),afterKey=currentSurfaceKey();
      if(beforeKey&&afterKey&&beforeKey!==afterKey){
        cacheBypass.delete(identity(projectId,afterKey));
        retireLegacyOwner('point-save');
        hideCanonicalHeat('point-save');
        mark('heatmap.v130-mutation-authoritative',{serial,projectId,changed:true,legacyWrapperStackBypassed:true});
        queueMicrotask(()=>{try{window.pgDrawSurface?.();mark('heatmap.v130-refresh-requested',{serial,reason:'point-save',cacheBeforeWorker:true});}catch(e){}});
      }else mark('heatmap.v130-mutation-authoritative',{serial,projectId,changed:false,legacyWrapperStackBypassed:true});
      return result;
    };
    // Carry-forward markers intentionally tell the older periodic installers that
    // the lifecycle is already satisfied. They must not wrap this function again.
    wrapped.__padGradeV130AuthoritativeMutation=true;
    wrapped.__padGradeV127MutationFirst=true;
    wrapped.__padGradeV128MutationOrder=true;
    wrapped.__padGradeV129CacheSnapshotBeforeRetire=true;
    wrapped.__padGradeV130Base=base;
    window.saveCurrent=wrapped;
    mark('heatmap.v130-authoritative-mutation-installed',{oneWrapper:true,legacyV127V128V129RewrapBlocked:true,baseCapturedBeforeHeatWrappers:true});return true;
  }

  function hostFromError(event){
    const text=String(event?.error?.message||event?.message||'');
    if(/imagery\.nationalmap\.gov|naip|exportimage/i.test(text))return 'imagery.nationalmap.gov';
    if(/basemap\.nationalmap\.gov/i.test(text))return 'basemap.nationalmap.gov';
    return '';
  }
  function imageryState(map,reason){
    if(!map)return;
    let zoom=0,baseLoaded=false,highLoaded=false,baseVisible=false,highVisible=false;
    try{zoom=+map.getZoom?.()||0;baseLoaded=!!map.getSource?.(BASE_SOURCE)&&!!map.isSourceLoaded?.(BASE_SOURCE);highLoaded=!!map.getSource?.(HIGH_SOURCE)&&!!map.isSourceLoaded?.(HIGH_SOURCE);baseVisible=!!map.getLayer?.(BASE_LAYER)&&map.getLayoutProperty?.(BASE_LAYER,'visibility')!=='none';highVisible=!!map.getLayer?.(HIGH_LAYER)&&map.getLayoutProperty?.(HIGH_LAYER,'visibility')!=='none';}catch(e){}
    mark('imagery.v130-stack-state',{reason,zoom:+zoom.toFixed(2),expectedContributor:zoom>=14?'HIGH_RES_NAIP_PLUS':'BASE_USGS',base:{sourcePresent:!!map.getSource?.(BASE_SOURCE),loaded:baseLoaded,visible:baseVisible,maxZoom:16},highRes:{sourcePresent:!!map.getSource?.(HIGH_SOURCE),loaded:highLoaded,visible:highVisible,minZoom:14,maxZoom:22},diagnosticOnly:true});
  }
  function lonLatToTile(lon,lat,z){const n=2**z,x=Math.max(0,Math.min(n-1,Math.floor((lon+180)/360*n))),rad=Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180,y=Math.max(0,Math.min(n-1,Math.floor((1-Math.asinh(Math.tan(rad))/Math.PI)/2*n)));return {x,y};}
  function baseProbeUrl(center,z){const t=lonLatToTile(+center.lng,+center.lat,Math.min(16,z));return `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${Math.min(16,z)}/${t.y}/${t.x}`;}
  function highProbeUrl(center,z){
    z=Math.max(14,Math.min(22,z));const t=lonLatToTile(+center.lng,+center.lat,z),span=WORLD_METERS/(2**z),minx=-WEB_MERCATOR_HALF+t.x*span,maxx=minx+span,maxy=WEB_MERCATOR_HALF-t.y*span,miny=maxy-span;
    return `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=${minx},${miny},${maxx},${maxy}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=false&f=image`;
  }
  function probeImage(kind,url,zoom,serial){
    return new Promise(resolve=>{
      const started=now(),image=new Image();let done=false;
      const finish=(ok,reason)=>{if(done)return;done=true;clearTimeout(timer);mark('imagery.v130-probe-result',{kind,ok,reason,zoom:+zoom.toFixed(2),elapsedMs:+Math.max(0,now()-started).toFixed(1),width:+image.naturalWidth||0,height:+image.naturalHeight||0,serial,diagnosticOnly:true});resolve(ok);};
      const timer=setTimeout(()=>finish(false,'timeout'),6500);image.onload=()=>finish(true,'load');image.onerror=()=>finish(false,'error');image.src=url;
    });
  }
  async function probeImagery(map,reason,force=false){
    if(!map)return;const t=Date.now();if(!force&&t-imageryProbeAt<15000)return;imageryProbeAt=t;
    let center=null,zoom=0;try{center=map.getCenter?.();zoom=+map.getZoom?.()||0;}catch(e){}if(!center)return;
    const serial=++imageryProbeSerial,z=Math.max(0,Math.floor(zoom));
    mark('imagery.v130-probe-start',{serial,reason,zoom:+zoom.toFixed(2),base:true,highRes:zoom>=14,diagnosticOnly:true});
    const tasks=[probeImage('BASE_USGS',baseProbeUrl(center,z),zoom,serial)];if(zoom>=14)tasks.push(probeImage('HIGH_RES_NAIP_PLUS',highProbeUrl(center,z),zoom,serial));
    await Promise.all(tasks);imageryState(map,'after-independent-probes');
  }
  function attachImageryDiagnostics(map){
    if(!map||map.__padGradeV130ImageryDiagnostics)return !!map;map.__padGradeV130ImageryDiagnostics=true;imageryMap=map;
    map.on?.('sourcedata',event=>{const id=String(event?.sourceId||'');if(id!==BASE_SOURCE&&id!==HIGH_SOURCE)return;let loaded=false;try{loaded=!!map.isSourceLoaded?.(id);}catch(e){}if(loaded)mark('imagery.v130-source-loaded',{kind:id===HIGH_SOURCE?'HIGH_RES_NAIP_PLUS':'BASE_USGS',source:id,zoom:+(+map.getZoom?.()||0).toFixed(2),diagnosticOnly:true});});
    map.on?.('error',event=>{const source=String(event?.sourceId||event?.source?.id||''),host=hostFromError(event);if(source!==BASE_SOURCE&&source!==HIGH_SOURCE&&!host)return;mark('imagery.v130-source-error',{kind:source===HIGH_SOURCE||host==='imagery.nationalmap.gov'?'HIGH_RES_NAIP_PLUS':'BASE_USGS',source:source||undefined,host:host||undefined,zoom:+(+map.getZoom?.()||0).toFixed(2),message:String(event?.error?.message||event?.message||'unknown').replace(/https?:\/\/\S+/g,'[url]').slice(0,180),diagnosticOnly:true});});
    map.on?.('moveend',()=>{imageryState(map,'moveend');probeImagery(map,'moveend');});
    map.on?.('idle',()=>imageryState(map,'idle'));
    imageryState(map,'attach');setTimeout(()=>probeImagery(map,'initial',true),250);
    mark('imagery.v130-diagnostics-attached',{providersUnchanged:true,recoveryBehaviorUnchanged:true,independentHighResProbe:true,suppressedNaipErrorsNowObservable:true});return true;
  }

  function attach(){
    installDiagnosticObserver();installAuthoritativeMutation();installLazyWorker();
    const map=window.__padGradeMapInstance||null;if(map){mapPatched=map;attachImageryDiagnostics(map);}
    try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}
    const ready=!!window.saveCurrent?.__padGradeV130AuthoritativeMutation&&!!window.Worker?.__padGradeV130Lazy&&!!map?.__padGradeV130ImageryDiagnostics;
    if(ready&&attachTimer){clearInterval(attachTimer);attachTimer=null;}
    return ready;
  }

  window.PadGradeHeatLifecycleV130={version:VERSION,cancelPreflights,captureFinalSnapshot,retireLegacyOwner,hideCanonicalHeat,resolveExactCache,snapshot:()=>({version:VERSION,mutationSerial,pendingPreflights:preflightGroups.size,snapshots:snapshots.size,pendingRender:!!pendingRender,lazyWorker:!!window.Worker?.__padGradeV130Lazy})};
  window.addEventListener('padgrade-map-created',event=>{const map=event?.detail?.map||window.__padGradeMapInstance;mapPatched=map;setTimeout(()=>{attachImageryDiagnostics(map);attach();},0);});
  window.addEventListener('padgrade-active-project-applied',()=>{cancelPreflights('active-project-applied');preflightGroups.clear();cacheBypass.clear();setTimeout(attach,0);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,0),{once:true});else setTimeout(attach,0);
  attachTimer=setInterval(attach,100);
  window.addEventListener('beforeunload',()=>{if(attachTimer)clearInterval(attachTimer);cancelPreflights('beforeunload');for(const item of snapshots.values())releaseCanvas(item?.canvas);snapshots.clear();},{once:true});
  mark('heatmap.v130-runtime-installed',{version:VERSION,build:102,authoritativeMutationLifecycle:true,exact891BeforeWorkerCreation:true,cacheRenderConfirmation:true,oneShotCanonicalRecovery:true,legacyProducerRetiredThroughOwner:true,protectedV122PresenterUnchanged:true,imageryDiagnosticsOnly:true});
})();
