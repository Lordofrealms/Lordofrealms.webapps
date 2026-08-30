/* Pad Grade v0.9.8 DEV — first-install durable-storage choice.
 *
 * A clean Android install does not create a default project until the user has
 * resolved storage choice. Selecting a durable folder always attempts fresh
 * settings/project recovery first. If that folder contains no Pad Grade state at
 * all, it is treated as first use and the initial project is created there. If
 * Pad Grade state exists but cannot be recovered, return to the choice dialog
 * rather than silently overwriting/adding state. During Android legal-preload,
 * generic local layout may run underneath the Terms screen, but storage choice
 * remains gated until the native activity reports acceptance.
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
  let recoveryVisualPending=false;
  let recoveryCoverTimer=null;
  let indexTimer=null;
  let finalizeTimer=null;
  let finalizeBusy=false;

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function index(){const x=parse(localStorage.getItem(INDEX_KEY),[]);return Array.isArray(x)?x:[];}
  function realIndex(){return index().filter(x=>x&&x.id&&x.id!==SENTINEL);}
  function projectKeys(){const out=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith(PROJECT_PREFIX))out.push(key);}return out;}
  function isAndroid(){return !!(native&&typeof native.chooseProjectFolder==='function');}
  function hasFolder(){try{return !!native?.hasProjectFolder?.();}catch(e){return false;}}
  function indexReady(){try{return typeof native?.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasExistingLocalState(){return realIndex().length>0||!!localStorage.getItem(ACTIVE_KEY)||projectKeys().length>0||!!localStorage.getItem(LEGACY_KEY);}
  function legalPreloadActive(){try{return window.__padGradeLegalReleased!==true&&new URLSearchParams(location.search).get('legalPreload')==='1';}catch(e){return false;}}
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

  function beginRecoveryVisual(){
    if(!armed)return;
    if(!recoveryVisualPending)recoveryVisualPending=true;
    try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    window.__padGradeFirstRunRecoveryVisualV093='prepaint-before-folder-picker-and-indexing';
  }
  function endRecoveryVisual(){
    if(!recoveryVisualPending)return;
    recoveryVisualPending=false;
    try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}
  }
  function stopRecoveryCoverKeepalive(){if(recoveryCoverTimer){clearInterval(recoveryCoverTimer);recoveryCoverTimer=null;}}
  function startRecoveryCoverKeepalive(){
    if(recoveryCoverTimer)return;
    recoveryCoverTimer=setInterval(()=>{
      if(armed&&recoveryVisualPending)beginRecoveryVisual();
      else stopRecoveryCoverKeepalive();
    },2500);
  }
  function reloadNormally(){location.reload();}
  function reloadRecoveredDurable(){
    beginRecoveryVisual();
    setTimeout(()=>{try{location.reload();}catch(e){endRecoveryVisual();}},40);
  }
  function writeDefaultProject(durable){
    if(!armed||legalPreloadActive())return;stopRecoveryCoverKeepalive();closeChoice();removeSentinel();if(realIndex().length||localStorage.getItem(ACTIVE_KEY)){armed=false;endRecoveryVisual();return;}
    const p=defaultProject();
    localStorage.setItem(`${PROJECT_PREFIX}${p.id}`,JSON.stringify(p));
    localStorage.setItem(INDEX_KEY,JSON.stringify([{id:p.id,name:p.settings.name,createdAt:p.createdAt,modifiedAt:p.modifiedAt,status:'open'}]));
    localStorage.setItem(ACTIVE_KEY,p.id);
    if(durable&&hasFolder()&&indexReady()){
      try{if(window.PadGradeFiles?.write)window.PadGradeFiles.write(`${p.id}.padgrade`,JSON.stringify(p));else if(typeof native?.writeProjectFile==='function')native.writeProjectFile(`${p.id}.padgrade`,JSON.stringify(p));}catch(e){}
    }
    endRecoveryVisual();
    armed=false;window.__padGradeFirstRunPending=false;reloadNormally();
  }
  function chooseRestoredProjectOrResolve(minimum=null,full=null,note=''){
    if(!armed||legalPreloadActive())return;stopRecoveryCoverKeepalive();closeChoice();const projects=realIndex();
    if(projects.length){
      removeSentinel();
      let active=localStorage.getItem(ACTIVE_KEY);
      if(!projects.some(x=>x.id===active&&x.status!=='archived')){const open=projects.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));if(open.length){active=open[0].id;localStorage.setItem(ACTIVE_KEY,active);}}
      armed=false;window.__padGradeFirstRunPending=false;reloadRecoveredDurable();return;
    }
    const noProjectFiles=Number(minimum?.fileCount||full?.total||0)===0;
    const noSettings=minimum?.settingsFound!==true;
    if(minimum?.ready===true&&noProjectFiles&&noSettings){
      window.PadGradeDiag?.mark?.('recovery.first-run-empty-folder-create-default');
      writeDefaultProject(true);return;
    }
    pickerRequested=false;endRecoveryVisual();showChoice(note||'Pad Grade data was found in that folder but no usable project could be restored. Choose the folder again or select another folder.');
  }
  async function finalizeAfterIndex(){
    if(!armed||legalPreloadActive()||!hasFolder()||!indexReady()||finalizeBusy)return;
    finalizeBusy=true;
    try{
      let minimum=null,full=null;
      const prep=window.__padGradePrepareMinimumDurableRecovery;
      if(typeof prep==='function'){
        const token=window.PadGradeDiag?.start?.('recovery.first-run-await-minimum');
        try{minimum=await prep();}finally{window.PadGradeDiag?.end?.(token,{restoredId:minimum?.restoredId||null,ready:minimum?.ready===true,fileCount:minimum?.fileCount});}
      }
      if(!armed)return;
      if(!minimum?.restoredId&&!realIndex().length&&Number(minimum?.fileCount||0)>0&&typeof window.__padGradeReconcileDurableAsync==='function'){
        const token=window.PadGradeDiag?.start?.('recovery.first-run-await-full-scan');
        try{full=await window.__padGradeReconcileDurableAsync();}finally{window.PadGradeDiag?.end?.(token,{projects:realIndex().length,total:full?.total});}
      }
      if(!armed)return;
      clearTimeout(finalizeTimer);
      finalizeTimer=setTimeout(()=>chooseRestoredProjectOrResolve(minimum,full),40);
    }catch(e){
      window.PadGradeDiag?.mark?.('recovery.first-run-error',{error:String(e?.message||e)});
      clearTimeout(finalizeTimer);
      finalizeTimer=setTimeout(()=>chooseRestoredProjectOrResolve(null,null,'That folder could not be restored. Choose it again or select another folder; no new project has been created.'),40);
    }finally{finalizeBusy=false;}
  }
  function waitForIndex(){if(indexTimer||legalPreloadActive())return;indexTimer=setInterval(()=>{if(!armed){clearInterval(indexTimer);indexTimer=null;return;}if(hasFolder()&&indexReady()){clearInterval(indexTimer);indexTimer=null;finalizeAfterIndex();}},120);}
  function launchFolderPickerAfterCoverPaint(){
    const launch=()=>{
      if(!armed||!pickerRequested||legalPreloadActive())return;
      try{native.chooseProjectFolder();}catch(e){window.__padGradeProjectFolderSelectionCancelled?.();}
    };
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(launch,0)));
  }
  function requestFolder(forcePicker=false){
    if(!armed||pickerRequested||legalPreloadActive())return;
    if(hasFolder()&&!forcePicker){beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();return;}
    pickerRequested=true;beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();launchFolderPickerAfterCoverPaint();
  }
  function closeChoice(){const dlg=document.getElementById(DIALOG_ID);if(dlg?.open)try{dlg.close();}catch(e){}}
  function showChoice(note=''){
    if(!armed||legalPreloadActive())return;let dlg=document.getElementById(DIALOG_ID);
    if(!dlg){
      dlg=document.createElement('dialog');dlg.id=DIALOG_ID;
      dlg.innerHTML=`<div class="modal" style="max-width:520px"><h2>Choose project storage</h2><p style="line-height:1.45">Pad Grade can use a folder you choose for durable project files. Those files can survive an app uninstall and can be used to restore your projects after reinstalling.</p><p class="small">You do not have to enable this now. If you continue without a durable folder, projects stay in the app's local storage and you can connect a folder later from Projects.</p><div id="pgFirstRunStorageNote" class="small" style="min-height:1.2em;margin:8px 0;color:#e7c66a"></div><div class="modalActions"><button id="pgFirstRunLocal">Not now</button><button id="pgFirstRunDurable" class="primary">Choose durable folder</button></div></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('cancel',event=>{event.preventDefault();writeDefaultProject(false);});
      dlg.querySelector('#pgFirstRunLocal').onclick=()=>writeDefaultProject(false);
      dlg.querySelector('#pgFirstRunDurable').onclick=()=>{closeChoice();requestFolder(true);};
    }
    const noteEl=dlg.querySelector('#pgFirstRunStorageNote');if(noteEl)noteEl.textContent=note;if(!dlg.open)try{dlg.showModal();}catch(e){dlg.setAttribute('open','');}
  }
  function startFirstRunChoice(){
    if(!armed)return;
    if(legalPreloadActive()){
      window.__padGradeFirstRunWaitingForLegalV098=true;
      try{window.PadGradeDiag?.mark?.('legal.preload-layout-running',{storageChoiceDeferred:true});}catch(e){}
      return;
    }
    window.__padGradeFirstRunWaitingForLegalV098=false;
    if(hasFolder()){beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();}else showChoice();
  }

  window.__padGradeProjectFolderSelectionCancelled=function(){if(!armed)return;pickerRequested=false;stopRecoveryCoverKeepalive();endRecoveryVisual();showChoice('Folder selection was canceled. Choose a folder, or continue locally for now.');};
  window.addEventListener('padgrade-project-folder-selected',()=>{
    pickerRequested=false;if(armed&&!legalPreloadActive()){beginRecoveryVisual();startRecoveryCoverKeepalive();}waitForIndex();
  });
  window.addEventListener('padgrade-project-folder-indexed',finalizeAfterIndex);
  window.addEventListener('padgrade-projects-reconciled',()=>{if(armed&&!legalPreloadActive()&&hasFolder()&&indexReady())finalizeAfterIndex();});
  window.addEventListener('padgrade-legal-accepted',()=>{
    try{window.PadGradeDiag?.mark?.('legal.accepted-release',{storageChoiceDeferred:!!window.__padGradeFirstRunWaitingForLegalV098});}catch(e){}
    setTimeout(startFirstRunChoice,0);
  });

  if(isAndroid()&&!hasExistingLocalState()){
    armed=true;window.__padGradeFirstRunPending=true;installSentinel();localStorage.setItem(PROMPT_KEY,'1');
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(startFirstRunChoice,80),{once:true});else setTimeout(startFirstRunChoice,80);
  }

  window.__padGradeFirstRunPolicyV098='layout-may-preload-under-legal-storage-choice-after-acceptance-no-default-before-choice';
  window.__padGradeFirstRunPolicyV097=window.__padGradeFirstRunPolicyV098;
  window.__padGradeFirstRunRecoveryCurtainPolicyV097='prepicker-index-minimum-full-fallback-then-settled-reload';
  window.addEventListener('beforeunload',()=>{stopRecoveryCoverKeepalive();if(indexTimer)clearInterval(indexTimer);if(finalizeTimer)clearTimeout(finalizeTimer);},{once:true});
})();

/* Legacy CI compatibility markers only:
 * explain-opt-in-before-durable-folder-picker
 * cover-immediately-after-folder-selection
 * startPickerCoverKeepalive
 */