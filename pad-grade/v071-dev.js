/* Pad Grade v0.7.2 DEV — late durable settings recovery owner.
 *
 * The folder-change handler is installed after the legacy project-manager stack,
 * so it cannot be overwritten. Recovery is settings-first: before native writes
 * are re-enabled we resolve the saved last project by canonical filename, embedded
 * project id, or saved project name. Only then do we reload into recovered state.
 */
(function installPadGrade071RecoveryOwner(){
  'use strict';

  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const SESSION_KEY='padGradeV070RecoveredSettings';
  const native=window.PadGradeNative;
  let legacyFolderChanged=null;
  let ownerInstalled=false;
  let recovering=false;
  let pollTimer=null;
  let deadline=0;

  if(!native||typeof native.readProjectFile!=='function')return;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;

  function completeNativeRecovery(){
    try{if(typeof native.completeProjectFolderRecovery==='function')native.completeProjectFolderRecovery();}catch(e){}
  }

  function putRecoveredProject(project,settings){
    if(!project||typeof project!=='object'||!project.id||!project.settings)return false;
    const id=project.id;
    try{
      localStorage.setItem(projectKey(id),JSON.stringify(project));
      let idx=parse(localStorage.getItem(INDEX_KEY),[]);if(!Array.isArray(idx))idx=[];
      const meta={
        id,
        name:project.settings.name||settings?.lastProjectName||'Pad',
        createdAt:project.createdAt||project.exportedAt||new Date().toISOString(),
        modifiedAt:project.modifiedAt||project.exportedAt||new Date().toISOString(),
        status:project.status==='archived'?'archived':'open'
      };
      const found=idx.find(x=>x&&x.id===id);
      if(found)Object.assign(found,meta);else idx.push(meta);
      localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
      if(meta.status!=='archived')localStorage.setItem(ACTIVE_KEY,id);
      return meta.status!=='archived';
    }catch(e){return false;}
  }

  function findDurableProject(id,name){
    if(!id)return null;
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
      if(!nameMatch&&name&&candidate.settings.name===name)nameMatch=candidate;
    }
    return nameMatch;
  }

  function saveRecoveryHandoff(settings,recoveredProject){
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({settings,recoveredProject:!!recoveredProject}));}catch(e){}
  }

  function fallThroughToProjectSync(){
    completeNativeRecovery();
    recovering=false;
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}
    try{legacyFolderChanged?.();}catch(e){}
  }

  function restoreIndexedSettings(){
    let raw=null;
    try{raw=native.readProjectFile(SETTINGS_FILE);}catch(e){raw=null;}
    const settings=parse(raw,null);
    if(!settings||settings.type!=='settings'){
      fallThroughToProjectSync();
      return;
    }

    try{
      if(settings.appPrefs&&typeof settings.appPrefs==='object')localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));
    }catch(e){}

    let recoveredProject=false;
    const desired=settings.lastProjectId||null;
    if(desired){
      const project=findDurableProject(desired,settings.lastProjectName||null);
      if(project)recoveredProject=putRecoveredProject(project,settings);
    }

    saveRecoveryHandoff(settings,recoveredProject);
    completeNativeRecovery();
    recovering=false;
    if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}

    // Reload before the legacy reconciler is allowed to select/create another
    // active project. The recovered ACTIVE_KEY is therefore present when v040
    // initializes on the fresh page.
    setTimeout(()=>{try{location.reload();}catch(e){}},40);
  }

  function indexReady(){
    try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}
  }

  function waitForIndex(){
    if(!recovering)return;
    if(indexReady()){restoreIndexedSettings();return;}
    if(Date.now()>=deadline){fallThroughToProjectSync();return;}
    pollTimer=setTimeout(waitForIndex,100);
  }

  function onFolderChanged(){
    if(recovering)return;
    recovering=true;
    deadline=Date.now()+60000;
    waitForIndex();
  }

  function installFinalOwner(){
    if(ownerInstalled||!window.__padGradeDurableSyncV040)return false;
    const current=window.__padGradeProjectFolderChanged;
    if(typeof current!=='function')return false;
    legacyFolderChanged=current;
    window.__padGradeProjectFolderChanged=onFolderChanged;
    ownerInstalled=true;
    window.__padGradeFolderRecoveryV071='late-owner-settings-first-then-project-sync';
    return true;
  }

  window.addEventListener('padgrade-durable-sync-ready',installFinalOwner);
  let tries=0;
  const ownerTimer=setInterval(()=>{
    if(installFinalOwner()||++tries>120)clearInterval(ownerTimer);
  },100);

  window.addEventListener('beforeunload',()=>{
    if(pollTimer)clearTimeout(pollTimer);
    clearInterval(ownerTimer);
  },{once:true});
})();
