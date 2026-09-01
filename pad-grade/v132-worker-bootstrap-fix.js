/* Pad Grade v1.3.6 DEV — redirect legacy heat work to the all-tier Blob coordinator.
 *
 * Loaded in the existing v1.3.x bootstrap slot. It preserves the most-derived
 * v1.2.6/v1.2.7 lifecycle prototype with Reflect.construct while changing only
 * the underlying heat worker implementation to v1.3.6. The coordinator handles
 * the progressive 99 / 297 / 891 tiers with compute-only Blob band workers.
 */
(function installPadGrade136WorkerBootstrap(){
  'use strict';
  if(window.__padGradeV136WorkerBootstrap)return;
  window.__padGradeV136WorkerBootstrap=true;

  const Prior=window.Worker;
  if(typeof Prior!=='function')return;
  const NativeParent=Prior.__padGradeV136WorkerParent||Prior.__padGradeV135WorkerParent||Prior.__padGradeV134WorkerParent||Prior.__padGradeV133WorkerParent||Prior.__padGradeV131WorkerParent||Prior;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v136.js?v=20260901-1';

  function PadGrade136WorkerBootstrap(url,options){
    let next=url;
    try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    const args=options===undefined?[next]:[next,options];
    return Reflect.construct(NativeParent,args,new.target||PadGrade136WorkerBootstrap);
  }

  PadGrade136WorkerBootstrap.prototype=NativeParent.prototype;
  try{Object.setPrototypeOf(PadGrade136WorkerBootstrap,NativeParent);}catch(e){}
  PadGrade136WorkerBootstrap.__padGradeV136WorkerBootstrap=true;
  PadGrade136WorkerBootstrap.__padGradeV136WorkerParent=NativeParent;
  PadGrade136WorkerBootstrap.__padGradeV135WorkerBootstrap=true;
  PadGrade136WorkerBootstrap.__padGradeV135WorkerParent=NativeParent;
  PadGrade136WorkerBootstrap.__padGradeV134WorkerBootstrap=true;
  PadGrade136WorkerBootstrap.__padGradeV134WorkerParent=NativeParent;
  PadGrade136WorkerBootstrap.__padGradeV133WorkerBootstrap=true;
  PadGrade136WorkerBootstrap.__padGradeV133WorkerParent=NativeParent;
  PadGrade136WorkerBootstrap.__padGradeV132WorkerBootstrapFix=true;
  PadGrade136WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade136WorkerBootstrap.__padGradeV131WorkerParent=NativeParent;
  window.Worker=PadGrade136WorkerBootstrap;

  try{
    window.PadGradeDiag?.mark?.('heatmap.v136-worker-bootstrap-installed',{
      target:'heatmap-raster-worker-v136.js',childWorker:'heatmap-raster-band-worker-v136.js',
      parallelTiers:[99,297,891],transport:'parent-fetched-surface-plus-band-single-blob-url',
      expectedComputeWorkerPolicy:'max(1, hardwareConcurrency - 1)',noSequentialBenchmarkRun:true,
      noChildImportScripts:true,noExternalNestedWorkerBootstrap:true,preservesDerivedPrototype:true,
      lifecyclePostMessagePreserved:true,atomicEveryTier:true,partialFramesPublished:0,
      bandFramesPublished:0,protectedV122PresenterUnchanged:true
    });
  }catch(e){}
})();
