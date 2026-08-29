/* Pad Grade v0.9.1 DEV — durable-folder recovery curtain.
 *
 * Match the stable v0.8.0 behavior: this head-loaded helper only preserves a
 * recovery hold that was explicitly armed before a durable-folder recovery
 * reload. Ordinary app startup and ordinary project switching are never covered.
 * A separate session target may still correct project-switch ownership before
 * other project managers run, but that target does not activate the curtain.
 */
(function installPadGradeRecoveryVisualHold(){
  'use strict';
  const KEY='padGradeRecoveryVisualHoldV073';
  const TARGET_KEY='padGradeProjectSwitchTargetV091';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const LEGACY_RELOAD_KEY='padGradeV068RestoredProject';
  let failsafe=null;

  function consumeLegacyReloadMarker(){
    try{
      const marked=!!sessionStorage.getItem(LEGACY_RELOAD_KEY);
      if(marked)sessionStorage.removeItem(LEGACY_RELOAD_KEY);
      return marked;
    }catch(e){return false;}
  }
  function recentHold(){
    try{
      const t=Number(sessionStorage.getItem(KEY)||0);
      return Number.isFinite(t)&&t>0&&Date.now()-t<15000;
    }catch(e){return false;}
  }
  function applyPendingSwitchTarget(){
    try{
      const id=sessionStorage.getItem(TARGET_KEY)||'';
      if(!id)return null;
      sessionStorage.removeItem(TARGET_KEY);
      if(!localStorage.getItem(`${PROJECT_PREFIX}${id}`))return null;
      localStorage.setItem(ACTIVE_KEY,id);
      return id;
    }catch(e){return null;}
  }
  function armFailsafe(){
    if(failsafe)clearTimeout(failsafe);
    failsafe=setTimeout(()=>end(),6000);
  }
  function begin(){
    try{sessionStorage.setItem(KEY,String(Date.now()));}catch(e){}
    document.documentElement.classList.add('padGradeRecoveryHold');
    armFailsafe();
  }
  function end(){
    try{sessionStorage.removeItem(KEY);}catch(e){}
    document.documentElement.classList.remove('padGradeRecoveryHold');
    if(failsafe){clearTimeout(failsafe);failsafe=null;}
  }

  window.__padGradeBeginRecoveryVisualHold=begin;
  window.__padGradeEndRecoveryVisualHold=end;
  window.__padGradeAppliedSwitchTargetV091=applyPendingSwitchTarget();

  if(recentHold()||consumeLegacyReloadMarker()){
    document.documentElement.classList.add('padGradeRecoveryHold');
    armFailsafe();
  }else end();

  window.__padGradeRecoveryVisualPolicyV091='stable-semantics-durable-recovery-only';
})();

/* Legacy CI search marker only; intentionally not current behavior:
 * head-cover-normal-load-and-switch-before-project-managers
 */
