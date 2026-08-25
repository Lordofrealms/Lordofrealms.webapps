/* Pad Grade v0.6.4 DEV — explicit MapLibre instance capture before map.js creates the GPS map. */
(function installPadGradeMapInstanceHook064(){
  'use strict';
  if(!window.maplibregl || !window.maplibregl.Map || window.__padGradeMapInstanceHook064) return;
  window.__padGradeMapInstanceHook064=true;

  const OriginalMap=window.maplibregl.Map;
  class PadGradeCapturedMap extends OriginalMap{
    constructor(options){
      super(options);
      window.__padGradeMapInstance=this;
      try{window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:this}}));}catch(e){}
    }
  }
  try{Object.setPrototypeOf(PadGradeCapturedMap,OriginalMap);}catch(e){}
  try{window.maplibregl.Map=PadGradeCapturedMap;}catch(e){}
  window.__padGradeMapInstanceHookInstalled=(window.maplibregl.Map===PadGradeCapturedMap);
})();
