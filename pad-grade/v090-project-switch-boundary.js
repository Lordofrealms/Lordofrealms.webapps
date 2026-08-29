/* Pad Grade v0.8.10 DEV — prepaint atomic project-switch boundary.
 *
 * Do not try to make two long-lived map/grid runtimes coexist during a project
 * change. The transition curtain goes up in capture phase, the intended target
 * is carried through sessionStorage, and the page reloads. The head-loaded
 * recovery helper restores that intended target before any project manager can
 * read localStorage, even if an older beforeunload autosave rewrites ACTIVE_KEY
 * while leaving the old project.
 */
(function installPadGrade090ProjectSwitchBoundary(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  let clickStartActive=null;
  let reloadQueued=false;
  let armedTarget=null;

  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function armTransition(id){
    if(!id||id===armedTarget)return;
    armedTarget=id;
    window.__padGradeProjectSwitchInProgress=true;
    try{window.__padGradeBeginProjectTransition?.(id);}catch(e){}
    window.__padGradeProjectMapBoundaryState='covered-reload-pending';
  }
  function queueReload(){
    if(reloadQueued)return;
    reloadQueued=true;
    queueMicrotask(()=>location.reload());
  }
  function actionFromEvent(event){
    const button=event.target?.closest?.('button');
    if(!button)return null;
    const act=button.dataset?.act||'';
    if(act==='open')return {kind:'open',button,row:button.closest('[data-id]')};
    if(act==='delete')return {kind:'delete',button,row:button.closest('[data-id]')};
    if(act==='archive')return {kind:'archive',button,row:button.closest('[data-id]')};
    if(button.id==='v040NewProject')return {kind:'new',button,row:null};
    return null;
  }

  // Capture phase runs before either the v040 or v041 row onclick handler. That
  // makes the old project disappear behind the curtain before any handler can
  // apply the new project's settings, grid, or heat-map inputs in-place.
  document.addEventListener('click',event=>{
    const action=actionFromEvent(event);if(!action)return;
    clickStartActive=activeId();
    if(action.kind==='open'){
      const target=action.row?.dataset?.id||null;
      if(target&&target!==clickStartActive)armTransition(target);
    }
  },true);

  // v040 can still apply a project in-place before this bubble listener runs;
  // the curtain is already covering it. Force one clean reload so the only
  // visible runtime after the transition is constructed entirely from target.
  document.addEventListener('click',event=>{
    const action=actionFromEvent(event);if(!action)return;
    const before=clickStartActive,after=activeId();clickStartActive=null;
    if(before&&after&&before!==after){
      armTransition(after);
      queueReload();
    }else if(action.kind==='open'&&armedTarget){
      // v041's open handler already requested a reload. Queueing another reload
      // in the same turn is harmless and protects against handler-order changes.
      queueReload();
    }
  });

  function wrapImport(){
    const fn=window.importProjectFile;
    if(typeof fn!=='function'||fn.__padGradeSwitchBoundary)return;
    const wrapped=async function(){
      const before=activeId();
      const result=await fn.apply(this,arguments);
      const after=activeId();
      if(before&&after&&before!==after){armTransition(after);queueReload();}
      return result;
    };
    wrapped.__padGradeSwitchBoundary=true;
    wrapped.__padGradeSwitchBoundaryBase=fn;
    window.importProjectFile=wrapped;
  }

  let wraps=0;
  const timer=setInterval(()=>{wrapImport();if(++wraps>80)clearInterval(timer);},250);
  wrapImport();

  // If a project-changing handler itself calls location.reload() before normal
  // bubbling finishes, preserve the new ACTIVE_KEY here as a final fallback.
  window.addEventListener('beforeunload',()=>{
    const now=activeId();
    if(clickStartActive&&now&&now!==clickStartActive)armTransition(now);
    clearInterval(timer);
  },{once:true});

  window.__padGradeProjectSwitchPolicyV091='cover-before-handler-carry-target-reload-before-paint';
})();
