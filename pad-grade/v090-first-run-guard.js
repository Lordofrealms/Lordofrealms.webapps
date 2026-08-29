/* Pad Grade v0.9.1 DEV — first-install durable-storage choice.
 *
 * A clean Android install does not create a default project until the user has
 * had a chance to reconnect surviving durable files, and it never opens Android's
 * folder picker without an explanatory opt-in first. The stable-style recovery
 * curtain is armed only when an existing durable project set has actually been
 * recovered and the app performs the one recovery reload.
 */
(function installPadGrade090FirstRunGuard(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const LEGACY_KEY='padGradeMobile';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const PROMPT_KEY='padGradeDurableFolderPromptedV1';
  const SENTINEL='__padgrade_first_run_pending__';
  const DIALOG_ID='pgFirstRunStorageChoice';
  const native=window.PadGradeNative||null;
  let armed=false;
  let pickerRequested=false;
  let indexTimer=null;
  let finalizeTimer=null;

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function index(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function realIndex(){return index().filter(x=>x&&x.id&&x.id!==SENTINEL);}
  function projectKeys(){const out=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith(PROJECT_PREFIX))out.push(key);}return out;}
  function isAndroid(){return !!(native&&typeof native.chooseProjectFolder==='function');}
  function hasFolder(){try{return !!native?.hasProjectFolder?.();}catch(e){return false;}}
  function indexReady(){try{return typeof native?.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasExistingLocalState(){return realIndex().length>0||!!localStorage.getItem(ACTIVE_KEY)||projectKeys().length>0||!!localStorage.getItem(LEGACY_KEY);}
  function sentinelMeta(){return {id:SENTINEL,name:'Waiting for storage choice…',createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),status:'archived',firstRunSentinel:true};}
  function installSentinel(){if(!index().some(x=>x?.id===SENTINEL))localStorage.setItem(INDEX_KEY,JSON.stringify([sentinelMeta()]));}
  function removeSentinel(){localStorage.setItem(INDEX_KEY,JSON.stringify(index().filter(x=>x?.id!==SENTINEL)));try{window.__padGradeRefreshProjectIndex?.();}catch(e){}}
  function uid(){return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
  function defaultProject(){
    const id=uid(),now=new Date().toISOString();
    let settings={width:64,length:76,cols:9,rows:9,target:64,tol:.5,refCorner:'SW',name:'60×72 Shop Pad'};
    try{if(typeof window.cfg==='function')settings={...settings,...window.cfg()};}catch(e){}
    return {app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,createdAt:now,modifiedAt:now,status:'open',settings,readings:{},readingMeta:{},gps:{},measureMode:'manual',migration:{sourceVersion:5},dev:{unitMode:'inches',heatmap:true,routeMode:'serpentine',laser:null,notes:''}};
  }
  function reloadNormally(){location.reload();}
  function reloadRecoveredDurable(){
    try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    setTimeout(()=>{try{location.reload();}catch(e){try{window.__padGradeEndRecoveryVisualHold?.();}catch(_){}}},40);
  }
  function writeDefaultProject(durable){
    if(!armed)return;closeChoice();removeSentinel();if(realIndex().length||localStorage.getItem(ACTIVE_KEY)){armed=false;return;}
    const p=defaultProject();
    localStorage.setItem(`${PROJECT_PREFIX}${p.id}`,JSON.stringify(p));
    localStorage.setItem(INDEX_KEY,JSON.stringify([{id:p.id,name:p.settings.name,createdAt:p.createdAt,modifiedAt:p.modifiedAt,status:'open'}]));
    localStorage.setItem(ACTIVE_KEY,p.id);
    if(durable&&hasFolder()&&indexReady()&&typeof native?.writeProjectFile==='function'){try{native.writeProjectFile(`${p.id}.padgrade`,JSON.stringify(p));}catch(e){}}
    armed=false;window.__padGradeFirstRunPending=false;reloadNormally();
  }
  function chooseRestoredProjectOrDefault(){
    if(!armed)return;closeChoice();removeSentinel();const projects=realIndex();
    if(projects.length){
      let active=localStorage.getItem(ACTIVE_KEY);
      if(!projects.some(x=>x.id===active&&x.status!=='archived')){const open=projects.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));if(open.length){active=open[0].id;localStorage.setItem(ACTIVE_KEY,active);}}
      armed=false;window.__padGradeFirstRunPending=false;reloadRecoveredDurable();return;
    }
    writeDefaultProject(true);
  }
  function finalizeAfterIndex(){if(!armed||!hasFolder()||!indexReady())return;clearTimeout(finalizeTimer);finalizeTimer=setTimeout(chooseRestoredProjectOrDefault,450);}
  function waitForIndex(){if(indexTimer)return;indexTimer=setInterval(()=>{if(!armed){clearInterval(indexTimer);indexTimer=null;return;}if(hasFolder()&&indexReady()){clearInterval(indexTimer);indexTimer=null;finalizeAfterIndex();}},120);}
  function requestFolder(){if(!armed||pickerRequested)return;if(hasFolder()){waitForIndex();return;}pickerRequested=true;waitForIndex();try{native.chooseProjectFolder();}catch(e){window.__padGradeProjectFolderSelectionCancelled?.();}}
  function closeChoice(){const dlg=document.getElementById(DIALOG_ID);if(dlg?.open)try{dlg.close();}catch(e){}}
  function showChoice(note=''){
    if(!armed)return;let dlg=document.getElementById(DIALOG_ID);
    if(!dlg){
      dlg=document.createElement('dialog');dlg.id=DIALOG_ID;
      dlg.innerHTML=`<div class="modal" style="max-width:520px"><h2>Choose project storage</h2><p style="line-height:1.45">Pad Grade can use a folder you choose for durable project files. Those files can survive an app uninstall and can be used to restore your projects after reinstalling.</p><p class="small">You do not have to enable this now. If you continue without a durable folder, projects stay in the app's local storage and you can connect a folder later from Projects.</p><div id="pgFirstRunStorageNote" class="small" style="min-height:1.2em;margin:8px 0;color:#e7c66a"></div><div class="modalActions"><button id="pgFirstRunLocal">Not now</button><button id="pgFirstRunDurable" class="primary">Choose durable folder</button></div></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('cancel',event=>{event.preventDefault();writeDefaultProject(false);});
      dlg.querySelector('#pgFirstRunLocal').onclick=()=>writeDefaultProject(false);
      dlg.querySelector('#pgFirstRunDurable').onclick=()=>{closeChoice();requestFolder();};
    }
    const noteEl=dlg.querySelector('#pgFirstRunStorageNote');if(noteEl)noteEl.textContent=note;if(!dlg.open)try{dlg.showModal();}catch(e){dlg.setAttribute('open','');}
  }

  window.__padGradeProjectFolderSelectionCancelled=function(){if(!armed)return;pickerRequested=false;showChoice('Folder selection was canceled. Choose a folder, or continue locally for now.');};
  window.addEventListener('padgrade-project-folder-selected',()=>{pickerRequested=false;waitForIndex();});
  window.addEventListener('padgrade-project-folder-indexed',finalizeAfterIndex);
  window.addEventListener('padgrade-projects-reconciled',()=>{if(armed&&hasFolder()&&indexReady())finalizeAfterIndex();});

  if(isAndroid()&&!hasExistingLocalState()){
    armed=true;window.__padGradeFirstRunPending=true;installSentinel();localStorage.setItem(PROMPT_KEY,'1');
    const start=()=>{if(hasFolder())waitForIndex();else showChoice();};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,80),{once:true});else setTimeout(start,80);
  }

  window.__padGradeFirstRunPolicyV091='explain-opt-in-before-durable-folder-picker';
  window.__padGradeFirstRunRecoveryCurtainPolicyV091='only-existing-durable-project-recovery-reload';
  window.addEventListener('beforeunload',()=>{if(indexTimer)clearInterval(indexTimer);if(finalizeTimer)clearTimeout(finalizeTimer);},{once:true});
})();
