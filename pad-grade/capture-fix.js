/* Pad Grade v0.3.0 bootstrap.
 * Keeps the v0.2.4 resilient corner-capture completion, captures the existing
 * MapLibre instance before map.js creates it, and loads the v0.3.0 workflow
 * redesign after the legacy modules have finished initializing.
 */
(function installCaptureCompletionFix(){
  'use strict';

  const previousIngest=ingestGpsPosition;

  function finishIfDue(){
    if(!activeCornerCapture) return false;
    if(Date.now()<activeCornerCapture.endsAt) return false;
    finalizeCornerCapture();
    return true;
  }

  ingestGpsPosition=function(pos){
    previousIngest(pos);
    finishIfDue();
  };

  startCornerCapture=function(){
    if(activeCornerCapture) return;
    if(!gpsEnabled||!gpsPos){
      requestGpsAccess(()=>setTimeout(startCornerCapture,100));
      return;
    }
    const corner=currentSurveyCorner();
    if(!corner) return;

    const now=Date.now();
    activeCornerCapture={
      corner,
      startedAt:now,
      endsAt:now+CORNER_CAPTURE_MS,
      samples:gpsRecentSamples.filter(s=>now-s.timestamp<=1000)
    };

    clearInterval(captureProgressTimer);
    captureProgressTimer=setInterval(()=>{
      if(!finishIfDue()) updateGpsUI();
    },200);

    updateGpsUI();
    setTimeout(finishIfDue,CORNER_CAPTURE_MS+300);
  };
})();

(function installV030Bootstrap(){
  'use strict';

  // Capture the MapLibre instance without rewriting the already-proven imagery
  // module. This must happen before map.js constructs the map.
  if(window.maplibregl && window.maplibregl.Map && !window.__padGradeMapHookInstalled){
    window.__padGradeMapHookInstalled=true;
    const OriginalMap=window.maplibregl.Map;
    function WrappedMap(options){
      const instance=new OriginalMap(options);
      window.__padGradeMapInstance=instance;
      try{window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:instance}}));}catch(e){}
      return instance;
    }
    WrappedMap.prototype=OriginalMap.prototype;
    try{Object.setPrototypeOf(WrappedMap,OriginalMap);}catch(e){}
    for(const key of Object.keys(OriginalMap)){
      try{WrappedMap[key]=OriginalMap[key];}catch(e){}
    }
    window.maplibregl.Map=WrappedMap;
  }

  // Load redesign styling immediately so the first GPS-mode paint is compact.
  if(!document.querySelector('link[data-padgrade-v030]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='v030.css?v=20260822-2';
    link.dataset.padgradeV030='1';
    document.head.appendChild(link);
  }

  function polishLoadedWorkflow(){
    document.title='Pad Grade Mapper v0.3.0';

    // Keep the live corner instruction visible inside the new calibration block.
    const calibration=document.querySelector('.v030-calibration');
    const instruction=document.getElementById('gpsInstruction');
    const title=calibration&&calibration.querySelector('.v030-sectionTitle');
    if(calibration&&instruction&&title){
      title.insertAdjacentElement('afterend',instruction);
      instruction.style.marginBottom='8px';
    }

    // The volume numbers move into Job Summary. Move their collapsed explanation
    // with them instead of leaving an almost-empty standalone card behind.
    const summary=document.querySelector('.v030-jobSummary');
    const volumeHelp=document.querySelector('.v030-help[aria-label="Volume estimate information"]');
    if(summary&&volumeHelp){
      const helpWrap=volumeHelp.parentElement;
      const oldCard=volumeHelp.closest('.card');
      if(helpWrap) summary.appendChild(helpWrap);
      if(oldCard&&oldCard!==summary) oldCard.remove();
    }
  }

  function loadWorkflow(){
    if(document.querySelector('script[data-padgrade-v030]')) return;
    const script=document.createElement('script');
    script.src='v030.js?v=20260822-2';
    script.dataset.padgradeV030='1';
    script.onload=polishLoadedWorkflow;
    document.body.appendChild(script);
  }

  if(document.readyState==='complete') loadWorkflow();
  else window.addEventListener('load',loadWorkflow,{once:true});
})();
