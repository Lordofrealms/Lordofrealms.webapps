/* Pad Grade v0.7.7 DEV — locality selector activation layer.
 *
 * v0.7.6 still owns the probe UI and shared surface consumers. This layer swaps
 * the heat-map worker to the v0.7.7 locality implementation and marks the new
 * surface model/version after surface-local-v077.js has replaced the shared math.
 */
(function installPadGrade077(){
  'use strict';

  const VERSION='v0.7.7 DEV';
  const WORKER_MATCH=/heatmap-raster-worker-v0(?:73|76)\.js(?:\?|$)/;
  const WORKER_NEW='heatmap-raster-worker-v077.js?v=20260826-1';

  function installWorkerRedirect(){
    const NativeWorker=window.Worker;
    if(typeof NativeWorker!=='function'||NativeWorker.__padGrade077Redirect)return;
    function PadGradeWorker077(url,options){
      let next=url;
      try{if(WORKER_MATCH.test(String(url)))next=WORKER_NEW;}catch(e){}
      return new NativeWorker(next,options);
    }
    PadGradeWorker077.prototype=NativeWorker.prototype;
    try{Object.setPrototypeOf(PadGradeWorker077,NativeWorker);}catch(e){}
    PadGradeWorker077.__padGrade077Redirect=true;
    PadGradeWorker077.__padGrade077Previous=NativeWorker;
    window.Worker=PadGradeWorker077;
  }

  installWorkerRedirect();
  window.__padGradeSurfaceModel='locality-farthest-then-total-distance-then-area-idw2-full-score-tie-average';
  window.__padGradeDevVersion077=VERSION;

  const setTitle=()=>{document.title=`Pad Grade Mapper ${VERSION}`;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setTitle,{once:true});
  else setTitle();
})();
