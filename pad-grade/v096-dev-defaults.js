/* Pad Grade v0.9.6 DEV defaults.
 * Diagnostic timing is ON by default for DEV builds so fresh-install recovery
 * traces are captured automatically. An explicit user OFF choice is respected.
 * Stable promotion must change this default back to OFF.
 */
(function installPadGrade096DevDefaults(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';
  let prefs={};
  try{const parsed=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');if(parsed&&typeof parsed==='object')prefs=parsed;}catch(e){}
  if(typeof prefs.diagnosticLogging!=='boolean'){
    try{window.PadGradeDiag?.setEnabled?.(true,'v0.9.6-dev-default');}catch(e){}
  }else{
    try{window.PadGradeDiag?.refreshEnabledFromPrefs?.('v0.9.6-explicit-preference');}catch(e){}
  }
  window.__padGradeDiagnosticDefaultV096='dev-on-stable-off';
})();
