/* Pad Grade v0.9.6 DEV — asynchronous durable recovery/reconciliation.
 *
 * Recovery waits only for the native directory index, then asynchronously reads
 * the durable settings file and the one last-active project needed for first
 * paint. The recovery curtain may stay up while those minimum reads happen, but
 * the WebView main thread is never blocked by SAF I/O. Full-folder import and
 * legacy filename/File-ID work trail later in the background.
 */
(function installPadGrade096AsyncReconcile(){
  'use strict';
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const native=window.PadGradeNative||null;
  const files=window.PadGradeFiles||null;
  const diag=()=>window.PadGradeDiag||null;
  let minimumPromise=null;
  let fullPromise=null;
  let migrationTimer=null;

  if(!native||!files||typeof files.read!=='function')return;
  window.__padGradeAsyncDurableV096=true;
  window.__padGradeFolderChangedV068=true; // v0.6.8 must not install its synchronous folder-change restore hook.

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const nowIso=()=>new Date().toISOString();
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;
  function indexReady(){try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasFolder(){try{if(typeof native.hasProjectFolderConfigured==='function')return !!native.hasProjectFolderConfigured();return typeof native.hasProjectFolder==='function'&&!!native.hasProjectFolder();}catch(e){return false;}}
  function getIndex(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function setIndex(x){try{localStorage.setItem(INDEX_KEY,JSON.stringify(x));}catch(e){}}
  function getLocal(id){return parse(localStorage.getItem(projectKey(id)),null);}
  function putLocal(p){if(p?.id)try{localStorage.setItem(projectKey(p.id),JSON.stringify(p));}catch(e){}}
  function modified(p){const t=Date.parse(p?.modifiedAt||p?.exportedAt||p?.createdAt||'');return Number.isFinite(t)?t:0;}
  function statusOf(p,item){return (p?.status||item?.status)==='archived'?'archived':'open';}
  function clamp(n,a,b,d){n=Number(n);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):d;}
  function isCandidate(name){const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');}
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
    return {...raw,app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,createdAt,modifiedAt,status:raw.status==='archived'?'archived':'open',settings:{width:clamp(s.width,0.1,100000,64),length:clamp(s.length,0.1,100000,76),cols:Math.round(clamp(s.cols,2,200,9)),rows:Math.round(clamp(s.rows,2,200,9)),target:Number.isFinite(Number(s.target))?Number(s.target):64,tol:Math.max(0,Number.isFinite(Number(s.tol))?Number(s.tol):0.5),refCorner:s.refCorner||'SW',name:s.name||raw.name||String(filename||'Pad').replace(/\.(padgrade(\.json)?|json)$/i,'')||'Pad'},readings,readingMeta:(raw.readingMeta&&typeof raw.readingMeta==='object')?raw.readingMeta:{},gps,measureMode:raw.measureMode==='gps'?'gps':'manual',migration:{sourceVersion:Number(raw.schemaVersion||raw.version||1),sourceFile:filename||null}};
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

  async function readProjectById(id,projectName,list){
    let name=filenameForId(id,list);
    if(name){const raw=parse(await files.read(name),null);if(raw?.id===id&&raw.settings)return {project:normalizeOne(raw,name),filename:name};}
    // Legacy/backup fallback: still asynchronous. Yield between files so map/UI
    // painting can continue even on a slow provider.
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
    if(minimumPromise)return minimumPromise;
    minimumPromise=(async()=>{
      const token=diag()?.start?.('recovery.minimum',{indexReady:indexReady()});
      if(!hasFolder()||!indexReady()){diag()?.end?.(token,{ready:false});return {ready:false};}
      const list=names();
      const settingsRaw=await files.read(SETTINGS_FILE),settings=parse(settingsRaw,null);
      applyPortableSettings(settings);
      const desired=settings?.lastProjectId||localStorage.getItem(ACTIVE_KEY)||null;
      let restored=null;
      if(desired){
        const found=await readProjectById(desired,settings?.lastProjectName||null,list);
        if(found?.project){storeProject(found.project);if(found.project.status!=='archived')localStorage.setItem(ACTIVE_KEY,found.project.id);restored=found.project;}
      }
      try{native.completeProjectFolderRecovery?.();}catch(e){}
      const result={ready:true,restoredId:restored?.id||null,fileCount:list.length,settingsFound:!!settings};
      window.__padGradeMinimumDurableRecoveryV096=result;
      try{window.dispatchEvent(new CustomEvent('padgrade-minimum-durable-recovery-ready',{detail:result}));}catch(e){}
      diag()?.end?.(token,result);
      setTimeout(()=>reconcileAll(),0);
      return result;
    })().catch(error=>{const result={ready:true,error:String(error?.message||error)};window.__padGradeMinimumDurableRecoveryV096=result;try{native.completeProjectFolderRecovery?.();}catch(e){}diag()?.mark?.('recovery.minimum-error',result);return result;});
    return minimumPromise;
  }

  async function reconcileAll(){
    if(fullPromise)return fullPromise;
    fullPromise=(async()=>{
      if(!hasFolder()||!indexReady())return null;
      const token=diag()?.start?.('recovery.full-reconcile');
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
      const result={imported,skipped,recognized,total:list.length,at:Date.now(),async:true};window.__padGradeLastFolderSync=result;
      try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
      try{window.dispatchEvent(new CustomEvent('padgrade-projects-reconciled',{detail:result}));}catch(e){}
      diag()?.end?.(token,result);
      scheduleAsyncFileIdMigration();
      return result;
    })().finally(()=>{});
    return fullPromise;
  }

  async function migrateFileIds(){
    if(!hasFolder()||!indexReady()||!window.PadGradeFileId)return;
    const token=diag()?.start?.('file-id.async-migration'),list=names();
    try{window.PadGradeFileId.ensureAllLocal?.();}catch(e){}
    for(const filename of list){
      const raw=parse(await files.read(filename),null);if(!raw||!raw.settings||!raw.id)continue;
      let fid=null;try{fid=window.PadGradeFileId.ensureProject?.(raw,filename)||null;}catch(e){}
      if(!fid)continue;
      const target=String(filename).match(/^[A-HJ-NP-Z]{4}[2-9]{2}-/i)?filename:`${fid}-${filename}`;
      const nextText=JSON.stringify(raw,null,2);
      const wrote=await files.write(target,nextText);
      if(wrote&&target!==filename)await files.delete(filename);
      await new Promise(r=>setTimeout(r,0));
    }
    diag()?.end?.(token,{files:list.length});
  }
  function scheduleAsyncFileIdMigration(delay=700){clearTimeout(migrationTimer);migrationTimer=setTimeout(()=>migrateFileIds(),delay);}

  window.__padGradePrepareMinimumDurableRecovery=prepareMinimumRecovery;
  window.__padGradeReconcileDurableAsync=reconcileAll;
  window.__padGradeScheduleAsyncFileIdMigration=scheduleAsyncFileIdMigration;
  window.__padGradeProjectFolderChanged=function(){if(indexReady())prepareMinimumRecovery();};
  window.addEventListener('padgrade-project-folder-indexed',()=>{
    if(indexReady()){prepareMinimumRecovery();return;}
    // An inaccessible configured URI must not leave recovery pending forever.
    try{native.completeProjectFolderRecovery?.();}catch(e){}
    const result={ready:false,indexUnavailable:true};window.__padGradeMinimumDurableRecoveryV096=result;
    try{window.dispatchEvent(new CustomEvent('padgrade-minimum-durable-recovery-ready',{detail:result}));}catch(e){}
    diag()?.mark?.('recovery.index-unavailable',result);
  });
  window.addEventListener('padgrade-durable-sync-ready',()=>{if(indexReady())prepareMinimumRecovery();});
  if(hasFolder()&&indexReady())setTimeout(()=>prepareMinimumRecovery(),0);
  diag()?.mark?.('recovery.async-controller-installed');
})();
