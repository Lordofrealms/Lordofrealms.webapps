/* Pad Grade v0.8.0 DEV — human-readable six-character project/save file IDs.
 *
 * A stable six-character ID is stored in every project payload, mirrored in a
 * project-id -> file-id map so older project layers cannot accidentally discard
 * it, displayed in the UI, used as the prefix for one-project exports, and used
 * to upgrade durable-folder save files in place (write new prefixed file first,
 * then remove the legacy unprefixed file).
 */
(function installPadGrade080FileIds(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const FILE_MAP_KEY='padGradeFileIdsV1';
  const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DIGITS='23456789';
  const FILE_ID_RE=/^[A-HJ-NP-Z]{4}[2-9]{2}$/;
  const PREFIX_RE=/^([A-HJ-NP-Z]{4}[2-9]{2})-/i;
  const native=window.PadGradeNative||null;
  const $=id=>document.getElementById(id);

  let lastFolderSignature='';
  let folderTimer=null;
  let localTimer=null;
  let lastLocalSignature='';

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function validFileId(value){const s=String(value||'').toUpperCase();return FILE_ID_RE.test(s)?s:null;}
  function fileIdFromName(name){const m=String(name||'').match(PREFIX_RE);return m?validFileId(m[1]):null;}
  function fileMap(){const x=parse(localStorage.getItem(FILE_MAP_KEY),{});return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
  function saveFileMap(map){try{localStorage.setItem(FILE_MAP_KEY,JSON.stringify(map));}catch(e){}}
  function projectKey(id){return `${PROJECT_PREFIX}${id}`;}
  function randomInt(max){
    if(window.crypto&&typeof window.crypto.getRandomValues==='function'){
      const a=new Uint32Array(1);window.crypto.getRandomValues(a);return a[0]%max;
    }
    return Math.floor(Math.random()*max);
  }
  function generateFileId(used=new Set()){
    for(let attempt=0;attempt<1000;attempt++){
      let id='';
      for(let i=0;i<4;i++)id+=LETTERS[randomInt(LETTERS.length)];
      for(let i=0;i<2;i++)id+=DIGITS[randomInt(DIGITS.length)];
      if(!used.has(id))return id;
    }
    return `PGPG${DIGITS[randomInt(DIGITS.length)]}${DIGITS[randomInt(DIGITS.length)]}`;
  }
  function getIndex(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function setIndex(idx){try{localStorage.setItem(INDEX_KEY,JSON.stringify(idx));}catch(e){}}
  function getProject(id){const p=parse(localStorage.getItem(projectKey(id)),null);return p&&typeof p==='object'?p:null;}
  function putProject(p){if(!p||!p.id)return;try{localStorage.setItem(projectKey(p.id),JSON.stringify(p));}catch(e){}}
  function projectIds(){
    const ids=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(key&&key.startsWith(PROJECT_PREFIX))ids.push(key.slice(PROJECT_PREFIX.length));
    }
    return ids;
  }

  function ensureLocalFileIds(){
    const ids=projectIds().sort();
    const map=fileMap();
    const owner=new Map();
    let changed=false;

    // Reserve explicit/mapped IDs first so a duplicated project payload cannot
    // silently steal another project's visible ID.
    for(const id of ids){
      const p=getProject(id);if(!p)continue;
      const candidate=validFileId(map[id])||validFileId(p.fileId);
      if(candidate&&!owner.has(candidate))owner.set(candidate,id);
    }

    for(const id of ids){
      const p=getProject(id);if(!p)continue;
      let fid=validFileId(map[id]);
      const embedded=validFileId(p.fileId);
      if(!fid&&embedded&&(!owner.has(embedded)||owner.get(embedded)===id))fid=embedded;
      if(!fid){
        fid=generateFileId(new Set(owner.keys()));
        owner.set(fid,id);
      }
      if(map[id]!==fid){map[id]=fid;changed=true;}
      if(p.fileId!==fid){p.fileId=fid;putProject(p);changed=true;}
    }

    // Remove stale mappings only after projects are gone locally.
    for(const id of Object.keys(map))if(!ids.includes(id)){delete map[id];changed=true;}
    if(changed)saveFileMap(map);

    const idx=getIndex();let idxChanged=false;
    for(const item of idx){
      if(!item||!item.id)continue;
      const fid=validFileId(map[item.id]);
      if(fid&&item.fileId!==fid){item.fileId=fid;idxChanged=true;}
    }
    if(idxChanged)setIndex(idx);
    refreshFileIdUi();
    return {ids,map,changed:changed||idxChanged};
  }

  function ensureProjectPayloadFileId(project,filename=null){
    if(!project||typeof project!=='object')return null;
    const map=fileMap();
    const localMapped=project.id?validFileId(map[project.id]):null;
    let fid=localMapped||validFileId(project.fileId)||fileIdFromName(filename);
    if(!fid){
      const used=new Set(Object.values(map).map(validFileId).filter(Boolean));
      fid=generateFileId(used);
    }
    project.fileId=fid;
    if(project.id&&map[project.id]!==fid){map[project.id]=fid;saveFileMap(map);}
    return fid;
  }

  function canonicalDurableName(project){
    if(!project||!project.id)return null;
    const fid=ensureProjectPayloadFileId(project);
    return fid?`${fid}-${project.id}.padgrade`:null;
  }

  function isProjectCandidate(name){const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');}
  function isSingleProject(raw){return !!(raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.settings&&typeof raw.settings==='object'&&raw.readings&&typeof raw.readings==='object');}
  function isAllProjectsBackup(raw){return !!(raw&&typeof raw==='object'&&(raw.backupType==='all-projects'||Array.isArray(raw.projects)));}

  function migrateDurableFolder(force=false){
    if(!native||typeof native.hasProjectFolder!=='function'||typeof native.listProjectFiles!=='function'||typeof native.readProjectFile!=='function'||typeof native.writeProjectFile!=='function')return;
    let connected=false;try{connected=!!native.hasProjectFolder();}catch(e){}
    if(!connected)return;
    let names=[];try{names=parse(native.listProjectFiles(),[])||[];}catch(e){names=[];}
    names=names.filter(n=>typeof n==='string'&&isProjectCandidate(n)).sort();
    const signature=JSON.stringify(names);
    if(!force&&signature===lastFolderSignature)return;
    lastFolderSignature=signature;

    ensureLocalFileIds();
    for(const name of names){
      let rawText=null,raw=null;
      try{rawText=native.readProjectFile(name);raw=parse(rawText,null);}catch(e){raw=null;}
      if(!raw||typeof raw!=='object')continue;

      let fid=null;
      if(isSingleProject(raw)){
        fid=ensureProjectPayloadFileId(raw,name);
        if(raw.id){
          const local=getProject(raw.id);
          if(local){
            local.fileId=fid;putProject(local);
          }
        }
      }else if(isAllProjectsBackup(raw)){
        fid=validFileId(raw.fileId)||fileIdFromName(name)||generateFileId(new Set(Object.values(fileMap()).map(validFileId).filter(Boolean)));
        raw.fileId=fid;
      }else{
        continue;
      }

      if(!fid)continue;
      const alreadyPrefixed=!!fileIdFromName(name);
      const targetName=alreadyPrefixed?name:`${fid}-${name}`;
      const nextText=JSON.stringify(raw,null,2);
      let wrote=false;
      try{wrote=!!native.writeProjectFile(targetName,nextText);}catch(e){wrote=false;}
      if(wrote&&targetName!==name&&typeof native.deleteProjectFile==='function'){
        try{native.deleteProjectFile(name);}catch(e){}
      }
    }

    // Force one cheap rescan next time so the final post-migration name set is
    // recorded rather than the legacy pre-migration set.
    lastFolderSignature='';
    ensureLocalFileIds();
  }

  function safeName(name){return String(name||'Pad').replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'Pad';}
  function saveTextFile(filename,mime,text){
    try{if(window.PadGradePlatform?.saveTextFile?.(filename,mime,text))return true;}catch(e){}
    const blob=new Blob([text],{type:mime||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
  function exportProjectById(id){
    const p=getProject(id);if(!p)return false;
    const fid=ensureProjectPayloadFileId(p);p.exportedAt=new Date().toISOString();putProject(p);ensureLocalFileIds();
    return saveTextFile(`${fid}-${safeName(p.settings?.name||'Pad')}.padgrade`,'application/octet-stream',JSON.stringify(p,null,2));
  }

  function installExportInterception(){
    document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button');if(!btn)return;
      const direct=['exportProjectBtn','v041ExportCurrent'].includes(btn.id);
      const rowExport=btn.dataset?.act==='export'&&!!btn.closest?.('[data-id]');
      if(!direct&&!rowExport)return;
      const id=rowExport?btn.closest('[data-id]')?.dataset?.id:localStorage.getItem(ACTIVE_KEY);
      if(!id||!getProject(id))return;
      event.preventDefault();event.stopImmediatePropagation();exportProjectById(id);
    },true);
  }

  function activeFileId(){
    const id=localStorage.getItem(ACTIVE_KEY);if(!id)return null;
    const map=fileMap();return validFileId(map[id])||validFileId(getProject(id)?.fileId);
  }
  function addOrUpdateBadge(host,fid,label='File ID'){
    if(!host||!fid)return;
    let el=host.querySelector?.(':scope > .pgFileIdBadge');
    if(!el){el=document.createElement('div');el.className='pgFileIdBadge';host.appendChild(el);}
    el.textContent=`${label}: ${fid}`;
  }
  function refreshFileIdUi(){
    const fid=activeFileId();
    const name=$('nameDisp');if(name&&fid)addOrUpdateBadge(name.parentElement,fid,'File ID');
    const projectName=$('v040ProjectName');if(projectName&&fid){
      const parent=projectName.parentElement;if(parent)addOrUpdateBadge(parent,fid,'File ID');
    }
    const map=fileMap();
    document.querySelectorAll('[data-id].v040-projectItem,[data-id].v041-projectItem').forEach(row=>{
      const id=row.dataset.id,rfid=validFileId(map[id])||validFileId(getProject(id)?.fileId);if(!rfid)return;
      const textHost=row.firstElementChild||row;let badge=textHost.querySelector('.pgFileIdInline');
      if(!badge){badge=document.createElement('div');badge.className='pgFileIdInline';textHost.appendChild(badge);}
      badge.textContent=`File ID ${rfid}`;
    });
  }

  function installStyle(){
    if($('pgFileIdStyle'))return;
    const style=document.createElement('style');style.id='pgFileIdStyle';style.textContent=`
      .pgFileIdBadge{margin-top:3px;color:#9fb5cc;font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
      .pgFileIdInline{margin-top:3px;color:#9fb5cc;font-size:.7rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
    `;document.head.appendChild(style);
  }

  function scheduleDurableMigration(delay=120){setTimeout(()=>migrateDurableFolder(true),delay);}
  function installDeleteCleanup(){
    document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button[data-act="delete"]');const row=btn?.closest?.('[data-id]');if(!row)return;
      const id=row.dataset.id;if(!id)return;
      setTimeout(()=>{
        if(getProject(id))return;
        if(!native||typeof native.listProjectFiles!=='function'||typeof native.readProjectFile!=='function'||typeof native.deleteProjectFile!=='function')return;
        let names=[];try{names=parse(native.listProjectFiles(),[])||[];}catch(e){names=[];}
        for(const name of names){
          let p=null;try{p=parse(native.readProjectFile(name),null);}catch(e){}
          if(p&&p.id===id){try{native.deleteProjectFile(name);}catch(e){}}
        }
      },650);
    },true);
  }

  function localSignature(){
    const ids=projectIds().sort(),parts=[];
    for(const id of ids){const p=getProject(id);parts.push(`${id}|${p?.modifiedAt||''}|${p?.fileId||''}`);}return parts.join(';');
  }
  function pollLocalChanges(){
    const sig=localSignature();
    if(sig!==lastLocalSignature){lastLocalSignature=sig;ensureLocalFileIds();scheduleDurableMigration(180);}
    refreshFileIdUi();
  }

  window.PadGradeFileId={
    valid:validFileId,
    fromFilename:fileIdFromName,
    generate:generateFileId,
    ensureProject:ensureProjectPayloadFileId,
    canonicalDurableName,
    ensureAllLocal:ensureLocalFileIds,
    migrateDurableFolder,
    exportProjectById
  };

  installStyle();
  ensureLocalFileIds();
  installExportInterception();
  installDeleteCleanup();
  document.title='Pad Grade Mapper v0.8.0 DEV';

  window.addEventListener('padgrade-projects-reconciled',()=>{ensureLocalFileIds();scheduleDurableMigration(80);});
  window.addEventListener('padgrade-durable-sync-ready',()=>scheduleDurableMigration(120));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){ensureLocalFileIds();scheduleDurableMigration(120);}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{refreshFileIdUi();scheduleDurableMigration(250);},{once:true});
  else scheduleDurableMigration(100);

  localTimer=setInterval(pollLocalChanges,1200);
  folderTimer=setInterval(()=>migrateDurableFolder(false),2500);
  window.addEventListener('beforeunload',()=>{if(localTimer)clearInterval(localTimer);if(folderTimer)clearInterval(folderTimer);},{once:true});

  window.__padGradeFileIdsV080='stable-six-char-file-id-prefix-with-legacy-folder-upgrade';
})();
