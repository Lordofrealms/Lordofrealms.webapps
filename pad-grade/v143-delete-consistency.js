/* Pad Grade v1.4.3 DEV — authoritative project deletion across durable storage, local cache, and indexed catalog.
 *
 * The legacy project manager removed local state before it resolved the human-readable durable filename,
 * which could miss the real prefixed .padgrade file. A later cleanup could remove the file while the
 * durable catalog still retained the project, leaving a non-openable ghost row. v1.4.3 owns project delete
 * clicks before the lazy-load/catalog layers, resolves durable identity first, removes derived heat cache,
 * rewrites the durable index immediately, and performs two fresh reconciliations before declaring success.
 */
(function installPadGrade143DeleteConsistency(){
  'use strict';

  const LOCAL_INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const FILE_MAP_KEY='padGradeFileIdsV1';
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const INDEX_FILE='Pad-Grade-Project-Index.pgindex';
  const HEAT_PREFIX='Pad-Grade-Heat-';
  const busy=new Set();

  const parse=(text,fallback=null)=>{try{return text?JSON.parse(text):fallback;}catch(e){return fallback;}};
  const diag=()=>window.PadGradeDiag||null;
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;
  const heatName=id=>`${HEAT_PREFIX}${id}.pgheatcache`;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function getLocalIndex(){const x=parse(localStorage.getItem(LOCAL_INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function setLocalIndex(x){try{localStorage.setItem(LOCAL_INDEX_KEY,JSON.stringify(x));}catch(e){}}
  function getLocal(id){return parse(localStorage.getItem(projectKey(id)),null);}
  function statusFor(item){const p=getLocal(item?.id);return (p?.status||item?.status)==='archived'?'archived':'open';}
  function nextOpenProject(index,id){
    return index.filter(x=>x?.id&&x.id!==id&&statusFor(x)==='open')
      .sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')))[0]||null;
  }
  function removeFileMapId(id){
    const map=parse(localStorage.getItem(FILE_MAP_KEY),{});
    if(!map||typeof map!=='object'||Array.isArray(map)||!(id in map))return;
    delete map[id];try{localStorage.setItem(FILE_MAP_KEY,JSON.stringify(map));}catch(e){}
  }
  function removeRows(id){
    document.querySelectorAll?.('[data-id]').forEach(row=>{if(row?.dataset?.id===id)row.remove?.();});
    const archived=document.getElementById?.('v041ArchivedList');
    const count=document.querySelector?.('#v041ArchivedDetails summary span');
    if(count&&archived)count.textContent=String(archived.querySelectorAll?.('.v041-projectItem')?.length||0);
  }

  async function waitForRuntime(timeoutMs=4000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const api=window.PadGradeProjectIndexV107,files=window.PadGradeFiles;
      if(api&&files&&typeof api.catalog==='function'&&typeof api.readIndex==='function'&&typeof api.writeIndex==='function'&&typeof api.reconcile==='function')return {api,files};
      await sleep(25);
    }
    return null;
  }

  function catalogEntries(api,id){
    try{return (api.catalog?.()||[]).filter(e=>e&&(e.projectId===id||e.id===id));}catch(e){return [];}
  }

  function exactIndividualNames(files,id,entries,item,local){
    const names=new Set();
    for(const e of entries)if(e?.filename&&!Number.isInteger(e.backupIndex))names.add(String(e.filename));
    if(item?.durableFilename)names.add(String(item.durableFilename));
    if(local?.id===id&&local?.fileId)names.add(`${local.fileId}-${id}.padgrade`);
    try{
      const suffix=`${id}.padgrade`.toLowerCase();
      for(const name of files.list?.()||[]){const n=String(name||'');if(n.toLowerCase()===suffix||n.toLowerCase().endsWith(`-${suffix}`))names.add(n);}
    }catch(e){}
    return [...names];
  }

  async function deleteExact(files,filename){
    if(!filename)return {ok:true,missing:true};
    const before=new Set((files.list?.()||[]).map(String));
    if(!before.has(filename))return {ok:true,missing:true,filename};
    let result=null,reported=false;
    try{
      if(typeof files.deleteResult==='function'){result=await files.deleteResult(filename);reported=!!result?.ok;}
      else reported=!!(await files.delete(filename));
    }catch(e){result={ok:false,error:String(e?.message||e)};}
    const remains=new Set((files.list?.()||[]).map(String)).has(filename);
    return {ok:!remains,missing:false,filename,reported,error:result?.error||null};
  }

  async function rewriteBackupWithoutProject(files,filename,id){
    const text=await files.read(filename);
    if(text==null)return {ok:true,missing:true,filename};
    const raw=parse(text,null);
    if(!raw||!Array.isArray(raw.projects))return {ok:false,filename,error:'backup-format-invalid'};
    const before=raw.projects.length;
    raw.projects=raw.projects.filter(p=>p?.id!==id);
    if(raw.activeProjectId===id)raw.activeProjectId=raw.projects.find(p=>p?.status!=='archived')?.id||raw.projects[0]?.id||null;
    if(raw.projects.length===before)return {ok:true,filename,unchanged:true};
    if(!raw.projects.length)return deleteExact(files,filename);
    const nextText=JSON.stringify(raw,null,2),ok=!!(await files.write(filename,nextText));
    if(!ok)return {ok:false,filename,error:'backup-rewrite-failed'};
    const verify=parse(await files.read(filename),null);
    const stillPresent=Array.isArray(verify?.projects)&&verify.projects.some(p=>p?.id===id);
    return {ok:!stillPresent,filename,rewritten:true,error:stillPresent?'backup-verify-failed':null};
  }

  async function removeDurableProject(files,id,entries,item,local){
    const backupNames=[...new Set(entries.filter(e=>Number.isInteger(e?.backupIndex)&&e?.filename).map(e=>String(e.filename)))];
    const individual=exactIndividualNames(files,id,entries,item,local).filter(name=>!backupNames.includes(name));
    const results=[];
    for(const name of backupNames)results.push(await rewriteBackupWithoutProject(files,name,id));
    for(const name of individual)results.push(await deleteExact(files,name));
    const remaining=(files.list?.()||[]).map(String).filter(name=>{
      const n=name.toLowerCase(),suffix=`${id}.padgrade`.toLowerCase();
      return n===suffix||n.endsWith(`-${suffix}`);
    });
    return {ok:results.every(x=>x.ok)&&remaining.length===0,results,remaining};
  }

  async function prepareActiveSettings(files,id,replacementId){
    const original=await files.read(SETTINGS_FILE);
    if(original==null)return {ok:true,original:null,changed:false};
    const raw=parse(original,null);
    if(!raw||typeof raw!=='object')return {ok:false,original,error:'settings-invalid'};
    if(raw.lastProjectId!==id)return {ok:true,original,changed:false};
    if(replacementId)raw.lastProjectId=replacementId;else delete raw.lastProjectId;
    const ok=!!(await files.write(SETTINGS_FILE,JSON.stringify(raw,null,2)));
    return {ok,original,changed:true,error:ok?null:'settings-write-failed'};
  }

  async function restoreSettings(files,prepared){
    if(!prepared?.changed||prepared.original==null)return;
    try{await files.write(SETTINGS_FILE,prepared.original);}catch(e){}
  }

  function removeLocalState(id,replacementId){
    localStorage.removeItem(projectKey(id));
    const next=getLocalIndex().filter(x=>x?.id!==id);setLocalIndex(next);removeFileMapId(id);
    if(localStorage.getItem(ACTIVE_KEY)===id){
      if(replacementId)localStorage.setItem(ACTIVE_KEY,replacementId);else localStorage.removeItem(ACTIVE_KEY);
    }
  }

  async function rewriteDurableIndex(api,id){
    const state=await api.readIndex();
    const projects=Array.isArray(state?.projects)?state.projects.filter(e=>e?.projectId!==id):[];
    const next={...(state||{}),projects};
    return !!(await api.writeIndex(next));
  }

  async function verifyGone(api,files,id){
    const localMissing=!getLocal(id)&&!getLocalIndex().some(x=>x?.id===id);
    const catalogMissing=!catalogEntries(api,id).length;
    const durableMissing=!(files.list?.()||[]).some(name=>{const n=String(name||'').toLowerCase(),suffix=`${id}.padgrade`.toLowerCase();return n===suffix||n.endsWith(`-${suffix}`);});
    let indexMissing=true;
    try{const state=await api.readIndex();indexMissing=!Array.isArray(state?.projects)||!state.projects.some(e=>e?.projectId===id);}catch(e){indexMissing=false;}
    return {ok:localMissing&&catalogMissing&&durableMissing&&indexMissing,localMissing,catalogMissing,durableMissing,indexMissing};
  }

  async function deleteProject(id,options={}){
    id=String(id||'');if(!id||busy.has(id))return {ok:false,reason:busy.has(id)?'busy':'missing-id'};
    const runtime=await waitForRuntime();if(!runtime)return {ok:false,reason:'runtime-not-ready'};
    const {api,files}=runtime,index=getLocalIndex(),item=index.find(x=>x?.id===id)||null,local=getLocal(id),activeId=localStorage.getItem(ACTIVE_KEY),replacement=nextOpenProject(index,id);
    if(activeId===id&&!replacement)return {ok:false,reason:'last-open-project'};
    if(!options.confirmed){const name=item?.name||local?.settings?.name||'this project';if(!window.confirm?.(`Delete ${name} permanently?`))return {ok:false,reason:'cancelled'};}

    busy.add(id);diag()?.mark?.('project.delete-v143-start',{projectId:id,active:activeId===id,replacementId:replacement?.id||null});
    try{
      const entries=catalogEntries(api,id);
      let prepared={ok:true,changed:false,original:null};
      if(activeId===id){prepared=await prepareActiveSettings(files,id,replacement?.id||null);if(!prepared.ok){diag()?.mark?.('project.delete-v143-failed',{projectId:id,stage:'settings',error:prepared.error});return {ok:false,reason:prepared.error||'settings-failed'};}}

      const durable=await removeDurableProject(files,id,entries,item,local);
      if(!durable.ok){await restoreSettings(files,prepared);diag()?.mark?.('project.delete-v143-failed',{projectId:id,stage:'durable',remaining:durable.remaining,results:durable.results});return {ok:false,reason:'durable-delete-failed',durable};}

      removeLocalState(id,replacement?.id||null);
      const heat=await deleteExact(files,heatName(id));
      const indexWriteOk=await rewriteDurableIndex(api,id);

      // First call joins any already-running reconcile; second is guaranteed to start from fresh folder metadata.
      try{await api.reconcile('project-delete-v143-join');}catch(e){}
      try{await api.reconcile('project-delete-v143-verify');}catch(e){}

      let verified=await verifyGone(api,files,id);
      if(!verified.ok){
        removeLocalState(id,replacement?.id||null);
        await rewriteDurableIndex(api,id);
        try{await api.reconcile('project-delete-v143-repair');}catch(e){}
        verified=await verifyGone(api,files,id);
      }

      if(!verified.ok){diag()?.mark?.('project.delete-v143-failed',{projectId:id,stage:'verify',verified,indexWriteOk,heat});return {ok:false,reason:'verification-failed',verified};}

      removeRows(id);
      try{window.dispatchEvent(new CustomEvent('padgrade-project-deleted',{detail:{projectId:id,replacementId:replacement?.id||null,version:'1.4.3'}}));}catch(e){}
      diag()?.mark?.('project.delete-v143-complete',{projectId:id,replacementId:replacement?.id||null,indexWriteOk,heatDeleted:heat.ok,verified:true});
      if(activeId===id&&replacement?.id&&!options.noReload)setTimeout(()=>location.reload(),60);
      return {ok:true,projectId:id,replacementId:replacement?.id||null,indexWriteOk,heatDeleted:heat.ok,verified};
    }finally{busy.delete(id);}
  }

  function handleDeleteClick(event,btn,row){
    const id=row?.dataset?.id;if(!id)return false;
    deleteProject(id).then(result=>{
      if(result?.ok)return;
      if(result?.reason==='cancelled'||result?.reason==='busy')return;
      if(result?.reason==='last-open-project'){window.alert?.('At least one open project must remain.');return;}
      window.alert?.('Pad Grade could not fully delete this project. The project was left intact where possible; please try again.');
    });
    return true;
  }

  window.PadGradeDeleteConsistencyV143={deleteProject,handleDeleteClick,verifyGone};
  window.__padGradeProjectDeletePolicyV143='exact-durable-first-local-index-cache-then-double-reconcile';
  document.title='Pad Grade Mapper v1.4.3 DEV';
  diag()?.mark?.('project.delete-v143-installed',{version:'1.4.3',exactDurableFirst:true,indexRewrite:true,doubleReconcile:true,heatCacheCleanup:true});
})();
