(()=>{
 const ALLOWED_ORIGINS=new Set([location.origin,'https://geocoding.geo.census.gov','https://basemap.nationalmap.gov','https://imagery.nationalmap.gov','https://carto.nationalmap.gov','https://tiles.openfreemap.org','https://raw.githubusercontent.com']);
 const MESSAGE='Outbound request blocked by Tractor Guidance privacy allowlist.';
 const parsed=input=>{try{return new URL(input instanceof Request?input.url:String(input),location.href)}catch(e){return null}};
 const allowed=input=>{const u=parsed(input);return !!u&&(u.protocol==='blob:'||u.protocol==='data:'||ALLOWED_ORIGINS.has(u.origin))};
 const nativeFetch=window.fetch?.bind(window);
 if(nativeFetch)window.fetch=(input,init)=>allowed(input)?nativeFetch(input,init):Promise.reject(new Error(MESSAGE+' '+String(input)));
 try{const nativeOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){if(!allowed(url))throw new Error(MESSAGE+' '+String(url));return nativeOpen.call(this,method,url,...rest)}}catch(e){}
 try{window.WebSocket=function(){throw new Error(MESSAGE)}}catch(e){}
 try{window.EventSource=function(){throw new Error(MESSAGE)}}catch(e){}
 try{navigator.sendBeacon=()=>false}catch(e){}
 Object.defineProperty(window,'TRACTOR_GUIDANCE_PRIVACY',{value:Object.freeze({localGPSStorage:true,analytics:false,beaconBlocked:true,websocketBlocked:true,allowlistedOrigins:Object.freeze([...ALLOWED_ORIGINS]),note:'Map viewport requests can disclose the approximate viewed area to an allowlisted map provider. Address text is sent to the U.S. Census geocoder only when address search is used.'}),writable:false,configurable:false});
})();
