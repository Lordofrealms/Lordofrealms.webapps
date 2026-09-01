/* Pad Grade v1.3.5 DEV — redirect legacy heat work to the Blob-bundled final-891 coordinator.
 *
 * Loaded in the existing v1.3.x bootstrap slot. It preserves the most-derived
 * v1.2.6/v1.2.7 lifecycle prototype with Reflect.construct while changing only
 * the underlying heat worker implementation to v1.3.5.
 */
(function installPadGrade135WorkerBootstrap(){
  'use strict';
  if(window.__padGradeV135WorkerBootstrap)return;
  window.__padGradeV135WorkerBootstrap=true;

  const Prior=window.Worker;
  if(typeof Prior!=='function')return;
  const NativeParent=Prior.__padGradeV135WorkerParent||Prior.__padGradeV134WorkerParent||Prior.__padGradeV133WorkerParent||Prior.__padGradeV131WorkerParent||Prior;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v135.js?v=20260901-1';

  function PadGrade135WorkerBootstrap(url,options){
    let next=url;
    try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    const args=options===undefined?[next]:[next,options];
    return Reflect.construct(NativeParent,args,new.target||PadGrade135WorkerBootstrap);
  }

  PadGrade135WorkerBootstrap.prototype=NativeParent.prototype;
  try{Object.setPrototypeOf(PadGrade135WorkerBootstrap,NativeParent);}catch(e){}
  PadGrade135WorkerBootstrap.__padGradeV135WorkerBootstrap=true;
  PadGrade135WorkerBootstrap.__padGradeV135WorkerParent=NativeParent;
  PadGrade135WorkerBootstrap.__padGradeV134WorkerBootstrap=true;
  PadGrade135WorkerBootstrap.__padGradeV134WorkerParent=NativeParent;
  PadGrade135WorkerBootstrap.__padGradeV133WorkerBootstrap=true;
  PadGrade135WorkerBootstrap.__padGradeV133WorkerParent=NativeParent;
  PadGrade135WorkerBootstrap.__padGradeV132WorkerBootstrapFix=true;
  PadGrade135WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade135WorkerBootstrap.__padGradeV131WorkerParent=NativeParent;
  window.Worker=PadGrade135WorkerBootstrap;

  try{
    window.PadGradeDiag?.mark?.('heatmap.v135-worker-bootstrap-installed',{
      target:'heatmap-raster-worker-v135.js',childWorker:'heatmap-raster-band-worker-v135.js',
      transport:'parent-fetched-surface-plus-band-single-blob-url',expectedComputeWorkerPolicy:'max(1, hardwareConcurrency - 1)',
      noChildImportScripts:true,noExternalNestedWorkerBootstrap:true,
      preservesDerivedPrototype:true,lifecyclePostMessagePreserved:true,
      atomicFinal891Only:true,partialFramesPublished:0,bandFramesPublished:0,protectedV122PresenterUnchanged:true
    });
  }catch(e){}
})();
