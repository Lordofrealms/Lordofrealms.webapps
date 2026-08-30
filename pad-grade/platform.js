/* Shared Pad Grade platform bridge.
 *
 * Browser target: leaves navigator.geolocation and downloads alone.
 * Android WebView target: the wrapper exposes window.PadGradeNative. When the
 * Precision Location companion is available, we shadow navigator.geolocation
 * with a compatible provider backed by that service. If it is unavailable or
 * later fails, active requests transparently continue on ordinary WebView/
 * Android geolocation.
 */
(function installPadGradePlatform(){
  'use strict';

  const nativeBridge=window.PadGradeNative;
  const originalGeolocation=(function captureOriginalGeolocation(){
    try{
      const geo=navigator.geolocation;
      if(!geo) return null;
      return {
        getCurrentPosition:typeof geo.getCurrentPosition==='function'?geo.getCurrentPosition.bind(geo):null,
        watchPosition:typeof geo.watchPosition==='function'?geo.watchPosition.bind(geo):null,
        clearWatch:typeof geo.clearWatch==='function'?geo.clearWatch.bind(geo):null
      };
    }catch(e){ return null; }
  })();

  if(nativeBridge){
    try{ localStorage.setItem('padGradeTermsAcceptedVersion','2026-08-19-v1'); }catch(e){}
    const removeLegacyTerms=()=>{
      try{ document.getElementById('termsGate')?.remove(); }catch(e){}
      try{ document.getElementById('termsBtn')?.remove(); }catch(e){}
    };
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',removeLegacyTerms,{once:true});
    }else removeLegacyTerms();
    try{
      const observer=new MutationObserver(()=>removeLegacyTerms());
      observer.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(()=>observer.disconnect(),5000);
    }catch(e){}
  }

  let precisionAvailable=false;
  if(nativeBridge && typeof nativeBridge.startPrecisionLocation==='function'){
    try{
      precisionAvailable=typeof nativeBridge.isPrecisionLocationAvailable==='function'
        ? !!nativeBridge.isPrecisionLocationAvailable()
        : true;
    }catch(e){ precisionAvailable=false; }
  }

  const platform={
    target:nativeBridge?'android':'web',
    nativePrecisionLocation:precisionAvailable,
    lastLocationMeta:precisionAvailable?{
      provider:'precision-location',
      solutionMode:'Precision Location',
      solutionState:'STARTING',
      fixAgeMs:0,
      timestamp:0
    }:{
      provider:'native',
      solutionMode:'Native GPS',
      solutionState:'UNKNOWN',
      fixAgeMs:0,
      timestamp:0
    },
    saveTextFile(filename,mimeType,text){
      if(!nativeBridge || typeof nativeBridge.saveTextFile!=='function') return false;
      try{
        return !!nativeBridge.saveTextFile(
          String(filename||'pad-grade.txt'),
          String(mimeType||'text/plain'),
          String(text??'')
        );
      }catch(e){ return false; }
    }
  };
  window.PadGradePlatform=platform;

  if(!precisionAvailable) return;

  let nextWatchId=1;
  const watchers=new Map();
  const oneShots=[];
  const fallbackWatchIds=new Map();
  let lastPosition=null;
  let lastPositionReceivedAt=0;
  let startRequested=false;
  let fallbackActive=false;

  function positionError(code,message){
    return {code,message:String(message||'Location unavailable')};
  }

  function setPrecisionState(state,mode){
    platform.lastLocationMeta={
      provider:'precision-location',
      solutionMode:mode||platform.lastLocationMeta.solutionMode||'Precision Location',
      solutionState:state||'UNKNOWN',
      fixAgeMs:platform.lastLocationMeta.fixAgeMs||0,
      timestamp:platform.lastLocationMeta.timestamp||0
    };
  }

  function setNativeFallbackState(state){
    platform.lastLocationMeta={
      provider:'native',
      solutionMode:'Native GPS',
      solutionState:state||'WAITING',
      fixAgeMs:0,
      timestamp:Date.now()
    };
  }

  function emitError(code,message){
    setPrecisionState('ERROR','Precision Location');
    const err=positionError(code,message);
    for(const watcher of watchers.values()){
      try{ if(typeof watcher.error==='function') watcher.error(err); }catch(e){}
    }
    while(oneShots.length){
      const request=oneShots.shift();
      clearTimeout(request.timer);
      try{ if(typeof request.error==='function') request.error(err); }catch(e){}
    }
  }

  function positionFromPayload(payload){
    const p=typeof payload==='string'?JSON.parse(payload):payload;
    if(!p || !Number.isFinite(+p.latitude) || !Number.isFinite(+p.longitude)) return null;
    const accuracy=Number.isFinite(+p.horizontalAccuracy)?+p.horizontalAccuracy:NaN;
    const altitude=Number.isFinite(+p.altitude)?+p.altitude:null;
    const verticalAccuracy=Number.isFinite(+p.verticalAccuracy)?+p.verticalAccuracy:null;
    const speed=Number.isFinite(+p.speed)?+p.speed:null;
    const heading=Number.isFinite(+p.bearing)?+p.bearing:null;
    const timestamp=Number.isFinite(+p.timestamp)?+p.timestamp:Date.now();
    platform.lastLocationMeta={
      provider:'precision-location',
      solutionMode:p.solutionMode||'Precision Location',
      solutionState:p.solutionState||'UNKNOWN',
      fixAgeMs:Number.isFinite(+p.fixAgeMs)?+p.fixAgeMs:0,
      timestamp
    };
    return {
      coords:{
        latitude:+p.latitude,
        longitude:+p.longitude,
        accuracy,
        altitude,
        altitudeAccuracy:verticalAccuracy,
        heading,
        speed,
        solutionMode:platform.lastLocationMeta.solutionMode,
        solutionState:platform.lastLocationMeta.solutionState,
        fixAgeMs:platform.lastLocationMeta.fixAgeMs,
        provider:'precision-location'
      },
      timestamp
    };
  }

  function canUseNativeFallback(){
    return !!(originalGeolocation && originalGeolocation.getCurrentPosition && originalGeolocation.watchPosition);
  }

  function acceptNativeFallbackPosition(pos){
    if(!pos || !pos.coords || !Number.isFinite(+pos.coords.latitude) || !Number.isFinite(+pos.coords.longitude)) return false;
    lastPosition=pos;
    lastPositionReceivedAt=Date.now();
    const timestamp=Number.isFinite(+pos.timestamp)?+pos.timestamp:Date.now();
    platform.lastLocationMeta={
      provider:'native',
      solutionMode:'Native GPS',
      solutionState:'ACTIVE',
      fixAgeMs:Math.max(0,Date.now()-timestamp),
      timestamp
    };
    return true;
  }

  function removeOneShot(request){
    const index=oneShots.indexOf(request);
    if(index>=0) oneShots.splice(index,1);
  }

  function startFallbackOneShot(request){
    if(!request || request.fallbackStarted || !originalGeolocation || !originalGeolocation.getCurrentPosition) return;
    request.fallbackStarted=true;
    clearTimeout(request.timer);
    request.timer=null;
    try{
      originalGeolocation.getCurrentPosition(
        pos=>{
          removeOneShot(request);
          if(acceptNativeFallbackPosition(pos)){
            try{ if(typeof request.success==='function') request.success(pos); }catch(e){}
          }else{
            try{ if(typeof request.error==='function') request.error(positionError(2,'Native GPS returned an invalid position.')); }catch(e){}
          }
          maybeReleaseSubscription();
        },
        err=>{
          removeOneShot(request);
          setNativeFallbackState('ERROR');
          try{ if(typeof request.error==='function') request.error(err||positionError(2,'Native GPS unavailable.')); }catch(e){}
          maybeReleaseSubscription();
        },
        request.options||{}
      );
    }catch(e){
      removeOneShot(request);
      setNativeFallbackState('ERROR');
      try{ if(typeof request.error==='function') request.error(positionError(2,e&&e.message?e.message:'Native GPS could not be started.')); }catch(err){}
      maybeReleaseSubscription();
    }
  }

  function startFallbackWatch(id){
    if(fallbackWatchIds.has(id) || !originalGeolocation || !originalGeolocation.watchPosition) return;
    const watcher=watchers.get(id);
    if(!watcher) return;
    try{
      const nativeId=originalGeolocation.watchPosition(
        pos=>{
          if(!watchers.has(id)) return;
          if(!acceptNativeFallbackPosition(pos)) return;
          const current=watchers.get(id);
          try{ if(current && typeof current.success==='function') current.success(pos); }catch(e){}
        },
        err=>{
          if(!watchers.has(id)) return;
          setNativeFallbackState('ERROR');
          const current=watchers.get(id);
          try{ if(current && typeof current.error==='function') current.error(err||positionError(2,'Native GPS unavailable.')); }catch(e){}
        },
        watcher.options||{}
      );
      fallbackWatchIds.set(id,nativeId);
    }catch(e){
      setNativeFallbackState('ERROR');
      try{ if(typeof watcher.error==='function') watcher.error(positionError(2,e&&e.message?e.message:'Native GPS could not be started.')); }catch(err){}
    }
  }

  function activateNativeFallback(reason){
    if(fallbackActive){
      for(const id of watchers.keys()) startFallbackWatch(id);
      for(const request of [...oneShots]) startFallbackOneShot(request);
      return true;
    }
    if(!canUseNativeFallback()) return false;

    fallbackActive=true;
    startRequested=false;
    lastPosition=null;
    lastPositionReceivedAt=0;
    setNativeFallbackState('WAITING');
    try{
      if(typeof nativeBridge.releasePrecisionLocation==='function') nativeBridge.releasePrecisionLocation();
    }catch(e){}

    for(const id of watchers.keys()) startFallbackWatch(id);
    for(const request of [...oneShots]) startFallbackOneShot(request);
    try{
      window.dispatchEvent(new CustomEvent('padgrade-location-fallback',{detail:{from:'precision-location',to:'native',reason:String(reason||'Precision Location stopped')}}));
    }catch(e){}
    return true;
  }

  function ensureStarted(){
    if(fallbackActive){
      for(const id of watchers.keys()) startFallbackWatch(id);
      for(const request of [...oneShots]) startFallbackOneShot(request);
      return;
    }
    if(startRequested) return;
    startRequested=true;
    setPrecisionState('STARTING','Precision Location');
    try{
      const result=nativeBridge.startPrecisionLocation();
      if(result===false){
        startRequested=false;
        if(!activateNativeFallback('Precision Location could not be started.')) emitError(2,'Precision Location could not be started.');
      }
    }catch(e){
      startRequested=false;
      const message=e&&e.message?e.message:'Could not start Precision Location.';
      if(!activateNativeFallback(message)) emitError(2,message);
    }
  }

  function maybeReleaseSubscription(){
    if(watchers.size || oneShots.length) return;
    for(const [id,nativeId] of fallbackWatchIds.entries()){
      try{ if(originalGeolocation && originalGeolocation.clearWatch) originalGeolocation.clearWatch(nativeId); }catch(e){}
      fallbackWatchIds.delete(id);
    }
    fallbackActive=false;
    startRequested=false;
    try{
      if(typeof nativeBridge.releasePrecisionLocation==='function') nativeBridge.releasePrecisionLocation();
    }catch(e){}
  }

  const nativeGeolocation={
    getCurrentPosition(success,error,options){
      const maxAge=options&&Number.isFinite(+options.maximumAge)?Math.max(0,+options.maximumAge):0;
      if(lastPosition && Date.now()-lastPositionReceivedAt<=maxAge){
        setTimeout(()=>success(lastPosition),0);
        return;
      }
      const timeout=options&&Number.isFinite(+options.timeout)?Math.max(0,+options.timeout):15000;
      const request={success,error,timer:null,options:Object.assign({},options||{},{timeout}),fallbackStarted:false};
      oneShots.push(request);
      if(fallbackActive){
        startFallbackOneShot(request);
        return;
      }
      request.timer=setTimeout(()=>{
        if(request.fallbackStarted) return;
        if(activateNativeFallback('Precision Location request timed out.')) return;
        removeOneShot(request);
        setPrecisionState('ERROR','Precision Location');
        try{ if(typeof error==='function') error(positionError(3,'Precision Location request timed out.')); }catch(e){}
        maybeReleaseSubscription();
      },timeout);
      ensureStarted();
    },

    watchPosition(success,error,options){
      const id=nextWatchId++;
      watchers.set(id,{success,error,options:options||{}});
      if(lastPosition && (!fallbackActive || platform.lastLocationMeta.provider==='native')) setTimeout(()=>{
        const current=watchers.get(id);
        if(current){ try{ current.success(lastPosition); }catch(e){} }
      },0);
      if(fallbackActive) startFallbackWatch(id);
      else ensureStarted();
      return id;
    },

    clearWatch(id){
      if(fallbackWatchIds.has(id)){
        const nativeId=fallbackWatchIds.get(id);
        try{ if(originalGeolocation && originalGeolocation.clearWatch) originalGeolocation.clearWatch(nativeId); }catch(e){}
        fallbackWatchIds.delete(id);
      }
      watchers.delete(id);
      maybeReleaseSubscription();
    }
  };

  // Expose the Precision Location-backed provider so later dev compatibility
  // layers can restore it after temporary fallbacks without reimplementing IPC.
  platform.precisionGeolocation=nativeGeolocation;

  window.__padGradeNativeLocation=function(payload){
    if(fallbackActive) return;
    let pos;
    try{ pos=positionFromPayload(payload); }catch(e){ pos=null; }
    if(!pos) return;
    lastPosition=pos;
    lastPositionReceivedAt=Date.now();

    const pending=oneShots.splice(0,oneShots.length);
    for(const request of pending){
      clearTimeout(request.timer);
      try{ if(typeof request.success==='function') request.success(pos); }catch(e){}
    }
    for(const watcher of watchers.values()){
      try{ if(typeof watcher.success==='function') watcher.success(pos); }catch(e){}
    }
    maybeReleaseSubscription();
  };

  window.__padGradeNativeLocationError=function(message){
    startRequested=false;
    const detail=message||'Precision Location unavailable.';
    if(!activateNativeFallback(detail)){
      emitError(2,detail);
      maybeReleaseSubscription();
    }
  };

  window.__padGradeNativeProviderStopped=function(){
    startRequested=false;
    if(!activateNativeFallback('Precision Location stopped.')){
      setPrecisionState('STOPPED',platform.lastLocationMeta.solutionMode||'Precision Location');
      emitError(2,'Precision Location stopped.');
      maybeReleaseSubscription();
    }
  };

  try{
    Object.defineProperty(navigator,'geolocation',{
      value:nativeGeolocation,
      configurable:true,
      enumerable:true
    });
  }catch(e){
    platform.geolocation=nativeGeolocation;
  }
})();