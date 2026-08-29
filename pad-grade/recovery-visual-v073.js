/* Pad Grade v0.9.0 DEV — prepaint project/recovery transition curtain.
 *
 * The hold is installed in <head>, before any project manager can paint. Normal
 * startup with an existing active project gets a brief local-project cover. A
 * project switch also carries its intended target through navigation so an older
 * beforeunload autosave cannot rewrite the active project back to the one left.
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
      const raw=localStorage.getItem(`${PROJECT_PREFIX}${id}`);
      if(!raw)return null;
      localStorage.setItem(ACTIVE_KEY,id);
      return id;
    }catch(e){return null;}
  }
  function hasLocalActiveProject(){
    try{
      const id=localStorage.getItem(ACTIVE_KEY)||'';
      return !!(id&&localStorage.getItem(`${PROJECT_PREFIX}${id}`));
    }catch(e){return false;}
  }
  function applyMode(mode){
    const root=document.documentElement;
    root.classList.toggle('padGradeProjectSwitchHold',mode==='project-switch');
    root.classList.toggle('padGradeProjectLoadHold',mode==='project-load');
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
    window.__padGradeProjectSwitchInProgress=false;
    document.documentElement.classList.remove('padGradeRecoveryHold','padGradeProjectSwitchHold','padGradeProjectLoadHold');
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
  }else if(hasLocalActiveProject()){
    begin('project-load');
  }else end();

  window.__padGradeRecoveryVisualPolicyV091='head-cover-normal-load-and-switch-before-project-managers';
})();
