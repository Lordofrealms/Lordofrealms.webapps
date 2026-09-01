/* Pad Grade v1.3.2 DEV — preserve heat lifecycle subclasses through the v1.3.1 worker redirect.
 *
 * v1.3.1 redirected the legacy heat-worker URL by returning a newly constructed
 * parent Worker from its wrapper constructor. When v1.2.6/v1.2.7 extended that
 * wrapper, the explicit returned object discarded the derived Worker prototype,
 * so their postMessage/terminate lifecycle overrides never owned the real worker.
 * This replacement redirect uses Reflect.construct with the most-derived new.target
 * so every existing lifecycle wrapper stays on the actual Worker instance while the
 * underlying URL still points at the v1.3.1 adaptive final-891 implementation.
 */
(function installPadGrade132WorkerBootstrapFix(){
  'use strict';
  if(window.__padGradeV132WorkerBootstrapFix)return;
  window.__padGradeV132WorkerBootstrapFix=true;

  const Prior=window.Worker;
  if(typeof Prior!=='function')return;
  const NativeParent=Prior.__padGradeV131WorkerParent||Prior;
  const MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TARGET='heatmap-raster-worker-v131.js?v=20260901-1';

  function PadGrade132WorkerBootstrap(url,options){
    let next=url;
    try{if(MATCH.test(String(url||'')))next=TARGET;}catch(e){}
    const args=options===undefined?[next]:[next,options];
    return Reflect.construct(NativeParent,args,new.target||PadGrade132WorkerBootstrap);
  }

  PadGrade132WorkerBootstrap.prototype=NativeParent.prototype;
  try{Object.setPrototypeOf(PadGrade132WorkerBootstrap,NativeParent);}catch(e){}
  PadGrade132WorkerBootstrap.__padGradeV132WorkerBootstrapFix=true;
  PadGrade132WorkerBootstrap.__padGradeV131WorkerBootstrap=true;
  PadGrade132WorkerBootstrap.__padGradeV131WorkerParent=NativeParent;
  window.Worker=PadGrade132WorkerBootstrap;

  try{
    window.PadGradeDiag?.mark?.('heatmap.v132-worker-bootstrap-fixed',{
      preservesDerivedPrototype:true,
      lifecyclePostMessagePreserved:true,
      target:'heatmap-raster-worker-v131.js',
      protectedV122PresenterUnchanged:true
    });
  }catch(e){}
})();
