/* Capture the MapLibre map instance without changing the proven imagery module. */
(function installPadGradeMapHook(){
  'use strict';
  if(!window.maplibregl || !window.maplibregl.Map || window.__padGradeMapHookInstalled) return;
  window.__padGradeMapHookInstalled=true;
  const OriginalMap=window.maplibregl.Map;
  function WrappedMap(options){
    const instance=new OriginalMap(options);
    window.__padGradeMapInstance=instance;
    try{ window.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:instance}})); }catch(e){}
    return instance;
  }
  WrappedMap.prototype=OriginalMap.prototype;
  try{ Object.setPrototypeOf(WrappedMap,OriginalMap); }catch(e){}
  for(const key of Object.keys(OriginalMap)){
    try{ WrappedMap[key]=OriginalMap[key]; }catch(e){}
  }
  window.maplibregl.Map=WrappedMap;
})();
