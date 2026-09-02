/* Pad Grade v1.4.0 stable defaults.
 * Diagnostic timing remains available from Advanced Settings, but stable builds
 * default it OFF unless the user has explicitly chosen otherwise.
 */
(function installPadGrade096StableDefaults(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';
  let prefs={};
  try{const parsed=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');if(parsed&&typeof parsed==='object')prefs=parsed;}catch(e){}
  if(typeof prefs.diagnosticLogging!=='boolean'){
    try{window.PadGradeDiag?.setEnabled?.(false,'v1.4.0-stable-default');}catch(e){}
  }else{
    try{window.PadGradeDiag?.refreshEnabledFromPrefs?.('v1.4.0-explicit-preference');}catch(e){}
  }
  const markStable=()=>{
    try{document.title='Pad Grade Mapper v1.4.0';}catch(e){}
    window.__padGradeBuildChannel='stable';
    window.__padGradeStableVersion='1.4.0';
  };
  markStable();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',markStable,{once:true});
  setTimeout(markStable,750);
  setTimeout(markStable,2000);
  window.__padGradeDiagnosticDefaultV096='dev-on-stable-off';
})();
