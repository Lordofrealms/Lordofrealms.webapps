/* Pad Grade v1.1.3 DEV — true heat swaps, reusable project surfaces, persistent final heat cache,
 * discrete resolution inspection, and Android lifecycle diagnostics.
 *
 * The authoritative IDW² worker math and 99/297/891 resolutions are unchanged.
 */
(function installPadGrade113Dev(){
  'use strict';
  if(window.__padGradeDevV113)return;
  window.__padGradeDevV113=true;

  const VERSION='1.1.3';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const TIERS=Object.freeze([99,297,891]);
  const GRID_LAYERS=Object.freeze(['pad-grade-grid-labels','pad-grade-grid-points-layer','pad-grade-route-layer','pad-grade-pad-outline-layer','pad-grade-grid-lines-layer']);
  const GRID_SOURCES=Object.freeze(['pad-grade-grid-points','pad-grade-route','pad-grade-pad-outline','pad-grade-grid-lines']);
  const HEAT_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const HEAT_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v113-inspect-layer-';
  const INSPECT_SOURCE_PREFIX='pad-grade-v113-inspect-source-';
  const CACHE_FORMAT='PadGradeHeatCache';
  const CACHE_VERSION=1;
  const WORKER_URL='heatmap-raster-worker-v073.js?v=20260825-1';
  const lifecycleImportedKey='padGradeLifecycleImportedSeqV113';

  const NativeWorker=window.Worker;
  const tierCache=new Map();
  const cacheMemory=new Map();
  const cacheLoads=new Map();
  const cacheWriteKeys=new Set();
  const backgroundQueue=[];
  let backgroundWorker=null;
  let backgroundTimer=null;
  let foregroundHeatJobs=0;
  let switchGuard=false;
  let switchSerial=0;
  let inspectorMode='auto';
  let inspectorUi=null;
  let visibleCachedKey='';
  let openButtonObserver=null;
  let lifecycleImportTimer=null;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const activeProject=()=>{const id=activeId();if(!id)return null;try{const p=JSON.parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`)||'null');return p&&p.id===id?p:null;}catch(e){return null;}};
  const mapInstance=()=>window.__padGradeMapInstance||null;
  const heatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !!(t&&t.checked);};
  const heatOpacity=()=>{try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}};
  const fc=features=>({type:'FeatureCollection',features:features||[]});
  const cacheFilename=id=>`Pad-Grade-Heat-${String(id||'unknown').replace(/[^A-Za-z0-9._-]/g,'_')}.pgheatcache`;

  function imageCoordinates(){
    try{
      if(typeof fitPointLatLon!=='function'||typeof cfg!=='function'||typeof gpsFit==='undefined'||!gpsFit)return null;
      const s=cfg(),tl=fitPointLatLon(0,s.length),tr=fitPointLatLon(s.width,s.length),br=fitPointLatLon(s.width,0),bl=fitPointLatLon(0,0);
      if(!tl||!tr||!br||!bl)return null;
      return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];
    }catch(e){return null;}
  }
  function surfaceKeyFromBuild(message){
    const s=message?.settings||{};
    return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(message?.points||[]).map(p=>[+p.x,+p.y,+p.v])});
  }
  function currentSurfaceKey(){
    try{
      if(typeof pgMeasuredSurfacePoints!=='function'||typeof cfg!=='function')return '';
      const s=cfg(),points=pgMeasuredSurfacePoints();
      return JSON.stringify({settings:{width:s.width,length:s.length,target:s.target,tol:s.tol},points:points.map(p=>[p.x,p.y,p.v])});
    }catch(e){return '';}
  }
  function resolutionFor(settings,tier){
    const s=settings||{},longest=Math.max(+s.width||0,+s.length||0,1),cols=Math.max(2,Math.round(+s.cols||2)),rows=Math.max(2,Math.round(+s.rows||2));
    return {nx:Math.max((cols-1)*3+1,Math.round(tier*(+s.width||0)/longest)),ny:Math.max((rows-1)*3+1,Math.round(tier*(+s.length||0)/longest))};
  }
  function canvasFromBuffer(msg,copy=true){
    try{
      const bytes=copy&&msg?.buffer?.slice?msg.buffer.slice(0):msg?.buffer;if(!bytes)return null;
      const canvas=document.createElement('canvas');canvas.width=+msg.nx;canvas.height=+msg.ny;
      const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
      const image=ctx.createImageData(+msg.nx,+msg.ny);image.data.set(new Uint8ClampedArray(bytes));ctx.putImageData(image,0,0);return canvas;
    }catch(e){return null;}
  }
  function dataUrlToCanvas(dataUrl,nx,ny){
    return new Promise(resolve=>{
      try{
        const image=new Image();image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=nx;canvas.height=ny;const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){resolve(null);return;}ctx.drawImage(image,0,0,nx,ny);resolve(canvas);}catch(e){resolve(null);}};image.onerror=()=>resolve(null);image.src=dataUrl;
      }catch(e){resolve(null);}
    });
  }
  function projectPoints(project){
    const s=project?.settings||{},out=[];const rows=Math.max(2,Math.round(+s.rows||0)),cols=Math.max(2,Math.round(+s.cols||0));
    if(!rows||!cols||!(+s.width>0)||!(+s.length>0))return out;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const v=project?.readings?.[`${r},${c}`];if(!Number.isFinite(+v))continue;
      out.push({x:c*(+s.width)/(cols-1),y:r*(+s.length)/(rows-1),v:+v,r,c});
    }
    return out;
  }
  function projectSurfaceKey(project){
    const s=project?.settings||{},points=projectPoints(project);
    return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:points.map(p=>[p.x,p.y,p.v])});
  }

  function showNormalHeat(visible){
    const map=mapInstance();if(!map)return;
    try{for(const layer of map.getStyle?.()?.layers||[]){const id=layer?.id||'';if(id.startsWith(HEAT_LAYER_PREFIX))map.setLayoutProperty(id,'visibility',visible&&heatEnabled()?'visible':'none');}}catch(e){}
  }
  function clearInspectorLayers(){
    const map=mapInstance();if(!map)return;
    for(const tier of TIERS){const lid=`${INSPECT_LAYER_PREFIX}${tier}`,sid=`${INSPECT_SOURCE_PREFIX}${tier}`;try{if(map.getLayer(lid))map.removeLayer(lid);}catch(e){}try{if(map.getSource(sid))map.removeSource(sid);}catch(e){}}
  }
  function layerAnchor(map){try{for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;}catch(e){}return undefined;}
  function ensureInspectorTier(tier){
    const map=mapInstance(),item=tierCache.get(tier),coords=imageCoordinates();if(!map||!item?.canvas||!coords)return false;
    const sid=`${INSPECT_SOURCE_PREFIX}${tier}`,lid=`${INSPECT_LAYER_PREFIX}${tier}`;
    try{
      if(!map.getSource(sid))map.addSource(sid,{type:'canvas',canvas:item.canvas,coordinates:coords,animate:false});else map.getSource(sid)?.setCoordinates?.(coords);
      if(!map.getLayer(lid))map.addLayer({id:lid,type:'raster',source:sid,paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}},layerAnchor(map));
      return true;
    }catch(e){return false;}
  }
  function renderInspector(){
    const map=mapInstance();if(!map){updateInspectorUi();return false;}
    if(inspectorMode==='auto'){
      clearInspectorLayers();showNormalHeat(true);updateInspectorUi();return true;
    }
    showNormalHeat(false);
    const tier=+inspectorMode;
    if(!tierCache.has(tier)){calculateInspectorTier(tier);updateInspectorUi();return false;}
    ensureInspectorTier(tier);
    for(const t of TIERS){const lid=`${INSPECT_LAYER_PREFIX}${t}`;try{if(map.getLayer(lid))map.setLayoutProperty(lid,'visibility',t===tier&&heatEnabled()?'visible':'none');}catch(e){}}
    try{map.triggerRepaint?.();}catch(e){}
    updateInspectorUi();return true;
  }
  function updateInspectorUi(){
    if(!inspectorUi)return;
    const ready=TIERS.filter(t=>tierCache.has(t));
    for(const button of inspectorUi.buttons)button.classList.toggle('primary',button.dataset.mode===inspectorMode);
    inspectorUi.status.textContent=inspectorMode==='auto'?`Auto • ready: ${ready.length?ready.join(', '):'calculating…'}`:`${inspectorMode} only • ${tierCache.has(+inspectorMode)?'ready':'calculating…'} • cached: ${ready.length?ready.join(', '):'none'}`;
  }
  function installInspectorUi(){
    document.getElementById('pg112ResolutionInspector')?.remove();
    if(inspectorUi?.host?.isConnected)return true;
    const wrap=document.querySelector('#gpsMapCard .gpsMapWrap');if(!wrap)return false;
    const host=document.createElement('div');host.id='pg113ResolutionInspector';Object.assign(host.style,{display:'grid',gap:'7px',padding:'10px 12px',borderTop:'1px solid rgba(255,255,255,.12)',background:'rgba(11,15,20,.55)'});
    const title=document.createElement('b');title.textContent='DEV heat-map resolution inspector';
    const row=document.createElement('div');Object.assign(row.style,{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'6px'});
    const buttons=[];for(const mode of ['auto','99','297','891']){const b=document.createElement('button');b.type='button';b.dataset.mode=mode;b.textContent=mode==='auto'?'Auto':mode;b.addEventListener('click',()=>{inspectorMode=mode;renderInspector();mark('heatmap.inspector-mode',{mode});});buttons.push(b);row.appendChild(b);}
    const status=document.createElement('div');status.className='small';
    const help=document.createElement('div');help.className='small';help.textContent='Exactly one completed raster is shown in manual mode. No cross-fade and no heat-map math/color change.';
    host.append(title,row,status,help);wrap.insertAdjacentElement('afterend',host);inspectorUi={host,status,buttons};updateInspectorUi();return true;
  }
  function calculateInspectorTier(tier){
    if(!TIERS.includes(+tier)||tierCache.get(+tier)?.pending)return;
    const points=typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[],s=typeof cfg==='function'?cfg():null;if(!s||points.length<3)return;
    tierCache.set(+tier,{pending:true});updateInspectorUi();
    const r=resolutionFor(s,+tier),worker=new NativeWorker(WORKER_URL),jobId=`inspect-${Date.now()}-${tier}`;
    worker.onmessage=event=>{const msg=event.data||{};if(msg.jobId!==jobId||msg.type!=='complete')return;try{worker.terminate();}catch(e){}const canvas=canvasFromBuffer(msg,true);if(canvas){tierCache.set(+tier,{tier:+tier,nx:+msg.nx,ny:+msg.ny,canvas,key:currentSurfaceKey(),projectId:activeId()});if(+tier===891)scheduleCacheWrite(activeId(),currentSurfaceKey(),canvas,+msg.nx,+msg.ny,'inspector');}else tierCache.delete(+tier);if(inspectorMode===String(tier))renderInspector();else updateInspectorUi();};
    worker.onerror=()=>{try{worker.terminate();}catch(e){}tierCache.delete(+tier);updateInspectorUi();};
    try{worker.postMessage({type:'build',context:'v113-inspector',jobId,tier:+tier,nx:r.nx,ny:r.ny,rowsPerSlice:tier<=99?24:tier<=297?18:10,settings:{width:s.width,length:s.length,target:s.target,tol:s.tol},points});}catch(e){try{worker.terminate();}catch(_){}tierCache.delete(+tier);}
  }

  async function loadCache(projectId,key){
    if(!projectId||!key)return null;
    const memoryKey=`${projectId}|${key}`;if(cacheMemory.has(memoryKey))return cacheMemory.get(memoryKey);
    if(cacheLoads.has(memoryKey))return cacheLoads.get(memoryKey);
    const promise=(async()=>{
      try{
        const files=window.PadGradeFiles;if(!files?.read)return null;
        const text=await files.read(cacheFilename(projectId));if(!text)return null;
        const raw=JSON.parse(text);if(raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.projectId!==projectId||raw.surfaceKey!==key||+raw.tier!==891||!(+raw.nx>0)||!(+raw.ny>0)||typeof raw.png!=='string')return null;
        const canvas=await dataUrlToCanvas(raw.png,+raw.nx,+raw.ny);if(!canvas)return null;
        const item={projectId,key,tier:891,nx:+raw.nx,ny:+raw.ny,canvas,createdAt:raw.createdAt||null,cached:true};cacheMemory.set(memoryKey,item);mark('heatmap.cache-hit',{projectId,tier:891,nx:item.nx,ny:item.ny});return item;
      }catch(e){mark('heatmap.cache-read-failed',{projectId,error:String(e?.message||e).slice(0,120)});return null;}
      finally{cacheLoads.delete(memoryKey);}
    })();cacheLoads.set(memoryKey,promise);return promise;
  }
  function dropVisibleCachedRaster(reason='surface-invalidated'){
    if(!visibleCachedKey)return false;
    const map=mapInstance();
    if(map){
      for(let slot=0;slot<2;slot++){const lid=`${HEAT_LAYER_PREFIX}${slot}`,sid=`${HEAT_SOURCE_PREFIX}${slot}`;try{if(map.getLayer(lid))map.removeLayer(lid);}catch(e){}try{if(map.getSource(sid))map.removeSource(sid);}catch(e){}}
      try{map.triggerRepaint?.();}catch(e){}
    }
    mark('heatmap.cache-invalidated',{reason});visibleCachedKey='';return true;
  }
  function installCachedRaster(item){
    if(!item||item.projectId!==activeId()||item.key!==currentSurfaceKey())return false;
    const map=mapInstance(),coords=imageCoordinates();if(!map||!coords)return false;
    const sid=`${HEAT_SOURCE_PREFIX}0`,lid=`${HEAT_LAYER_PREFIX}0`;
    try{
      for(let slot=0;slot<2;slot++){const ol=`${HEAT_LAYER_PREFIX}${slot}`,os=`${HEAT_SOURCE_PREFIX}${slot}`;try{if(map.getLayer(ol))map.removeLayer(ol);}catch(e){}try{if(map.getSource(os))map.removeSource(os);}catch(e){}}
      map.addSource(sid,{type:'canvas',canvas:item.canvas,coordinates:coords,animate:false});
      map.addLayer({id:lid,type:'raster',source:sid,paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}},layerAnchor(map));
      map.setLayoutProperty(lid,'visibility',heatEnabled()&&inspectorMode==='auto'?'visible':'none');
      window.__padGradeHeatmapMesh={tier:891,nx:item.nx,ny:item.ny,cells:item.nx*item.ny,raster:true,canvasSource:true,atomicSwap:true,cached:true,progressiveTiers:TIERS.slice(),monotonic:true};
      tierCache.set(891,{...item});visibleCachedKey=item.key;
      try{map.getSource(sid)?.play?.();map.triggerRepaint?.();requestAnimationFrame(()=>map.getSource(sid)?.pause?.());}catch(e){}
      mark('heatmap.cache-visible',{projectId:item.projectId,tier:891,nx:item.nx,ny:item.ny});updateInspectorUi();return true;
    }catch(e){mark('heatmap.cache-install-failed',{projectId:item.projectId,error:String(e?.message||e).slice(0,120)});return false;}
  }
  async function resolveCacheForBuild(worker,message,send){
    const key=surfaceKeyFromBuild(message),projectId=activeId();worker.__pg113BuildKey=key;worker.__pg113ProjectId=projectId;
    const hit=await loadCache(projectId,key);
    if(hit&&projectId===activeId()&&key===currentSurfaceKey()){
      setTimeout(()=>{installCachedRaster(hit);try{worker.dispatchEvent(new MessageEvent('message',{data:{type:'empty',jobId:message.jobId,tier:message.tier,cacheHit:true}}));}catch(e){}},0);
      return;
    }
    send();
  }
  function canvasPngDataUrl(canvas){
    return new Promise(resolve=>{
      try{
        if(typeof canvas.toBlob!=='function'){resolve(canvas.toDataURL('image/png'));return;}
        canvas.toBlob(blob=>{if(!blob){resolve(null);return;}try{const reader=new FileReader();reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:null);reader.onerror=()=>resolve(null);reader.readAsDataURL(blob);}catch(e){resolve(null);}},'image/png');
      }catch(e){resolve(null);}
    });
  }
  function scheduleCacheWrite(projectId,key,canvas,nx,ny,source='worker'){
    if(!projectId||!key||!canvas||!nx||!ny)return;
    const memoryKey=`${projectId}|${key}`;if(cacheWriteKeys.has(memoryKey))return;cacheWriteKeys.add(memoryKey);
    const run=async()=>{
      try{
        if(document.visibilityState==='hidden'){cacheWriteKeys.delete(memoryKey);setTimeout(()=>scheduleCacheWrite(projectId,key,canvas,nx,ny,source),1500);return;}
        const files=window.PadGradeFiles;if(!files?.write){cacheWriteKeys.delete(memoryKey);return;}
        const started=now(),png=await canvasPngDataUrl(canvas);if(!png){mark('heatmap.cache-encode-failed',{projectId,source});return;}
        const payload=JSON.stringify({format:CACHE_FORMAT,version:CACHE_VERSION,projectId,surfaceKey:key,tier:891,nx,ny,createdAt:new Date().toISOString(),png});
        const ok=await files.write(cacheFilename(projectId),payload);if(ok){cacheMemory.set(memoryKey,{projectId,key,tier:891,nx,ny,canvas,createdAt:new Date().toISOString(),cached:true});mark('heatmap.cache-written',{projectId,tier:891,nx,ny,bytes:payload.length,source,elapsedMs:+(now()-started).toFixed(1)});}else mark('heatmap.cache-write-skipped',{projectId,source});
      }catch(e){mark('heatmap.cache-write-failed',{projectId,error:String(e?.message||e).slice(0,120),source});}
      finally{cacheWriteKeys.delete(memoryKey);scheduleBackgroundCaching(1800);}
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:2500});else setTimeout(run,120);
  }

  if(typeof NativeWorker==='function'){
    class PadGrade113Worker extends NativeWorker{
      constructor(url,options){
        super(url,options);this.__pg113HeatWorker=String(url||'').includes('heatmap-raster-worker-v073.js');this.__pg113Jobs=new Map();
        if(this.__pg113HeatWorker)this.addEventListener('message',event=>{
          const msg=event?.data||{},job=this.__pg113Jobs.get(msg.jobId);if(!job)return;
          if(msg.type==='complete'||msg.type==='empty'||msg.type==='error'){this.__pg113Jobs.delete(msg.jobId);if(job.context==='regular')foregroundHeatJobs=Math.max(0,foregroundHeatJobs-1);}
          if(msg.type!=='complete')return;
          const canvas=canvasFromBuffer(msg,true);if(canvas&&TIERS.includes(+job.tier)){
            if(job.projectId===activeId()&&job.key===currentSurfaceKey()){tierCache.set(+job.tier,{tier:+job.tier,nx:+msg.nx,ny:+msg.ny,canvas,key:job.key,projectId:job.projectId});if(inspectorMode!== 'auto')renderInspector();else updateInspectorUi();}
            if(+job.tier===891)scheduleCacheWrite(job.projectId,job.key,canvas,+msg.nx,+msg.ny,'regular-worker');
          }
          scheduleBackgroundCaching(1800);
        });
      }
      postMessage(message,transfer){
        if(!this.__pg113HeatWorker||message?.type!=='build')return arguments.length>1?NativeWorker.prototype.postMessage.call(this,message,transfer):NativeWorker.prototype.postMessage.call(this,message);
        const context=String(message.context||''),job={context,tier:+message.tier,key:surfaceKeyFromBuild(message),projectId:activeId()};this.__pg113Jobs.set(message.jobId,job);if(context==='regular'){foregroundHeatJobs++;if(visibleCachedKey&&job.key!==visibleCachedKey)dropVisibleCachedRaster('surface-key-changed');if(backgroundWorker){try{backgroundWorker.terminate();}catch(e){}backgroundWorker=null;mark('heatmap.background-cache-preempted',{reason:'foreground-heat'});}}
        const send=()=>{try{if(arguments.length>1)NativeWorker.prototype.postMessage.call(this,message,transfer);else NativeWorker.prototype.postMessage.call(this,message);}catch(e){this.__pg113Jobs.delete(message.jobId);if(context==='regular')foregroundHeatJobs=Math.max(0,foregroundHeatJobs-1);throw e;}};
        if(context==='regular'&&(+message.tier===99||+message.tier===297)){
          resolveCacheForBuild(this,message,send).catch(()=>send());return;
        }
        send();
      }
      terminate(){
        for(const job of this.__pg113Jobs.values())if(job.context==='regular')foregroundHeatJobs=Math.max(0,foregroundHeatJobs-1);
        this.__pg113Jobs.clear();
        return NativeWorker.prototype.terminate.call(this);
      }
    }
    window.Worker=PadGrade113Worker;
  }

  function patchMap(map){
    if(!map||map.__padGradeV113Patched)return false;map.__padGradeV113Patched=true;
    const removeLayer=map.removeLayer.bind(map),removeSource=map.removeSource.bind(map),addSource=map.addSource.bind(map),addLayer=map.addLayer.bind(map);
    map.removeLayer=function(id){
      if(switchGuard&&(GRID_LAYERS.includes(id)||String(id||'').startsWith(HEAT_LAYER_PREFIX))){try{if(this.getLayer(id))this.setLayoutProperty(id,'visibility','none');}catch(e){}return this;}
      return removeLayer(id);
    };
    map.removeSource=function(id){
      if(switchGuard&&GRID_SOURCES.includes(id)){try{this.getSource(id)?.setData?.(fc([]));}catch(e){}return this;}
      if(switchGuard&&String(id||'').startsWith(HEAT_SOURCE_PREFIX))return this;
      return removeSource(id);
    };
    map.addSource=function(id,spec){
      if(switchGuard&&GRID_SOURCES.includes(id)&&this.getSource(id)&&spec?.type==='geojson'){try{this.getSource(id).setData(spec.data||fc([]));return this;}catch(e){}}
      return addSource(id,spec);
    };
    map.addLayer=function(layer,before){
      const id=layer?.id||'';
      if(switchGuard&&GRID_LAYERS.includes(id)&&this.getLayer(id)){try{this.setLayoutProperty(id,'visibility','visible');}catch(e){}return this;}
      const result=addLayer(layer,before);
      if(id.startsWith(HEAT_LAYER_PREFIX)){
        // A literal visual swap: hide the previously visible complete raster in
        // the same synchronous task that stages the new one. MapLibre cannot
        // paint an overlap frame between these calls.
        try{for(const other of this.getStyle?.()?.layers||[]){const otherId=other?.id||'';if(otherId!==id&&otherId.startsWith(HEAT_LAYER_PREFIX)&&this.getLayer(otherId))this.setLayoutProperty(otherId,'visibility','none');}}catch(e){}
        mark('heatmap.true-swap-staged',{next:id});
      }
      return result;
    };
    mark('map.reuse-hooks-installed',{});return true;
  }

  function clearOutgoingVisuals(){
    const started=now(),map=mapInstance();
    if(map){
      try{for(const id of GRID_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');}catch(e){}
      try{for(const id of GRID_SOURCES)map.getSource(id)?.setData?.(fc([]));}catch(e){}
      try{for(const layer of map.getStyle?.()?.layers||[]){const id=layer?.id||'';if(id.startsWith(HEAT_LAYER_PREFIX)||id.startsWith(INSPECT_LAYER_PREFIX))map.setLayoutProperty(id,'visibility','none');}}catch(e){}
      try{map.triggerRepaint?.();}catch(e){}
    }
    const shell=document.querySelector('.gridShell');if(shell)shell.style.visibility='hidden';
    tierCache.clear();visibleCachedKey='';clearInspectorLayers();updateInspectorUi();mark('project.switch-outgoing-hidden',{elapsedMs:+(now()-started).toFixed(1)});
  }
  function showProjectGrid(){const map=mapInstance();if(!map)return;try{for(const id of GRID_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility','visible');map.triggerRepaint?.();}catch(e){}}
  function closeProjectsDialog(){const dlg=document.getElementById('projectsDlg');if(dlg?.open)try{dlg.close();}catch(e){dlg.removeAttribute('open');}}
  function claimOpenButtons(root=document){
    try{for(const b of root.querySelectorAll?.('button[data-act="open"]')||[]){b.dataset.act='open113';b.dataset.pg113Claimed='1';}}catch(e){}
  }
  function installOpenButtonClaim(){
    claimOpenButtons();if(openButtonObserver||!window.MutationObserver)return;
    openButtonObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes||[])if(node?.nodeType===1)claimOpenButtons(node);claimOpenButtons();});openButtonObserver.observe(document.documentElement,{childList:true,subtree:true});
  }
  async function handleProjectOpen(event){
    const button=event.target?.closest?.('button[data-act="open113"]');if(!button)return;
    const row=button.closest?.('[data-id]'),target=row?.dataset?.id||'',from=activeId();if(!target||target===from)return;
    event.preventDefault();event.stopImmediatePropagation();
    const serial=++switchSerial,started=now(),oldText=button.textContent;button.disabled=true;button.textContent='Loading…';mark('project.switch-v113-start',{from,to:target});
    let loaded=null;try{const index=window.PadGradeProjectIndexV107;loaded=index?.loadProject?await index.loadProject(target):true;}catch(e){mark('project.switch-v113-load-failed',{to:target,error:String(e?.message||e).slice(0,120)});}
    if(serial!==switchSerial)return;if(!loaded){button.disabled=false;button.textContent=oldText;return;}
    clearOutgoingVisuals();
    closeProjectsDialog();
    const base=window.__padGradeSwitchProjectInPlace;let ok=false;switchGuard=true;
    try{ok=typeof base==='function'&&!!base(target);}catch(e){mark('project.switch-v113-apply-failed',{to:target,error:String(e?.message||e).slice(0,120)});}finally{switchGuard=false;}
    const shell=document.querySelector('.gridShell');if(shell)shell.style.visibility='visible';showProjectGrid();claimOpenButtons();
    if(!ok){button.disabled=false;button.textContent=oldText;try{window.pgDrawSurface?.();}catch(e){}return;}
    mark('project.switch-v113-complete',{from,to:target,elapsedMs:+(now()-started).toFixed(1),reusedMap:true});
    setTimeout(()=>{loadActiveCache();renderInspector();scheduleBackgroundCaching(2500);},0);
  }

  function installGridReuse(){
    const base=window.renderGrid;if(typeof base!=='function'||base.__padGradeV113Reuse)return false;
    const reused=function(){
      try{
        const s=cfg(),grid=document.getElementById('grid'),cells=grid?[...grid.querySelectorAll('.cell')]:[];
        if(grid&&cells.length===s.rows*s.cols&&cells.every(cell=>Number.isInteger(+cell.dataset.r)&&Number.isInteger(+cell.dataset.c)&&+cell.dataset.r<s.rows&&+cell.dataset.c<s.cols)){
          const started=now();for(const cell of cells){const r=+cell.dataset.r,c=+cell.dataset.c,val=readings[k(r,c)],[main,sub]=textFor(val),rc=refCoords(r,c);cell.className='cell '+classFor(val);const coord=cell.querySelector('.coord'),xy=cell.querySelector('.xy'),m=cell.querySelector('.main'),ss=cell.querySelector('.sub');if(coord)coord.textContent=label(r,c);if(xy)xy.innerHTML=`<span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span>`;if(m)m.textContent=main||'—';if(ss)ss.textContent=sub||'—';}
          try{window.__padGradeStartGridSizing?.('v113-project-reuse',false);}catch(e){}try{updateStats();}catch(e){}try{window.pgScheduleSurfaceDraw?.();}catch(e){}
          mark('grid.cells-reused',{cells:cells.length,elapsedMs:+(now()-started).toFixed(1)});return;
        }
      }catch(e){}
      return base();
    };reused.__padGradeV113Reuse=true;reused.__padGradeWorkerGridCore=base.__padGradeWorkerGridCore;window.renderGrid=reused;mark('grid.reuse-wrapper-installed',{});return true;
  }

  async function loadActiveCache(){
    const project=activeProject(),key=currentSurfaceKey();if(!project?.id||!key)return null;
    const item=await loadCache(project.id,key);if(!item)return null;
    tierCache.set(891,{...item});setTimeout(()=>{if(project.id===activeId()&&key===currentSurfaceKey())installCachedRaster(item);renderInspector();},0);return item;
  }

  function backgroundEligible(){return document.visibilityState==='visible'&&foregroundHeatJobs===0&&!backgroundWorker&&window.PadGradeProjectIndexV107?.catalog&&window.PadGradeProjectIndexV107?.loadProject;}
  function scheduleBackgroundCaching(delay=5000){
    if(backgroundTimer)clearTimeout(backgroundTimer);backgroundTimer=setTimeout(()=>{backgroundTimer=null;runBackgroundCaching();},Math.max(800,delay));
  }
  async function fillBackgroundQueue(){
    if(backgroundQueue.length)return;
    try{for(const item of window.PadGradeProjectIndexV107.catalog()||[]){const id=item?.id||item?.projectId;if(id&&id!==activeId()&&!backgroundQueue.includes(id))backgroundQueue.push(id);}}catch(e){}
  }
  async function runBackgroundCaching(){
    if(!backgroundEligible()){scheduleBackgroundCaching(5000);return;}
    await fillBackgroundQueue();const id=backgroundQueue.shift();if(!id)return;
    let project=null;try{project=await window.PadGradeProjectIndexV107.loadProject(id);}catch(e){}if(!project||document.visibilityState!=='visible'){if(project)backgroundQueue.unshift(id);scheduleBackgroundCaching(5000);return;}
    const points=projectPoints(project);if(points.length<3){scheduleBackgroundCaching(1800);return;}
    const key=projectSurfaceKey(project),existing=await loadCache(id,key);if(existing){mark('heatmap.background-cache-skip',{projectId:id,reason:'valid-cache'});scheduleBackgroundCaching(1200);return;}
    if(!backgroundEligible()){backgroundQueue.unshift(id);scheduleBackgroundCaching(5000);return;}
    const s=project.settings,r=resolutionFor(s,891),worker=new NativeWorker(WORKER_URL),jobId=`bg-${Date.now()}-${id}`;backgroundWorker=worker;mark('heatmap.background-cache-start',{projectId:id,nx:r.nx,ny:r.ny});
    const finish=()=>{if(backgroundWorker===worker)backgroundWorker=null;try{worker.terminate();}catch(e){}scheduleBackgroundCaching(2200);};
    worker.onmessage=event=>{const msg=event.data||{};if(msg.jobId!==jobId||msg.type!=='complete')return;const canvas=canvasFromBuffer(msg,true);if(canvas)scheduleCacheWrite(id,key,canvas,+msg.nx,+msg.ny,'background-project');finish();};worker.onerror=finish;
    try{worker.postMessage({type:'build',context:'v113-background-cache',jobId,tier:891,nx:r.nx,ny:r.ny,rowsPerSlice:10,settings:{width:s.width,length:s.length,target:s.target,tol:s.tol},points});}catch(e){finish();}
  }
  function stopBackgroundCaching(reason){if(backgroundTimer){clearTimeout(backgroundTimer);backgroundTimer=null;}if(backgroundWorker){try{backgroundWorker.terminate();}catch(e){}backgroundWorker=null;}mark('heatmap.background-cache-paused',{reason});}

  function importLifecycleDiagnostics(){
    try{
      const bridge=window.PadGradeLifecycle;if(!bridge?.getEvents)return false;const events=JSON.parse(bridge.getEvents()||'[]');if(!Array.isArray(events))return false;
      let last=Number(localStorage.getItem(lifecycleImportedKey)||0),max=last;
      for(const item of events){const seq=Number(item?.seq)||0;if(seq<=last)continue;max=Math.max(max,seq);mark(`android.${String(item?.event||'lifecycle')}`,{seq,pid:Number(item?.pid)||0,activity:String(item?.activity||''),savedState:item?.savedState===true,trimLevel:Number.isFinite(+item?.trimLevel)?+item.trimLevel:undefined,rendererCrash:item?.rendererCrash===true,rendererPriority:Number.isFinite(+item?.rendererPriority)?+item.rendererPriority:undefined,detail:String(item?.detail||'').slice(0,160)});}
      if(max>last)localStorage.setItem(lifecycleImportedKey,String(max));return true;
    }catch(e){return false;}
  }

  function attachRuntime(){
    patchMap(mapInstance());installGridReuse();installInspectorUi();installOpenButtonClaim();claimOpenButtons();importLifecycleDiagnostics();
  }
  function boot(){
    document.title=`Pad Grade Mapper v${VERSION} DEV`;
    attachRuntime();
    lifecycleImportTimer=setInterval(()=>{attachRuntime();if(window.PadGradeLifecycle&&window.PadGradeDiag)importLifecycleDiagnostics();},750);
    document.addEventListener('click',handleProjectOpen,true);
    window.addEventListener('padgrade-primary-map-captured',ev=>{patchMap(ev?.detail?.map||mapInstance());setTimeout(()=>{renderInspector();loadActiveCache();},0);});
    window.addEventListener('padgrade-map-created',ev=>{patchMap(ev?.detail?.map||mapInstance());setTimeout(()=>{installInspectorUi();renderInspector();loadActiveCache();},0);});
    window.addEventListener('padgrade-active-project-applied',()=>{tierCache.clear();updateInspectorUi();setTimeout(()=>{installGridReuse();loadActiveCache();renderInspector();scheduleBackgroundCaching(3000);},0);});
    window.addEventListener('padgrade-projects-reconciled',()=>scheduleBackgroundCaching(2200));
    window.addEventListener('padgrade-recovery-visual-released',()=>scheduleBackgroundCaching(2500));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopBackgroundCaching('hidden');else{importLifecycleDiagnostics();setTimeout(()=>{loadActiveCache();scheduleBackgroundCaching(4000);},0);}});
    window.addEventListener('load',()=>{setTimeout(()=>{loadActiveCache();scheduleBackgroundCaching(4500);},0);},{once:true});
    window.addEventListener('beforeunload',()=>{stopBackgroundCaching('beforeunload');if(openButtonObserver)openButtonObserver.disconnect();if(lifecycleImportTimer)clearInterval(lifecycleImportTimer);},{once:true});
    window.__padGradeHeatmapSwapPolicyV113='stage-new-hide-old-same-task-zero-fade-no-overlap-frame';
    window.__padGradeResolutionInspectorPolicyV113='auto-or-exact-single-raster-99-297-891-no-crossfade';
    window.__padGradeProjectSwitchPolicyV113='lazy-load-target-hide-blank-outgoing-before-dialog-close-reuse-map-grid-sources-layers';
    window.__padGradeHeatCachePolicyV113='lossless-png-final-891-per-project-surface-key-active-hit-suppresses-recalc-idle-visible-one-project-at-a-time';
    window.__padGradeGridReusePolicyV113='reuse-cell-dom-when-row-column-geometry-matches';
    mark('v113.installed',{version:VERSION});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
