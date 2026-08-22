/* Pad Grade v0.4.1 persistence hardening. */
(function installPadGradeV041Persistence(){
  'use strict';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const projectKey=id=>`padGradeProjectV5:${id}`;

  function getIndex(){try{const x=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function repairActiveStatus(){
    const id=localStorage.getItem(ACTIVE_KEY);if(!id)return;
    const idx=getIndex(),item=idx.find(x=>x.id===id);if(!item)return;
    const status=item.status==='archived'?'archived':'open';
    let p=null;try{p=JSON.parse(localStorage.getItem(projectKey(id))||'null');}catch(e){}
    if(!p)return;
    let changed=false;
    if(p.status!==status){p.status=status;changed=true;}
    if(item.status!==status){item.status=status;changed=true;}
    if(changed){
      localStorage.setItem(projectKey(id),JSON.stringify(p));
      localStorage.setItem(INDEX_KEY,JSON.stringify(idx));
    }
    try{
      if(window.PadGradeNative&&typeof PadGradeNative.hasProjectFolder==='function'&&PadGradeNative.hasProjectFolder()&&typeof PadGradeNative.writeProjectFile==='function'){
        PadGradeNative.writeProjectFile(`${id}.padgrade`,JSON.stringify(p));
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
