/* Pad Grade v0.7.1 DEV — progressive heat-map layer UI integration. */
(function installPadGrade071ProgressiveLayerUi(){
  'use strict';
  document.title='Pad Grade Mapper v0.7.1 DEV';
  const LAYER_PREFIX='pad-grade-interpolated-surface-layer-';
  const GRID_ANCHORS=['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'];
  const $=id=>document.getElementById(id);
  let sliderHooked=false;

  function opacity(){
    try{return typeof window.pgHeatmapOpacity==='function'?window.pgHeatmapOpacity():.58;}catch(e){return .58;}
  }

  function heatLayers(map){
    try{return (map?.getStyle?.()?.layers||[]).map(x=>x.id).filter(id=>String(id).startsWith(LAYER_PREFIX));}catch(e){return [];}
  }

  function applyOpacity(){
    const map=window.__padGradeMapInstance;if(!map)return false;
    const value=opacity();let changed=false;
    for(const id of heatLayers(map)){
      try{map.setPaintProperty(id,'fill-opacity',value);changed=true;}catch(e){}
    }
    if(changed)try{map.triggerRepaint();}catch(e){}
    return changed;
  }

  function enforceOrder(){
    const map=window.__padGradeMapInstance;if(!map)return false;
    try{
      const ids=(map.getStyle?.()?.layers||[]).map(x=>x.id);
      let anchor=null,anchorIndex=Infinity;
      for(const id of GRID_ANCHORS){const i=ids.indexOf(id);if(i>=0&&i<anchorIndex){anchor=id;anchorIndex=i;}}
      if(!anchor)return false;
      let moved=false;
      for(const id of ids){
        if(!String(id).startsWith(LAYER_PREFIX))continue;
        const i=ids.indexOf(id);
        if(i>anchorIndex){try{map.moveLayer(id,anchor);moved=true;}catch(e){}}
      }
      if(moved)map.triggerRepaint();
      return true;
    }catch(e){return false;}
  }

  function hookSlider(){
    if(sliderHooked)return true;
    const slider=$('heatmapTransparency');if(!slider)return false;
    slider.addEventListener('input',applyOpacity);
    slider.addEventListener('change',applyOpacity);
    sliderHooked=true;return true;
  }

  function maintain(){hookSlider();applyOpacity();enforceOrder();}
  window.addEventListener('padgrade-map-created',()=>setTimeout(maintain,0));
  const timer=setInterval(maintain,500);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  window.__padGradeProgressiveLayerUiV071=true;
})();