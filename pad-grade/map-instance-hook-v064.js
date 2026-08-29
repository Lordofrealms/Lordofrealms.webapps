/* Pad Grade v0.6.4 DEV — explicit MapLibre instance capture before map.js creates the GPS map. */
(function installPadGradeMapInstanceHook064(){
  'use strict';
  if(!window.maplibregl || !window.maplibregl.Map || window.__padGradeMapInstanceHook064) return;
  window.__padGradeMapInstanceHook064=true;

  const OriginalMap=window.maplibregl.Map;
  class PadGradeCapturedMap extends OriginalMap{
    constructor(options){
      super(options);
      // Only the application's real GPS/project map owns the global primary-map
      // pointer. Feature maps (including Project Comparison) must remain private
      // to their feature so project-grid/heat-map hooks cannot attach to them.
      const container=options&&options.container;
      const containerId=typeof container==='string'?container:(container&&container.id);
      if(containerId==='gpsMap'){
        window.__padGradeMapInstance=this;
        try{window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:this}}));}catch(e){}
      }
    }
  }
  try{Object.setPrototypeOf(PadGradeCapturedMap,OriginalMap);}catch(e){}
  try{window.maplibregl.Map=PadGradeCapturedMap;}catch(e){}
  window.__padGradeMapInstanceHookInstalled=(window.maplibregl.Map===PadGradeCapturedMap);

  // capture-fix.js contains an older fallback hook guarded by this historical
  // flag. Mark it satisfied here so that fallback cannot wrap this constructor
  // a second time and make feature maps steal the primary project-map pointer.
  if(window.__padGradeMapInstanceHookInstalled)window.__padGradeMapHookInstalled=true;
})();
