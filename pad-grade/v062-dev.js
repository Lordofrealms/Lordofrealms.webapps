/* Pad Grade v0.6.1 dev stability gate.
 * Keep the proven lower-grid workflow, start shading OFF, and restore Precision
 * Location now that its companion explicitly whitelists the dev app.
 */
(function installPadGrade062StabilityGate(){
  'use strict';

  const HEATMAP_OPTIN_KEY='padGradeHeatmapOptInV061';
  const $=id=>document.getElementById(id);

  function heatmapEnabled(){const toggle=$('heatmapToggle');return !!(toggle&&toggle.checked);}
  function normalizeGridParent(){
    const grid=$('grid'),shell=document.querySelector('.gridShell');if(!grid||!shell)return null;
    const stack=$('gradeMapStack');
    if(stack){
      if(grid.parentElement===stack)shell.insertBefore(grid,stack);
      for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer']){const el=$(id);if(el&&el.parentElement===stack)shell.appendChild(el);}
      stack.remove();
    }
    if(grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
    return {grid,shell};
  }
  function clearHeatmapCanvas(){
    const canvas=$('gradeHeatmap');if(!canvas)return;
    try{const ctx=canvas.getContext&&canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width||0,canvas.height||0);}catch(e){}
    canvas.remove();
  }

  normalizeGridParent();

  const baseApplyDevPayload=window.pgApplyDevPayload;
  if(typeof baseApplyDevPayload==='function'){
    window.pgApplyDevPayload=function(dev){
      const next=dev&&typeof dev==='object'?{...dev}:{};
      if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')next.heatmap=false;
      baseApplyDevPayload(next);
      const toggle=$('heatmapToggle');if(toggle&&localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    };
  }

  const toggle=$('heatmapToggle');
  if(toggle){
    if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    toggle.addEventListener('change',()=>{
      if(toggle.checked)localStorage.setItem(HEATMAP_OPTIN_KEY,'1');else localStorage.removeItem(HEATMAP_OPTIN_KEY);
      if(toggle.checked){if(typeof window.pgScheduleSurfaceDraw==='function')window.pgScheduleSurfaceDraw();}else clearHeatmapCanvas();
    });
  }

  const baseScheduleSurfaceDraw=window.pgScheduleSurfaceDraw;
  if(typeof baseScheduleSurfaceDraw==='function'){
    window.pgScheduleSurfaceDraw=function(){
      if(!heatmapEnabled()){
        clearHeatmapCanvas();
        try{if(typeof window.pgDrawLaser==='function')requestAnimationFrame(()=>window.pgDrawLaser());}catch(e){}
        return;
      }
      return baseScheduleSurfaceDraw();
    };
  }
  const baseDrawSurface=window.pgDrawSurface;
  if(typeof baseDrawSurface==='function'){
    window.pgDrawSurface=function(){if(!heatmapEnabled()){clearHeatmapCanvas();return;}return baseDrawSurface();};
  }

  function restorePrecisionProvider(){
    const platform=window.PadGradePlatform,nativeBridge=window.PadGradeNative;
    if(!platform||!nativeBridge||!platform.precisionGeolocation)return false;
    let available=false;
    try{available=typeof nativeBridge.isPrecisionLocationAvailable==='function'?!!nativeBridge.isPrecisionLocationAvailable():true;}catch(e){available=false;}
    if(!available)return false;
    try{
      Object.defineProperty(navigator,'geolocation',{value:platform.precisionGeolocation,configurable:true,enumerable:true});
      platform.nativePrecisionLocation=true;
      platform.lastLocationMeta={provider:'precision-location',solutionMode:'Precision Location',solutionState:'STARTING',fixAgeMs:0,timestamp:0};
      return true;
    }catch(e){return false;}
  }
  restorePrecisionProvider();

  // v0.9.4: the authoritative grid owner now paints immediately and sizes in a
  // worker. This legacy gate may reveal/normalize the host, but MUST NOT request
  // another grid render after load; doing so would rebuild cells after the first
  // paint and defeat the one-final-resize architecture.
  function finishGridStartup(){
    const host=normalizeGridParent();if(!host)return false;
    if(window.__padGradeGridOwned){
      host.shell.removeAttribute('data-grid-booting');host.shell.style.visibility='visible';
      return true;
    }
    return false;
  }
  function waitForGridCore(){
    let tries=0;
    const poll=()=>{
      if(finishGridStartup())return;
      tries++;
      if(tries<30){setTimeout(poll,100);return;}
      const host=normalizeGridParent();if(!host)return;
      try{if(typeof window.renderGrid==='function')window.renderGrid();}catch(e){console.warn('Pad Grade fallback grid render failed',e);}
      host.shell.removeAttribute('data-grid-booting');host.shell.style.visibility='visible';
    };
    poll();
  }
  if(document.readyState==='complete')waitForGridCore();else window.addEventListener('load',waitForGridCore,{once:true});

  clearHeatmapCanvas();
  window.__padGradeDev061StabilityGate=true;
  window.__padGradeGridStartupGateV094='reveal-only-never-rerender-authoritative-grid';
})();

// v1.0.9: v063-dev.js is loaded exactly once by index.html.

/* Pad Grade v1.1.2 DEV diagnostic — resolution inspector + pre-close project switch.
 *
 * IMPORTANT: this intentionally does NOT change the v1.1.1 heat-map worker,
 * interpolation, color normalization, tier dimensions, or staged scheduling.
 * It passively copies completed 99/297/891 worker rasters so the user can scrub
 * between the exact rasters the current engine produced.
 */
(function installPadGrade112ResolutionInspector(){
  'use strict';
  if(window.__padGradeResolutionInspectorV112)return;
  window.__padGradeResolutionInspectorV112=true;

  const TIERS=[99,297,891];
  const INSPECT_SOURCE_PREFIX='pad-grade-v112-inspect-source-';
  const INSPECT_LAYER_PREFIX='pad-grade-v112-inspect-layer-';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const GRID_LAYERS=['pad-grade-grid-labels','pad-grade-grid-points-layer','pad-grade-route-layer','pad-grade-pad-outline-layer','pad-grade-grid-lines-layer'];
  const GRID_SOURCES=['pad-grade-grid-points','pad-grade-route','pad-grade-pad-outline','pad-grade-grid-lines'];
  const NORMAL_HEAT_LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const NORMAL_HEAT_SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const LEGACY_HEAT_LAYERS=['pad-grade-interpolated-surface-layer'];
  const LEGACY_HEAT_SOURCES=['pad-grade-interpolated-surface-raster','pad-grade-interpolated-surface','pad-grade-interpolated-surface-mesh'];

  const NativeWorker=window.Worker;
  const cache=new Map();
  let generation=0;
  let manual=false;
  let sliderValue=0;
  let refreshTimer=null;
  let switchSerial=0;
  let ui=null;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const mapInstance=()=>window.__padGradeMapInstance||null;
  const sourceId=t=>`${INSPECT_SOURCE_PREFIX}${t}`;
  const layerId=t=>`${INSPECT_LAYER_PREFIX}${t}`;
  const removeLayer=(map,id)=>{try{if(map?.getLayer?.(id))map.removeLayer(id);}catch(e){}};
  const removeSource=(map,id)=>{try{if(map?.getSource?.(id))map.removeSource(id);}catch(e){}};
  function heatOpacity(){try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}}
  function heatEnabled(){const t=document.getElementById('heatmapToggle');return !!(t&&t.checked);}

  function makeCanvas(msg){
    const copy=msg?.buffer?.slice?.(0);if(!copy)return null;
    const canvas=document.createElement('canvas');canvas.width=msg.nx;canvas.height=msg.ny;
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return null;
    const image=ctx.createImageData(msg.nx,msg.ny);image.data.set(new Uint8ClampedArray(copy));ctx.putImageData(image,0,0);
    return canvas;
  }
  function clearInspectLayers(){
    const map=mapInstance();if(!map)return;
    for(const t of TIERS){removeLayer(map,layerId(t));removeSource(map,sourceId(t));}
  }
  function resetCache(reason){
    generation++;cache.clear();clearInspectLayers();
    updateUi();
    mark('heatmap.inspector-reset',{reason:String(reason||'generation'),generation});
  }

  function captureResult(worker,event){
    const msg=event?.data||{};
    if(msg.type!=='complete'||!TIERS.includes(+msg.tier)||worker.__pg112Generation!==generation)return;
    const canvas=makeCanvas(msg);if(!canvas)return;
    cache.set(+msg.tier,{tier:+msg.tier,nx:+msg.nx,ny:+msg.ny,canvas,generation});
    mark('heatmap.inspector-tier-ready',{tier:+msg.tier,nx:+msg.nx,ny:+msg.ny,generation});
    updateUi();if(manual)renderBlend();
  }

  if(typeof NativeWorker==='function'){
    class PadGradeInspectorWorker extends NativeWorker{
      constructor(url,options){
        super(url,options);this.__pg112HeatWorker=String(url||'').includes('heatmap-raster-worker-v073.js');
        if(this.__pg112HeatWorker)this.addEventListener('message',event=>captureResult(this,event));
      }
      postMessage(message,transfer){
        if(this.__pg112HeatWorker&&message?.type==='build'&&TIERS.includes(+message.tier)){
          if(+message.tier===99)resetCache('new-99-generation');
          this.__pg112Generation=generation;
          this.__pg112Tier=+message.tier;
        }
        return arguments.length>1?super.postMessage(message,transfer):super.postMessage(message);
      }
    }
    window.Worker=PadGradeInspectorWorker;
  }

  function imageCoordinates(){
    try{
      if(typeof fitPointLatLon!=='function'||typeof cfg!=='function'||typeof gpsFit==='undefined'||!gpsFit)return null;
      const s=cfg(),tl=fitPointLatLon(0,s.length),tr=fitPointLatLon(s.width,s.length),br=fitPointLatLon(s.width,0),bl=fitPointLatLon(0,0);
      if(!tl||!tr||!br||!bl)return null;
      return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];
    }catch(e){return null;}
  }
  function anchorLayer(map){
    try{for(const id of GRID_LAYERS)if(map.getLayer(id))return id;}catch(e){}
    return undefined;
  }
  function setNormalHeatVisible(visible){
    const map=mapInstance();if(!map)return;
    try{
      const style=map.getStyle?.();for(const layer of style?.layers||[]){const id=layer?.id||'';if(id.startsWith(NORMAL_HEAT_LAYER_PREFIX)||LEGACY_HEAT_LAYERS.includes(id))try{map.setLayoutProperty(id,'visibility',visible?'visible':'none');}catch(e){}}
    }catch(e){}
  }
  function ensureTierLayer(tier){
    const item=cache.get(tier),map=mapInstance(),coords=imageCoordinates();if(!item||!map||!coords)return false;
    try{
      let source=map.getSource(sourceId(tier));
      if(!source){map.addSource(sourceId(tier),{type:'canvas',canvas:item.canvas,coordinates:coords,animate:false});source=map.getSource(sourceId(tier));}
      else if(typeof source.setCoordinates==='function')source.setCoordinates(coords);
      if(!map.getLayer(layerId(tier)))map.addLayer({id:layerId(tier),type:'raster',source:sourceId(tier),paint:{'raster-opacity':0,'raster-fade-duration':0}},anchorLayer(map));
      try{if(source?.play)source.play();map.triggerRepaint?.();requestAnimationFrame(()=>{try{source?.pause?.();}catch(e){}});}catch(e){}
      return true;
    }catch(e){return false;}
  }
  function desiredWeights(value){
    const p=Math.max(0,Math.min(2,+value||0));
    return p<=1?new Map([[99,1-p],[297,p],[891,0]]):new Map([[99,0],[297,2-p],[891,p-1]]);
  }
  function renderBlend(){
    const map=mapInstance();if(!map)return false;
    if(!manual){clearInspectLayers();setNormalHeatVisible(heatEnabled());return true;}
    setNormalHeatVisible(false);
    const wanted=desiredWeights(sliderValue),available=[];
    for(const t of TIERS)if(cache.has(t)&&ensureTierLayer(t))available.push(t);
    let total=0;for(const t of available)total+=Math.max(0,wanted.get(t)||0);
    if(total<=1e-9&&available.length){
      let nearest=available[0],best=Infinity;const targets=new Map([[99,0],[297,1],[891,2]]);
      for(const t of available){const d=Math.abs((targets.get(t)||0)-sliderValue);if(d<best){best=d;nearest=t;}}
      wanted.set(nearest,1);total=1;
    }
    const enabled=heatEnabled(),alpha=heatOpacity();
    for(const t of TIERS){
      const lid=layerId(t);try{if(!map.getLayer(lid))continue;const w=total>0?(Math.max(0,wanted.get(t)||0)/total):0;map.setLayoutProperty(lid,'visibility',enabled&&w>0?'visible':'none');map.setPaintProperty(lid,'raster-opacity',alpha*w);}catch(e){}
    }
    try{map.triggerRepaint?.();}catch(e){}
    updateUi();return true;
  }

  function sliderDescription(){
    const p=sliderValue;if(!manual)return 'Auto progression';
    if(Math.abs(p)<.015)return '99 only';if(Math.abs(p-1)<.015)return '297 only';if(Math.abs(p-2)<.015)return '891 only';
    if(p<1)return `99 → 297  ${Math.round(p*100)}%`;
    return `297 → 891  ${Math.round((p-1)*100)}%`;
  }
  function updateUi(){
    if(!ui)return;
    const ready=TIERS.filter(t=>cache.has(t));
    ui.status.textContent=`${sliderDescription()} • ready: ${ready.length?ready.join(', '):'calculating…'}`;
    ui.auto.classList.toggle('primary',!manual);
    for(const t of TIERS){const el=ui.labels.querySelector(`[data-tier="${t}"]`);if(el)el.style.opacity=cache.has(t)?'1':'.4';}
  }
  function installUi(){
    if(ui)return true;
    const wrap=document.querySelector('#gpsMapCard .gpsMapWrap');if(!wrap)return false;
    const host=document.createElement('div');host.id='pg112ResolutionInspector';host.className='pg112ResolutionInspector';
    Object.assign(host.style,{display:'grid',gap:'6px',padding:'10px 12px',borderTop:'1px solid rgba(255,255,255,.12)',background:'rgba(11,15,20,.55)'});
    const head=document.createElement('div');Object.assign(head.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'});
    const title=document.createElement('b');title.textContent='DEV heat-map resolution inspector';
    const auto=document.createElement('button');auto.type='button';auto.textContent='Auto';
    head.append(title,auto);
    const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='2';slider.step='.01';slider.value='0';slider.setAttribute('aria-label','Heat-map resolution blend');
    const labels=document.createElement('div');Object.assign(labels.style,{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:'700'});labels.innerHTML='<span data-tier="99">99</span><span data-tier="297">297</span><span data-tier="891">891</span>';
    const status=document.createElement('div');status.className='small';
    const help=document.createElement('div');help.className='small';help.textContent='Exact stops show one raster. Between stops cross-fades the two neighboring completed rasters. This build does not alter heat-map math or colors.';
    host.append(head,slider,labels,status,help);wrap.insertAdjacentElement('afterend',host);
    ui={host,slider,labels,status,auto};
    slider.addEventListener('input',()=>{manual=true;sliderValue=+slider.value;renderBlend();mark('heatmap.inspector-slider',{value:+sliderValue.toFixed(2)});});
    auto.addEventListener('click',()=>{manual=false;renderBlend();mark('heatmap.inspector-auto',{});});
    updateUi();return true;
  }

  function clearProjectMapLayers(){
    const map=mapInstance();if(!map)return;
    let style=null;try{style=map.getStyle?.()||null;}catch(e){}
    for(const layer of style?.layers||[]){const id=layer?.id||'';if(GRID_LAYERS.includes(id)||id.startsWith(NORMAL_HEAT_LAYER_PREFIX)||id.startsWith(INSPECT_LAYER_PREFIX)||LEGACY_HEAT_LAYERS.includes(id))removeLayer(map,id);}
    for(const id of Object.keys(style?.sources||{})){if(GRID_SOURCES.includes(id)||id.startsWith(NORMAL_HEAT_SOURCE_PREFIX)||id.startsWith(INSPECT_SOURCE_PREFIX)||LEGACY_HEAT_SOURCES.includes(id))removeSource(map,id);}
    try{map.triggerRepaint?.();}catch(e){}
  }
  function cancelOutgoingHeat(){
    if(typeof window.pgDrawSurface!=='function')return false;
    let saved,had=false;
    try{if(typeof gpsFit!=='undefined'){saved=gpsFit;had=true;gpsFit=null;window.pgDrawSurface();return true;}}catch(e){}finally{if(had)try{gpsFit=saved;}catch(e){}}
    return false;
  }
  function openTarget(event){const button=event.target?.closest?.('button[data-act="open"]');const row=button?.closest?.('[data-id]');return {button,row,id:row?.dataset?.id||''};}
  function closeProjectsDialog(){const dlg=document.getElementById('projectsDlg');if(dlg?.open)try{dlg.close();}catch(e){dlg.removeAttribute('open');}}
  function setLowerGridVisible(visible){const shell=document.querySelector('.gridShell');if(shell)shell.style.visibility=visible?'visible':'hidden';}

  document.addEventListener('click',event=>{
    const hit=openTarget(event),target=hit.id,from=activeId();if(!target||target===from)return;
    event.preventDefault();event.stopImmediatePropagation();
    const serial=++switchSerial,oldText=hit.button?.textContent||'Open';if(hit.button){hit.button.disabled=true;hit.button.textContent='Loading…';}
    (async()=>{
      let loaded=null;
      try{const index=window.PadGradeProjectIndexV107;loaded=index?.loadProject?await index.loadProject(target):true;}catch(e){console.warn('Pad Grade target project load failed',e);}
      if(serial!==switchSerial)return;
      if(!loaded){if(hit.button){hit.button.disabled=false;hit.button.textContent=oldText;}return;}

      // Keep the project dialog covering the app through the potentially slow
      // durable read. Only after the target is ready do we clear the outgoing
      // project's grid/heat state, then close the dialog and apply immediately.
      try{window.dispatchEvent(new CustomEvent('padgrade-before-project-switch',{detail:{from,to:target,preclose:true}}));}catch(e){}
      const heatCancelled=cancelOutgoingHeat();resetCache('project-switch-preclose');clearProjectMapLayers();setLowerGridVisible(false);
      mark('project.switch-preclose-cleared',{from,to:target,heatCancelled});
      closeProjectsDialog();
      const ok=typeof window.__padGradeSwitchProjectInPlace==='function'&&window.__padGradeSwitchProjectInPlace(target);
      setLowerGridVisible(true);
      if(!ok&&hit.button){hit.button.disabled=false;hit.button.textContent=oldText;}
    })();
  },true);

  window.addEventListener('padgrade-before-project-switch',()=>{resetCache('project-switch-event');});
  window.addEventListener('padgrade-active-project-applied',()=>{setLowerGridVisible(true);setTimeout(()=>{installUi();if(manual)renderBlend();},0);});
  window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installUi();if(manual)renderBlend();},0));
  window.addEventListener('padgrade-project-grid-ready',()=>{if(manual)renderBlend();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&manual)renderBlend();});

  function boot(){
    installUi();
    refreshTimer=setInterval(()=>{installUi();if(manual)renderBlend();},600);
    setTimeout(()=>{document.title='Pad Grade Mapper v1.1.2 DEV';},0);
    setTimeout(()=>{document.title='Pad Grade Mapper v1.1.2 DEV';},1800);
    window.__padGradeHeatmapInspectorPolicyV112='passive-worker-copy-continuous-99-297-891-crossfade-no-math-change';
    window.__padGradeProjectSwitchPolicyV112='lazy-load-under-dialog-clear-old-grid-heat-before-close-apply-target-immediately';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('beforeunload',()=>{if(refreshTimer)clearInterval(refreshTimer);clearInspectLayers();},{once:true});
})();
