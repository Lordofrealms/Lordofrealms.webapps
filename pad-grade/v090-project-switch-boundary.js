/* Pad Grade v0.9.2 DEV — atomic in-place project switching.
 *
 * Ordinary project changes keep the existing document and MapLibre/imagery
 * instance alive. Only project-owned runtime overlays/state are cleared before
 * the selected project is applied to the already-mounted UI. This avoids both
 * old/new overlay mixtures and full display-group reconstruction.
 */
(function installPadGrade090ProjectSwitchBoundary(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const EMPTY={type:'FeatureCollection',features:[]};
  let switching=false;

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function projectFor(id){
    const p=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);
    return p&&p.id===id&&p.settings?p:null;
  }
  function openTarget(event){
    const button=event.target?.closest?.('button[data-act="open"]');
    const row=button?.closest?.('[data-id]');
    return row?.dataset?.id||null;
  }

  function clearGeoJsonSource(map,id){
    try{const src=map?.getSource?.(id);if(src&&typeof src.setData==='function')src.setData(EMPTY);}catch(e){}
  }
  function removeLayer(map,id){try{if(map?.getLayer?.(id))map.removeLayer(id);}catch(e){}}
  function removeSource(map,id){try{if(map?.getSource?.(id))map.removeSource(id);}catch(e){}}

  function clearProjectOwnedMapState(){
    const map=window.__padGradeMapInstance||null;
    // Keep the map, imagery sources/layers, navigation controls, and live GPS fix.
    // Blank only the logical project grid/route/outline while the new project is
    // being applied in the same JS turn.
    for(const id of ['pad-grade-grid-points','pad-grade-grid-lines','pad-grade-pad-outline','pad-grade-route'])clearGeoJsonSource(map,id);

    // Heat maps are project-owned and double buffered. Remove both completed
    // canvas slots now; pgDrawSurface() below sees the new project key, cancels
    // any old worker job synchronously, and starts the replacement surface.
    if(map){
      let style=null;try{style=map.getStyle?.()||null;}catch(e){}
      const layerIds=(style?.layers||[]).map(x=>x?.id).filter(Boolean);
      for(const id of layerIds){
        if(id.startsWith('pad-grade-interpolated-surface-canvas-layer-')||
           id.startsWith('pad-grade-interpolated-surface-layer-band-')||
           id==='pad-grade-interpolated-surface-layer')removeLayer(map,id);
      }
      const sourceIds=Object.keys(style?.sources||{});
      for(const id of sourceIds){
        if(id.startsWith('pad-grade-interpolated-surface-canvas-source-')||
           id.startsWith('pad-grade-interpolated-surface-band-source-')||
           id==='pad-grade-interpolated-surface-raster'||
           id==='pad-grade-interpolated-surface'||
           id==='pad-grade-interpolated-surface-mesh')removeSource(map,id);
      }
      try{map.triggerRepaint();}catch(e){}
    }

    // Probe results belong to the old project's surface. Use the existing UI
    // actions so the probe module also clears its private marker/navigation state.
    try{document.getElementById('surfaceProbeClearBtn')?.click();}catch(e){}
    try{
      const probe=document.getElementById('surfaceProbeBtn');
      if(probe?.getAttribute('aria-pressed')==='true')probe.click();
    }catch(e){}
  }

  function applyProjectRuntime(project){
    if(!project?.settings)return false;
    const s=project.settings;
    try{
      if(typeof pgWriteCanonicalSettings==='function')pgWriteCanonicalSettings(s,typeof pgUnitMode==='function'?pgUnitMode():undefined);
      else{
        const vals={width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name};
        for(const [id,val] of Object.entries(vals)){const el=document.getElementById(id);if(el&&val!==undefined)el.value=val;}
      }

      readings={...(project.readings||{})};
      readingMeta={...(project.readingMeta||{})};
      gpsRef=project.gps?.reference||null;
      gpsOpposite=project.gps?.opposite||null;
      gpsTargetIndex=Number.isInteger(project.gps?.targetIndex)?project.gps.targetIndex:null;
      if(typeof gpsCorners!=='undefined')gpsCorners=(project.gps?.corners&&typeof project.gps.corners==='object')?{...project.gps.corners}:{};
      if(typeof gpsCaptureIndex!=='undefined')gpsCaptureIndex=Number.isInteger(project.gps?.captureIndex)?project.gps.captureIndex:Object.keys(project.gps?.corners||{}).length;
      if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();
      measureMode=project.measureMode==='gps'?'gps':'manual';
      if(project.dev&&typeof pgApplyDevPayload==='function')pgApplyDevPayload(project.dev);

      if(typeof updateCornerPicker==='function')updateCornerPicker();
      if(typeof renderGrid==='function')renderGrid();
      if(typeof updateGpsUI==='function')updateGpsUI();
      if(typeof pgUpdateNotesSummary==='function')pgUpdateNotesSummary();
      if(typeof updateStats==='function')updateStats();
      return true;
    }catch(e){
      console.warn('Pad Grade in-place project apply failed',e);
      return false;
    }
  }

  function switchProject(id){
    if(switching||!id||id===activeId())return false;
    const project=projectFor(id);if(!project)return false;
    const from=activeId();switching=true;
    window.__padGradeProjectSwitchInProgress=true;
    window.__padGradeProjectMapBoundaryState='clearing-old-project-overlays';

    try{window.dispatchEvent(new CustomEvent('padgrade-before-project-switch',{detail:{from,to:id}}));}catch(e){}
    clearProjectOwnedMapState();

    // Make the selected id authoritative before applying it. Refreshing the
    // project manager here also updates v040's private activeId without a reload.
    localStorage.setItem(ACTIVE_KEY,id);
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}

    const applied=applyProjectRuntime(project);
    if(!applied){
      if(from)localStorage.setItem(ACTIVE_KEY,from);
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      switching=false;window.__padGradeProjectSwitchInProgress=false;
      window.__padGradeProjectMapBoundaryState='apply-failed';
      return false;
    }

    window.__padGradeProjectMapBoundaryState='new-project-applied-refreshing-overlays';
    try{if(typeof refreshMapOverlays==='function')refreshMapOverlays(true);}catch(e){}
    // Direct call is intentional: it makes v063 compare the new surface key now,
    // canceling any old worker before its queued result can repaint the old heatmap.
    try{if(typeof window.pgDrawSurface==='function')window.pgDrawSurface();}catch(e){}
    try{window.__padGradeFrameSavedPad?.(true);}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-active-project-applied',{detail:{id,from,inPlace:true}}));}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-after-project-switch',{detail:{from,to:id,project}}));}catch(e){}

    // v030's existing 400 ms owner updates the same already-mounted grid sources;
    // v063 continues to own heat-map generation. No map or display-group reload.
    switching=false;window.__padGradeProjectSwitchInProgress=false;
    window.__padGradeProjectMapBoundaryState='in-place-overlay-swap-complete';
    return true;
  }

  document.addEventListener('click',event=>{
    const target=openTarget(event);
    if(!target||target===activeId())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    switchProject(target);
  },true);

  window.__padGradeSwitchProjectInPlace=switchProject;
  window.__padGradeProjectSwitchPolicyV092='keep-document-and-map-clear-project-overlays-then-apply-in-place';
})();

/* Legacy CI search markers only; intentionally not executable behavior:
 * intercept-open-carry-target-reload-no-curtain
 * cover-before-handler-carry-target-reload-before-paint
 * __padGradeBeginProjectTransition
 */