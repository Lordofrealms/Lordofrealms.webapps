/* Pad Grade v0.7.0 DEV — deterministic clean-install durable recovery.
 *
 * The Android bridge now indexes the selected SAF folder once in the background
 * and keeps Pad-Grade-Settings.pgsettings read-only until this module explicitly
 * completes recovery. This avoids repeated listFiles() scans and prevents a slow
 * provider from letting default settings overwrite the surviving snapshot.
 */
(function installPadGrade070Recovery(){
  'use strict';

  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const SESSION_KEY='padGradeV070RecoveredSettings';
  const native=window.PadGradeNative;
  const previousFolderChanged=window.__padGradeProjectFolderChanged;
  let recovering=false;
  let pollTimer=null;
  let recoveryDeadline=0;

  if(!native||typeof native.readProjectFile!=='function')return;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;

  function finishNativeRecovery(){
    try{if(typeof native.completeProjectFolderRecovery==='function')native.completeProjectFolderRecovery();}catch(e){}
  }

  function preserveAppPrefs(settings){
    if(!settings?.appPrefs||typeof settings.appPrefs!=='object')return;
    try{localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
  }

  function importLastProject(settings){
    const id=settings?.lastProjectId;
    if(!id)return false;
    let project=parse(localStorage.getItem(projectKey(id)),null);
    if(!project){
      try{project=parse(native.readProjectFile(`${id}.padgrade`),null);}catch(e){project=null;}
      if(project&&project.id===id&&project.settings){
        try{
          localStorage.setItem(projectKey(id),JSON.stringify(project));
          let idx=parse(localStorage.getItem(INDEX_KEY),[]);if(!Array.isArray(idx))idx=[];
          const meta={
            id,
            name:project.settings.name||settings.lastProjectName||'Pad',
            createdAt:project.createdAt||new Date().toISOString(),
            modifiedAt:project.modifiedAt||project.exportedAt||new Date().toISOString(),
            status:project.status==='archived'?'archived':'open'
          };
          const found=idx.find(x=>x&&x.id===id);
          if(found)Object.assign(found,meta);else idx.push(meta);
          localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
        }catch(e){}
      }
    }
    if(project&&project.settings&&project.status!=='archived'){
      try{localStorage.setItem(ACTIVE_KEY,id);}catch(e){}
      return true;
    }
    return false;
  }

  function saveSessionRecovery(settings,recoveredProject){
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({settings,recoveredProject:!!recoveredProject}));}catch(e){}
  }

  function handoffNormally(){
    finishNativeRecovery();
    recovering=false;
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
    try{previousFolderChanged?.();}catch(e){}
  }

  function recoverFromIndexedFolder(){
    let settings=null;
    try{settings=parse(native.readProjectFile(SETTINGS_FILE),null);}catch(e){settings=null;}
    if(!settings||settings.type!=='settings'){
      // The folder is fully indexed now, so a missing settings file is a real
      // absence rather than a transient SAF timing condition.
      handoffNormally();
      return;
    }

    preserveAppPrefs(settings);
    const recoveredProject=importLastProject(settings);
    saveSessionRecovery(settings,recoveredProject);
    finishNativeRecovery();
    recovering=false;

    // Do NOT start the expensive all-project reconciliation before this reload.
    // The recovered active project and appPrefs are already local, so reload first
    // and let the normal reconciler run afterward from a warm native folder cache.
    setTimeout(()=>{try{location.reload();}catch(e){}},40);
  }

  function indexReady(){
    try{
      if(typeof native.isProjectFolderIndexReady==='function')return !!native.isProjectFolderIndexReady();
      return true;
    }catch(e){return false;}
  }

  function pollForFolderIndex(){
    if(!recovering)return;
    if(indexReady()){
      if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
      recoverFromIndexedFolder();
      return;
    }
    if(Date.now()>=recoveryDeadline){
      // Very unusual provider failure: release the write lock and fall back to the
      // established project-folder path rather than trapping the app indefinitely.
      handoffNormally();
      return;
    }
    pollTimer=setTimeout(pollForFolderIndex,100);
  }

  function beginFolderRecovery(){
    if(recovering)return;
    recovering=true;
    recoveryDeadline=Date.now()+45000;
    // The folder itself is valid immediately after ACTION_OPEN_DOCUMENT_TREE.
    // Refreshing the header here no longer requires enumerating every project.
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
    pollForFolderIndex();
  }

  function applyRecoveredPortableState(){
    let recovered=null;
    try{recovered=parse(sessionStorage.getItem(SESSION_KEY),null);sessionStorage.removeItem(SESSION_KEY);}catch(e){}
    const settings=recovered?.settings;
    if(!settings||settings.type!=='settings')return;
    const portable=settings.portablePrefs&&typeof settings.portablePrefs==='object'?settings.portablePrefs:{};

    preserveAppPrefs(settings);
    try{
      if(portable.unitMode&&typeof pgSetUnitMode==='function')pgSetUnitMode(portable.unitMode);
      if(!recovered.recoveredProject&&settings.lastSettings&&typeof pgWriteCanonicalSettings==='function'){
        pgWriteCanonicalSettings(settings.lastSettings,portable.unitMode||undefined);
      }

      const heatmap=document.getElementById('heatmapToggle');
      if(heatmap&&typeof portable.heatmap==='boolean'){
        heatmap.checked=portable.heatmap;
        heatmap.dispatchEvent(new Event('change',{bubbles:true}));
      }

      const route=document.getElementById('routeMode');
      if(route&&portable.routeMode){
        route.value=String(portable.routeMode);
        route.dispatchEvent(new Event('change',{bubbles:true}));
      }

      const opacity=document.getElementById('heatmapTransparency');
      if(opacity&&Number.isFinite(+portable.heatmapTransparency)){
        opacity.value=String(Math.max(0,Math.min(90,+portable.heatmapTransparency)));
        opacity.dispatchEvent(new Event('input',{bubbles:true}));
        opacity.dispatchEvent(new Event('change',{bubbles:true}));
      }

      if(typeof renderGrid==='function')renderGrid();
      if(typeof updateGpsUI==='function')updateGpsUI();
      if(typeof pgDrawSurface==='function')setTimeout(()=>pgDrawSurface(),0);
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      // Persist the recovered portable controls through the normal current build
      // pathways after every module has had a chance to initialize.
      setTimeout(()=>{try{saveLocal();}catch(e){}},700);
    }catch(e){console.warn('Pad Grade durable settings UI restore failed',e);}
  }

  const wrapped=function(){beginFolderRecovery();};
  wrapped.__padGradeV070Recovery=true;
  window.__padGradeProjectFolderChanged=wrapped;
  window.__padGradeProjectFolderIndexed=function(){if(recovering)pollForFolderIndex();};

  // On the reload following a successful folder reconnect, appPrefs already exist
  // before earlier modules start. Apply the few UI-owned portable controls now.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyRecoveredPortableState,{once:true});
  else setTimeout(applyRecoveredPortableState,0);

  window.__padGradeFolderRecoveryV070='background-index-first-read-settings-then-reload';
})();
