/* Pad Grade v0.9.6 DEV — early project bootstrap work.
 * Runs immediately after init.js has restored/rendered the active project, before
 * the legacy project-management chain and map loader finish.
 *
 * v0.9.6 fixes an important ownership bug: earlier builds started an early text
 * sizing worker here but never actually loaded grid-core.js, leaving the visible
 * bottom grid owned by an older forced-layout renderer. Load the authoritative
 * immediate-paint/worker grid core first, then let the map-grid fast path wrap
 * that final renderGrid implementation.
 */
(function startPadGradeEarlyProjectWork(){
  'use strict';

  function diagMark(name,details){try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}}

  function loadScriptOnce(src,attr,errorText,onload){
    const selector=`script[${attr}]`,existing=document.querySelector(selector);
    if(existing){
      if(existing.dataset.loaded==='1'){onload?.();return existing;}
      if(onload)existing.addEventListener('load',onload,{once:true});
      return existing;
    }
    const script=document.createElement('script');
    script.src=src;script.async=false;script.setAttribute(attr,'1');
    script.onload=()=>{script.dataset.loaded='1';onload?.();};
    script.onerror=()=>console.error(errorText);
    document.body.appendChild(script);
    return script;
  }

  function loadFileIdsEarly(){
    if(document.querySelector('script[data-padgrade-v080-file-id]'))return;
    const script=document.createElement('script');
    script.src='v080-file-id.js?v=20260829-3';
    script.async=true;
    script.dataset.padgradeV080FileId='1';
    script.onerror=()=>console.error('Pad Grade early File-ID module failed to load');
    document.body.appendChild(script);
    window.__padGradeFileIdStartupV094='local-file-id-module-started-immediately-after-project-load';
  }

  function loadAfterGridCore(){
    loadScriptOnce('v095-map-grid-fastpath.js?v=20260829-3','data-padgrade-v095-map-grid-fastpath','Pad Grade v0.9.5 map-grid fast path failed to load',()=>{
      try{window.__padGradeRefreshMapGridNow?.(true);}catch(e){}
      diagMark('map.fast-grid-owner-ready');
    });
    loadScriptOnce('v095-reading-dialog.js?v=20260829-1','data-padgrade-v095-reading-dialog','Pad Grade v0.9.5 reading dialog layout failed to load');
    loadFileIdsEarly();
  }

  diagMark('grid.core-load-requested');
  if(window.__padGradeGridOwned){
    diagMark('grid.core-already-owned');
    loadAfterGridCore();
  }else{
    loadScriptOnce('grid-core.js?v=20260829-2','data-padgrade-grid-core','Pad Grade authoritative worker grid core failed to load',()=>{
      diagMark('grid.core-loaded');
      loadAfterGridCore();
    });
  }

  window.__padGradeEarlyProjectBootstrapV096='authoritative-grid-core-first-then-map-grid-fastpath-and-local-file-ids';
})();
