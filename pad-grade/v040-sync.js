/* Pad Grade v0.4.0 durable-folder reconciliation.
 * Keeps files outside app-private storage authoritative across reinstall while
 * still allowing fast local autosave during normal operation.
 */
(function installPadGradeDurableSync(){
  'use strict';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROMPT_KEY='padGradeDurableFolderPromptedV1';
  const projectKey=id=>`padGradeProjectV5:${id}`;
  const native=window.PadGradeNative;
  if(!native||typeof native.listProjectFiles!=='function') return;

  function getIndex(){try{const x=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function setIndex(x){localStorage.setItem(INDEX_KEY,JSON.stringify(x));}
  function getLocal(id){try{return JSON.parse(localStorage.getItem(projectKey(id))||'null');}catch(e){return null;}}
  function putLocal(p){localStorage.setItem(projectKey(p.id),JSON.stringify(p));}
  function modified(p){const t=Date.parse(p?.modifiedAt||p?.exportedAt||'');return Number.isFinite(t)?t:0;}

  function reconcile(reloadAfter=false){
    let names=[];
    try{names=JSON.parse(native.listProjectFiles()||'[]');}catch(e){names=[];}
    let idx=getIndex();
    const byId=new Map(idx.map(x=>[x.id,x]));
    let imported=false;

    for(const name of names){
      if(typeof name!=='string'||!name.toLowerCase().endsWith('.padgrade')) continue;
      let remote=null;
      try{remote=JSON.parse(native.readProjectFile(name)||'null');}catch(e){}
      if(!remote||!remote.id||!remote.settings) continue;
      const local=getLocal(remote.id);
      if(!local||modified(remote)>modified(local)){
        putLocal(remote); imported=true;
      }
      const best=(!local||modified(remote)>=modified(local))?remote:local;
      byId.set(best.id,{id:best.id,name:best.settings?.name||'Pad',modifiedAt:best.modifiedAt||best.exportedAt||new Date().toISOString(),createdAt:best.createdAt||best.exportedAt||new Date().toISOString()});
    }

    idx=[...byId.values()]; setIndex(idx);
    if(!localStorage.getItem(ACTIVE_KEY)&&idx.length) localStorage.setItem(ACTIVE_KEY,idx[0].id);

    // Only after inbound reconciliation do we mirror every local project out.
    for(const item of idx){
      const p=getLocal(item.id); if(!p) continue;
      try{native.writeProjectFile(`${item.id}.padgrade`,JSON.stringify(p));}catch(e){}
    }

    if(reloadAfter||imported) location.reload();
  }

  const previous=window.__padGradeProjectFolderChanged;
  window.__padGradeProjectFolderChanged=function(){
    try{reconcile(true);}catch(e){try{previous?.();}catch(ignore){}}
  };

  let connected=false;
  try{connected=!!native.hasProjectFolder();}catch(e){}
  if(connected){
    setTimeout(()=>reconcile(false),250);
  }else if(!localStorage.getItem(PROMPT_KEY)){
    localStorage.setItem(PROMPT_KEY,'1');
    setTimeout(()=>{
      const ok=confirm('Choose a durable Pad Grade project folder now? Projects in that folder survive app uninstall/reinstall. You can also do this later from Projects.');
      if(ok&&typeof native.chooseProjectFolder==='function'){
        try{native.chooseProjectFolder();}catch(e){}
      }
    },700);
  }
})();
