/* Pad Grade v0.8.7 DEV — Android/system Back closes temporary comparison first. */
(function installPadGrade087CompareBack(){
  'use strict';
  const TRAP_ID='pgCompareBackTrapV087';
  let observer=null;

  function removeTrap(){const trap=document.getElementById(TRAP_ID);if(trap)trap.remove();}
  function ensureTrap(){
    const overlay=document.getElementById('pgCompareOverlay');
    if(!overlay){removeTrap();return;}
    if(document.getElementById(TRAP_ID))return;
    // MainActivity already treats the topmost dialog[open] as the first Back
    // target. An invisible non-modal dialog lets that native path close Compare
    // without changing the comparison overlay's visual/top-layer behavior.
    const trap=document.createElement('dialog');
    trap.id=TRAP_ID;
    trap.style.display='none';
    document.body.appendChild(trap);
    try{trap.show();}catch(e){trap.setAttribute('open','');}
    trap.addEventListener('close',()=>{
      if(document.getElementById('pgCompareOverlay')){
        try{window.PadGradeProjectCompare?.close?.();}catch(e){}
      }
      removeTrap();
    },{once:true});
  }

  function sync(){if(document.getElementById('pgCompareOverlay'))ensureTrap();else removeTrap();}
  observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true});
  document.addEventListener('click',event=>{if(event.target?.id==='projectCompareStart')setTimeout(sync,0);});
  sync();
  window.addEventListener('beforeunload',()=>{observer?.disconnect();removeTrap();},{once:true});
  window.__padGradeCompareBackPolicyV087='system-back-exits-compare-before-app';
})();
