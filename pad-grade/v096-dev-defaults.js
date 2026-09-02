/* Pad Grade v1.4.4 stable defaults.
 * Diagnostic timing remains available from Advanced Settings, but stable builds
 * default it OFF unless the user has explicitly chosen otherwise.
 */
(function installPadGrade096StableDefaults(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';
  let prefs={};
  try{const parsed=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');if(parsed&&typeof parsed==='object')prefs=parsed;}catch(e){}
  if(typeof prefs.diagnosticLogging!=='boolean'){
    try{window.PadGradeDiag?.setEnabled?.(false,'v1.4.4-stable-default');}catch(e){}
  }else{
    try{window.PadGradeDiag?.refreshEnabledFromPrefs?.('v1.4.4-explicit-preference');}catch(e){}
  }
  if(!window.__padGradeDeleteCaptureV143){
    window.__padGradeDeleteCaptureV143=true;
    document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button[data-act="delete"]'),row=btn?.closest?.('[data-id]');
      if(!row)return;
      const handler=window.PadGradeDeleteConsistencyV143?.handleDeleteClick;
      if(typeof handler!=='function')return;
      event.preventDefault();event.stopImmediatePropagation();handler(event,btn,row);
    },true);
  }
  const markStable=()=>{
    try{document.title='Pad Grade Mapper v1.4.4';}catch(e){}
    window.__padGradeBuildChannel='stable';
    window.__padGradeStableVersion='1.4.4';
  };
  markStable();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',markStable,{once:true});
  setTimeout(markStable,750);
  setTimeout(markStable,2000);
  window.__padGradeDiagnosticDefaultV096='dev-on-stable-off';
})();
