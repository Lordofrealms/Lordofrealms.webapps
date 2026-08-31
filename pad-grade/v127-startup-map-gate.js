/* Pad Grade v1.2.7 DEV — base-map-preferred startup curtain gate.
 *
 * Loaded immediately after the recovery-visual primitive and BEFORE v1.2.7's
 * higher-level recovery wrapper. Normal recovery prefers to keep the workspace
 * covered until the primary MapLibre map has produced a real rendered frame.
 *
 * IMPORTANT: the historical recovery primitive's 6-second maximum reveal time
 * remains authoritative. This layer MUST NOT call begin() merely to extend the
 * map wait. recovery-visual-v073.js owns that safety timeout and may uncover the
 * app after 6 seconds if MapLibre has still not rendered.
 *
 * First-run directory selection is separate: the existing first-run controller
 * may intentionally call begin() again while the user is still choosing durable
 * storage, which renews the same 6-second timer. This module does not change or
 * duplicate that behavior.
 *
 * The gate intentionally does NOT wait for heatmap, GPS fix, NAIP refinement,
 * project overlays, or any other secondary content.
 */
(function installPadGrade127StartupMapGate(){
  'use strict';
  if(window.__padGradeV127StartupMapGate)return;
  window.__padGradeV127StartupMapGate=true;

  const VERSION='1.2.7';
  const root=document.documentElement;
  const GATE_CLASS='padGradeV127BaseMapGate';
  const originalEnd=window.__padGradeEndRecoveryVisualHold;
  let pendingEnd=false;
  let keepalive=null;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const rendered=()=>window.__padGradeBaseMapRenderedV127===true;
  function ensureStyle(){
    if(document.getElementById('pg127StartupMapGateStyle'))return;
    const style=document.createElement('style');style.id='pg127StartupMapGateStyle';
    style.textContent=`
      html.padGradeRecoveryHold.${GATE_CLASS}.pg111RuntimeReady body>*{visibility:hidden!important}
      html.padGradeRecoveryHold.${GATE_CLASS}.pg111RuntimeReady body::before{display:flex!important;visibility:visible!important}
      html.padGradeRecoveryHold.${GATE_CLASS}.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice,
      html.padGradeRecoveryHold.${GATE_CLASS}.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice *{visibility:visible!important}
    `;
    document.head.appendChild(style);
  }
  function keepCovered(reason){
    if(rendered()||!root.classList.contains('padGradeRecoveryHold'))return false;
    root.classList.add(GATE_CLASS);
    // Deliberately DO NOT call __padGradeBeginRecoveryVisualHold here. Doing so
    // would reset the recovery primitive's 6-second safety timeout and turn this
    // preference into an unbounded map wait.
    if(reason)mark('recovery.v127-base-map-cover-kept',{reason,preservesSixSecondSafetyCap:true});
    return true;
  }
  function observeSafetyRelease(){
    if(root.classList.contains('padGradeRecoveryHold'))return false;
    if(root.classList.contains(GATE_CLASS)||pendingEnd){
      root.classList.remove(GATE_CLASS);pendingEnd=false;
      mark('recovery.v127-base-map-gate-safety-released',{baseMapRendered:rendered(),reason:'legacy-six-second-max'});
      return true;
    }
    return false;
  }
  function releaseIfReady(reason){
    if(!rendered())return false;
    root.classList.remove(GATE_CLASS);
    if(!pendingEnd)return true;
    pendingEnd=false;
    mark('recovery.v127-base-map-gate-released',{reason});
    try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}
    return true;
  }

  if(typeof originalEnd==='function'&&!originalEnd.__padGradeV127MapPreferenceGate){
    const wrapped=function(){
      if(!rendered()&&root.classList.contains('padGradeRecoveryHold')){
        pendingEnd=true;keepCovered('end-request-before-base-map-render');
        mark('recovery.v127-base-map-release-held',{baseMapRendered:false,safetyMaxMs:6000});
        return;
      }
      pendingEnd=false;root.classList.remove(GATE_CLASS);return originalEnd();
    };
    wrapped.__padGradeV127MapPreferenceGate=true;
    wrapped.__padGradeV127MapPreferenceGateBase=originalEnd;
    window.__padGradeEndRecoveryVisualHold=wrapped;
  }

  ensureStyle();
  if(root.classList.contains('padGradeRecoveryHold'))keepCovered('startup-install');
  window.addEventListener('padgrade-base-map-rendered',()=>releaseIfReady('base-map-rendered'));
  keepalive=setInterval(()=>{
    ensureStyle();
    if(observeSafetyRelease())return;
    if(rendered()){
      root.classList.remove(GATE_CLASS);
      if(pendingEnd)releaseIfReady('keepalive-observed-render');
      return;
    }
    if(root.classList.contains('padGradeRecoveryHold')||pendingEnd)keepCovered();
  },750);
  window.addEventListener('beforeunload',()=>{if(keepalive)clearInterval(keepalive);},{once:true});
  mark('recovery.v127-base-map-preference-gate-installed',{version:VERSION,waitsForBaseMap:true,waitsForHeat:false,waitsForGps:false,preservesLegacyFailsafe:true,safetyMaxMs:6000});
})();
