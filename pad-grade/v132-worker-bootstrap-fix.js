/* Pad Grade v1.3.4 DEV — redirect legacy heat work to the diagnostic dedicated-band coordinator.
 *
 * Loaded in the existing v1.3.x bootstrap slot. It preserves the most-derived
 * v1.2.6/v1.2.7 lifecycle prototype with Reflect.construct while changing only
 * the underlying heat worker implementation to v1.3.4.
 */
(function installPadGrade134WorkerBootstrap(){
  'use strict';
  if(window.__padGradeV134WorkerBootstrap)return;
  window.__padGradeV134WorkerBootstrap=true;

  const Prior=window.Worker;
  if(typeof Prior!=='function')return;
  const NativeParent=Prior.__padGradeV134WorkerParent||Prior.__padGradeV133WorkerParent||Prior.__padGradeV131WorkerParent||Prior;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v134.js?v=20260901-1';

  function PadGrade134WorkerBootstrap(url,options){
    let next=url;
    try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    const args=options===undefined?[next]:[next,options];
    return Reflect.construct(NativeParent,args,new.target||PadGrade134WorkerBootstrap);
  }

  PadGrade134WorkerBootstrap.prototype=NativeParent.prototype;
  try{Object.setPrototypeOf(PadGrade134WorkerBootstrap,NativeParent);}catch(e){}
  PadGrade134WorkerBootstrap.__padGradeV134WorkerBootstrap=true;
  PadGrade134WorkerBootstrap.__padGradeV134WorkerParent=NativeParent;
  PadGrade134WorkerBootstrap.__padGradeV133WorkerBootstrap=true;
  PadGrade134WorkerBootstrap.__padGradeV133WorkerParent=NativeParent;
  PadGrade134WorkerBootstrap.__padGradeV132WorkerBootstrapFix=true;
  PadGrade134WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade134WorkerBootstrap.__padGradeV131WorkerParent=NativeParent;
  window.Worker=PadGrade134WorkerBootstrap;

  try{
    window.PadGradeDiag?.mark?.('heatmap.v134-worker-bootstrap-installed',{
      target:'heatmap-raster-worker-v134.js',childWorker:'heatmap-raster-band-worker-v134.js',
      stagedChildDiagnostics:true,nestedBlobFailureProbe:true,childAssetFailureProbe:true,
      preservesDerivedPrototype:true,lifecyclePostMessagePreserved:true,
      atomicFinal891Only:true,partialFramesPublished:0,protectedV122PresenterUnchanged:true
    });
  }catch(e){}
})();
