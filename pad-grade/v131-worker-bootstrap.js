/* Pad Grade v1.3.1 DEV — heat worker implementation redirect.
 *
 * Loaded before the v1.2.6/v1.2.7 lifecycle wrappers so those wrappers continue
 * to receive the original legacy heat-worker URL and therefore keep all existing
 * generation/cancellation/provenance semantics. This layer only replaces the
 * underlying worker implementation with the v1.3.1 adaptive 891 worker.
 */
(function installPadGrade131WorkerBootstrap(){
  'use strict';
  if(window.__padGradeV131WorkerBootstrap)return;
  window.__padGradeV131WorkerBootstrap=true;
  const Parent=window.Worker;
  if(typeof Parent!=='function')return;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v131.js?v=20260901-1';
  function PadGrade131WorkerBootstrap(url,options){
    let next=url;try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    return options===undefined?new Parent(next):new Parent(next,options);
  }
  PadGrade131WorkerBootstrap.prototype=Parent.prototype;
  try{Object.setPrototypeOf(PadGrade131WorkerBootstrap,Parent);}catch(e){}
  PadGrade131WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade131WorkerBootstrap.__padGradeV131WorkerParent=Parent;
  window.Worker=PadGrade131WorkerBootstrap;
  try{window.PadGradeDiag?.mark?.('heatmap.v131-worker-bootstrap-installed',{target:'heatmap-raster-worker-v131.js',legacyLifecycleSeesOriginalUrl:true});}catch(e){}
})();
