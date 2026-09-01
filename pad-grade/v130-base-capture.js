/* Pad Grade v1.3.0 DEV — capture the unwrapped point-save primitive.
 *
 * This file is intentionally loaded immediately after ui.js and before any heat
 * lifecycle wrappers. v1.3.0 uses this stable reference to replace the accumulated
 * v1.2.7/v1.2.8/v1.2.9 saveCurrent wrapper stack with one authoritative mutation
 * controller without changing the underlying point-save semantics.
 */
(function capturePadGrade130BaseMutation(){
  'use strict';
  if(window.__padGradeBaseSaveCurrentV130)return;
  if(typeof window.saveCurrent!=='function')return;
  window.__padGradeBaseSaveCurrentV130=window.saveCurrent;
  try{window.PadGradeDiag?.mark?.('heatmap.v130-base-mutation-captured',{beforeHeatLifecycleWrappers:true});}catch(e){}
})();
