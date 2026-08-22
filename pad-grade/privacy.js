(()=>{
  const MESSAGE='Outbound network access is blocked by Pad Grade Mapper privacy mode.';
  const USGS_PREFIX='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/';
  const nativeFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
  const nativeXhrOpen=XMLHttpRequest.prototype.open;

  function requestUrl(input){
    try{
      if(typeof input==='string') return new URL(input,location.href).href;
      if(input && typeof input.url==='string') return new URL(input.url,location.href).href;
    }catch(e){}
    return '';
  }
  function allowed(url,method='GET'){
    return String(method||'GET').toUpperCase()==='GET' && String(url||'').startsWith(USGS_PREFIX);
  }

  // Keep project/GPS data local while permitting only the raster-tile requests
  // needed by the explicitly visible USGS map. Everything else remains blocked.
  if(nativeFetch){
    try{
      window.fetch=(input,init)=>{
        const url=requestUrl(input);
        const method=(init&&init.method)||(input&&input.method)||'GET';
        if(!allowed(url,method)) return Promise.reject(new Error(MESSAGE));
        return nativeFetch(input,init);
      };
    }catch(e){}
  }
  try{
    XMLHttpRequest.prototype.open=function(method,url,...rest){
      const absolute=requestUrl(String(url||''));
      if(!allowed(absolute,method)) throw new Error(MESSAGE);
      return nativeXhrOpen.call(this,method,url,...rest);
    };
  }catch(e){}
  try{ window.WebSocket=function(){ throw new Error(MESSAGE); }; }catch(e){}
  try{ window.EventSource=function(){ throw new Error(MESSAGE); }; }catch(e){}
  try{ navigator.sendBeacon=()=>false; }catch(e){}

  Object.defineProperty(window,'PAD_GRADE_PRIVACY',{value:Object.freeze({
    localProjectData:true,
    networkBlockedByDefault:true,
    allowedNetwork:Object.freeze(['USGS National Map raster tiles']),
    storage:'browser localStorage',
    origin:location.origin
  }),writable:false,configurable:false});
})();
