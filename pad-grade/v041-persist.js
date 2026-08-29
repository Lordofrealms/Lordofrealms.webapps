/* Pad Grade v0.9.6 persistence hardening. */
(function installPadGradeV041Persistence(){
  'use strict';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const FILE_MAP_KEY='padGradeFileIdsV1';
  const FILE_ID_RE=/^[A-HJ-NP-Z]{4}[2-9]{2}$/;
  const projectKey=id=>`padGradeProjectV5:${id}`;

  function getIndex(){try{const x=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function durableReady(){
    try{
      if(!window.PadGradeNative||typeof PadGradeNative.hasProjectFolder!=='function'||!PadGradeNative.hasProjectFolder())return false;
      return typeof PadGradeNative.isProjectFolderIndexReady!=='function'||!!PadGradeNative.isProjectFolderIndexReady();
    }catch(e){return false;}
  }
  function fileIdFor(p,id){
    try{if(window.PadGradeFileId&&typeof window.PadGradeFileId.ensureProject==='function')return window.PadGradeFileId.ensureProject(p)||null;}catch(e){}
    try{const map=JSON.parse(localStorage.getItem(FILE_MAP_KEY)||'{}')||{},candidate=String(map[id]||p?.fileId||'').toUpperCase();return FILE_ID_RE.test(candidate)?candidate:null;}catch(e){return null;}
  }
  function writeRepairAsync(filename,p){
    const text=JSON.stringify(p);
    try{
      if(window.PadGradeFiles?.write){window.PadGradeFiles.write(filename,text);return;}
      if(typeof PadGradeNative.writeProjectFile==='function')PadGradeNative.writeProjectFile(filename,text);
    }catch(e){}
  }
  function repairActiveStatus(){
    const id=localStorage.getItem(ACTIVE_KEY);if(!id)return;
    const idx=getIndex(),item=idx.find(x=>x.id===id);if(!item)return;
    const status=item.status==='archived'?'archived':'open';
    let p=null;try{p=JSON.parse(localStorage.getItem(projectKey(id))||'null');}catch(e){}
    if(!p)return;
    let changed=false;
    if(p.status!==status){p.status=status;changed=true;}
    if(item.status!==status){item.status=status;changed=true;}
    const fileId=fileIdFor(p,id);
    if(fileId&&p.fileId!==fileId){p.fileId=fileId;changed=true;}
    if(fileId&&item.fileId!==fileId){item.fileId=fileId;changed=true;}
    if(!changed)return;
    localStorage.setItem(projectKey(id),JSON.stringify(p));
    localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
    if(!durableReady())return;
    const filename=fileId?`${fileId}-${id}.padgrade`:`${id}.padgrade`;
    writeRepairAsync(filename,p);
    try{window.PadGradeDiag?.mark?.('persistence.active-repair',{projectId:id,async:!!window.PadGradeFiles});}catch(e){}
  }

  const input=document.getElementById('importProjectFile');
  if(input)input.setAttribute('accept','.padgrade,.json,application/json,application/octet-stream');

  // The old implementation rewrote the active project every 1.2 seconds even
  // when nothing changed. Poll only for actual repair conditions; normal autosave
  // owns ordinary project changes.
  setInterval(repairActiveStatus,2500);
  window.addEventListener('pagehide',repairActiveStatus);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')repairActiveStatus();});
  setTimeout(repairActiveStatus,100);
  window.__padGradeDurableWritePolicyV096='repair-only-when-changed-and-async-when-available';
  window.__padGradeDurableWritePolicyV087=window.__padGradeDurableWritePolicyV096;
})();
