/* Pad Grade v0.4.1 persistence hardening. */
(function installPadGradeV041Persistence(){
  'use strict';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const FILE_MAP_KEY='padGradeFileIdsV1';
  const FILE_ID_RE=/^[A-HJ-NP-Z]{4}[2-9]{2}$/;
  const projectKey=id=>`padGradeProjectV5:${id}`;

  function getIndex(){try{const x=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function fileIdFor(p,id){
    try{
      if(window.PadGradeFileId&&typeof window.PadGradeFileId.ensureProject==='function'){
        return window.PadGradeFileId.ensureProject(p)||null;
      }
    }catch(e){}
    try{
      const map=JSON.parse(localStorage.getItem(FILE_MAP_KEY)||'{}')||{};
      const candidate=String(map[id]||p?.fileId||'').toUpperCase();
      return FILE_ID_RE.test(candidate)?candidate:null;
    }catch(e){return null;}
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
    if(changed){
      localStorage.setItem(projectKey(id),JSON.stringify(p));
      localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
    }
    try{
      if(window.PadGradeNative&&typeof PadGradeNative.hasProjectFolder==='function'&&PadGradeNative.hasProjectFolder()&&typeof PadGradeNative.writeProjectFile==='function'){
        const filename=fileId?`${fileId}-${id}.padgrade`:`${id}.padgrade`;
        PadGradeNative.writeProjectFile(filename,JSON.stringify(p));
      }
    }catch(e){}
  }

  const input=document.getElementById('importProjectFile');
  if(input)input.setAttribute('accept','.padgrade,.json,application/json,application/octet-stream');

  // v0.4.0 autosave predates lifecycle status. Repair after its debounce/periodic saves.
  setInterval(repairActiveStatus,1200);
  window.addEventListener('pagehide',repairActiveStatus);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')repairActiveStatus();});
  setTimeout(repairActiveStatus,100);
})();
