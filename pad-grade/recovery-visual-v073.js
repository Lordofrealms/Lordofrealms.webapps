/* Pad Grade v0.7.3 DEV — mask durable-folder recovery repaint races.
 *
 * The project/settings recovery is already deterministic. This tiny head-loaded
 * helper keeps the old/default UI hidden across the one intentional reload so the
 * user sees a single restoring state instead of several intermediate paints.
 */
(function installPadGradeRecoveryVisualHold(){
  'use strict';
  const KEY='padGradeRecoveryVisualHoldV073';
  let failsafe=null;

  function recentHold(){
    try{
      const t=Number(sessionStorage.getItem(KEY)||0);
      return Number.isFinite(t)&&t>0&&Date.now()-t<15000;
    }catch(e){return false;}
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
  if(recentHold()){document.documentElement.classList.add('padGradeRecoveryHold');armFailsafe();}
  else end();
})();
