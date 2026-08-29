/* Pad Grade v0.8.9 DEV — first-install folder/project decision guard.
 *
 * On Android, a truly clean install must not manufacture a default project
 * before the user has had a chance to reconnect a surviving durable folder.
 * A temporary index sentinel blocks the older project manager's eager default
 * creation. The sentinel is never a real project and is removed before normal
 * project use.
 */
(function installPadGrade090FirstRunGuard(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const LEGACY_KEY='padGradeMobile';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const PROMPT_KEY='padGradeDurableFolderPromptedV1';
  const SENTINEL='__padgrade_first_run_pending__';
  const native=window.PadGradeNative||null;
  let armed=false;
  let pickerRequested=false;
  let indexTimer=null;
  let finalizeTimer=null;

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function index(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function realIndex(){return index().filter(x=>x&&x.id&&x.id!==SENTINEL);}
  function projectKeys(){
    const out=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(key&&key.startsWith(PROJECT_PREFIX))out.push(key);
    }
    return out;
  }
  function isAndroid(){return !!(native&&typeof native.chooseProjectFolder==='function');}
  function hasFolder(){try{return !!native?.hasProjectFolder?.();}catch(e){return false;}}
  function indexReady(){try{return typeof native?.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasExistingLocalState(){
    return realIndex().length>0||!!localStorage.getItem(ACTIVE_KEY)||projectKeys().length>0||!!localStorage.getItem(LEGACY_KEY);
  }
  function sentinelMeta(){return {id:SENTINEL,name:'Restoring saved projects…',createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),status:'archived',firstRunSentinel:true};}
  function installSentinel(){
    if(index().some(x=>x?.id===SENTINEL))return;
    localStorage.setItem(INDEX_KEY,JSON.stringify([sentinelMeta()]));
  }
  function removeSentinel(){
    const next=index().filter(x=>x?.id!==SENTINEL);
    localStorage.setItem(INDEX_KEY,JSON.stringify(next));
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
  }
  function uid(){return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
  function defaultProject(){
    const id=uid(),now=new Date().toISOString();
    let settings={width:64,length:76,cols:9,rows:9,target:64,tol:.5,refCorner:'SW',name:'60×72 Shop Pad'};
    try{if(typeof window.cfg==='function')settings={...settings,...window.cfg()};}catch(e){}
    return {
      app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,createdAt:now,modifiedAt:now,status:'open',
      settings,readings:{},readingMeta:{},gps:{},measureMode:'manual',migration:{sourceVersion:5},
      dev:{unitMode:'inches',heatmap:true,routeMode:'serpentine',laser:null,notes:''}
    };
  }
  function writeDefaultProject(durable){
    if(!armed)return;
    removeSentinel();
    if(realIndex().length||localStorage.getItem(ACTIVE_KEY)){armed=false;return;}
    const p=defaultProject();
    localStorage.setItem(`${PROJECT_PREFIX}${p.id}`,JSON.stringify(p));
    localStorage.setItem(INDEX_KEY,JSON.stringify([{id:p.id,name:p.settings.name,createdAt:p.createdAt,modifiedAt:p.modifiedAt,status:'open'}]));
    localStorage.setItem(ACTIVE_KEY,p.id);
    if(durable&&hasFolder()&&indexReady()&&typeof native?.writeProjectFile==='function'){
      try{native.writeProjectFile(`${p.id}.padgrade`,JSON.stringify(p));}catch(e){}
    }
    armed=false;
    window.__padGradeFirstRunPending=false;
    // A clean reload gives the normal project manager one ordinary project from
    // its very first read, with no sentinel or partial first-run state left over.
    location.reload();
  }
  function chooseRestoredProjectOrDefault(){
    if(!armed)return;
    removeSentinel();
    const projects=realIndex();
    if(projects.length){
      let active=localStorage.getItem(ACTIVE_KEY);
      if(!projects.some(x=>x.id===active&&x.status!=='archived')){
        const open=projects.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));
        if(open.length){active=open[0].id;localStorage.setItem(ACTIVE_KEY,active);}
      }
      armed=false;window.__padGradeFirstRunPending=false;
      location.reload();
      return;
    }
    writeDefaultProject(true);
  }
  function finalizeAfterIndex(){
    if(!armed||!hasFolder())return;
    if(!indexReady())return;
    clearTimeout(finalizeTimer);
    // Give durable reconciliation/settings restore a short same-device pass to
    // populate the local project index before deciding the selected folder is empty.
    finalizeTimer=setTimeout(chooseRestoredProjectOrDefault,450);
  }
  function waitForIndex(){
    if(indexTimer)return;
    indexTimer=setInterval(()=>{
      if(!armed){clearInterval(indexTimer);indexTimer=null;return;}
      if(hasFolder()&&indexReady()){
        clearInterval(indexTimer);indexTimer=null;finalizeAfterIndex();
      }
    },120);
  }
  function requestFolder(){
    if(!armed||pickerRequested)return;
    if(hasFolder()){waitForIndex();return;}
    pickerRequested=true;
    try{native.chooseProjectFolder();}
    catch(e){window.__padGradeProjectFolderSelectionCancelled?.();}
  }

  window.__padGradeProjectFolderSelectionCancelled=function(){
    if(!armed)return;
    pickerRequested=false;
    writeDefaultProject(false);
  };

  window.addEventListener('padgrade-project-folder-selected',()=>{pickerRequested=false;waitForIndex();});
  window.addEventListener('padgrade-project-folder-indexed',finalizeAfterIndex);
  window.addEventListener('padgrade-projects-reconciled',()=>{if(armed&&hasFolder()&&indexReady())finalizeAfterIndex();});

  if(isAndroid()&&!hasExistingLocalState()){
    armed=true;
    window.__padGradeFirstRunPending=true;
    installSentinel();
    // Suppress the older confirm-based durable-folder prompt. This clean-install
    // flow owns the one folder decision and treats picker cancellation as decline.
    localStorage.setItem(PROMPT_KEY,'1');
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(requestFolder,120),{once:true});
    else setTimeout(requestFolder,120);
  }

  window.__padGradeFirstRunPolicyV090='folder-choice-before-default-project';
  window.addEventListener('beforeunload',()=>{if(indexTimer)clearInterval(indexTimer);if(finalizeTimer)clearTimeout(finalizeTimer);},{once:true});
})();
