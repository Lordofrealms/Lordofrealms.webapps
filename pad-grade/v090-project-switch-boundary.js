/* Pad Grade v0.9.1 DEV — atomic project switching without a visual curtain.
 *
 * Ordinary project changes must not reuse the durable-recovery cover. Intercept
 * an Open click before legacy managers can apply anything in-place, carry only
 * the intended target through sessionStorage, and reload. The head recovery
 * helper applies that target before project-manager scripts run in the new page.
 */
(function installPadGrade090ProjectSwitchBoundary(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const TARGET_KEY='padGradeProjectSwitchTargetV091';
  let reloadQueued=false;

  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function armTarget(id){
    if(!id)return false;
    try{sessionStorage.setItem(TARGET_KEY,String(id));}catch(e){return false;}
    window.__padGradeProjectMapBoundaryState='reload-target-armed-no-curtain';
    return true;
  }
  function queueReload(){
    if(reloadQueued)return;
    reloadQueued=true;
    queueMicrotask(()=>location.reload());
  }
  function openTarget(event){
    const button=event.target?.closest?.('button[data-act="open"]');
    const row=button?.closest?.('[data-id]');
    return row?.dataset?.id||null;
  }

  // Stop legacy v040/v041 Open handlers before they can mutate grid/map state in
  // the current document. The old project remains intact until navigation.
  document.addEventListener('click',event=>{
    const target=openTarget(event);
    if(!target||target===activeId())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(armTarget(target))queueReload();
  },true);

  // Imports become active only after their project data has been stored. Preserve
  // that selected id across the reload too; no recovery curtain is involved.
  function wrapImport(){
    const fn=window.importProjectFile;
    if(typeof fn!=='function'||fn.__padGradeSwitchBoundary)return;
    const wrapped=async function(){
      const before=activeId();
      const result=await fn.apply(this,arguments);
      const after=activeId();
      if(after&&after!==before){armTarget(after);queueReload();}
      return result;
    };
    wrapped.__padGradeSwitchBoundary=true;
    wrapped.__padGradeSwitchBoundaryBase=fn;
    window.importProjectFile=wrapped;
  }

  let wraps=0;
  const timer=setInterval(()=>{wrapImport();if(++wraps>80)clearInterval(timer);},250);
  wrapImport();
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});

  window.__padGradeProjectSwitchPolicyV091='intercept-open-carry-target-reload-no-curtain';
})();
