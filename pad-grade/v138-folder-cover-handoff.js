/* Pad Grade v1.3.8 DEV — folder-picker cover -> restoring-cover ownership handoff.
 *
 * No new cover is created. v1.2.7 uses the shared padGradeRecoveryHold pseudo-element
 * for both first-run folder selection and restoration, but while the picker is active
 * it adds padGradeFirstRunSetupV127, which changes the pseudo-element text to
 * "Choose project storage to continue". v1.3.7 re-armed padGradeRecoveryHold after a
 * successful Android folder result but did not retire that picker-specific class.
 *
 * v1.3.8 changes only that ownership transition: once the Android result callback
 * re-arms the existing recovery hold while the system picker still owns the screen,
 * remove/suppress the picker override so the first Pad Grade frame exposed afterward
 * is the same existing "Restoring saved project…" cover. Cancellation/failure returns
 * ownership to the existing folder-choice state. Recovery, reload and map-ready release
 * semantics remain untouched.
 */
(function installPadGrade138FolderCoverHandoff(){
  'use strict';
  if(window.__padGradeV138FolderCoverHandoff)return;
  window.__padGradeV138FolderCoverHandoff=true;

  const ROOT=document.documentElement;
  const PICKER_CLASS='padGradeFirstRunSetupV127';
  const DIALOG_ID='pgFirstRunStorageChoice';
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  let pickerActive=false;
  let restoreOwnership=false;
  let promoted=false;
  let mutatingClass=false;

  function setPublicState(){
    window.__padGradeFolderPickerActiveV138=pickerActive;
    window.__padGradeFolderRestoreOwnershipV138=restoreOwnership;
  }
  function removePickerOverride(){
    if(!ROOT.classList.contains(PICKER_CLASS))return false;
    mutatingClass=true;
    try{ROOT.classList.remove(PICKER_CLASS);}finally{mutatingClass=false;}
    return true;
  }
  function addPickerOverride(){
    if(ROOT.classList.contains(PICKER_CLASS))return false;
    mutatingClass=true;
    try{ROOT.classList.add(PICKER_CLASS);}finally{mutatingClass=false;}
    return true;
  }
  function armPicker(){
    pickerActive=true;
    restoreOwnership=false;
    promoted=false;
    setPublicState();
    mark('recovery.v138-folder-picker-cover-owned',{existingRecoveryCover:true,noNewCover:true,pickerOverride:true});
  }
  function promoteToRestoring(reason){
    if(!(pickerActive||window.__padGradeFolderPickerActiveV138===true))return false;
    restoreOwnership=true;
    removePickerOverride();
    setPublicState();
    if(!promoted){
      promoted=true;
      mark('recovery.v138-picker-cover-promoted-to-restoring',{
        reason,
        existingRecoveryCover:true,
        noNewCover:true,
        pickerOverrideRemoved:true,
        samePseudoElement:true,
        recoveryHoldPresent:ROOT.classList.contains('padGradeRecoveryHold')
      });
    }
    return true;
  }
  function returnToFolderChoice(reason){
    pickerActive=false;
    restoreOwnership=false;
    promoted=false;
    setPublicState();
    if(window.__padGradeFirstRunPending===true)addPickerOverride();
    mark('recovery.v138-restoring-ownership-returned-to-folder-choice',{reason,existingRecoveryCover:true,noNewCover:true});
  }

  // The durable button exists dynamically, so capture its click at document level.
  // v090 paints the existing picker cover before launching Android's document-tree UI.
  document.addEventListener('click',event=>{
    const id=event.target?.closest?.('button')?.id||'';
    if(id==='pgFirstRunDurable')armPicker();
  },true);

  // v1.3.7's native success callback invokes this function while the app is still
  // hidden behind the system picker. Wrap it so the shared cover is promoted before
  // Android can expose Pad Grade again.
  const baseBegin=window.__padGradeBeginRecoveryVisualHold;
  if(typeof baseBegin==='function'&&!baseBegin.__padGradeV138FolderCoverHandoff){
    const wrapped=function(){
      const out=baseBegin.apply(this,arguments);
      if((pickerActive||window.__padGradeFolderPickerActiveV138===true) && document.visibilityState==='hidden'){
        promoteToRestoring('successful-folder-result-hidden-handoff');
      }else if(restoreOwnership){
        removePickerOverride();
      }
      return out;
    };
    wrapped.__padGradeV138FolderCoverHandoff=true;
    wrapped.__padGradeV138Base=baseBegin;
    window.__padGradeBeginRecoveryVisualHold=wrapped;
  }

  // v1.2.7 has a first-run keepalive that may re-add its picker override while the
  // durable recovery is still in progress. Suppress only that class while restoration
  // owns the already-existing recovery cover.
  const classObserver=new MutationObserver(()=>{
    if(mutatingClass||!restoreOwnership)return;
    if(ROOT.classList.contains(PICKER_CLASS))removePickerOverride();
  });
  classObserver.observe(ROOT,{attributes:true,attributeFilter:['class']});

  // Cancellation must retain the pre-v1.3.8 behavior: return to the folder-choice
  // dialog/cover rather than remaining in restoring state.
  const baseCancel=window.__padGradeProjectFolderSelectionCancelled;
  if(typeof baseCancel==='function'&&!baseCancel.__padGradeV138FolderCoverHandoff){
    const wrappedCancel=function(){
      pickerActive=false;restoreOwnership=false;promoted=false;setPublicState();
      const out=baseCancel.apply(this,arguments);
      if(window.__padGradeFirstRunPending===true)addPickerOverride();
      return out;
    };
    wrappedCancel.__padGradeV138FolderCoverHandoff=true;
    wrappedCancel.__padGradeV138Base=baseCancel;
    window.__padGradeProjectFolderSelectionCancelled=wrappedCancel;
  }

  // The successful event means Android accepted the folder. Stop calling it a picker
  // operation, but keep restoration ownership through indexing/recovery and reload.
  window.addEventListener('padgrade-project-folder-selected',()=>{
    pickerActive=false;setPublicState();
    if(restoreOwnership)removePickerOverride();
  });

  // If durable recovery rejects the folder and v090 re-opens the existing choice
  // dialog, explicitly hand ownership back to the picker state.
  const choiceObserver=new MutationObserver(()=>{
    if(!restoreOwnership)return;
    const dlg=document.getElementById(DIALOG_ID);
    if(dlg?.open)returnToFolderChoice('folder-choice-reopened');
  });
  if(document.body)choiceObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});

  window.addEventListener('beforeunload',()=>{classObserver.disconnect();choiceObserver.disconnect();},{once:true});
  setPublicState();
  mark('recovery.v138-folder-cover-handoff-installed',{
    version:'1.3.8',build:110,
    existingRecoveryCover:true,noNewCover:true,
    samePseudoElement:true,
    heatmapChanged:false,imageryChanged:false
  });
})();
