/* Pad Grade v0.7.9 DEV — edge-locked local surface activation layer.
 *
 * v0.7.6 owns the probe UI and shared surface consumers. This layer cache-busts
 * the main-thread surface model, redirects the heat-map worker to the same model,
 * and marks v0.7.9 active after the edge-locked evaluator is loaded.
 */
(function installPadGrade079(){
  'use strict';

  const VERSION='v0.7.9 DEV';
  const MODEL='locality-triangle-local-rectangle-idw2-edge-locked-one-sixth-depth';
  const SURFACE_NEW='surface-local-v078.js?v=20260826-2';
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
    window.__padGradeEdgeLockedSurface079=true;
    window.__padGradeDevVersion079=VERSION;
    document.title=`Pad Grade Mapper ${VERSION}`;
  }

  function finishActivation(){
    markActive();
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',()=>{setTimeout(markActive,60);setTimeout(markActive,500);},{once:true});
    }else{
      setTimeout(markActive,100);
    }
  }

  function loadFreshSurface(){
    if(window.__padGradeEdgeLockedSurface079){finishActivation();return;}
    const prior=document.querySelector('script[data-padgrade-surface-v079]');
    if(prior){prior.addEventListener('load',finishActivation,{once:true});return;}
    const script=document.createElement('script');
    script.src=SURFACE_NEW;
    script.async=false;
    script.dataset.padgradeSurfaceV079='1';
    script.onload=finishActivation;
    script.onerror=()=>console.error('Pad Grade v0.7.9 edge-locked surface module failed to load');
    document.body.appendChild(script);
  }

  installWorkerRedirect();
  loadFreshSurface();
})();

/* v0.8.0 adds stable six-character file IDs and legacy durable-folder filename migration. */
(function loadPadGrade080FileIds(){
  if(document.querySelector('script[data-padgrade-v080-file-id]'))return;
  const script=document.createElement('script');
  script.src='v080-file-id.js?v=20260828-1';
  script.async=false;
  script.dataset.padgradeV080FileId='1';
  script.onerror=()=>console.error('Pad Grade v0.8.0 file-ID module failed to load');
  document.body.appendChild(script);
})();

/* v0.8.1 adds read-only, temporary two-project elevation-change comparison.
 * Later correction layers remain deferred until the base comparison UI exists.
 */
(function loadPadGrade081Comparison(){
  const loadRenderOrder=()=>{
    if(document.querySelector('script[data-padgrade-v085-map-order]'))return;
    const render=document.createElement('script');
    render.src='v085-map-render-order.js?v=20260829-2';
    render.async=false;
    render.dataset.padgradeV085MapOrder='1';
    render.onerror=()=>console.error('Pad Grade v0.8.6 map render-order correction failed to load');
    document.body.appendChild(render);
  };
  const loadFix=()=>{
    const existing=document.querySelector('script[data-padgrade-v083-compare-fix]');
    if(existing){loadRenderOrder();return;}
    const fix=document.createElement('script');
    fix.src='v083-project-compare-fix.js?v=20260829-1';
    fix.async=false;
    fix.dataset.padgradeV083CompareFix='1';
    fix.onload=loadRenderOrder;
    fix.onerror=()=>{console.error('Pad Grade v0.8.3 comparison correction failed to load');loadRenderOrder();};
    document.body.appendChild(fix);
  };
  const loadUi=()=>{
    const existing=document.querySelector('script[data-padgrade-v081-compare]');
    if(existing){
      if(window.PadGradeProjectCompare)loadFix();
      else existing.addEventListener('load',loadFix,{once:true});
      return;
    }
    const ui=document.createElement('script');
    ui.src='v081-project-compare.js?v=20260829-1';
    ui.async=false;
    ui.dataset.padgradeV081Compare='1';
    ui.onload=loadFix;
    ui.onerror=()=>console.error('Pad Grade v0.8.1 project comparison UI failed to load');
    document.body.appendChild(ui);
  };
  if(window.PadGradeProjectCompareCore){loadUi();return;}
  const existingCore=document.querySelector('script[data-padgrade-compare-core]');
  if(existingCore){existingCore.addEventListener('load',loadUi,{once:true});return;}
  const core=document.createElement('script');
  core.src='project-compare-core.js?v=20260829-1';
  core.async=false;
  core.dataset.padgradeCompareCore='1';
  core.onload=loadUi;
  core.onerror=()=>console.error('Pad Grade v0.8.1 project comparison core failed to load');
  document.body.appendChild(core);
})();
