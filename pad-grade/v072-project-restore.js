/* Pad Grade v0.8.7 DEV — non-blocking last-project restore.
 *
 * The locally cached active project is authoritative for first paint. Durable SAF
 * indexing/reconciliation happens later and never owns the recovery curtain or
 * waits on the GPS map. The retired v070/v071 reload owners are not loaded.
 */
(function installPadGrade072LastProjectRestore(){
  'use strict';

  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const native=window.PadGradeNative;
  let done=false;
  let durableReconciled=false;

  if(!native||typeof native.readProjectFile!=='function')return;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;

  function endVisualHold(delay=0){
    setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}
      window.__padGradeStartupRevealV087='local-project-grid-first-map-independent';
    })),Math.max(0,delay));
  }
  function indexReady(){try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasFolder(){try{return typeof native.hasProjectFolder==='function'&&!!native.hasProjectFolder();}catch(e){return false;}}

  function applyPortableSettings(settings){
    if(!settings||typeof settings!=='object')return;
    try{if(settings.appPrefs&&typeof settings.appPrefs==='object')localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
    const portable=settings.portablePrefs&&typeof settings.portablePrefs==='object'?settings.portablePrefs:{};
    try{
      if(portable.unitMode&&typeof pgSetUnitMode==='function')pgSetUnitMode(portable.unitMode);
      const heat=document.getElementById('heatmapToggle');
      if(heat&&typeof portable.heatmap==='boolean')heat.checked=portable.heatmap;
      const route=document.getElementById('routeMode');if(route&&portable.routeMode)route.value=String(portable.routeMode);
      const opacity=document.getElementById('heatmapTransparency');if(opacity&&Number.isFinite(+portable.heatmapTransparency))opacity.value=String(Math.max(0,Math.min(90,+portable.heatmapTransparency)));
    }catch(e){}
  }

  function storeProject(project){
    if(!project||typeof project!=='object'||!project.id||!project.settings)return false;
    const id=project.id;
    try{
      localStorage.setItem(projectKey(id),JSON.stringify(project));
      let idx=parse(localStorage.getItem(INDEX_KEY),[]);if(!Array.isArray(idx))idx=[];
      const meta={id,name:project.settings.name||'Pad',createdAt:project.createdAt||project.exportedAt||new Date().toISOString(),modifiedAt:project.modifiedAt||project.exportedAt||new Date().toISOString(),status:project.status==='archived'?'archived':'open',fileId:project.fileId||undefined};
      const found=idx.find(x=>x&&x.id===id);if(found)Object.assign(found,meta);else idx.push(meta);
      localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
      if(meta.status!=='archived')localStorage.setItem(ACTIVE_KEY,id);
      return meta.status!=='archived';
    }catch(e){return false;}
  }

  function applyProject(project){
    if(!project||!project.settings)return false;
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
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      try{window.dispatchEvent(new CustomEvent('padgrade-active-project-applied',{detail:{id:project.id}}));}catch(e){}
      return true;
    }catch(e){console.warn('Pad Grade last project apply failed',e);return false;}
  }

  function findDurableProject(id,projectName){
    if(!indexReady())return null;
    let project=null;
    try{project=parse(native.readProjectFile(`${id}.padgrade`),null);}catch(e){project=null;}
    if(project&&project.id===id&&project.settings)return project;
    let names=[];
    try{if(typeof native.listProjectFiles==='function')names=parse(native.listProjectFiles(),[])||[];}catch(e){names=[];}
    let nameMatch=null;
    for(const filename of names){
      if(typeof filename!=='string')continue;
      let candidate=null;try{candidate=parse(native.readProjectFile(filename),null);}catch(e){candidate=null;}
      if(!candidate||!candidate.settings)continue;
      if(candidate.id===id)return candidate;
      if(!nameMatch&&projectName&&candidate.settings.name===projectName)nameMatch=candidate;
    }
    return nameMatch;
  }

  function activeLocalProject(){
    const id=localStorage.getItem(ACTIVE_KEY)||null;
    if(!id)return null;
    const project=parse(localStorage.getItem(projectKey(id)),null);
    return project&&project.id===id&&project.settings?project:null;
  }

  function revealLocalImmediately(){
    if(done)return;
    const project=activeLocalProject();
    if(project){
      applyProject(project);
      window.__padGradeProjectStartupSettledV087=project.id;
    }
    done=true;
    endVisualHold(0);
  }

  function reconcileDurableWhenReady(){
    if(durableReconciled||!hasFolder()||!indexReady())return false;
    durableReconciled=true;
    let settings=null;
    try{settings=parse(native.readProjectFile(SETTINGS_FILE),null);}catch(e){settings=null;}
    applyPortableSettings(settings);
    const id=settings?.lastProjectId||localStorage.getItem(ACTIVE_KEY)||null;
    if(!id){try{native.completeProjectFolderRecovery?.();}catch(e){}return true;}
    let project=parse(localStorage.getItem(projectKey(id)),null);
    const durable=findDurableProject(id,settings?.lastProjectName||null);
    if(durable&&durable.settings){
      const durableMs=Date.parse(durable.modifiedAt||durable.exportedAt||'')||0;
      const localMs=Date.parse(project?.modifiedAt||project?.exportedAt||'')||0;
      if(!project||durableMs>=localMs)project=durable;
    }
    if(project&&project.settings&&storeProject(project)){
      const current=localStorage.getItem(ACTIVE_KEY);
      if(current===project.id){
        applyProject(project);
        window.__padGradeLastProjectRestoredV087=project.id;
      }
    }
    try{native.completeProjectFolderRecovery?.();}catch(e){}
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',revealLocalImmediately,{once:true});
  else revealLocalImmediately();

  window.__padGradeProjectFolderIndexed=()=>{setTimeout(reconcileDurableWhenReady,0);};
  window.addEventListener('padgrade-durable-sync-ready',()=>setTimeout(reconcileDurableWhenReady,0));
  window.addEventListener('padgrade-projects-reconciled',()=>setTimeout(reconcileDurableWhenReady,0));
  setTimeout(reconcileDurableWhenReady,0);

  window.__padGradeStartupFolderIndexPolicy='background-never-block-visible-grid-no-reload-owner';
})();
