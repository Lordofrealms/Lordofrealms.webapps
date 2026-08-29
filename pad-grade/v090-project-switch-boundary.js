/* Pad Grade v0.8.9 DEV — hard project-switch rendering boundary.
 *
 * The live project map uses long-lived GeoJSON and double-buffered canvas
 * sources. Switching projects in-place can otherwise leave one frame (or more)
 * containing layers from both projects. User-initiated project changes are now
 * treated as a teardown/reload boundary: clear the old project overlays first,
 * let the existing project manager finish/save the switch, then reload before
 * the browser can paint the newly-applied project on top of stale map state.
 */
(function installPadGrade090ProjectSwitchBoundary(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_GEOJSON_SOURCES=['pad-grade-grid-points','pad-grade-grid-lines','pad-grade-pad-outline','pad-grade-route'];
  const EMPTY={type:'FeatureCollection',features:[]};
  let clickStartActive=null;
  let reloadQueued=false;

  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function primaryMap(){return window.__padGradeMapInstance||null;}
  function clearSource(map,id){
    try{const src=map?.getSource?.(id);if(src&&typeof src.setData==='function')src.setData(EMPTY);}catch(e){}
  }
  function removeHeatmap(map){
    if(!map)return;
    try{
      const style=map.getStyle?.();
      const layers=Array.isArray(style?.layers)?style.layers.slice():[];
      for(let i=layers.length-1;i>=0;i--){
        const id=String(layers[i]?.id||'');
        if(id.startsWith('pad-grade-interpolated-surface-canvas-layer-')||id==='pad-grade-interpolated-surface-layer'||id.startsWith('pad-grade-interpolated-surface-layer-band-')){
          try{if(map.getLayer(id))map.removeLayer(id);}catch(e){}
        }
      }
      const sourceIds=style?.sources&&typeof style.sources==='object'?Object.keys(style.sources):[];
      for(const id of sourceIds){
        if(id.startsWith('pad-grade-interpolated-surface-canvas-source-')||id==='pad-grade-interpolated-surface-raster'||id.startsWith('pad-grade-interpolated-surface-band-source-')||id==='pad-grade-interpolated-surface'||id==='pad-grade-interpolated-surface-mesh'){
          try{if(map.getSource(id))map.removeSource(id);}catch(e){}
        }
      }
      map.triggerRepaint?.();
    }catch(e){}
  }
  function teardownVisibleProject(){
    const map=primaryMap();
    if(map){
      for(const id of PROJECT_GEOJSON_SOURCES)clearSource(map,id);
      removeHeatmap(map);
    }
    try{document.querySelectorAll('.maplibregl-popup').forEach(x=>x.remove());}catch(e){}
    window.__padGradeProjectMapBoundaryState='old-project-cleared-awaiting-switch';
  }
  function queueReload(){
    if(reloadQueued)return;
    reloadQueued=true;
    queueMicrotask(()=>{
      // beforeunload remains authoritative for the project manager's final save.
      location.reload();
    });
  }
  function actionFromEvent(event){
    const button=event.target?.closest?.('button');
    if(!button)return null;
    const act=button.dataset?.act||'';
    if(act==='open')return {kind:'open',button,row:button.closest('[data-id]')};
    if(act==='delete')return {kind:'delete',button,row:button.closest('[data-id]')};
    if(button.id==='v040NewProject')return {kind:'new',button,row:null};
    return null;
  }

  document.addEventListener('click',event=>{
    const action=actionFromEvent(event);if(!action)return;
    clickStartActive=activeId();
    if(action.kind==='open'&&action.row?.dataset?.id&&action.row.dataset.id!==clickStartActive){
      // Open has no confirmation prompt, so it is safe to blank the old project
      // before the existing manager applies the requested project.
      teardownVisibleProject();
    }
  },true);

  document.addEventListener('click',event=>{
    const action=actionFromEvent(event);if(!action)return;
    const before=clickStartActive,after=activeId();clickStartActive=null;
    if(before&&after&&before!==after){
      if(action.kind!=='open')teardownVisibleProject();
      queueReload();
    }
  });

  // Project import is asynchronous. Wrap whichever import owner is current and
  // reload in the same microtask turn that the imported project becomes active,
  // before a mixed old/new map frame can be painted.
  function wrapImport(){
    const fn=window.importProjectFile;
    if(typeof fn!=='function'||fn.__padGradeSwitchBoundary)return;
    const wrapped=async function(){
      const before=activeId();
      const result=await fn.apply(this,arguments);
      const after=activeId();
      if(before&&after&&before!==after){teardownVisibleProject();queueReload();}
      return result;
    };
    wrapped.__padGradeSwitchBoundary=true;
    wrapped.__padGradeSwitchBoundaryBase=fn;
    window.importProjectFile=wrapped;
  }

  let wraps=0;
  const timer=setInterval(()=>{wrapImport();if(++wraps>80)clearInterval(timer);},250);
  wrapImport();
  window.__padGradeProjectSwitchPolicyV090='teardown-old-map-then-reload-new-project-before-paint';
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
