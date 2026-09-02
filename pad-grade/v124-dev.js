/* Pad Grade v1.2.4 DEV — callback-queue diagnostics and inspector retirement.
 *
 * This file intentionally does NOT alter the v1.2.2 flickerless heat-map presentation.
 * It retires the temporary DEV resolution picker now that the tier investigation is
 * complete, and adds only lightweight runtime markers used by the Android/native
 * callback timing investigation.
 */
(function installPadGrade124Dev(){
  'use strict';
  if(window.__padGradeDevV124)return;
  window.__padGradeDevV124=true;

  const VERSION='1.2.4';
  window.__padGradeResolutionInspectorEnabled=false;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  // Leave the retired host connected but permanently hidden. v1.1.3 sees its
  // existing connected host and therefore does not recreate it every attach pass.
  // If a prior manual mode somehow survived in the DOM, force Auto exactly once.
  function retireInspector(){
    let found=0,forcedAuto=0;
    for(const id of ['pg112ResolutionInspector','pg113ResolutionInspector']){
      const host=document.getElementById(id);
      if(!host)continue;found++;
      try{
        const auto=host.querySelector?.('button[data-mode="auto"]');
        if(auto&&!auto.classList.contains('primary')){auto.click();forcedAuto++;}
      }catch(e){}
      try{host.setAttribute('aria-hidden','true');host.dataset.pgRetired='v124';}catch(e){}
    }
    return {found,forcedAuto};
  }

  const style=document.createElement('style');
  style.id='pg124InspectorRetiredStyle';
  style.textContent='#pg112ResolutionInspector,#pg113ResolutionInspector{display:none!important;pointer-events:none!important}';
  (document.head||document.documentElement).appendChild(style);

  const retired=retireInspector();
  // Older code can install the host after this script executes. One short delayed
  // pass is enough; once connected, the old install routine reuses that same host.
  setTimeout(retireInspector,0);
  setTimeout(retireInspector,1000);

  mark('heatmap.resolution-inspector-disabled',{version:VERSION,found:retired.found,forcedAuto:retired.forcedAuto,defaultMode:'auto',reason:'diagnostic-complete'});
  mark('file.callback-stage-diagnostics-expected',{version:VERSION,stages:['js-bridge-call','native-file-queue','native-io','android-ui-post','webview-evaluate-to-js','js-callback-microtask']});
})();