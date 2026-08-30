/* Pad Grade v1.1.2 DEV — pre-close project visual boundary.
 *
 * Project selection is intentionally intercepted before the v0.9.6 switch
 * handler. The outgoing grid and heat-map state are torn down while the project
 * dialog is still covering the map, then the target project's lazy durable read
 * runs. This prevents the old project's overlays from flashing after the dialog
 * closes. The existing v0.9.6 switch routine remains authoritative for applying
 * the target project and installing its new overlays.
 */
(function installPadGrade112VisualConsistency(){
  'use strict';
  if(window.__padGradeVisualConsistencyV112)return;
  window.__padGradeVisualConsistencyV112=true;

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const GRID_LAYERS=['pad-grade-grid-labels','pad-grade-grid-points-layer','pad-grade-route-layer','pad-grade-pad-outline-layer','pad-grade-grid-lines-layer'];
  const GRID_SOURCES=['pad-grade-grid-points','pad-grade-route','pad-grade-pad-outline','pad-grade-grid-lines'];
  const HEAT_LAYER_PREFIXES=['pad-grade-interpolated-surface-canvas-layer-','pad-grade-interpolated-surface-layer-band-'];
  const HEAT_SOURCE_PREFIXES=['pad-grade-interpolated-surface-canvas-source-','pad-grade-interpolated-surface-band-source-'];
  const HEAT_LAYER_IDS=['pad-grade-interpolated-surface-layer'];
  const HEAT_SOURCE_IDS=['pad-grade-interpolated-surface-raster','pad-grade-interpolated-surface','pad-grade-interpolated-surface-mesh'];
  let transitionSerial=0;

  const nowMs=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const removeLayer=(map,id)=>{try{if(map?.getLayer?.(id))map.removeLayer(id);}catch(e){}};
  const removeSource=(map,id)=>{try{if(map?.getSource?.(id))map.removeSource(id);}catch(e){}};

  function openTarget(event){
    const button=event.target?.closest?.('button[data-act="open"]');
    const row=button?.closest?.('[data-id]');
    return row?.dataset?.id||'';
  }

  function closeProjectsDialog(){
    const dlg=document.getElementById('projectsDlg');
    if(!dlg?.open)return;
    try{dlg.close();}catch(e){dlg.removeAttribute('open');}
  }

  function clearMapProjectLayers(){
    const map=window.__padGradeMapInstance||null;if(!map)return;
    let style=null;try{style=map.getStyle?.()||null;}catch(e){}
    const layerIds=(style?.layers||[]).map(x=>x?.id).filter(Boolean);
    for(const id of layerIds){
      if(GRID_LAYERS.includes(id)||HEAT_LAYER_IDS.includes(id)||HEAT_LAYER_PREFIXES.some(prefix=>id.startsWith(prefix)))removeLayer(map,id);
    }
    const sourceIds=Object.keys(style?.sources||{});
    for(const id of sourceIds){
      if(GRID_SOURCES.includes(id)||HEAT_SOURCE_IDS.includes(id)||HEAT_SOURCE_PREFIXES.some(prefix=>id.startsWith(prefix)))removeSource(map,id);
    }
    try{map.triggerRepaint?.();}catch(e){}
  }

  function cancelOutgoingHeatGeneration(){
    // v063 intentionally owns its workers and raster buffers inside a closure.
    // Calling its public draw entry point once with the fitted geometry hidden
    // takes the normal no-fit -> removeRaster() path, which terminates every
    // worker and clears all buffered/displayed tiers. Restore gpsFit immediately;
    // the new project apply will replace it later without ever exposing the old
    // raster again.
    if(typeof window.pgDrawSurface!=='function')return false;
    let hadFit=false,savedFit;
    try{
      if(typeof gpsFit!=='undefined'){
        hadFit=true;savedFit=gpsFit;gpsFit=null;
        window.pgDrawSurface();
        return true;
      }
    }catch(e){}finally{
      if(hadFit)try{gpsFit=savedFit;}catch(e){}
    }
    return false;
  }

  function restoreOutgoingProject(from,serial,reason){
    if(serial!==transitionSerial||activeId()!==from)return;
    try{window.__padGradeRefreshMapGridNow?.(true);}catch(e){}
    try{window.pgDrawSurface?.();}catch(e){}
    mark('project.switch-preclose-restored',{projectId:from,reason:String(reason||'target-load-failed')});
  }

  async function loadAndSwitch(target,from,serial){
    let loaded=null;
    try{
      const index=window.PadGradeProjectIndexV107;
      if(index?.loadProject)loaded=await index.loadProject(target)||null;
      else loaded=true;
    }catch(e){
      console.warn('Pad Grade pre-close target load failed',e);
    }
    if(serial!==transitionSerial)return;
    if(!loaded){restoreOutgoingProject(from,serial,'target-load-failed');return;}
    if(typeof window.__padGradeSwitchProjectInPlace!=='function'){
      restoreOutgoingProject(from,serial,'switch-handler-unavailable');return;
    }
    const ok=window.__padGradeSwitchProjectInPlace(target);
    if(!ok&&activeId()===from)restoreOutgoingProject(from,serial,'switch-apply-failed');
  }

  function prepareAndQueue(target,event){
    const from=activeId();if(!target||!from||target===from)return false;
    const serial=++transitionSerial,started=nowMs();
    event.preventDefault();event.stopImmediatePropagation();

    // Tell v1.1.1's repair controller to invalidate any outgoing-project retries
    // before touching the map. v0.9.6 will dispatch the same boundary event again
    // when the loaded target is actually applied; the duplicate is intentional
    // and keeps the legacy switch routine independently safe.
    try{window.dispatchEvent(new CustomEvent('padgrade-before-project-switch',{detail:{from,to:target,preclose:true}}));}catch(e){}
    const heatCancelled=cancelOutgoingHeatGeneration();
    clearMapProjectLayers();
    mark('project.switch-preclose-cleared',{from,to:target,heatCancelled,elapsedMs:+(nowMs()-started).toFixed(1)});

    // Only now expose the map behind the project dialog. The first visible frame
    // can therefore contain neither the outgoing grid nor its heat-map raster.
    closeProjectsDialog();
    requestAnimationFrame(()=>loadAndSwitch(target,from,serial));
    return true;
  }

  // This script is loaded immediately before v090-project-switch-boundary.js, so
  // its capture listener runs first. Same-project opens intentionally fall through
  // to the legacy handler, which simply closes the dialog without a transition.
  document.addEventListener('click',event=>{
    const target=openTarget(event);if(!target||target===activeId())return;
    prepareAndQueue(target,event);
  },true);

  window.__padGradeProjectSwitchVisualPolicyV112='clear-outgoing-grid-and-cancel-heat-before-project-dialog-close-then-lazy-load-and-switch';
})();
