/* Pad Grade v0.8.10 DEV — prepaint recovery/project-transition curtain.
 *
 * The hold is installed in <head>, before any project manager can paint. A
 * project switch also carries its intended target through the navigation in
 * sessionStorage so an older beforeunload autosave cannot rewrite the active
 * project back to the project we are leaving.
 */
(function installPadGradeRecoveryVisualHold(){
  'use strict';
  const KEY='padGradeRecoveryVisualHoldV073';
  const MODE_KEY='padGradeRecoveryVisualModeV091';
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
  function pendingSwitchTarget(){
    try{
      const id=sessionStorage.getItem(TARGET_KEY)||'';
      if(!id)return null;
      // Only honor a target that is already a real local project. This marker
      // is never allowed to manufacture or select an unknown project.
      const raw=localStorage.getItem(`${PROJECT_PREFIX}${id}`);
      if(!raw)return null;
      localStorage.setItem(ACTIVE_KEY,id);
      return id;
    }catch(e){return null;}
  }
  function applyMode(mode){
    const root=document.documentElement;
    root.classList.toggle('padGradeProjectSwitchHold',mode==='project-switch');
  }
  function armFailsafe(){
    if(failsafe)clearTimeout(failsafe);
    failsafe=setTimeout(()=>end(),6000);
  }
  function begin(mode='recovery'){
    try{
      sessionStorage.setItem(KEY,String(Date.now()));
      sessionStorage.setItem(MODE_KEY,mode);
    }catch(e){}
    document.documentElement.classList.add('padGradeRecoveryHold');
    applyMode(mode);
    armFailsafe();
  }
  function end(){
    try{
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(MODE_KEY);
      sessionStorage.removeItem(TARGET_KEY);
    }catch(e){}
    document.documentElement.classList.remove('padGradeRecoveryHold','padGradeProjectSwitchHold');
    if(failsafe){clearTimeout(failsafe);failsafe=null;}
  }
  function armProjectSwitch(id){
    if(!id)return false;
    try{sessionStorage.setItem(TARGET_KEY,String(id));}catch(e){}
    window.__padGradeProjectSwitchInProgress=true;
    begin('project-switch');
    return true;
  }

  window.__padGradeBeginRecoveryVisualHold=begin;
  window.__padGradeBeginProjectTransition=armProjectSwitch;
  window.__padGradeEndRecoveryVisualHold=end;

  const switchTarget=pendingSwitchTarget();
  if(switchTarget){
    window.__padGradeProjectSwitchInProgress=true;
    begin('project-switch');
  }else if(recentHold()||consumeLegacyReloadMarker()){
    let mode='recovery';try{mode=sessionStorage.getItem(MODE_KEY)||'recovery';}catch(e){}
    document.documentElement.classList.add('padGradeRecoveryHold');
    applyMode(mode);
    armFailsafe();
  }else end();

  window.__padGradeRecoveryVisualPolicyV091='head-cover-switch-target-before-project-managers';
})();
