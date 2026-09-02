/* Pad Grade v1.2.5 DEV — renderer-pressure cleanup + project-switch visual boundary.
 *
 * v1.2.5 intentionally preserves the v1.2.2 flickerless completed-canvas heat
 * presentation. The changes here only authorize the legacy v1.2.0 compatibility
 * controller to use a lightweight frame token instead of synchronously PNG-encoding
 * a canvas that v1.2.2 will copy directly anyway, and keep the Projects dialog on
 * screen until a successful in-place project switch has staged the replacement map.
 */
(function installPadGrade125Dev(){
  'use strict';
  if(window.__padGradeDevV125)return;
  window.__padGradeDevV125=true;

  const VERSION='1.2.5';
  // Explicit opt-in consumed by v120-dev.js. The v1.2.2 controller remains the
  // authoritative presentation path; this only removes its obsolete PNG precursor.
  window.__padGradeDirectCanvasTokenTransportV125=true;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  let switchActive=false;
  let pendingClose=null;
  let observer=null;

  function setVersionTitle(){try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}}
  function twoPaints(callback){
    const raf=typeof requestAnimationFrame==='function'?requestAnimationFrame.bind(window):fn=>setTimeout(fn,16);
    raf(()=>raf(callback));
  }
  function patchProjectsDialog(){
    const dlg=document.getElementById('projectsDlg');
    if(!dlg||dlg.__padGradeV125PaintBarrier)return !!dlg;
    let nativeClose=null;try{nativeClose=dlg.close.bind(dlg);}catch(e){return false;}
    dlg.__padGradeV125PaintBarrier=true;
    dlg.close=function(...args){
      if(!switchActive)return nativeClose(...args);
      pendingClose={dlg,nativeClose,args,queuedAt:(performance.now?.()||Date.now())};
      mark('project.switch-dialog-close-held',{version:VERSION,reason:'await-target-paint'});
    };
    return true;
  }
  function releaseSuccessfulSwitch(){
    const held=pendingClose;if(!held){switchActive=false;return;}
    twoPaints(()=>{
      if(pendingClose!==held)return;
      pendingClose=null;switchActive=false;
      try{held.nativeClose(...held.args);}catch(e){try{held.dlg.removeAttribute('open');}catch(_) {}}
      mark('project.switch-dialog-closed-after-target-paint',{version:VERSION,paintBarrierFrames:2,heldMs:Math.max(0,(performance.now?.()||Date.now())-held.queuedAt)});
    });
  }
  function cancelHeldClose(reason){
    if(pendingClose)mark('project.switch-dialog-close-cancelled',{version:VERSION,reason});
    pendingClose=null;switchActive=false;
  }
  function installDiagnosticBoundaryHook(){
    const d=window.PadGradeDiag;
    if(!d||typeof d.mark!=='function'||d.__padGradeV125Wrapped)return false;
    const original=d.mark.bind(d);d.__padGradeV125Wrapped=true;
    d.mark=function(name,details){
      if(name==='project.switch-v113-start'){switchActive=true;patchProjectsDialog();}
      const result=original(name,details);
      if(name==='project.switch-v113-complete')releaseSuccessfulSwitch();
      else if(name==='project.switch-v113-load-failed'||name==='project.switch-v113-apply-failed')cancelHeldClose(name);
      return result;
    };
    original('v125.project-switch-boundary-installed',{version:VERSION,dialogHeldThroughSuccessfulApply:true,paintBarrierFrames:2});
    return true;
  }
  function attach(){patchProjectsDialog();installDiagnosticBoundaryHook();setVersionTitle();}

  attach();
  if(window.MutationObserver){observer=new MutationObserver(()=>patchProjectsDialog());observer.observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
  window.addEventListener('load',attach,{once:true});
  window.addEventListener('beforeunload',()=>{try{observer?.disconnect?.();}catch(e){}},{once:true});

  window.__padGradeProjectSwitchVisualPolicyV125='hold-project-dialog-through-target-apply-two-paint-barrier-before-close';
  window.__padGradeHeatTransportOptimizationV125='completed-canvas-token-no-legacy-png-encode-v122-presentation-unchanged';
  mark('v125.installed',{version:VERSION,indexedDbDiagnosticsExpected:true,legacyHeatPngEncodeExpected:false,projectDialogPaintBarrier:true});
})();
