/* Pad Grade bootstrap.
 * Keeps resilient corner capture, loads the field/project workflow, then hands
 * lower-grid ownership to grid-core.js. GPS-map initialization is now independent
 * and may arrive later through maplibre-loader.js without blocking this workflow.
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

  // Browser-hosted legacy path: if MapLibre happened to be available before this
  // module, keep the historical hook. Android v0.8.7 normally installs the newer
  // primary-map-only hook later through maplibre-loader.js.
  if(window.maplibregl && window.maplibregl.Map && !window.__padGradeMapHookInstalled){
    window.__padGradeMapHookInstalled=true;
    const OriginalMap=window.maplibregl.Map;
    function WrappedMap(options){
      const instance=new OriginalMap(options);
      const container=options&&options.container;
      const id=typeof container==='string'?container:(container&&container.id);
      if(id==='gpsMap'){
        window.__padGradeMapInstance=instance;
        try{window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:instance}}));}catch(e){}
      }
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

  function nativeFolderIndexReady(){
    try{
      const n=window.PadGradeNative;
      if(!n||typeof n.hasProjectFolder!=='function'||!n.hasProjectFolder())return true;
      return typeof n.isProjectFolderIndexReady!=='function'||!!n.isProjectFolderIndexReady();
    }catch(e){return false;}
  }

  function loadDurableSyncWhenReady(){
    if(document.querySelector('script[data-padgrade-v040-sync]'))return;
    if(nativeFolderIndexReady()){
      loadScript('v040-sync.js?v=20260829-3','padgrade-v040-sync');
      return;
    }
    let tries=0;
    const timer=setInterval(()=>{
      if(nativeFolderIndexReady()||++tries>=1200){
        clearInterval(timer);
        if(nativeFolderIndexReady())loadScript('v040-sync.js?v=20260829-3','padgrade-v040-sync');
      }
    },100);
    window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  }

  function polishLoadedWorkflow(){
    document.title='Pad Grade Mapper v0.9.3 DEV';

    // Keep the already-rendered lower grid visible. grid-core builds its complete
    // replacement off-DOM and swaps it atomically, so hiding a valid project grid
    // while storage/map dependencies settle only hurts startup responsiveness.
    const gridShell=document.querySelector('.gridShell');
    if(gridShell){
      gridShell.style.visibility='';
      gridShell.removeAttribute('data-grid-booting');
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
        // Durable-folder enumeration is intentionally NOT on this chain. If the
        // SAF provider is still indexing, v040-sync is loaded later after the
        // native ready flag turns true; the project UI/grid continues now.
        loadDurableSyncWhenReady();
        loadScript('v041.js?v=20260822-1','padgrade-v041',()=>{
          loadScript('v041-persist.js?v=20260829-2','padgrade-v041-persist',()=>{
            loadScript('v042.js?v=20260822-1','padgrade-v042',()=>{
              loadScript('migration-core.js?v=20260822-1','padgrade-migration-core',()=>{
                loadScript('v048.js?v=20260822-1','padgrade-v048',()=>{
                  loadScript('v052.js?v=20260822-1','padgrade-v052',()=>{
                    setTimeout(()=>{
                      endLegacyResizeSuppression();
                      loadScript('grid-core.js?v=20260829-2','padgrade-grid-core');
                    },0);
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
    loadScript('v030.js?v=20260829-2','padgrade-v030',polishLoadedWorkflow);
  }

  // DOM-ready is sufficient; waiting for window.load couples the project/grid UI
  // to imagery, dynamically-loaded MapLibre, and other network resources.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadWorkflow,{once:true});
  else loadWorkflow();
})();
