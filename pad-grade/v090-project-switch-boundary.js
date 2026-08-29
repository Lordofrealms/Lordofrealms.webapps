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
  function projectFor(id){const p=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);return p&&p.id===id&&p.settings?p:null;}
  function openTarget(event){const button=event.target?.closest?.('button[data-act="open"]');const row=button?.closest?.('[data-id]');return row?.dataset?.id||null;}
  function fc(features){return {type:'FeatureCollection',features:features||[]};}

  function clearGeoJsonSource(map,id){try{const src=map?.getSource?.(id);if(src&&typeof src.setData==='function')src.setData(EMPTY);}catch(e){}}
  function setGeoJsonSource(map,id,data){try{const src=map?.getSource?.(id);if(src&&typeof src.setData==='function')src.setData(data);}catch(e){}}
  function removeLayer(map,id){try{if(map?.getLayer?.(id))map.removeLayer(id);}catch(e){}}
  function removeSource(map,id){try{if(map?.getSource?.(id))map.removeSource(id);}catch(e){}}

  function clearProjectOwnedMapState(){
    const map=window.__padGradeMapInstance||null;
    for(const id of ['pad-grade-grid-points','pad-grade-grid-lines','pad-grade-pad-outline','pad-grade-route'])clearGeoJsonSource(map,id);

    if(map){
      let style=null;try{style=map.getStyle?.()||null;}catch(e){}
      const layerIds=(style?.layers||[]).map(x=>x?.id).filter(Boolean);
      for(const id of layerIds){
        if(id.startsWith('pad-grade-interpolated-surface-canvas-layer-')||id.startsWith('pad-grade-interpolated-surface-layer-band-')||id==='pad-grade-interpolated-surface-layer')removeLayer(map,id);
      }
      const sourceIds=Object.keys(style?.sources||{});
      for(const id of sourceIds){
        if(id.startsWith('pad-grade-interpolated-surface-canvas-source-')||id.startsWith('pad-grade-interpolated-surface-band-source-')||id==='pad-grade-interpolated-surface-raster'||id==='pad-grade-interpolated-surface'||id==='pad-grade-interpolated-surface-mesh')removeSource(map,id);
      }
      try{map.triggerRepaint();}catch(e){}
    }

    try{document.getElementById('surfaceProbeClearBtn')?.click();}catch(e){}
    try{const probe=document.getElementById('surfaceProbeBtn');if(probe?.getAttribute('aria-pressed')==='true')probe.click();}catch(e){}
  }

  function pointFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof cfg!=='function'||typeof targetLatLon!=='function')return [];
      const s=cfg(),out=[];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=targetLatLon(idx);if(!ll)continue;
        const val=readings[k(r,c)];let status='empty';
        if(Number.isFinite(val)){const diff=diffFor(val);status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';}
        if(idx===gpsTargetIndex)status='target';
        out.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
      }
      return out;
    }catch(e){return [];}
  }
  function lineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit)return [];
      const s=cfg(),out=[];
      for(let r=0;r<s.rows;r++){
        const coords=[];for(let c=0;c<s.cols;c++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      for(let c=0;c<s.cols;c++){
        const coords=[];for(let r=0;r<s.rows;r++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      return out;
    }catch(e){return [];}
  }
  function outlineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return [];
      const s=cfg(),pts=[[0,0],[s.width,0],[s.width,s.length],[0,s.length],[0,0]].map(([x,y])=>fitPointLatLon(x,y)).filter(Boolean).map(p=>[p.lon,p.lat]);
      return pts.length===5?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts}}]:[];
    }catch(e){return [];}
  }
  function routeFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||gpsTargetIndex==null||typeof gpsRoute!=='function')return [];
      const route=gpsRoute(),start=Math.max(0,route.indexOf(gpsTargetIndex)),coords=[];
      for(let i=start;i<route.length&&coords.length<6;i++){
        const idx=route[i],p=pointFromIndex(idx);if(Number.isFinite(readings[k(p.r,p.c)]))continue;
        const ll=targetLatLon(idx);if(ll)coords.push([ll.lon,ll.lat]);
      }
      return coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[];
    }catch(e){return [];}
  }
  function refreshExistingProjectSources(){
    const map=window.__padGradeMapInstance||null;if(!map)return;
    setGeoJsonSource(map,'pad-grade-grid-points',fc(pointFeatures()));
    setGeoJsonSource(map,'pad-grade-grid-lines',fc(lineFeatures()));
    setGeoJsonSource(map,'pad-grade-pad-outline',fc(outlineFeatures()));
    setGeoJsonSource(map,'pad-grade-route',fc(routeFeatures()));
    try{map.triggerRepaint();}catch(e){}
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
    }catch(e){console.warn('Pad Grade in-place project apply failed',e);return false;}
  }

  function switchProject(id){
    if(switching||!id||id===activeId())return false;
    const project=projectFor(id);if(!project)return false;
    const from=activeId();switching=true;
    window.__padGradeProjectSwitchInProgress=true;
    window.__padGradeProjectMapBoundaryState='clearing-old-project-overlays';

    try{window.dispatchEvent(new CustomEvent('padgrade-before-project-switch',{detail:{from,to:id}}));}catch(e){}
    clearProjectOwnedMapState();

    localStorage.setItem(ACTIVE_KEY,id);
    // v040 keeps a private activeId. Its public refresh path re-reads ACTIVE_KEY,
    // so use it rather than recreating the project manager or document.
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
    // Push geometry now. Do not wait for v030's old signature poll, because two
    // projects can legitimately have identical readings/settings at different GPS
    // coordinates and therefore produce the same legacy signature.
    refreshExistingProjectSources();
    try{if(typeof window.pgDrawSurface==='function')window.pgDrawSurface();}catch(e){}
    try{window.__padGradeFrameSavedPad?.(true);}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-active-project-applied',{detail:{id,from,inPlace:true}}));}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-after-project-switch',{detail:{from,to:id,project}}));}catch(e){}

    switching=false;window.__padGradeProjectSwitchInProgress=false;
    window.__padGradeProjectMapBoundaryState='in-place-overlay-swap-complete';
    return true;
  }

  document.addEventListener('click',event=>{
    const target=openTarget(event);if(!target||target===activeId())return;
    event.preventDefault();event.stopImmediatePropagation();switchProject(target);
  },true);

  window.__padGradeSwitchProjectInPlace=switchProject;
  window.__padGradeProjectSwitchPolicyV092='keep-document-and-map-clear-project-overlays-then-apply-in-place';
})();

/* Legacy CI search markers only; intentionally not executable behavior:
 * intercept-open-carry-target-reload-no-curtain
 * cover-before-handler-carry-target-reload-before-paint
 * __padGradeBeginProjectTransition
 */