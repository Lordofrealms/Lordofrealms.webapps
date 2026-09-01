/* Pad Grade v1.3.3 DEV — redirect legacy heat work to the dedicated-band coordinator.
 *
 * Loaded as the existing v1.3.2 bootstrap slot. It preserves the most-derived
 * v1.2.6/v1.2.7 lifecycle prototype with Reflect.construct while changing only
 * the underlying heat worker implementation to v1.3.3.
 */
(function installPadGrade133WorkerBootstrap(){
  'use strict';
  if(window.__padGradeV133WorkerBootstrap)return;
  window.__padGradeV133WorkerBootstrap=true;

  const Prior=window.Worker;
  if(typeof Prior!=='function')return;
  const NativeParent=Prior.__padGradeV133WorkerParent||Prior.__padGradeV131WorkerParent||Prior;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v133.js?v=20260901-1';

  function PadGrade133WorkerBootstrap(url,options){
    let next=url;
    try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    const args=options===undefined?[next]:[next,options];
    return Reflect.construct(NativeParent,args,new.target||PadGrade133WorkerBootstrap);
  }

  PadGrade133WorkerBootstrap.prototype=NativeParent.prototype;
  try{Object.setPrototypeOf(PadGrade133WorkerBootstrap,NativeParent);}catch(e){}
  PadGrade133WorkerBootstrap.__padGradeV133WorkerBootstrap=true;
  PadGrade133WorkerBootstrap.__padGradeV133WorkerParent=NativeParent;
  // Carry historical markers forward so existing lifecycle/lazy wrappers keep
  // recognizing this as the same protected heat-worker bootstrap chain.
  PadGrade133WorkerBootstrap.__padGradeV132WorkerBootstrapFix=true;
  PadGrade133WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade133WorkerBootstrap.__padGradeV131WorkerParent=NativeParent;
  window.Worker=PadGrade133WorkerBootstrap;

  try{
    window.PadGradeDiag?.mark?.('heatmap.v133-worker-bootstrap-installed',{
      target:'heatmap-raster-worker-v133.js',
      childWorker:'heatmap-raster-band-worker-v133.js',
      preservesDerivedPrototype:true,
      lifecyclePostMessagePreserved:true,
      atomicFinal891Only:true,
      partialFramesPublished:0,
      protectedV122PresenterUnchanged:true
    });
  }catch(e){}
})();
