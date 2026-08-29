/* Pad Grade v0.9.4 DEV — explicit MapLibre instance capture before map.js creates the GPS map.
 *
 * The primary map is exposed immediately through padgrade-primary-map-captured so
 * the lightweight project-grid owner can attach before style readiness. The
 * historical padgrade-map-created event is deferred until style.load; by then the
 * grid owner has had first claim on the style and can install grid/point layers
 * before older heat-map listeners begin interpolation work.
 */
(function installPadGradeMapInstanceHook064(){
  'use strict';
  if(!window.maplibregl || !window.maplibregl.Map || window.__padGradeMapInstanceHook064) return;
  window.__padGradeMapInstanceHook064=true;

  const OriginalMap=window.maplibregl.Map;
  class PadGradeCapturedMap extends OriginalMap{
    constructor(options){
      super(options);
      // Only the application's real GPS/project map owns the global primary-map
      // pointer. Feature maps (including Project Comparison) remain private.
      const container=options&&options.container;
      const containerId=typeof container==='string'?container:(container&&container.id);
      if(containerId==='gpsMap'){
        window.__padGradeMapInstance=this;

        // Give the fast grid owner the map immediately. It registers its
        // style.load listener synchronously during this event.
        try{window.dispatchEvent(new CustomEvent('padgrade-primary-map-captured',{detail:{map:this}}));}catch(e){}

        let announced=false;
        const announceCreated=()=>{
          if(announced)return;announced=true;
          try{window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:this}}));}catch(e){}
        };
        try{
          if(typeof this.isStyleLoaded==='function'&&this.isStyleLoaded())queueMicrotask(announceCreated);
          else this.once('style.load',announceCreated);
        }catch(e){setTimeout(announceCreated,0);}
      }
    }
  }
  try{Object.setPrototypeOf(PadGradeCapturedMap,OriginalMap);}catch(e){}
  try{window.maplibregl.Map=PadGradeCapturedMap;}catch(e){}
  window.__padGradeMapInstanceHookInstalled=(window.maplibregl.Map===PadGradeCapturedMap);

  // capture-fix.js contains an older fallback hook guarded by this historical
  // flag. Mark it satisfied so feature maps cannot steal primary-map ownership.
  if(window.__padGradeMapInstanceHookInstalled)window.__padGradeMapHookInstalled=true;
  window.__padGradeMapCreatePriorityV094='primary-captured-first-grid-style-ready-before-map-created-heatmap';
})();
