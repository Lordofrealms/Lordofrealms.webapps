/* Pad Grade v1.4.1 DEV — persistent project/file identity integrity barrier.
 *
 * Runs before the v1.0.7 indexed controller is allowed to restore the durable
 * directory. Unchanged schema-6 projects need only their bounded headers. Full
 * project bodies are read only for headerless legacy files or actual collisions.
 *
 * Repair is conservative: newest duplicate keeps the existing identity; every
 * other colliding project is written to a new canonical filename first, then the
 * old file is deleted. If deletion fails, the new write is rolled back. Collision
 * winners are then reloaded into the local cache so a prior ambiguous index cannot
 * leave the retained project ID pointing at the wrong body. The rebuildable
 * .pgindex is invalidated after a successful repair so the existing index
 * controller reconstructs it from authoritative project files.
 */
(function installPadGrade141StorageIntegrity(){
  'use strict';
  if(window.PadGradeProjectIntegrityV141)return;
  const VERSION='1.4.1';
  const INDEX_FILE='Pad-Grade-Project-Index.pgindex';
  const files=window.PadGradeFiles||null,native=window.PadGradeNative||null,fmt=window.PadGradeProjectFormatV107||null;
  let runPromise=null,barrierPromise=null;
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const parse=(text,fallback=null)=>{try{return text?JSON.parse(text):fallback;}catch(e){return fallback;}};
  const isCandidate=name=>{const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');};
  const isBackup=raw=>!!(raw&&typeof raw==='object'&&(raw.backupType==='all-projects'||Array.isArray(raw.projects)));
  const cacheFilename=id=>`Pad-Grade-Heat-${String(id||'unknown').replace(/[^A-Za-z0-9._-]/g,'_')}.pgheatcache`;
  const modifiedMs=x=>{const a=Date.parse(x?.modifiedAt||x?.createdAt||'');return Number.isFinite(a)?a:Math.max(0,Number(x?.lastModified)||0);};
  function durableCapable(){return !!native&&(typeof native.hasProjectFolderConfigured==='function'||typeof native.hasProjectFolder==='function');}
  function hasFolder(){try{if(typeof native?.hasProjectFolderConfigured==='function')return !!native.hasProjectFolderConfigured();return !!native?.hasProjectFolder?.();}catch(e){return false;}}
  function indexReady(){try{return typeof native?.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function details(){try{return (files?.details?.()||[]).filter(x=>x&&typeof x.name==='string'&&isCandidate(x.name));}catch(e){return [];}}
  async function withRepairWrite(fn){const prior=window.__padGradeIntegrityRepairActive;window.__padGradeIntegrityRepairActive=true;try{return await fn();}finally{if(prior===undefined)delete window.__padGradeIntegrityRepairActive;else window.__padGradeIntegrityRepairActive=prior;}}
  function randomProjectId(used){for(let i=0;i<2000;i++){const id=`pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;if(!used.has(id)){used.add(id);return id;}}throw new Error('Unable to allocate unique project ID');}
  function randomFileId(used){const L='ABCDEFGHJKLMNPQRSTUVWXYZ',D='23456789';for(let a=0;a<2000;a++){let s='';for(let i=0;i<4;i++)s+=L[Math.floor(Math.random()*L.length)];for(let i=0;i<2;i++)s+=D[Math.floor(Math.random()*D.length)];if(!used.has(s)){used.add(s);return s;}}throw new Error('Unable to allocate unique file ID');}
  async function inspect(detail){
    const head=await files.readHead(detail.name,4096),h=fmt.parseHeaderText(head);
    if(h)return {kind:'project',filename:detail.name,lastModified:+detail.lastModified||0,projectId:String(h.id||''),fileId:fmt.validFileId(h.fileId)||fmt.fileIdFromFilename(detail.name)||null,modifiedAt:h.modifiedAt||null,raw:null};
    const text=await files.read(detail.name),raw=parse(text,null);if(!raw)return {kind:'invalid',filename:detail.name};
    if(isBackup(raw))return {kind:'backup',filename:detail.name};
    const p=fmt.normalizeProject(raw,detail.name);if(!p)return {kind:'invalid',filename:detail.name};
    return {kind:'project',filename:detail.name,lastModified:+detail.lastModified||0,projectId:String(p.id||''),fileId:fmt.validFileId(p.fileId)||fmt.fileIdFromFilename(detail.name)||null,modifiedAt:p.modifiedAt||null,raw,text};
  }
  function ownerOf(list){return list.slice().sort((a,b)=>modifiedMs(b)-modifiedMs(a)||String(b.filename).localeCompare(String(a.filename)))[0];}
  function markCollisions(records,key,reason,toRepair,owners){
    const groups=new Map();for(const r of records){const value=r[key];if(!value)continue;if(!groups.has(value))groups.set(value,[]);groups.get(value).push(r);}
    for(const [value,list] of groups)if(list.length>1){const owner=ownerOf(list);owners.add(owner);for(const r of list)if(r!==owner){if(!toRepair.has(r.filename))toRepair.set(r.filename,new Set());toRepair.get(r.filename).add(reason);}mark('project.integrity-collision',{kind:reason,value,files:list.length,owner:owner.filename});}
  }
  async function bodyFor(record){if(record.raw)return fmt.normalizeProject(record.raw,record.filename);const text=await files.read(record.filename),raw=parse(text,null);if(!raw||isBackup(raw))return null;return fmt.normalizeProject(raw,record.filename);}
  async function refreshCollisionOwners(owners){
    let refreshed=0,failed=0;
    for(const record of owners){
      const p=await bodyFor(record);if(!p){failed++;mark('project.integrity-owner-refresh-failed',{filename:record.filename,reason:'project-body-unreadable'});continue;}
      try{localStorage.setItem(`padGradeProjectV5:${p.id}`,JSON.stringify(p));refreshed++;mark('project.integrity-owner-refreshed',{filename:record.filename,projectId:p.id});}catch(e){failed++;mark('project.integrity-owner-refresh-failed',{filename:record.filename,reason:'local-cache-write-failed'});}
    }
    return {refreshed,failed};
  }
  async function repair(records){
    const projects=records.filter(r=>r.kind==='project'&&r.projectId),toRepair=new Map(),owners=new Set();
    markCollisions(projects,'projectId','duplicate-project-id',toRepair,owners);
    markCollisions(projects,'fileId','duplicate-file-id',toRepair,owners);
    if(!toRepair.size)return {repaired:0,failed:0,collisions:0,ownersRefreshed:0,ownerRefreshFailed:0};
    const usedProjectIds=new Set(projects.map(r=>r.projectId).filter(Boolean));
    const usedFileIds=new Set(projects.map(r=>r.fileId).filter(Boolean));
    const usedNames=new Set(records.map(r=>r.filename));
    let repaired=0,failed=0;
    for(const [filename,reasons] of toRepair){
      const record=projects.find(r=>r.filename===filename);if(!record){failed++;continue;}
      const p=await bodyFor(record);if(!p){failed++;mark('project.integrity-repair-failed',{filename,reason:'project-body-unreadable'});continue;}
      const oldProjectId=String(p.id||record.projectId||''),oldFileId=fmt.validFileId(p.fileId)||record.fileId||null;
      if(reasons.has('duplicate-project-id'))p.id=randomProjectId(usedProjectIds);
      if(reasons.has('duplicate-file-id'))p.fileId=randomFileId(usedFileIds);else if(oldFileId)p.fileId=oldFileId;
      if(!fmt.validFileId(p.fileId))p.fileId=randomFileId(usedFileIds);
      const stamp={at:new Date().toISOString(),priorProjectId:oldProjectId,priorFileId:oldFileId,reasons:[...reasons]};
      p.migration={...(p.migration&&typeof p.migration==='object'?p.migration:{}),integrityRepairV141:stamp};
      let target=`${p.fileId}-${p.id}.padgrade`;
      while(target!==filename&&usedNames.has(target)){p.fileId=randomFileId(usedFileIds);target=`${p.fileId}-${p.id}.padgrade`;}
      const text=fmt.serializeV6(p,target);
      let ok=false,deletedOld=true;
      try{
        ok=await withRepairWrite(()=>files.write(target,text));
        if(ok&&target!==filename){deletedOld=await withRepairWrite(()=>files.delete(filename));if(!deletedOld){await withRepairWrite(()=>files.delete(target));ok=false;}}
      }catch(e){ok=false;}
      if(!ok){failed++;mark('project.integrity-repair-failed',{filename,target,reason:deletedOld?'write-failed':'old-file-delete-failed-rolled-back'});continue;}
      usedNames.delete(filename);usedNames.add(target);record.filename=target;record.projectId=p.id;record.fileId=p.fileId;record.raw=p;
      try{localStorage.setItem(`padGradeProjectV5:${p.id}`,JSON.stringify(p));}catch(e){}
      if(reasons.has('duplicate-project-id'))try{await withRepairWrite(()=>files.delete(cacheFilename(oldProjectId)));}catch(e){}
      repaired++;mark('project.integrity-repaired',{filename,target,projectIdChanged:p.id!==oldProjectId,fileIdChanged:p.fileId!==oldFileId,reasons:[...reasons],heatCacheInvalidated:reasons.has('duplicate-project-id')});
    }
    const ownerRefresh=await refreshCollisionOwners(owners);
    if(repaired>0){try{await withRepairWrite(()=>files.delete(INDEX_FILE));}catch(e){}mark('project.integrity-index-invalidated',{repaired});}
    return {repaired,failed,collisions:toRepair.size,ownersRefreshed:ownerRefresh.refreshed,ownerRefreshFailed:ownerRefresh.failed};
  }
  async function run(reason='persistent-directory-restoration'){
    if(runPromise)return runPromise;
    runPromise=(async()=>{
      if(!files||!fmt||!durableCapable()||!hasFolder()||!indexReady())return {ready:false,reason:'folder-not-ready'};
      const meta=details(),records=[];let backups=0,invalid=0;
      mark('project.integrity-scan-start',{reason,files:meta.length,headerFirst:true});
      for(const detail of meta){const r=await inspect(detail);records.push(r);if(r.kind==='backup')backups++;if(r.kind==='invalid')invalid++;await new Promise(resolve=>setTimeout(resolve,0));}
      const result=await repair(records);const out={ready:true,reason,files:meta.length,projects:records.filter(r=>r.kind==='project').length,backupsSkipped:backups,invalidFiles:invalid,...result};
      window.__padGradeProjectIntegrityV141Last=out;mark('project.integrity-scan-complete',out);return out;
    })().finally(()=>{runPromise=null;});return runPromise;
  }
  function beforeIndexController(){
    if(barrierPromise)return barrierPromise;
    if(!durableCapable())return Promise.resolve({ready:true,reason:'no-durable-native-capability'});
    if(hasFolder()&&indexReady())return run('persistent-directory-restoration');
    barrierPromise=new Promise(resolve=>{
      const events=['padgrade-project-folder-selected','padgrade-project-folder-indexed','padgrade-durable-sync-ready','padgrade-project-folder-refreshed'];
      let settled=false;
      const cleanup=()=>{for(const name of events)window.removeEventListener?.(name,attempt);window.removeEventListener?.('load',attempt);};
      const attempt=()=>{if(settled||!hasFolder()||!indexReady())return;settled=true;cleanup();run('persistent-directory-restoration-after-folder-ready').then(resolve,error=>{mark('project.integrity-barrier-error',{error:String(error?.message||error).slice(0,160)});resolve({ready:false,error:String(error?.message||error)});});};
      for(const name of events)window.addEventListener?.(name,attempt);window.addEventListener?.('load',attempt,{once:true});
      mark('project.integrity-barrier-waiting',{eventDriven:true,arbitraryDelay:false});attempt();
    }).finally(()=>{barrierPromise=null;});
    return barrierPromise;
  }
  window.PadGradeProjectIntegrityV141={version:VERSION,run,beforeIndexController};
  mark('project.integrity-controller-installed',{version:VERSION,beforeIndexedRecovery:true,checks:['project-id','file-id'],writeThenDelete:true,indexRebuildByInvalidation:true,collisionOwnerLocalRefresh:true});
})();
