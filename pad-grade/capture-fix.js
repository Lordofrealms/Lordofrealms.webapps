/* Pad Grade bootstrap.
 * Keeps resilient corner capture, captures the MapLibre instance, loads the
 * field/project/migration layers, then hands grid ownership to grid-core.js.
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

(function installV054Bootstrap(){
  'use strict';

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

  function addStyle(href,key){
    if(document.querySelector(`link[data-${key}]`)) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.setAttribute(`data-${key}`,'1');
    document.head.appendChild(link);
  }

  addStyle('v030.css?v=20260822-2','padgrade-v030');
  addStyle('v031.css?v=20260822-1','padgrade-v031');
  addStyle('v040.css?v=20260822-1','padgrade-v040');
  addStyle('v041.css?v=20260822-1','padgrade-v041');
  addStyle('v042.css?v=20260822-1','padgrade-v042');

  function loadScript(src,key,onload){
    if(document.querySelector(`script[data-${key}]`)){
      if(onload) onload();
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.setAttribute(`data-${key}`,'1');
    script.onload=onload;
    document.body.appendChild(script);
  }

  // Old version layers contain migration/project behavior we still need, but
  // several also register private grid resize/reconcile callbacks. Suppress only
  // those legacy window hooks while the compatibility layers initialize.
  const nativeAddEventListener=window.addEventListener;
  function beginLegacyCompatibilityLoad(){
    window.__padGradeSuppressLegacyGridHooks=true;
    window.addEventListener=function(type,listener,options){
      if(window.__padGradeSuppressLegacyGridHooks &&
         (type==='resize'||type==='padgrade-projects-reconciled')) return;
      return nativeAddEventListener.call(this,type,listener,options);
    };
  }
  function endLegacyCompatibilityLoad(){
    window.__padGradeSuppressLegacyGridHooks=false;
    window.addEventListener=nativeAddEventListener;
  }

  function polishLoadedWorkflow(){
    document.title='Pad Grade Mapper v0.5.4';

    // Hide only the grid shell while compatibility modules initialize. They may
    // still perform private legacy renders, but none are visible to the user.
    const gridShell=document.getElementById('grid')?.parentElement;
    if(gridShell){
      gridShell.style.visibility='hidden';
      gridShell.setAttribute('data-grid-booting','1');
    }

    const calibration=document.querySelector('.v030-calibration');
    const instruction=document.getElementById('gpsInstruction');
    const title=calibration&&calibration.querySelector('.v030-sectionTitle');
    if(calibration&&instruction&&title){
      title.insertAdjacentElement('afterend',instruction);
      instruction.style.marginBottom='8px';
    }

    const summary=document.querySelector('.v030-jobSummary');
    const volumeHelp=document.querySelector('.v030-help[aria-label="Volume estimate information"]');
    if(summary&&volumeHelp){
      const helpWrap=volumeHelp.parentElement;
      const oldCard=volumeHelp.closest('.card');
      if(helpWrap) summary.appendChild(helpWrap);
      if(oldCard&&oldCard!==summary) oldCard.remove();
    }

    loadScript('v031.js?v=20260822-1','padgrade-v031',()=>{
      loadScript('v040.js?v=20260822-1','padgrade-v040',()=>{
        loadScript('v040-sync.js?v=20260822-2','padgrade-v040-sync',()=>{
          beginLegacyCompatibilityLoad();
          loadScript('v041.js?v=20260822-1','padgrade-v041',()=>{
            loadScript('v041-persist.js?v=20260822-1','padgrade-v041-persist',()=>{
              loadScript('v042.js?v=20260822-1','padgrade-v042',()=>{
                // v043/v049/v050/v051/v053 were grid experiments and are no
                // longer part of the runtime stack. v046/v047 remain only for
                // GPS/project migration, v048 for in-place switching, v052 for
                // authoritative rename behavior.
                loadScript('v046.js?v=20260822-1','padgrade-v046',()=>{
                  loadScript('v047.js?v=20260822-1','padgrade-v047',()=>{
                    loadScript('v048.js?v=20260822-1','padgrade-v048',()=>{
                      loadScript('v052.js?v=20260822-1','padgrade-v052',()=>{
                        // Allow any zero-delay legacy boot callbacks to finish,
                        // then permanently replace grid ownership with one core.
                        setTimeout(()=>{
                          endLegacyCompatibilityLoad();
                          loadScript('grid-core.js?v=20260822-1','padgrade-grid-core');
                        },0);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function loadWorkflow(){
    loadScript('v030.js?v=20260822-2','padgrade-v030',polishLoadedWorkflow);
  }

  if(document.readyState==='complete') loadWorkflow();
  else window.addEventListener('load',loadWorkflow,{once:true});
})();
