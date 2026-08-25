/* Pad Grade v0.7.2 DEV — deterministic last-project application.
 *
 * Durable settings recovery already restores app preferences. This module waits
 * for the native SAF folder index, reads the saved lastProjectId, restores that
 * exact .padgrade file into local storage if needed, and explicitly applies it
 * to the live UI. This removes the remaining startup-order dependency between
 * init.js defaults, the asynchronous v040 project manager, and folder recovery.
 */
(function installPadGrade072LastProjectRestore(){
  'use strict';

  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const native=window.PadGradeNative;
  let done=false;
  let timer=null;
  let deadline=Date.now()+60000;

  if(!native||typeof native.readProjectFile!=='function')return;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;

  function indexReady(){
    try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}
  }
  function hasFolder(){try{return typeof native.hasProjectFolder==='function'&&!!native.hasProjectFolder();}catch(e){return false;}}

  function storeProject(project){
    if(!project||typeof project!=='object'||!project.id||!project.settings)return false;
    const id=project.id;
    try{
      localStorage.setItem(projectKey(id),JSON.stringify(project));
      let idx=parse(localStorage.getItem(INDEX_KEY),[]);if(!Array.isArray(idx))idx=[];
      const meta={id,name:project.settings.name||'Pad',createdAt:project.createdAt||project.exportedAt||new Date().toISOString(),modifiedAt:project.modifiedAt||project.exportedAt||new Date().toISOString(),status:project.status==='archived'?'archived':'open'};
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
      if(typeof gpsCorners!=='undefined')gpsCorners=(project.gps?.corners&&typeof project.gps.corners==='object')?project.gps.corners:{};
      if(typeof gpsCaptureIndex!=='undefined')gpsCaptureIndex=Number.isInteger(project.gps?.captureIndex)?project.gps.captureIndex:Object.keys(project.gps?.corners||{}).length;
      if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();
      measureMode=project.measureMode==='gps'?'gps':'manual';
      if(project.dev&&typeof pgApplyDevPayload==='function')pgApplyDevPayload(project.dev);
      if(typeof updateCornerPicker==='function')updateCornerPicker();
      if(typeof renderGrid==='function')renderGrid();
      if(typeof updateGpsUI==='function')updateGpsUI();
      if(typeof pgUpdateNotesSummary==='function')pgUpdateNotesSummary();
      try{refreshMapOverlays(true);}catch(e){}
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      return true;
    }catch(e){console.warn('Pad Grade last project apply failed',e);return false;}
  }

  function restore(){
    if(done)return true;
    if(!hasFolder())return false;
    if(!indexReady())return false;

    let settings=null;
    try{settings=parse(native.readProjectFile(SETTINGS_FILE),null);}catch(e){settings=null;}
    const id=settings?.lastProjectId||null;
    if(!id){done=true;return true;}

    let project=parse(localStorage.getItem(projectKey(id)),null);
    if(!project||project.id!==id||!project.settings){
      try{project=parse(native.readProjectFile(`${id}.padgrade`),null);}catch(e){project=null;}
    }
    if(!project||project.id!==id||!project.settings){done=true;return true;}
    if(!storeProject(project)){done=true;return true;}

    // Apply after the asynchronous project manager has had a chance to initialize;
    // repeat once on the next frame so its own initial paint cannot win a race.
    applyProject(project);
    requestAnimationFrame(()=>applyProject(project));
    setTimeout(()=>applyProject(project),250);
    done=true;
    window.__padGradeLastProjectRestoredV072=id;
    return true;
  }

  function poll(){
    if(done)return;
    if(restore())return;
    if(Date.now()>=deadline)return;
    timer=setTimeout(poll,120);
  }

  window.addEventListener('padgrade-durable-sync-ready',()=>setTimeout(poll,0));
  window.addEventListener('padgrade-projects-reconciled',()=>{if(!done)setTimeout(poll,0);});
  setTimeout(poll,0);
  window.addEventListener('beforeunload',()=>{if(timer)clearTimeout(timer);},{once:true});
})();
