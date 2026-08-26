/* Pad Grade v0.7.9 DEV — edge-locked local surface activation layer.
 *
 * v0.7.6 owns the probe UI and shared surface consumers. This layer redirects
 * the heat-map worker to the edge-locked local surface and marks v0.7.9 active.
 */
(function installPadGrade079(){
  'use strict';

  const VERSION='v0.7.9 DEV';
  const MODEL='locality-triangle-local-rectangle-idw2-edge-locked-one-sixth-depth';
  const WORKER_MATCH=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const WORKER_NEW='heatmap-raster-worker-v078.js?v=20260826-3';

  function installWorkerRedirect(){
    const NativeWorker=window.Worker;
    if(typeof NativeWorker!=='function'||NativeWorker.__padGrade079Redirect)return;
    function PadGradeWorker079(url,options){
      let next=url;
      try{if(WORKER_MATCH.test(String(url)))next=WORKER_NEW;}catch(e){}
      return new NativeWorker(next,options);
    }
    PadGradeWorker079.prototype=NativeWorker.prototype;
    try{Object.setPrototypeOf(PadGradeWorker079,NativeWorker);}catch(e){}
    PadGradeWorker079.__padGrade079Redirect=true;
    PadGradeWorker079.__padGrade079Previous=NativeWorker;
    window.Worker=PadGradeWorker079;
  }

  function markActive(){
    window.__padGradeSurfaceModel=MODEL;
    window.__padGradeSurfaceLocalVersion='0.7.9';
    window.__padGradeDevVersion079=VERSION;
    document.title=`Pad Grade Mapper ${VERSION}`;
  }

  installWorkerRedirect();
  markActive();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(markActive,60);setTimeout(markActive,500);},{once:true});
  }else{
    setTimeout(markActive,100);
  }
})();
