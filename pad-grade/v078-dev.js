/* Pad Grade v0.7.8 DEV — local rectangle promotion activation layer.
 *
 * v0.7.6 owns the probe UI and shared surface consumers. This layer redirects
 * the heat-map worker to the v0.7.8 surface model and marks the active version
 * after surface-local-v078.js has replaced the shared interpolation math.
 */
(function installPadGrade078(){
  'use strict';

  const VERSION='v0.7.8 DEV';
  const MODEL='locality-triangle-then-local-grid-rectangle-promotion-idw2-full-score-tie-average';
  const WORKER_MATCH=/heatmap-raster-worker-v0(?:73|76|77)\.js(?:\?|$)/;
  const WORKER_NEW='heatmap-raster-worker-v078.js?v=20260826-2';

  function installWorkerRedirect(){
    const NativeWorker=window.Worker;
    if(typeof NativeWorker!=='function'||NativeWorker.__padGrade078Redirect)return;
    function PadGradeWorker078(url,options){
      let next=url;
      try{if(WORKER_MATCH.test(String(url)))next=WORKER_NEW;}catch(e){}
      return new NativeWorker(next,options);
    }
    PadGradeWorker078.prototype=NativeWorker.prototype;
    try{Object.setPrototypeOf(PadGradeWorker078,NativeWorker);}catch(e){}
    PadGradeWorker078.__padGrade078Redirect=true;
    PadGradeWorker078.__padGrade078Previous=NativeWorker;
    window.Worker=PadGradeWorker078;
  }

  function markActive(){
    window.__padGradeSurfaceModel=MODEL;
    window.__padGradeDevVersion078=VERSION;
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
