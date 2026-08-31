/* Pad Grade v1.2.7 DEV — strict base-map startup curtain gate.
 *
 * Loaded immediately after the recovery-visual primitive and BEFORE v1.2.7's
 * higher-level recovery wrapper. This makes the base-map requirement impossible
 * for the older 6-second recovery failsafe or the v1.1.1 partial-reveal path to
 * bypass. The ordinary workspace stays covered until v1.2.7 reports that the
 * primary MapLibre map has produced a real rendered frame.
 *
 * This gate intentionally does NOT wait for heatmap, GPS fix, NAIP refinement,
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
    if(document.getElementById('pg127StrictBaseMapGateStyle'))return;
    const style=document.createElement('style');style.id='pg127StrictBaseMapGateStyle';
    style.textContent=`
      html.padGradeRecoveryHold.${GATE_CLASS}.pg111RuntimeReady body>*{visibility:hidden!important}
      html.padGradeRecoveryHold.${GATE_CLASS}.pg111RuntimeReady body::before{display:flex!important;visibility:visible!important}
      html.padGradeRecoveryHold.${GATE_CLASS}.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice,
      html.padGradeRecoveryHold.${GATE_CLASS}.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice *{visibility:visible!important}
    `;
    document.head.appendChild(style);
  }
  function keepCovered(reason){
    if(rendered())return false;
    root.classList.add(GATE_CLASS);
    // Re-arm the historical recovery hold so its internal 6-second failsafe can
    // never uncover a still-unrendered base map.
    try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    if(reason)mark('recovery.v127-base-map-cover-kept',{reason});
    return true;
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

  if(typeof originalEnd==='function'&&!originalEnd.__padGradeV127StrictMapGate){
    const wrapped=function(){
      if(!rendered()){
        pendingEnd=true;keepCovered('end-request-before-base-map-render');
        mark('recovery.v127-base-map-release-held',{baseMapRendered:false});
        return;
      }
      pendingEnd=false;root.classList.remove(GATE_CLASS);return originalEnd();
    };
    wrapped.__padGradeV127StrictMapGate=true;
    wrapped.__padGradeV127StrictMapGateBase=originalEnd;
    window.__padGradeEndRecoveryVisualHold=wrapped;
  }

  ensureStyle();
  if(root.classList.contains('padGradeRecoveryHold'))keepCovered('startup-install');
  window.addEventListener('padgrade-base-map-rendered',()=>releaseIfReady('base-map-rendered'));
  keepalive=setInterval(()=>{
    ensureStyle();
    if(rendered()){
      root.classList.remove(GATE_CLASS);
      if(pendingEnd)releaseIfReady('keepalive-observed-render');
      return;
    }
    if(root.classList.contains('padGradeRecoveryHold')||pendingEnd)keepCovered();
  },750);
  window.addEventListener('beforeunload',()=>{if(keepalive)clearInterval(keepalive);},{once:true});
  mark('recovery.v127-strict-base-map-gate-installed',{version:VERSION,waitsForBaseMap:true,waitsForHeat:false,waitsForGps:false,overridesLegacyFailsafe:true});
})();
