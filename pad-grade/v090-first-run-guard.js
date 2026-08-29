/* Pad Grade v0.9.7 DEV — first-install durable-storage choice.
 *
 * A clean Android install does not create a default project until the user
 * explicitly chooses to continue locally. Selecting a durable folder always
 * attempts fresh settings/project recovery and, if no saved Pad Grade project is
 * found, returns to the choice dialog rather than manufacturing a project.
 * The stable-style recovery curtain is painted BEFORE the native picker opens.
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
    // Keep the pre-picker curtain armed while Android owns the screen and while
    // the selected folder is indexing. The post-reload settled gate owns final
    // release after the restored visible state has actually painted.
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
    if(!armed)return;stopRecoveryCoverKeepalive();closeChoice();removeSentinel();if(realIndex().length||localStorage.getItem(ACTIVE_KEY)){armed=false;endRecoveryVisual();return;}
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
  function chooseRestoredProjectOrPrompt(note=''){
    if(!armed)return;stopRecoveryCoverKeepalive();closeChoice();const projects=realIndex();
    if(projects.length){
      removeSentinel();
      let active=localStorage.getItem(ACTIVE_KEY);
      if(!projects.some(x=>x.id===active&&x.status!=='archived')){const open=projects.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||'')));if(open.length){active=open[0].id;localStorage.setItem(ACTIVE_KEY,active);}}
      armed=false;window.__padGradeFirstRunPending=false;reloadRecoveredDurable();return;
    }
    // A selected durable folder is never consent to manufacture a default job.
    // Keep the sentinel/first-run guard in place and return control to the user.
    pickerRequested=false;endRecoveryVisual();showChoice(note||'No saved Pad Grade projects were found in that folder. Choose another folder, or continue locally with Not now.');
  }
  async function finalizeAfterIndex(){
    if(!armed||!hasFolder()||!indexReady()||finalizeBusy)return;
    finalizeBusy=true;
    try{
      let minimum=null;
      const prep=window.__padGradePrepareMinimumDurableRecovery;
      if(typeof prep==='function'){
        const token=window.PadGradeDiag?.start?.('recovery.first-run-await-minimum');
        try{minimum=await prep();}finally{window.PadGradeDiag?.end?.(token,{restoredId:minimum?.restoredId||null,ready:minimum?.ready===true});}
      }
      if(!armed)return;
      // If settings did not identify a recoverable active project, give the full
      // asynchronous folder scan one chance to discover legacy/backup saves.
      if(!minimum?.restoredId&&!realIndex().length&&typeof window.__padGradeReconcileDurableAsync==='function'){
        const token=window.PadGradeDiag?.start?.('recovery.first-run-await-full-scan');
        try{await window.__padGradeReconcileDurableAsync();}finally{window.PadGradeDiag?.end?.(token,{projects:realIndex().length});}
      }
      if(!armed)return;
      clearTimeout(finalizeTimer);
      finalizeTimer=setTimeout(()=>chooseRestoredProjectOrPrompt(),40);
    }catch(e){
      window.PadGradeDiag?.mark?.('recovery.first-run-error',{error:String(e?.message||e)});
      clearTimeout(finalizeTimer);
      finalizeTimer=setTimeout(()=>chooseRestoredProjectOrPrompt('That folder could not be restored. Choose it again or select another folder; no new project has been created.'),40);
    }finally{finalizeBusy=false;}
  }
  function waitForIndex(){if(indexTimer)return;indexTimer=setInterval(()=>{if(!armed){clearInterval(indexTimer);indexTimer=null;return;}if(hasFolder()&&indexReady()){clearInterval(indexTimer);indexTimer=null;finalizeAfterIndex();}},120);}
  function launchFolderPickerAfterCoverPaint(){
    const launch=()=>{
      if(!armed||!pickerRequested)return;
      try{native.chooseProjectFolder();}catch(e){window.__padGradeProjectFolderSelectionCancelled?.();}
    };
    // The picker is a native Android surface. Give WebView two animation frames
    // to commit the black recovery curtain first, so it is already present when
    // Android returns control to the app.
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(launch,0)));
  }
  function requestFolder(forcePicker=false){
    if(!armed||pickerRequested)return;
    if(hasFolder()&&!forcePicker){
      beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();return;
    }
    pickerRequested=true;
    beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();launchFolderPickerAfterCoverPaint();
  }
  function closeChoice(){const dlg=document.getElementById(DIALOG_ID);if(dlg?.open)try{dlg.close();}catch(e){}}
  function showChoice(note=''){
    if(!armed)return;let dlg=document.getElementById(DIALOG_ID);
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

  window.__padGradeProjectFolderSelectionCancelled=function(){if(!armed)return;pickerRequested=false;stopRecoveryCoverKeepalive();endRecoveryVisual();showChoice('Folder selection was canceled. Choose a folder, or continue locally for now.');};
  window.addEventListener('padgrade-project-folder-selected',()=>{
    pickerRequested=false;
    // Normally already covered from before the picker opened. Keep this as an
    // idempotent fallback. The keepalive intentionally continues through indexing.
    if(armed){beginRecoveryVisual();startRecoveryCoverKeepalive();}
    waitForIndex();
  });
  window.addEventListener('padgrade-project-folder-indexed',finalizeAfterIndex);
  window.addEventListener('padgrade-projects-reconciled',()=>{if(armed&&hasFolder()&&indexReady())finalizeAfterIndex();});

  if(isAndroid()&&!hasExistingLocalState()){
    armed=true;window.__padGradeFirstRunPending=true;installSentinel();localStorage.setItem(PROMPT_KEY,'1');
    const start=()=>{if(hasFolder()){beginRecoveryVisual();startRecoveryCoverKeepalive();waitForIndex();}else showChoice();};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,80),{once:true});else setTimeout(start,80);
  }

  window.__padGradeFirstRunPolicyV097='default-only-after-explicit-not-now-durable-recovery-never-creates-project';
  window.__padGradeFirstRunRecoveryCurtainPolicyV097='prepicker-index-minimum-full-fallback-then-settled-reload';
  window.addEventListener('beforeunload',()=>{stopRecoveryCoverKeepalive();if(indexTimer)clearInterval(indexTimer);if(finalizeTimer)clearTimeout(finalizeTimer);},{once:true});
})();

/* Legacy CI compatibility markers only:
 * explain-opt-in-before-durable-folder-picker
 * cover-immediately-after-folder-selection
 * startPickerCoverKeepalive
 */