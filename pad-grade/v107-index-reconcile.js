/* Pad Grade v1.0.7 DEV — durable project index, lazy reads, and schema-6 migration.
 *
 * Authoritative data remains in .padgrade files. Pad-Grade-Project-Index.pgindex
 * is a rebuildable catalog/cache. Routine reconciliation compares cached native
 * filename/size/mtime metadata to the index and performs zero project reads when
 * nothing changed. New/changed schema-6 files require only a bounded header read;
 * schema-5/legacy files are fully read once, upgraded to schema 6, and indexed.
 */
(function installPadGrade107IndexedReconcile(){
  'use strict';
  const INDEX_FILE='Pad-Grade-Project-Index.pgindex',INDEX_FORMAT='PadGradeProjectIndex',INDEX_VERSION=1;
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings';
  const LOCAL_INDEX_KEY='padGradeProjectsV5',ACTIVE_KEY='padGradeActiveProjectIdV5',PREF_KEY='padGradeAppPrefsV1',PROJECT_PREFIX='padGradeProjectV5:';
  const files=window.PadGradeFiles||null,native=window.PadGradeNative||null,fmt=window.PadGradeProjectFormatV107||null;
  const diag=()=>window.PadGradeDiag||null;
  if(!files||!native||!fmt)return;

  const rawRead=files.read.bind(files),rawReadHead=files.readHead.bind(files),rawWrite=files.write.bind(files),rawDelete=files.delete.bind(files),rawDetails=files.details.bind(files);
  let catalogState={format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:null,projects:[]};
  let syncPromise=null,minimumPromise=null,syncTimer=null,syncIdle=null,writeSerial=Promise.resolve(),exportPatched=false;
  window.__padGradeAsyncDurableV096=true;window.__padGradeIndexedDurableV107=true;window.__padGradeFolderChangedV068=true;

  const parse=(text,fallback=null)=>{try{return text?JSON.parse(text):fallback;}catch(e){return fallback;}};
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const nowIso=()=>new Date().toISOString();
  const projectKey=id=>`${PROJECT_PREFIX}${id}`;
  const isCandidate=name=>{const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');};
  const isBackup=raw=>!!(raw&&typeof raw==='object'&&(raw.backupType==='all-projects'||Array.isArray(raw.projects)));
  function indexReady(){try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasFolder(){try{if(typeof native.hasProjectFolderConfigured==='function')return !!native.hasProjectFolderConfigured();return !!native.hasProjectFolder?.();}catch(e){return false;}}
  function recoveryPending(){try{return !!native.isProjectFolderRecoveryPending?.();}catch(e){return false;}}
  function criticalRecoveryActive(){let curtain=false;try{curtain=document.documentElement.classList.contains('padGradeRecoveryHold');}catch(e){}return recoveryPending()&&(curtain||window.__padGradeFirstRunPending===true);}
  function getLocalIndex(){const x=parse(localStorage.getItem(LOCAL_INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function setLocalIndex(x){try{localStorage.setItem(LOCAL_INDEX_KEY,JSON.stringify(x));}catch(e){}}
  function getLocal(id){return parse(localStorage.getItem(projectKey(id)),null);}
  function putLocal(p){if(p?.id)try{localStorage.setItem(projectKey(p.id),JSON.stringify(p));}catch(e){}}
  function metadata(){return rawDetails().filter(x=>x&&typeof x.name==='string'&&isCandidate(x.name)).map(x=>({name:x.name,size:Math.max(0,Number(x.size)||0),lastModified:Math.max(0,Number(x.lastModified)||0)}));}
  function sameMeta(entry,detail){return !!entry&&String(entry.filename)===detail.name&&Number(entry.size||0)===detail.size&&Number(entry.lastModified||0)===detail.lastModified;}
  function canonicalName(p){return `${p.fileId?`${p.fileId}-`:''}${p.id}.padgrade`;}

  function randomFileId(used){const L='ABCDEFGHJKLMNPQRSTUVWXYZ',D='23456789';for(let a=0;a<1000;a++){let s='';for(let i=0;i<4;i++)s+=L[Math.floor(Math.random()*L.length)];for(let i=0;i<2;i++)s+=D[Math.floor(Math.random()*D.length)];if(!used.has(s))return s;}return 'PGPG22';}
  function ensureFileId(p,filename,used=new Set()){let id=fmt.fileIdFromFilename(filename)||fmt.validFileId(p?.fileId);if(!id){try{id=window.PadGradeFileId?.ensureProject?.(p,filename)||null;}catch(e){}}if(!id)id=randomFileId(used);p.fileId=id;used.add(id);return id;}

  async function sha256(text){
    try{const bytes=new TextEncoder().encode(String(text||'')),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(e){return null;}
  }
  function entryFromProject(p,filename,detail,hash=null,backupIndex=null){const c=fmt.catalogFromProject(p);return {filename,fileId:p.fileId||null,projectId:p.id,schemaVersion:Number(p.schemaVersion||p.version||fmt.CURRENT_SCHEMA),name:c.name,createdAt:p.createdAt||null,modifiedAt:p.modifiedAt||null,status:p.status==='archived'?'archived':'open',width:c.width,length:c.length,cols:c.cols,rows:c.rows,fullyMeasured:!!c.fullyMeasured,gpsReady:!!c.gpsReady,size:Math.max(0,Number(detail?.size)||0),lastModified:Math.max(0,Number(detail?.lastModified)||0),sha256:hash||null,backupIndex:Number.isInteger(backupIndex)?backupIndex:null};}
  function entryFromHeader(h,filename,detail,prior=null){const c=h.catalog||{};return {filename,fileId:h.fileId||null,projectId:h.id,schemaVersion:Number(h.schemaVersion)||fmt.CURRENT_SCHEMA,name:String(c.name||prior?.name||'Pad'),createdAt:h.createdAt||prior?.createdAt||null,modifiedAt:h.modifiedAt||prior?.modifiedAt||null,status:h.status==='archived'?'archived':'open',width:Number(c.width)||0,length:Number(c.length)||0,cols:Math.round(Number(c.cols)||0),rows:Math.round(Number(c.rows)||0),fullyMeasured:!!c.fullyMeasured,gpsReady:!!c.gpsReady,size:detail.size,lastModified:detail.lastModified,sha256:prior&&sameMeta(prior,detail)?prior.sha256||null:null,backupIndex:null};}
  function localMetaFromEntry(e){return {id:e.projectId,name:e.name||'Pad',createdAt:e.createdAt||nowIso(),modifiedAt:e.modifiedAt||e.createdAt||nowIso(),status:e.status==='archived'?'archived':'open',fileId:e.fileId||undefined,durableFilename:e.filename,schemaVersion:e.schemaVersion,fullyMeasured:!!e.fullyMeasured,gpsReady:!!e.gpsReady,width:e.width,length:e.length,cols:e.cols,rows:e.rows};}

  function syncLocalCatalog(entries){
    const idx=getLocalIndex(),byId=new Map(idx.filter(x=>x?.id).map(x=>[x.id,x]));
    for(const e of entries){if(!e?.projectId)continue;const meta=localMetaFromEntry(e),old=byId.get(meta.id);byId.set(meta.id,{...(old||{}),...meta});}
    // Keep local-only projects that have not reached durable storage yet.
    for(const [id,item] of [...byId])if(!entries.some(e=>e.projectId===id)&&!getLocal(id))byId.delete(id);
    const next=[...byId.values()];setLocalIndex(next);
    const activeId=localStorage.getItem(ACTIVE_KEY),active=next.find(x=>x.id===activeId&&x.status!=='archived');
    if(!active){const open=next.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));if(open.length)localStorage.setItem(ACTIVE_KEY,open[0].id);}
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
  }

  async function readIndex(){
    const token=diag()?.start?.('index.read',{filename:INDEX_FILE});const raw=await rawRead(INDEX_FILE),parsed=parse(raw,null);
    if(parsed?.format===INDEX_FORMAT&&Number(parsed.indexVersion)===INDEX_VERSION&&Array.isArray(parsed.projects)){catalogState=parsed;diag()?.end?.(token,{ok:true,entries:parsed.projects.length});return parsed;}
    const empty={format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:null,projects:[]};catalogState=empty;diag()?.end?.(token,{ok:!raw,missing:!raw,invalid:!!raw});return empty;
  }
  async function writeIndex(state=catalogState){
    if(criticalRecoveryActive())return false;state={...state,format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:nowIso(),projects:Array.isArray(state.projects)?state.projects:[]};
    const text=JSON.stringify(state,null,2),token=diag()?.start?.('index.write',{entries:state.projects.length});const ok=await rawWrite(INDEX_FILE,text);if(ok)catalogState=state;diag()?.end?.(token,{ok,size:text.length});return ok;
  }

  async function migrateSingle(raw,filename,detail,used){
    const p=fmt.normalizeProject(raw,filename);if(!p)return [];
    ensureFileId(p,filename,used);const target=canonicalName(p),text=fmt.serializeV6(p,target),hash=await sha256(text);
    const writeNeeded=Number(raw?.schemaVersion||raw?.version||1)!==fmt.CURRENT_SCHEMA||!fmt.parseHeaderText(String(raw?._pgHeader?JSON.stringify({_pgHeader:raw._pgHeader}):''))||target!==filename;
    let finalName=filename,finalDetail=detail;
    if(writeNeeded&&!criticalRecoveryActive()){
      const ok=await rawWrite(target,text);if(ok){finalName=target;if(target!==filename)await rawDelete(filename);const d=metadata().find(x=>x.name===target);if(d)finalDetail=d;diag()?.mark?.('project.schema-upgraded',{from:Number(raw?.schemaVersion||raw?.version||1),to:6,filename,target});}
    }
    putLocal(p);return [entryFromProject(p,finalName,finalDetail,hash,null)];
  }
  async function importBackup(raw,filename,detail,used){
    const list=Array.isArray(raw?.projects)?raw.projects:[];const hash=await sha256(JSON.stringify(raw));const out=[];
    for(let i=0;i<list.length;i++){const p=fmt.normalizeProject(list[i],`${filename}#${i}`);if(!p)continue;ensureFileId(p,null,used);putLocal(p);out.push(entryFromProject(p,filename,detail,hash,i));}
    return out;
  }

  async function inspectChanged(detail,priorEntries,used){
    const head=await rawReadHead(detail.name,4096),h=fmt.parseHeaderText(head);
    if(h){const prior=priorEntries.find(x=>x.projectId===h.id)||priorEntries[0]||null;diag()?.mark?.('index.header-match',{filename:detail.name,schemaVersion:h.schemaVersion});return [entryFromHeader(h,detail.name,detail,prior)];}
    const token=diag()?.start?.('project.full-read',{filename:detail.name,reason:'new-or-legacy'}),text=await rawRead(detail.name),raw=parse(text,null);diag()?.end?.(token,{ok:!!raw,size:text?.length||0});if(!raw)return [];
    if(isBackup(raw))return importBackup(raw,detail.name,detail,used);
    return migrateSingle(raw,detail.name,detail,used);
  }

  async function reconcileAll(reason='background'){
    if(syncPromise)return syncPromise;if(!hasFolder()||!indexReady())return null;
    syncPromise=(async()=>{
      const token=diag()?.start?.('index.reconcile',{reason}),stored=await readIndex(),details=metadata();
      const old=Array.isArray(stored.projects)?stored.projects:[],byFile=new Map();for(const e of old){if(!byFile.has(e.filename))byFile.set(e.filename,[]);byFile.get(e.filename).push(e);}
      const used=new Set(old.map(e=>fmt.validFileId(e.fileId)).filter(Boolean)),next=[];let fast=0,headers=0,changed=0;
      for(const detail of details){const prior=byFile.get(detail.name)||[];if(prior.length&&prior.every(e=>sameMeta(e,detail))){next.push(...prior);fast++;diag()?.mark?.('index.fast-match',{filename:detail.name,size:detail.size,lastModified:detail.lastModified});continue;}
        const rows=await inspectChanged(detail,prior,used);if(rows.length){next.push(...rows);changed++;if(rows.every(e=>e.schemaVersion===6))headers++;}await new Promise(r=>setTimeout(r,0));}
      catalogState={format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:nowIso(),projects:next};syncLocalCatalog(next);if(!criticalRecoveryActive())await writeIndex(catalogState);
      const result={files:details.length,projects:next.length,fastMatches:fast,changedFiles:changed,zeroProjectReads:fast===details.length,reason,at:Date.now()};window.__padGradeLastFolderSync=result;
      try{window.dispatchEvent(new CustomEvent('padgrade-projects-reconciled',{detail:result}));}catch(e){}diag()?.end?.(token,result);return result;
    })().finally(()=>{syncPromise=null;});return syncPromise;
  }

  function findEntry(id){return catalogState.projects.find(e=>e.projectId===id)||null;}
  async function loadProject(id){
    if(!id)return null;const local=getLocal(id);if(local)return fmt.normalizeProject(local,null);
    if(!catalogState.projects.length&&hasFolder()&&indexReady())await reconcileAll('lazy-load-catalog');const e=findEntry(id);if(!e)return null;
    const token=diag()?.start?.('project.full-read',{filename:e.filename,reason:'user-load',projectId:id}),text=await rawRead(e.filename),raw=parse(text,null);diag()?.end?.(token,{ok:!!raw,size:text?.length||0});if(!raw)return null;
    let p=null;if(isBackup(raw)){const list=Array.isArray(raw.projects)?raw.projects:[];if(Number.isInteger(e.backupIndex)&&list[e.backupIndex])p=fmt.normalizeProject(list[e.backupIndex],`${e.filename}#${e.backupIndex}`);if(!p)for(const x of list){const q=fmt.normalizeProject(x,e.filename);if(q?.id===id){p=q;break;}}}else p=fmt.normalizeProject(raw,e.filename);
    if(!p)return null;putLocal(p);const hash=await sha256(text);if(e.sha256&&hash&&e.sha256!==hash)diag()?.mark?.('index.hash-mismatch',{filename:e.filename,projectId:id});if(hash)e.sha256=hash;syncLocalCatalog(catalogState.projects);if(!criticalRecoveryActive())writeSerial=writeSerial.then(()=>writeIndex(catalogState));return p;
  }

  function catalog(){
    const rows=catalogState.projects.map(e=>({...e,id:e.projectId})),seen=new Set(rows.map(x=>x.id));
    for(const item of getLocalIndex()){if(!item?.id||seen.has(item.id))continue;const p=getLocal(item.id);if(p){const q=fmt.normalizeProject(p),c=fmt.catalogFromProject(q);rows.push({id:item.id,projectId:item.id,filename:item.durableFilename||null,fileId:q.fileId||item.fileId||null,schemaVersion:Number(q.schemaVersion||q.version||5),name:c.name,createdAt:q.createdAt,modifiedAt:q.modifiedAt,status:q.status||item.status,width:c.width,length:c.length,cols:c.cols,rows:c.rows,fullyMeasured:c.fullyMeasured,gpsReady:c.gpsReady,size:0,lastModified:0,sha256:null,localOnly:true});}}
    return rows;
  }

  async function prepareMinimumRecovery(){
    if(!hasFolder()||!indexReady()){const result={ready:false};window.__padGradeMinimumDurableRecoveryV096=result;return result;}if(minimumPromise)return minimumPromise;
    minimumPromise=(async()=>{
      const token=diag()?.start?.('recovery.minimum',{indexedV107:true,writeLocked:criticalRecoveryActive()}),settings=parse(await rawRead(SETTINGS_FILE),null);if(settings?.appPrefs)try{localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
      try{diag()?.refreshEnabledFromPrefs?.('durable-settings');}catch(e){}
      const desired=settings?.lastProjectId||localStorage.getItem(ACTIVE_KEY)||null;await readIndex();let restored=null;
      if(desired){restored=getLocal(desired);if(!restored){let entry=findEntry(desired);if(!entry){const details=metadata(),suffix=`${desired}.padgrade`.toLowerCase(),d=details.find(x=>x.name.toLowerCase().endsWith(suffix));if(d){const rows=await inspectChanged(d,[],new Set(catalogState.projects.map(x=>x.fileId).filter(Boolean)));if(rows.length){catalogState.projects.push(...rows);syncLocalCatalog(catalogState.projects);entry=rows.find(x=>x.projectId===desired)||null;}}}if(entry)restored=await loadProject(desired);}
        if(restored&&restored.status!=='archived')localStorage.setItem(ACTIVE_KEY,desired);}
      if(metadata().length===0&&!settings)try{native.completeProjectFolderRecovery?.();}catch(e){}
      const result={ready:true,restoredId:restored?.id||null,fileCount:metadata().length,settingsFound:!!settings,writeLocked:criticalRecoveryActive(),indexedV107:true};window.__padGradeMinimumDurableRecoveryV096=result;
      try{window.dispatchEvent(new CustomEvent('padgrade-minimum-durable-recovery-ready',{detail:result}));}catch(e){}diag()?.end?.(token,result);return result;
    })().catch(error=>{minimumPromise=null;const result={ready:true,error:String(error?.message||error),writeLocked:criticalRecoveryActive(),indexedV107:true};window.__padGradeMinimumDurableRecoveryV096=result;diag()?.mark?.('recovery.minimum-error',result);return result;});return minimumPromise;
  }

  async function updateIndexAfterWrite(filename,text){
    const raw=parse(text,null);if(!raw||isBackup(raw)||!raw.settings||!raw.id)return;const p=fmt.normalizeProject(raw,filename);if(!p)return;const used=new Set(catalogState.projects.map(e=>e.fileId).filter(Boolean));ensureFileId(p,filename,used);const target=canonicalName(p),canonical=fmt.serializeV6(p,target),ok=await rawWrite(target,canonical);if(!ok)return false;if(target!==filename)await rawDelete(filename);
    const d=metadata().find(x=>x.name===target)||{name:target,size:new TextEncoder().encode(canonical).length,lastModified:Date.now()},hash=await sha256(canonical),entry=entryFromProject(p,target,d,hash,null);
    catalogState.projects=catalogState.projects.filter(e=>e.projectId!==p.id&&e.filename!==filename);catalogState.projects.push(entry);putLocal({...p,fileId:p.fileId});syncLocalCatalog(catalogState.projects);await writeIndex(catalogState);return true;
  }

  // All normal durable project writes are promoted to canonical schema 6 before
  // bytes reach SAF. Settings/index/other files bypass this wrapper unchanged.
  files.write=async function(filename,text){
    if(filename===INDEX_FILE||filename===SETTINGS_FILE||!isCandidate(filename))return rawWrite(filename,text);
    return writeSerial=writeSerial.then(()=>updateIndexAfterWrite(filename,text)).catch(e=>{diag()?.mark?.('index.write-wrapper-error',{filename,error:String(e?.message||e)});return false;});
  };
  files.writeResult=async function(filename,text){const ok=await files.write(filename,text);return {ok,value:ok,filename,op:'write',indexedV107:true};};

  async function downgradeFolderToV5(){
    if(!hasFolder()||!indexReady())return {ok:false,reason:'folder-not-ready'};await reconcileAll('pre-downgrade');let rewritten=0,failed=0;
    const unique=[...new Set(catalogState.projects.filter(e=>e.backupIndex==null).map(e=>e.filename))];
    for(const filename of unique){const raw=parse(await rawRead(filename),null);if(!raw){failed++;continue;}const text=fmt.serializeV5(raw),ok=await rawWrite(filename,text);if(ok)rewritten++;else failed++;}
    catalogState={format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:nowIso(),projects:[]};if(!criticalRecoveryActive())await writeIndex(catalogState);diag()?.mark?.('project.schema-downgrade',{from:6,to:5,rewritten,failed});return {ok:failed===0,rewritten,failed};
  }

  function saveText(filename,text){try{if(window.PadGradePlatform?.saveTextFile?.(filename,'application/octet-stream',text))return true;}catch(e){}try{const blob=new Blob([text],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;}catch(e){return false;}}
  async function exportV6(id){const p=await loadProject(id)||getLocal(id);if(!p)return false;const q=fmt.normalizeProject(p),used=new Set(catalogState.projects.map(e=>e.fileId).filter(Boolean));ensureFileId(q,null,used);const safe=String(q.settings?.name||'Pad').replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'Pad';return saveText(`${q.fileId}-${safe}.padgrade`,fmt.serializeV6(q));}

  function installLazyProjectUiAndExport(){
    document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button');if(!btn)return;
      const row=btn.closest?.('[data-id]'),id=row?.dataset?.id||null,act=btn.dataset?.act;
      const projectAct=row&&['open','rename','copy','delete'].includes(act);
      const directExport=['exportProjectBtn','v041ExportCurrent'].includes(btn.id),rowExport=act==='export'&&!!row;
      if(directExport||rowExport){const projectId=rowExport?id:localStorage.getItem(ACTIVE_KEY);if(!projectId)return;event.preventDefault();event.stopImmediatePropagation();exportV6(projectId);return;}
      if(!projectAct||getLocal(id))return;
      event.preventDefault();event.stopImmediatePropagation();loadProject(id).then(p=>{if(p)setTimeout(()=>btn.click(),0);});
    },true);
  }

  function cancelIdle(){if(!syncIdle)return;try{if(syncIdle.kind==='idle'&&typeof cancelIdleCallback==='function')cancelIdleCallback(syncIdle.id);else clearTimeout(syncIdle.id);}catch(e){}syncIdle=null;}
  function scheduleSync(delay=2200,reason='scheduled'){
    if(criticalRecoveryActive()||!hasFolder()||!indexReady())return;clearTimeout(syncTimer);cancelIdle();syncTimer=setTimeout(()=>{syncTimer=null;const run=()=>{syncIdle=null;reconcileAll(reason);};syncIdle=typeof requestIdleCallback==='function'?{kind:'idle',id:requestIdleCallback(run,{timeout:6500})}:{kind:'timer',id:setTimeout(run,200)};},Math.max(800,Number(delay)||0));
  }
  function resetForFolder(){minimumPromise=null;syncPromise=null;clearTimeout(syncTimer);syncTimer=null;cancelIdle();catalogState={format:INDEX_FORMAT,indexVersion:INDEX_VERSION,updatedAt:null,projects:[]};}

  window.PadGradeProjectIndexV107={INDEX_FILE,INDEX_VERSION,catalog,ensureCatalog:()=>reconcileAll('catalog-request'),loadProject,reconcile:reconcileAll,downgradeFolderToV5,exportV6,readIndex,writeIndex};
  window.__padGradePrepareMinimumDurableRecovery=prepareMinimumRecovery;
  window.__padGradeReconcileDurableAsync=()=>reconcileAll('legacy-call');
  window.__padGradeScheduleAsyncFileIdMigration=delay=>scheduleSync(delay||2600,'file-id-request');
  window.__padGradeProjectFolderChanged=function(){if(indexReady())prepareMinimumRecovery();};

  installLazyProjectUiAndExport();
  window.addEventListener('padgrade-project-folder-selected',resetForFolder);
  window.addEventListener('padgrade-project-folder-indexed',()=>{if(indexReady())prepareMinimumRecovery();});
  window.addEventListener('padgrade-durable-sync-ready',()=>{if(indexReady())prepareMinimumRecovery();});
  window.addEventListener('padgrade-active-project-applied',()=>scheduleSync(2200,'active-project'));
  window.addEventListener('padgrade-recovery-visual-released',()=>scheduleSync(1600,'recovery-released'));
  window.addEventListener('load',()=>scheduleSync(2400,'window-load'),{once:true});
  if(hasFolder()&&indexReady())setTimeout(()=>prepareMinimumRecovery(),0);
  diag()?.mark?.('index.controller-installed',{version:'1.0.7',schema:6,rollbackSchema:5,indexFile:INDEX_FILE,metadataFastPath:true,headerReadChars:4096,hashOnFullReadOrWrite:true});
})();
