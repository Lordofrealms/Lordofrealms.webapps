/* Pad Grade v0.8.6 DEV — map ownership, early grid, and foreground render order.
 *
 * Goals:
 * - start the existing GPS grid-overlay owner at DOM-ready instead of waiting for
 *   the full window-load event;
 * - never allow project/comparison heat maps to cover their grid geometry;
 * - keep comparison maps private from the live-project map stack;
 * - load the v0.8.6 comparison presentation layer after the comparison feature.
 */
(function installPadGrade085MapRenderOrder(){
  'use strict';

  const VERSION='v0.8.6 DEV';
  const PRIMARY_GRID='pad-grade-grid-lines-layer';
  const PRIMARY_OUTLINE='pad-grade-pad-outline-layer';
  const PRIMARY_ROUTE='pad-grade-route-layer';
  const PRIMARY_POINTS='pad-grade-grid-points-layer';
  const PRIMARY_LABELS='pad-grade-grid-labels';
  const PRIMARY_FIX='pad-grade-current-fix-layer';
  const PRIMARY_HEAT_PREFIX='pad-grade-interpolated-surface-canvas-layer-';

  const COMPARE_GRID='pg-compare-grid-layer';
  const COMPARE_OUTLINE='pg-compare-outline-layer';
  const COMPARE_POINTS='pg-compare-point-layer';
  const COMPARE_LABELS='pg-compare-label-layer';
  const COMPARE_HEAT_PREFIX='pg-compare-heat-layer-';

  function mapContainerId(options){
    const container=options&&options.container;
    return typeof container==='string'?container:(container&&container.id)||'';
  }
  function layerIds(map){try{return (map.getStyle()?.layers||[]).map(x=>x&&x.id).filter(Boolean);}catch(e){return [];}}
  function hasLayer(map,id){try{return !!(map&&map.getLayer&&map.getLayer(id));}catch(e){return false;}}
  function moveBeforeIfNeeded(map,id,before){
    try{if(!hasLayer(map,id)||!hasLayer(map,before))return;const ids=layerIds(map),a=ids.indexOf(id),b=ids.indexOf(before);if(a<0||b<0||a<b)return;map.moveLayer(id,before);}catch(e){}
  }
  function moveToTopIfNeeded(map,id){
    try{if(!hasLayer(map,id))return;const ids=layerIds(map),at=ids.indexOf(id);if(at<0||at===ids.length-1)return;map.moveLayer(id);}catch(e){}
  }

  function primaryGridReady(map){return hasLayer(map,PRIMARY_GRID)&&hasLayer(map,PRIMARY_POINTS);}
  function primaryHeatIds(map){return layerIds(map).filter(id=>id.startsWith(PRIMARY_HEAT_PREFIX));}
  function comparisonHeatIds(map){return layerIds(map).filter(id=>id.startsWith(COMPARE_HEAT_PREFIX));}
  function heatmapShouldShow(){const toggle=document.getElementById('heatmapToggle');return !toggle||!!toggle.checked;}

  function attachPrimary(map){
    if(!map||map.__padGrade085PrimaryGuard)return;
    map.__padGrade085PrimaryGuard=true;
    const rawAddLayer=map.addLayer.bind(map),rawSetLayout=map.setLayoutProperty.bind(map);
    let scheduled=false;
    function enforce(){
      scheduled=false;
      const ready=primaryGridReady(map),heat=primaryHeatIds(map);
      if(!ready){for(const id of heat)try{rawSetLayout(id,'visibility','none');}catch(e){}return;}
      for(const id of heat){moveBeforeIfNeeded(map,id,PRIMARY_GRID);try{rawSetLayout(id,'visibility',heatmapShouldShow()?'visible':'none');}catch(e){}}
      for(const id of [PRIMARY_GRID,PRIMARY_OUTLINE,PRIMARY_ROUTE,PRIMARY_POINTS,PRIMARY_LABELS])moveToTopIfNeeded(map,id);
      moveToTopIfNeeded(map,PRIMARY_FIX);
    }
    function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enforce);}
    map.addLayer=function(layer,beforeId){
      const id=layer&&layer.id||'';
      if(id.startsWith(PRIMARY_HEAT_PREFIX)&&primaryGridReady(map))beforeId=PRIMARY_GRID;
      const out=rawAddLayer(layer,beforeId);
      if(id.startsWith(PRIMARY_HEAT_PREFIX)&&!primaryGridReady(map))try{rawSetLayout(id,'visibility','none');}catch(e){}
      schedule();return out;
    };
    map.setLayoutProperty=function(id,name,value){
      if(String(id||'').startsWith(PRIMARY_HEAT_PREFIX)&&name==='visibility'&&value==='visible'&&!primaryGridReady(map))return rawSetLayout(id,name,'none');
      const out=rawSetLayout(id,name,value);schedule();return out;
    };
    try{map.on('load',schedule);map.on('styledata',schedule);}catch(e){}
    schedule();
  }

  function attachComparison(map){
    if(!map||map.__padGrade085CompareGuard)return;
    map.__padGrade085CompareGuard=true;
    window.__padGradeCompareMapInstance=map;
    const rawAddLayer=map.addLayer.bind(map);
    let scheduled=false;
    function enforce(){
      scheduled=false;
      if(!hasLayer(map,COMPARE_GRID))return;
      for(const id of comparisonHeatIds(map))moveBeforeIfNeeded(map,id,COMPARE_GRID);
      try{map.setPaintProperty(COMPARE_GRID,'line-width',1.5);map.setPaintProperty(COMPARE_GRID,'line-opacity',.88);}catch(e){}
      for(const id of [COMPARE_GRID,COMPARE_OUTLINE,COMPARE_POINTS,COMPARE_LABELS])moveToTopIfNeeded(map,id);
    }
    function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enforce);}
    map.addLayer=function(layer,beforeId){
      const id=layer&&layer.id||'';
      if(id.startsWith(COMPARE_HEAT_PREFIX)&&hasLayer(map,COMPARE_GRID))beforeId=COMPARE_GRID;
      const out=rawAddLayer(layer,beforeId);schedule();return out;
    };
    try{map.on('load',schedule);map.on('styledata',schedule);}catch(e){}
    schedule();
  }

  function installConstructorGuard(){
    if(!window.maplibregl||!window.maplibregl.Map||window.__padGradeMapRenderOrder085)return;
    window.__padGradeMapRenderOrder085=true;
    const PreviousMap=window.maplibregl.Map;
    class PadGradeRenderOrderedMap extends PreviousMap{
      constructor(options){super(options);const id=mapContainerId(options);if(id==='gpsMap')attachPrimary(this);else if(id==='pgCompareMap')attachComparison(this);}
    }
    try{Object.setPrototypeOf(PadGradeRenderOrderedMap,PreviousMap);}catch(e){}
    try{window.maplibregl.Map=PadGradeRenderOrderedMap;}catch(e){}
    if(window.__padGradeMapInstance)attachPrimary(window.__padGradeMapInstance);
  }

  function startGridOverlayOwnerEarly(){
    if(document.querySelector('script[data-padgrade-v030]'))return;
    const script=document.createElement('script');script.src='v030.js?v=20260822-2';script.async=false;script.setAttribute('data-padgrade-v030','1');
    script.onerror=()=>console.error('Pad Grade v0.8.6 early GPS grid overlay failed to load');document.body.appendChild(script);
  }

  function loadComparePresentation(){
    if(document.querySelector('script[data-padgrade-v086-compare-presentation]'))return;
    const script=document.createElement('script');script.src='v086-compare-presentation.js?v=20260829-1';script.async=false;script.setAttribute('data-padgrade-v086-compare-presentation','1');document.body.appendChild(script);
  }

  installConstructorGuard();
  window.addEventListener('padgrade-map-created',ev=>{const map=ev?.detail?.map||window.__padGradeMapInstance;if(map)attachPrimary(map);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{startGridOverlayOwnerEarly();setTimeout(loadComparePresentation,0);},{once:true});
  else{startGridOverlayOwnerEarly();setTimeout(loadComparePresentation,0);}

  document.title=`Pad Grade Mapper ${VERSION}`;
  window.__padGradeDevVersion085=VERSION;
  window.__padGradeMapRenderOrder='imagery-then-heatmap-then-grid-points-labels';
})();
