/* Pad Grade v0.4.3 durable-folder reconciliation.
 * Existing .padgrade files are imported immediately when a durable folder is
 * selected/reselected, before any local project is mirrored outward.
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
  function statusOf(p,item){return (p?.status||item?.status)==='archived'?'archived':'open';}

  function reconcile(reloadAfter=false){
    let names=[];
    try{names=JSON.parse(native.listProjectFiles()||'[]');}catch(e){names=[];}
    let idx=getIndex();
    const byId=new Map(idx.map(x=>[x.id,x]));
    const beforeIds=new Set(idx.map(x=>x.id));
    let imported=false;

    for(const name of names){
      if(typeof name!=='string'||!name.toLowerCase().endsWith('.padgrade')) continue;
      let remote=null;
      try{remote=JSON.parse(native.readProjectFile(name)||'null');}catch(e){}
      if(!remote||!remote.id||!remote.settings) continue;
      remote.status=statusOf(remote,null);
      const local=getLocal(remote.id);
      if(!local||modified(remote)>modified(local)){
        putLocal(remote); imported=true;
      }
      const best=(!local||modified(remote)>=modified(local))?remote:local;
      byId.set(best.id,{
        id:best.id,
        name:best.settings?.name||'Pad',
        modifiedAt:best.modifiedAt||best.exportedAt||new Date().toISOString(),
        createdAt:best.createdAt||best.exportedAt||new Date().toISOString(),
        status:statusOf(best,byId.get(best.id))
      });
      if(!beforeIds.has(best.id)) imported=true;
    }

    idx=[...byId.values()];setIndex(idx);

    // If the selected folder contains projects and the app has no meaningful
    // open active project (common immediately after reinstall), activate the
    // newest open project discovered in that folder.
    const activeId=localStorage.getItem(ACTIVE_KEY);
    const activeItem=idx.find(x=>x.id===activeId&&x.status!=='archived');
    if(!activeItem){
      const open=idx.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
      if(open.length)localStorage.setItem(ACTIVE_KEY,open[0].id);
    }

    // Only after inbound reconciliation do we mirror every local project out.
    for(const item of idx){
      const p=getLocal(item.id);if(!p)continue;
      p.status=statusOf(p,item);
      try{native.writeProjectFile(`${item.id}.padgrade`,JSON.stringify(p));}catch(e){}
    }

    if(reloadAfter||imported) location.reload();
  }

  const previous=window.__padGradeProjectFolderChanged;
  window.__padGradeProjectFolderChanged=function(){
    // Android's document provider can take a moment to expose children after
    // returning from ACTION_OPEN_DOCUMENT_TREE. Retry briefly before giving up.
    let attempts=0;
    const run=()=>{
      attempts++;
      try{
        const names=JSON.parse(native.listProjectFiles()||'[]');
        if(names.length||attempts>=5){reconcile(true);return;}
      }catch(e){if(attempts>=5){try{reconcile(true);}catch(ignore){}return;}}
      setTimeout(run,180);
    };
    setTimeout(run,60);
    try{previous?.();}catch(ignore){}
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
