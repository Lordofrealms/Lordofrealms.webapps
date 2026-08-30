/* Pad Grade v1.0.3 DEV defaults.
 * Diagnostic timing is ON by default for DEV builds so fresh-install recovery
 * traces are captured automatically. An explicit user OFF choice is respected.
 * Stable promotion must change this default back to OFF.
 *
 * v1.0.3 also loads the responsive-grid hitbox correction before the body/grid
 * bootstrap runs. Keeping this in the early head script makes the corrected cell
 * geometry available before the first interactive lower-grid paint.
 */
(function installPadGrade096DevDefaults(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';

  if(!document.querySelector('link[data-padgrade-v103-grid-hitbox]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='v103-grid-hitbox.css?v=20260830-1';
    link.dataset.padgradeV103GridHitbox='1';
    document.head.appendChild(link);
  }

  let prefs={};
  try{const parsed=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');if(parsed&&typeof parsed==='object')prefs=parsed;}catch(e){}
  if(typeof prefs.diagnosticLogging!=='boolean'){
    try{window.PadGradeDiag?.setEnabled?.(true,'v1.0.3-dev-default');}catch(e){}
  }else{
    try{window.PadGradeDiag?.refreshEnabledFromPrefs?.('v1.0.3-explicit-preference');}catch(e){}
  }
  window.__padGradeDiagnosticDefaultV096='dev-on-stable-off';
  window.__padGradeGridHitboxFixV103='track-bounded-cells-loaded-before-grid-bootstrap';
  window.__padGradeDevBuildVersion='1.0.3';
})();
