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

  function retireInspector(){
    let removed=0;
    for(const id of ['pg112ResolutionInspector','pg113ResolutionInspector']){
      const host=document.getElementById(id);
      if(!host)continue;
      try{
        const auto=host.querySelector?.('button[data-mode="auto"]');
        if(auto&&!auto.classList.contains('primary'))auto.click();
      }catch(e){}
      try{host.remove();removed++;}catch(e){}
    }
    return removed;
  }

  const style=document.createElement('style');
  style.id='pg124InspectorRetiredStyle';
  style.textContent='#pg112ResolutionInspector,#pg113ResolutionInspector{display:none!important}';
  (document.head||document.documentElement).appendChild(style);

  const firstRemoved=retireInspector();
  const observer=new MutationObserver(()=>retireInspector());
  try{observer.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  window.addEventListener('beforeunload',()=>{try{observer.disconnect();}catch(e){}},{once:true});

  mark('heatmap.resolution-inspector-disabled',{version:VERSION,removed:firstRemoved,defaultMode:'auto',reason:'diagnostic-complete'});
  mark('file.callback-stage-diagnostics-expected',{version:VERSION,stages:['js-bridge-call','native-file-queue','native-io','android-ui-post','webview-evaluate-to-js','js-callback-microtask']});
})();
