(()=>{
  const MESSAGE='Outbound network access is blocked by Pad Grade Mapper privacy mode.';
  const ALLOWED_GET_PREFIXES=Object.freeze([
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/',
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/',
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/identify',
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/query'
  ]);
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
    if(String(method||'GET').toUpperCase()!=='GET') return false;
    const value=String(url||'');
    return ALLOWED_GET_PREFIXES.some(prefix=>value.startsWith(prefix));
  }

  // Keep project/GPS data local while permitting only the explicitly visible
  // USGS imagery requests and the same-service NAIP Plus identify/query requests
  // used to prove which source resolution the imagery server selected. Everything
  // else remains blocked.
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
    allowedNetwork:Object.freeze([
      'USGS National Map cached imagery',
      'USGS NAIP Plus high-resolution imagery',
      'USGS NAIP Plus selected-source resolution identify diagnostic',
      'USGS NAIP Plus best-positive-resolution catalog query diagnostic'
    ]),
    storage:'browser localStorage',
    origin:location.origin
  }),writable:false,configurable:false});
})();
