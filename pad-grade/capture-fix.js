/* Pad Grade bootstrap.
 * Keeps resilient corner capture, captures the MapLibre instance, loads the
 * field/project workflow, then hands all grid ownership to grid-core.js.
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
    link.rel='stylesheet'; link.href=href; link.setAttribute(`data-${key}`,'1');
    document.head.appendChild(link);
  }

  addStyle('v030.css?v=20260822-2','padgrade-v030');
  addStyle('v031.css?v=20260822-1','padgrade-v031');
  addStyle('v040.css?v=20260822-1','padgrade-v040');
  addStyle('v041.css?v=20260822-1','padgrade-v041');
  addStyle('v042.css?v=20260822-1','padgrade-v042');

  function loadScript(src,key,onload){
    if(document.querySelector(`script[data-${key}]`)){if(onload)onload();return;}
    const script=document.createElement('script');
    script.src=src;
    script.setAttribute(`data-${key}`,'1');
    script.onload=onload;
    document.body.appendChild(script);
  }

  function beginLegacyResizeSuppression(){
    if(window.__padGradeLegacyResizeSuppression)return;
    const original=window.addEventListener.bind(window);
    window.__padGradeOriginalAddEventListener=original;
    window.__padGradeLegacyResizeSuppression=true;
    window.addEventListener=function(type,listener,options){
      if(window.__padGradeLegacyResizeSuppression&&type==='resize')return;
      return original(type,listener,options);
    };
  }

  function endLegacyResizeSuppression(){
    window.__padGradeLegacyResizeSuppression=false;
    if(window.__padGradeOriginalAddEventListener){
      window.addEventListener=window.__padGradeOriginalAddEventListener;
      delete window.__padGradeOriginalAddEventListener;
    }
  }

  function polishLoadedWorkflow(){
    document.title='Pad Grade Mapper v0.5.4';

    // No provisional grid is shown. Older modules can initialize project/storage
    // state behind the curtain; grid-core reveals the grid only after a complete
    // final sizing solve.
    const gridShell=document.querySelector('.gridShell');
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

    // v041/v042 still contain historical grid implementations mixed with useful
    // project-manager UI. Let their UI initialize, but prevent their private
    // window-resize callbacks from ever being registered.
    beginLegacyResizeSuppression();

    loadScript('v031.js?v=20260822-1','padgrade-v031',()=>{
      loadScript('v040.js?v=20260822-1','padgrade-v040',()=>{
        loadScript('v040-sync.js?v=20260822-2','padgrade-v040-sync',()=>{
          loadScript('v041.js?v=20260822-1','padgrade-v041',()=>{
            loadScript('v041-persist.js?v=20260822-1','padgrade-v041-persist',()=>{
              loadScript('v042.js?v=20260822-1','padgrade-v042',()=>{
                // v046/v047 used to mix migration with their own grid renderers.
                // migration-core carries forward the repair behavior only.
                loadScript('migration-core.js?v=20260822-1','padgrade-migration-core',()=>{
                  loadScript('v048.js?v=20260822-1','padgrade-v048',()=>{
                    loadScript('v052.js?v=20260822-1','padgrade-v052',()=>{
                      // Let zero-delay legacy boot callbacks finish while resize
                      // registration is still suppressed, then install the one
                      // production grid owner.
                      setTimeout(()=>{
                        endLegacyResizeSuppression();
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
  }

  function loadWorkflow(){
    loadScript('v030.js?v=20260822-2','padgrade-v030',polishLoadedWorkflow);
  }

  if(document.readyState==='complete') loadWorkflow();
  else window.addEventListener('load',loadWorkflow,{once:true});
})();
