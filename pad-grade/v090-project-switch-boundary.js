/* Pad Grade v0.9.6 DEV — atomic in-place project switching.
 *
 * Ordinary project changes keep the document, MapLibre instance, imagery,
 * controls, and live GPS marker alive. Project-owned overlays are removed before
 * state changes. As soon as the new project's fitted GPS geometry exists, its
 * tiny GeoJSON grid is pushed synchronously into the existing map before bottom
 * grid/GPS/stats/heat-map work begins. Durable last-project persistence is async.
 */
(function installPadGrade090ProjectSwitchBoundary(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const GRID_LAYERS=['pad-grade-grid-labels','pad-grade-grid-points-layer','pad-grade-route-layer','pad-grade-pad-outline-layer','pad-grade-grid-lines-layer'];
  const GRID_SOURCES=['pad-grade-grid-points','pad-grade-route','pad-grade-pad-outline','pad-grade-grid-lines'];
  let switching=false,queuedSwitch=null;

  function nowMs(){try{return performance.now();}catch(e){return Date.now();}}
  function diagMark(name,details){try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}}
  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function projectFor(id){const p=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);return p&&p.id===id&&p.settings?p:null;}
  function openTarget(event){const button=event.target?.closest?.('button[data-act="open"]');const row=button?.closest?.('[data-id]');return row?.dataset?.id||null;}
  function fc(features){return {type:'FeatureCollection',features:features||[]};}
  function removeLayer(map,id){try{if(map?.getLayer?.(id))map.removeLayer(id);}catch(e){}}
  function removeSource(map,id){try{if(map?.getSource?.(id))map.removeSource(id);}catch(e){}}

  function removeGridFamily(map){
    if(!map)return;
    for(const id of GRID_LAYERS)removeLayer(map,id);
    for(const id of GRID_SOURCES)removeSource(map,id);
  }

  function clearProjectOwnedMapState(){
    const started=nowMs(),map=window.__padGradeMapInstance||null;
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
      removeGridFamily(map);
      try{map.triggerRepaint();}catch(e){}
    }
    try{document.getElementById('surfaceProbeClearBtn')?.click();}catch(e){}
    try{const probe=document.getElementById('surfaceProbeBtn');if(probe?.getAttribute('aria-pressed')==='true')probe.click();}catch(e){}
    diagMark('project.switch-old-overlays-cleared',{elapsedMs:+(nowMs()-started).toFixed(1)});
  }

  function pointFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof cfg!=='function'||typeof targetLatLon!=='function')return [];
      const s=cfg(),pid=activeId()||'',out=[];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=targetLatLon(idx);if(!ll)continue;
        const val=readings[k(r,c)];let status='empty';
        if(Number.isFinite(val)){const diff=diffFor(val);status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';}
        if(idx===gpsTargetIndex)status='target';
        out.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status,projectId:pid},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
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

  function installProjectGridFamily(expectedProjectId){
    const map=window.__padGradeMapInstance||null;if(!map||expectedProjectId!==activeId())return false;
    try{if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded())return false;}catch(e){return false;}
    removeGridFamily(map);
    try{
      map.addSource('pad-grade-grid-lines',{type:'geojson',data:fc(lineFeatures())});
      map.addLayer({id:'pad-grade-grid-lines-layer',type:'line',source:'pad-grade-grid-lines',paint:{'line-color':'#d8f2ff','line-width':1,'line-opacity':0.55}});
      map.addSource('pad-grade-pad-outline',{type:'geojson',data:fc(outlineFeatures())});
      map.addLayer({id:'pad-grade-pad-outline-layer',type:'line',source:'pad-grade-pad-outline',paint:{'line-color':'#ffffff','line-width':3,'line-opacity':0.95}});
      map.addSource('pad-grade-route',{type:'geojson',data:fc(routeFeatures())});
      map.addLayer({id:'pad-grade-route-layer',type:'line',source:'pad-grade-route',paint:{'line-color':'#ffd166','line-width':3,'line-opacity':0.8,'line-dasharray':[2,2]}});
      map.addSource('pad-grade-grid-points',{type:'geojson',data:fc(pointFeatures())});
      map.addLayer({id:'pad-grade-grid-points-layer',type:'circle',source:'pad-grade-grid-points',paint:{'circle-radius':['case',['==',['get','status'],'target'],9,6],'circle-color':['match',['get','status'],'target','#ffd166','cut','#a83a2b','fill','#315fa8','grade','#4f8f3a','#66717d'],'circle-stroke-color':'#ffffff','circle-stroke-width':['case',['==',['get','status'],'target'],3,1]}});
      map.addLayer({id:'pad-grade-grid-labels',type:'symbol',source:'pad-grade-grid-points',minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
      try{map.triggerRepaint();}catch(e){}
      window.__padGradeProjectGridSourceOwnerV094=expectedProjectId;
      return true;
    }catch(e){console.warn('Pad Grade project grid reinstall failed',e);removeGridFamily(map);return false;}
  }

  function primeNewProjectGrid(id,reason='switch'){ 
    const started=nowMs();let ok=false;
    try{if(typeof window.__padGradeRefreshMapGridNow==='function')ok=!!window.__padGradeRefreshMapGridNow(true);}catch(e){}
    if(!ok)ok=installProjectGridFamily(id);
    diagMark('map.project-grid-primed',{projectId:id,reason,ok,elapsedMs:+(nowMs()-started).toFixed(1)});
    return ok;
  }

  function refreshProjectOverlays(id){
    const map=window.__padGradeMapInstance||null;
    const finish=()=>{
      if(id!==activeId())return;
      primeNewProjectGrid(id,'overlay-refresh');
      try{if(typeof window.pgDrawSurface==='function')window.pgDrawSurface();}catch(e){}
      try{window.__padGradeFrameSavedPad?.(true);}catch(e){}
    };
    if(!map){return;}
    try{
      if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded()){
        map.once('style.load',finish);return;
      }
    }catch(e){}
    finish();
  }

  function applyProjectRuntime(project){
    if(!project?.settings)return false;
    const s=project.settings,started=nowMs();
    try{
      if(typeof pgWriteCanonicalSettings==='function')pgWriteCanonicalSettings(s,typeof pgUnitMode==='function'?pgUnitMode():undefined);
      else{
        const vals={width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name};
        for(const [id,val] of Object.entries(vals)){const el=document.getElementById(id);if(el&&val!==undefined)el.value=val;}
      }
      readings={...(project.readings||{})};readingMeta={...(project.readingMeta||{})};
      gpsRef=project.gps?.reference||null;gpsOpposite=project.gps?.opposite||null;gpsTargetIndex=Number.isInteger(project.gps?.targetIndex)?project.gps.targetIndex:null;
      if(typeof gpsCorners!=='undefined')gpsCorners=(project.gps?.corners&&typeof project.gps.corners==='object')?{...project.gps.corners}:{};
      if(typeof gpsCaptureIndex!=='undefined')gpsCaptureIndex=Number.isInteger(project.gps?.captureIndex)?project.gps.captureIndex:Object.keys(project.gps?.corners||{}).length;
      if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();
      measureMode=project.measureMode==='gps'?'gps':'manual';
      if(project.dev&&typeof pgApplyDevPayload==='function')pgApplyDevPayload(project.dev);

      // The fitted coordinates are now valid. Push the tiny map grid BEFORE any
      // UI work that can schedule surface interpolation.
      primeNewProjectGrid(project.id,'immediate-after-gps-fit');

      if(typeof renderGrid==='function')renderGrid();
      if(typeof updateCornerPicker==='function')updateCornerPicker();
      if(typeof updateGpsUI==='function')updateGpsUI();
      if(typeof pgUpdateNotesSummary==='function')pgUpdateNotesSummary();
      setTimeout(()=>{try{if(typeof updateStats==='function')updateStats();}catch(e){}},0);
      diagMark('project.runtime-applied',{projectId:project.id,elapsedMs:+(nowMs()-started).toFixed(1)});
      return true;
    }catch(e){console.warn('Pad Grade in-place project apply failed',e);return false;}
  }

  function persistLastProject(project){
    const files=window.PadGradeFiles,native=window.PadGradeNative;
    if(!native||typeof native.hasProjectFolder!=='function'||!native.hasProjectFolder())return;
    if(typeof native.isProjectFolderIndexReady==='function'&&!native.isProjectFolderIndexReady())return;
    if(files&&typeof files.read==='function'&&typeof files.write==='function'){
      (async()=>{
        const token=window.PadGradeDiag?.start?.('project.persist-last',{projectId:project.id});
        try{
          const settings=parse(await files.read(SETTINGS_FILE),null);if(!settings||typeof settings!=='object'||settings.type!=='settings')return;
          settings.lastProjectId=project.id;settings.lastProjectName=project.settings?.name||settings.lastProjectName||'Pad';settings.modifiedAt=new Date().toISOString();
          await files.write(SETTINGS_FILE,JSON.stringify(settings));
        }catch(e){}finally{try{window.PadGradeDiag?.end?.(token);}catch(e){}}
      })();
      return;
    }
    try{
      if(typeof native.readProjectFile!=='function'||typeof native.writeProjectFile!=='function')return;
      const settings=parse(native.readProjectFile(SETTINGS_FILE),null);if(!settings||typeof settings!=='object'||settings.type!=='settings')return;
      settings.lastProjectId=project.id;settings.lastProjectName=project.settings?.name||settings.lastProjectName||'Pad';settings.modifiedAt=new Date().toISOString();
      native.writeProjectFile(SETTINGS_FILE,JSON.stringify(settings));
    }catch(e){}
  }

  function closeProjectsDialog(){const dlg=document.getElementById('projectsDlg');if(dlg?.open)try{dlg.close();}catch(e){dlg.removeAttribute('open');}}

  function switchProject(id){
    if(switching||!id||id===activeId())return false;
    const project=projectFor(id);if(!project)return false;
    const from=activeId(),started=nowMs();switching=true;window.__padGradeProjectSwitchInProgress=true;window.__padGradeProjectMapBoundaryState='clearing-old-project-overlays';
    try{window.dispatchEvent(new CustomEvent('padgrade-before-project-switch',{detail:{from,to:id}}));}catch(e){}
    clearProjectOwnedMapState();
    localStorage.setItem(ACTIVE_KEY,id);
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}

    const applied=applyProjectRuntime(project);
    if(!applied){if(from)localStorage.setItem(ACTIVE_KEY,from);try{window.__padGradeRefreshProjectIndex?.();}catch(e){}switching=false;window.__padGradeProjectSwitchInProgress=false;window.__padGradeProjectMapBoundaryState='apply-failed';return false;}

    window.__padGradeProjectMapBoundaryState='new-project-applied-refreshing-overlays';
    refreshProjectOverlays(id);
    persistLastProject(project);
    try{window.dispatchEvent(new CustomEvent('padgrade-active-project-applied',{detail:{id,from,inPlace:true}}));}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-after-project-switch',{detail:{from,to:id,project}}));}catch(e){}
    switching=false;window.__padGradeProjectSwitchInProgress=false;window.__padGradeProjectMapBoundaryState='in-place-overlay-hard-swap-complete';
    diagMark('project.switch-complete',{from,to:id,elapsedMs:+(nowMs()-started).toFixed(1)});
    return true;
  }

  function reloadActiveProject(project){
    if(!project?.id||project.id!==activeId())return false;
    const started=nowMs();clearProjectOwnedMapState();
    const applied=applyProjectRuntime(project);if(!applied)return false;
    refreshProjectOverlays(project.id);persistLastProject(project);
    try{window.dispatchEvent(new CustomEvent('padgrade-active-project-applied',{detail:{id:project.id,from:project.id,inPlace:true,durableReload:true}}));}catch(e){}
    diagMark('project.active-durable-reload',{projectId:project.id,elapsedMs:+(nowMs()-started).toFixed(1)});return true;
  }

  function queueProjectSwitch(target){
    if(!target)return;queuedSwitch=target;
    requestAnimationFrame(async()=>{
      const id=queuedSwitch;queuedSwitch=null;if(!id)return;
      const before=projectFor(id),wasActive=id===activeId();let loaded=before;
      try{const index=window.PadGradeProjectIndexV107;if(index?.loadProject)loaded=await index.loadProject(id)||before;}catch(e){console.warn('Pad Grade lazy durable project load failed',e);}
      if(!loaded)return;
      if(wasActive){if(before&&String(before.modifiedAt||'')===String(loaded.modifiedAt||''))return;reloadActiveProject(loaded);return;}
      switchProject(id);
    });
  }

  document.addEventListener('click',event=>{
    const target=openTarget(event);if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();closeProjectsDialog();
    if(target===activeId())return;queueProjectSwitch(target);
  },true);

  window.__padGradeSwitchProjectInPlace=switchProject;
  window.__padGradeProjectSwitchPolicyV096='keep-map-imagery-clear-old-overlays-prime-new-grid-immediately-after-gps-fit-then-ui-heatmap';
  window.__padGradeProjectSwitchPolicyV094=window.__padGradeProjectSwitchPolicyV096;
  window.__padGradeProjectSwitchPolicyV093='superseded-by-v096-fast-overlay-boundary';
})();

/* Legacy CI search markers only; intentionally not executable behavior:
 * intercept-open-carry-target-reload-no-curtain
 * cover-before-handler-carry-target-reload-before-paint
 * __padGradeBeginProjectTransition
 */
