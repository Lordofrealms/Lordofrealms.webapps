/* Pad Grade v0.4.3 bootstrap.
 * Keeps resilient corner capture, captures the MapLibre instance, loads the
 * v0.3.x field workflow, then applies v0.4.x projects/storage/grid behavior.
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

(function installV050Bootstrap(){
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
    link.rel='stylesheet'; link.href=href; link.setAttribute(`data-${key}`,'1');
    document.head.appendChild(link);
  }
  addStyle('v030.css?v=20260822-2','padgrade-v030');
  addStyle('v031.css?v=20260822-1','padgrade-v031');
  addStyle('v040.css?v=20260822-1','padgrade-v040');
  addStyle('v041.css?v=20260822-1','padgrade-v041');
  addStyle('v042.css?v=20260822-1','padgrade-v042');

  function loadScript(src,key,onload){
    if(document.querySelector(`script[data-${key}]`)){ if(onload) onload(); return; }
    const script=document.createElement('script');
    script.src=src; script.setAttribute(`data-${key}`,'1'); script.onload=onload;
    document.body.appendChild(script);
  }

  function polishLoadedWorkflow(){
    document.title='Pad Grade Mapper v0.5.0';

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
          loadScript('v041.js?v=20260822-1','padgrade-v041',()=>{
            loadScript('v041-persist.js?v=20260822-1','padgrade-v041-persist',()=>{
              loadScript('v042.js?v=20260822-1','padgrade-v042',()=>{
                loadScript('v043.js?v=20260822-1','padgrade-v043',()=>{
                  loadScript('v046.js?v=20260822-1','padgrade-v046',()=>{
                    loadScript('v047.js?v=20260822-1','padgrade-v047',()=>{
                      loadScript('v048.js?v=20260822-1','padgrade-v048',()=>{
                        loadScript('v049.js?v=20260822-1','padgrade-v049',()=>{
                          loadScript('v050.js?v=20260822-1','padgrade-v050');
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
    });
  }

  function loadWorkflow(){
    loadScript('v030.js?v=20260822-2','padgrade-v030',polishLoadedWorkflow);
  }

  if(document.readyState==='complete') loadWorkflow();
  else window.addEventListener('load',loadWorkflow,{once:true});
})();
