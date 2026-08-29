/* Pad Grade v0.9.8 DEV — minimum durable recovery + idle reconciliation.
 *
 * The recovery critical path is limited to the background-built native directory
 * index, portable settings, and the one last-active project. Recovered durable
 * storage remains mutation-locked while the recovery curtain is active. Full
 * folder reconciliation and File-ID migration start only after the visible app is
 * usable and an idle slice is available.
 */
(function installPadGrade096AsyncReconcile(){
  'use strict';
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const FILE_ID_RE=/^([A-HJ-NP-Z]{4}[2-9]{2})-/i;
  const native=window.PadGradeNative||null;
  const files=window.PadGradeFiles||null;
  const diag=()=>window.PadGradeDiag||null;
  let minimumPromise=null,fullPromise=null,migrationPromise=null;
  let reconcileTimer=null,migrationTimer=null,reconcileIdle=null,migrationIdle=null;

  if(!native||!files||typeof files.read!=='function')return;
  window.__padGradeAsyncDurableV096=true;
  window.__padGradeFolderChangedV068=true;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const nowIso=()=>new Date().toISOString();
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;
  function indexReady(){try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasFolder(){try{if(typeof native.hasProjectFolderConfigured==='function')return !!native.hasProjectFolderConfigured();return typeof native.hasProjectFolder==='function'&&!!native.hasProjectFolder();}catch(e){return false;}}
  function recoveryPending(){try{return typeof native.isProjectFolderRecoveryPending==='function'&&!!native.isProjectFolderRecoveryPending();}catch(e){return false;}}
  function recoveryCurtain(){try{return document.documentElement.classList.contains('padGradeRecoveryHold');}catch(e){return false;}}
  function criticalRecoveryActive(){return recoveryPending()&&(recoveryCurtain()||window.__padGradeFirstRunPending===true);}
  function getIndex(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function setIndex(x){try{localStorage.setItem(INDEX_KEY,JSON.stringify(x));}catch(e){}}
  function getLocal(id){return parse(localStorage.getItem(projectKey(id)),null);}
  function putLocal(p){if(p?.id)try{localStorage.setItem(projectKey(p.id),JSON.stringify(p));}catch(e){}}
  function modified(p){const t=Date.parse(p?.modifiedAt||p?.exportedAt||p?.createdAt||'');return Number.isFinite(t)?t:0;}
  function statusOf(p,item){return (p?.status||item?.status)==='archived'?'archived':'open';}
  function clamp(n,a,b,d){n=Number(n);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):d;}
  function isCandidate(name){const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');}
  function fileIdFromFilename(filename){if(String(filename||'').includes('#'))return null;const m=String(filename||'').match(FILE_ID_RE);return m?String(m[1]).toUpperCase():null;}
  function stableLegacyId(filename,raw){const seed=String(filename||'legacy')+'|'+JSON.stringify(raw?.settings||raw||{});let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return `pg-legacy-${(h>>>0).toString(36)}`;}
  function normalizeOne(raw,filename){
    if(!raw||typeof raw!=='object')return null;
    const s=(raw.settings&&typeof raw.settings==='object')?raw.settings:raw;
    const hasGeometry=['width','length','cols','rows'].some(k=>s[k]!==undefined),hasReadings=raw.readings&&typeof raw.readings==='object';
    if(!hasGeometry&&!hasReadings)return null;
    const id=raw.id||stableLegacyId(filename,raw),gpsRaw=(raw.gps&&typeof raw.gps==='object')?raw.gps:{},gps={...gpsRaw};
    if(!gps.reference&&raw.gpsRef)gps.reference=raw.gpsRef;if(!gps.opposite&&raw.gpsOpposite)gps.opposite=raw.gpsOpposite;if(!gps.corners&&raw.gpsCorners)gps.corners=raw.gpsCorners;if(gps.targetIndex==null&&Number.isInteger(raw.gpsTargetIndex))gps.targetIndex=raw.gpsTargetIndex;
    const readings={};for(const [key,val] of Object.entries(raw.readings||{})){const n=Number(val);if(Number.isFinite(n))readings[key]=n;}
    const createdAt=raw.createdAt||raw.exportedAt||nowIso(),modifiedAt=raw.modifiedAt||raw.exportedAt||createdAt;
    const durableFileId=fileIdFromFilename(filename),fileId=durableFileId||raw.fileId||undefined;
    return {...raw,app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,fileId,createdAt,modifiedAt,status:raw.status==='archived'?'archived':'open',settings:{width:clamp(s.width,0.1,100000,64),length:clamp(s.length,0.1,100000,76),cols:Math.round(clamp(s.cols,2,200,9)),rows:Math.round(clamp(s.rows,2,200,9)),target:Number.isFinite(Number(s.target))?Number(s.target):64,tol:Math.max(0,Number.isFinite(Number(s.tol))?Number(s.tol):0.5),refCorner:s.refCorner||'SW',name:s.name||raw.name||String(filename||'Pad').replace(/\.(padgrade(\.json)?|json)$/i,'')||'Pad'},readings,readingMeta:(raw.readingMeta&&typeof raw.readingMeta==='object')?raw.readingMeta:{},gps,measureMode:raw.measureMode==='gps'?'gps':'manual',migration:{sourceVersion:Number(raw.schemaVersion||raw.version||1),sourceFile:filename||null}};
  }
  function projectsFromFile(raw,filename){if(raw?.backupType==='all-projects'||Array.isArray(raw?.projects))return (raw.projects||[]).map((p,i)=>normalizeOne(p,`${filename}#${i}`)).filter(Boolean);const one=normalizeOne(raw,filename);return one?[one]:[];}
  function storeProject(project){
    if(!project?.id||!project.settings)return false;
    putLocal(project);const idx=getIndex(),meta={id:project.id,name:project.settings.name||'Pad',createdAt:project.createdAt||nowIso(),modifiedAt:project.modifiedAt||project.exportedAt||nowIso(),status:project.status==='archived'?'archived':'open',fileId:project.fileId||undefined};
    const found=idx.find(x=>x?.id===project.id);if(found)Object.assign(found,meta);else idx.push(meta);setIndex(idx);return true;
  }
  function applyPortableSettings(settings){
    if(!settings||typeof settings!=='object')return;
    if(settings.appPrefs&&typeof settings.appPrefs==='object')try{localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
    try{diag()?.refreshEnabledFromPrefs?.('durable-settings');}catch(e){}
  }
  function names(){return files.list().filter(n=>typeof n==='string'&&isCandidate(n));}
  function filenameForId(id,list){if(!id)return null;const suffix=`${id}.padgrade`.toLowerCase();return list.find(n=>String(n).toLowerCase().endsWith(suffix))||null;}
  function idle(task,timeout=5000){
    if(typeof requestIdleCallback==='function')return {kind:'idle',id:requestIdleCallback(task,{timeout})};
    return {kind:'timer',id:setTimeout(task,Math.min(250,timeout))};
  }
  function cancelIdle(handle){if(!handle)return;try{if(handle.kind==='idle'&&typeof cancelIdleCallback==='function')cancelIdleCallback(handle.id);else clearTimeout(handle.id);}catch(e){}}

  async function readProjectById(id,projectName,list){
    const name=filenameForId(id,list);
    if(name){const raw=parse(await files.read(name),null);if(raw?.id===id&&raw.settings)return {project:normalizeOne(raw,name),filename:name};}
    let nameMatch=null;
    for(const filename of list){
      const raw=parse(await files.read(filename),null);if(!raw)continue;
      for(const p of projectsFromFile(raw,filename)){
        if(p.id===id)return {project:p,filename};
        if(!nameMatch&&projectName&&p.settings?.name===projectName)nameMatch={project:p,filename};
      }
      await new Promise(r=>setTimeout(r,0));
    }
    return nameMatch;
  }

  async function prepareMinimumRecovery(){
    if(!hasFolder()||!indexReady()){
      const token=diag()?.start?.('recovery.minimum',{indexReady:indexReady()});const result={ready:false};diag()?.end?.(token,result);return result;
    }
    if(minimumPromise)return minimumPromise;
    minimumPromise=(async()=>{
      const token=diag()?.start?.('recovery.minimum',{indexReady:true,writeLocked:criticalRecoveryActive()});
      const list=names();
      const settingsRaw=await files.read(SETTINGS_FILE),settings=parse(settingsRaw,null);
      applyPortableSettings(settings);
      const desired=settings?.lastProjectId||localStorage.getItem(ACTIVE_KEY)||null;
      let restored=null;
      if(desired){
        const found=await readProjectById(desired,settings?.lastProjectName||null,list);
        if(found?.project){storeProject(found.project);if(found.project.status!=='archived')localStorage.setItem(ACTIVE_KEY,found.project.id);restored=found.project;}
      }
      // A truly empty chosen folder contains nothing that can be overwritten, so
      // first-run default creation may safely write into it immediately.
      if(list.length===0&&!settings){try{native.completeProjectFolderRecovery?.();}catch(e){}}
      const result={ready:true,restoredId:restored?.id||null,fileCount:list.length,settingsFound:!!settings,writeLocked:criticalRecoveryActive()};
      window.__padGradeMinimumDurableRecoveryV096=result;
      try{window.dispatchEvent(new CustomEvent('padgrade-minimum-durable-recovery-ready',{detail:result}));}catch(e){}
      diag()?.end?.(token,result);
      if(!criticalRecoveryActive())scheduleBackgroundReconcile(1400);
      return result;
    })().catch(error=>{minimumPromise=null;const result={ready:true,error:String(error?.message||error),writeLocked:criticalRecoveryActive()};window.__padGradeMinimumDurableRecoveryV096=result;diag()?.mark?.('recovery.minimum-error',result);return result;});
    return minimumPromise;
  }

  async function reconcileAll(){
    if(fullPromise)return fullPromise;
    fullPromise=(async()=>{
      if(!hasFolder()||!indexReady())return null;
      const token=diag()?.start?.('recovery.full-reconcile',{idle:true});
      const list=names(),idx=getIndex(),byId=new Map(idx.map(x=>[x.id,x]));let imported=0,skipped=0,recognized=0;
      for(const filename of list){
        const raw=parse(await files.read(filename),null);if(!raw){skipped++;continue;}
        const projects=projectsFromFile(raw,filename);if(!projects.length){skipped++;continue;}recognized+=projects.length;
        for(const remote of projects){
          const local=getLocal(remote.id),remoteWins=!local||modified(remote)>modified(local),best=remoteWins?remote:local;
          if(remoteWins){putLocal(remote);imported++;}
          byId.set(best.id,{id:best.id,name:best.settings?.name||'Pad',modifiedAt:best.modifiedAt||best.exportedAt||nowIso(),createdAt:best.createdAt||best.exportedAt||nowIso(),status:statusOf(best,byId.get(best.id)),fileId:best.fileId});
        }
        await new Promise(r=>setTimeout(r,0));
      }
      const next=[...byId.values()];setIndex(next);
      const activeId=localStorage.getItem(ACTIVE_KEY),active=next.find(x=>x.id===activeId&&x.status!=='archived');
      if(!active){const open=next.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));if(open.length)localStorage.setItem(ACTIVE_KEY,open[0].id);}
      const result={imported,skipped,recognized,total:list.length,at:Date.now(),async:true,idleScheduled:true};window.__padGradeLastFolderSync=result;
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      try{window.dispatchEvent(new CustomEvent('padgrade-projects-reconciled',{detail:result}));}catch(e){}
      diag()?.end?.(token,result);
      scheduleAsyncFileIdMigration(2400);
      return result;
    })();
    return fullPromise;
  }

  function migrateFileIds(){
    if(migrationPromise)return migrationPromise;
    if(!hasFolder()||!indexReady()||criticalRecoveryActive()||!window.PadGradeFileId)return Promise.resolve(null);
    migrationPromise=(async()=>{
      const token=diag()?.start?.('file-id.async-migration',{idle:true}),list=names();let rewritten=0,renamed=0,unchanged=0;
      try{window.PadGradeFileId.ensureAllLocal?.();}catch(e){}
      try{
        for(const filename of list){
          const rawText=await files.read(filename),raw=parse(rawText,null);if(!raw||!raw.settings||!raw.id)continue;
          const prefix=fileIdFromFilename(filename);if(prefix&&!raw.fileId)raw.fileId=prefix;
          const before=JSON.stringify(raw);
          let fid=null;try{fid=window.PadGradeFileId.ensureProject?.(raw,filename)||prefix||null;}catch(e){fid=prefix;}
          if(!fid)continue;
          const canonical=!!prefix,target=canonical?filename:`${fid}-${filename}`;
          const changed=before!==JSON.stringify(raw);
          if(canonical&&!changed){unchanged++;await new Promise(r=>setTimeout(r,0));continue;}
          const wrote=await files.write(target,JSON.stringify(raw,null,2));
          if(wrote){rewritten++;if(target!==filename){renamed++;await files.delete(filename);}}
          await new Promise(r=>setTimeout(r,0));
        }
      }finally{diag()?.end?.(token,{files:list.length,rewritten,renamed,unchanged,singleFlight:true,idle:true});}
      return {files:list.length,rewritten,renamed,unchanged};
    })().finally(()=>{migrationPromise=null;});
    return migrationPromise;
  }
  function scheduleBackgroundReconcile(delay=1400){
    if(fullPromise||criticalRecoveryActive()||!hasFolder()||!indexReady())return;
    clearTimeout(reconcileTimer);cancelIdle(reconcileIdle);reconcileIdle=null;
    reconcileTimer=setTimeout(()=>{reconcileTimer=null;if(criticalRecoveryActive())return;reconcileIdle=idle(()=>{reconcileIdle=null;reconcileAll();},5000);},Math.max(700,Number(delay)||0));
  }
  function scheduleAsyncFileIdMigration(delay=2400){
    if(migrationPromise||criticalRecoveryActive())return;
    clearTimeout(migrationTimer);cancelIdle(migrationIdle);migrationIdle=null;
    migrationTimer=setTimeout(()=>{migrationTimer=null;if(criticalRecoveryActive())return;migrationIdle=idle(()=>{migrationIdle=null;migrateFileIds();},7000);},Math.max(1800,Number(delay)||0));
  }

  function resetForFolderSelection(){
    minimumPromise=null;fullPromise=null;clearTimeout(reconcileTimer);clearTimeout(migrationTimer);reconcileTimer=migrationTimer=null;cancelIdle(reconcileIdle);cancelIdle(migrationIdle);reconcileIdle=migrationIdle=null;
    diag()?.mark?.('recovery.folder-transaction-reset');
  }

  window.__padGradePrepareMinimumDurableRecovery=prepareMinimumRecovery;
  window.__padGradeReconcileDurableAsync=reconcileAll;
  window.__padGradeScheduleAsyncFileIdMigration=scheduleAsyncFileIdMigration;
  window.__padGradeProjectFolderChanged=function(){if(indexReady())prepareMinimumRecovery();};
  window.addEventListener('padgrade-project-folder-selected',resetForFolderSelection);
  window.addEventListener('padgrade-project-folder-indexed',()=>{
    if(indexReady()){prepareMinimumRecovery();return;}
    try{native.completeProjectFolderRecovery?.();}catch(e){}
    const result={ready:false,indexUnavailable:true};window.__padGradeMinimumDurableRecoveryV096=result;
    try{window.dispatchEvent(new CustomEvent('padgrade-minimum-durable-recovery-ready',{detail:result}));}catch(e){}
    diag()?.mark?.('recovery.index-unavailable',result);
  });
  window.addEventListener('padgrade-durable-sync-ready',()=>{if(indexReady())prepareMinimumRecovery();});
  window.addEventListener('padgrade-active-project-applied',()=>{if(!criticalRecoveryActive())scheduleBackgroundReconcile(1200);});
  window.addEventListener('padgrade-recovery-visual-released',()=>scheduleBackgroundReconcile(1200));
  window.addEventListener('load',()=>{if(!criticalRecoveryActive())scheduleBackgroundReconcile(1800);},{once:true});
  if(hasFolder()&&indexReady())setTimeout(()=>prepareMinimumRecovery(),0);
  diag()?.mark?.('recovery.async-controller-installed',{version:'0.9.8',retryableNotReady:true,migrationSingleFlight:true,idleMaintenance:true,canonicalFilenameFileId:true});
})();
