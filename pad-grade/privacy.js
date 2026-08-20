(()=>{
  const MESSAGE='Outbound network access is disabled by Pad Grade Mapper privacy mode.';
  const fail=()=>{ throw new Error(MESSAGE); };
  const reject=()=>Promise.reject(new Error(MESSAGE));

  // Pad Grade Mapper does not require network access after the page assets load.
  // These guards prevent accidental future code from transmitting GPS/grade data.
  try{ window.fetch=reject; }catch(e){}
  try{ XMLHttpRequest.prototype.open=fail; }catch(e){}
  try{ window.WebSocket=function(){ fail(); }; }catch(e){}
  try{ window.EventSource=function(){ fail(); }; }catch(e){}
  try{ navigator.sendBeacon=()=>false; }catch(e){}

  Object.defineProperty(window,'PAD_GRADE_PRIVACY',{value:Object.freeze({
    localOnly:true,
    networkBlocked:true,
    storage:'browser localStorage',
    origin:location.origin
  }),writable:false,configurable:false});
})();
