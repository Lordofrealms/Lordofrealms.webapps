/* Shared Pad Grade platform bridge.
 *
 * Browser target: leaves navigator.geolocation and downloads alone.
 * Android WebView target: the wrapper exposes window.PadGradeNative. When the
 * Precision Location companion is available, we shadow navigator.geolocation
 * with a compatible provider backed by that service. If it is not installed or
 * not yet IPC-capable, the WebView falls back to ordinary browser geolocation.
 */
(function installPadGradePlatform(){
  'use strict';

  const nativeBridge=window.PadGradeNative;

  // Android has its own canonical native Terms/Safety acceptance screen. The
  // shared web build retains the browser Terms gate, but the Android wrapper
  // suppresses that older duplicate so users are not asked to accept twice.
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
  let lastPosition=null;
  let lastPositionReceivedAt=0;
  let startRequested=false;

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

  function ensureStarted(){
    if(startRequested) return;
    startRequested=true;
    setPrecisionState('STARTING','Precision Location');
    try{
      const result=nativeBridge.startPrecisionLocation();
      if(result===false){
        startRequested=false;
        emitError(2,'Precision Location could not be started.');
      }
    }catch(e){
      startRequested=false;
      emitError(2,e&&e.message?e.message:'Could not start Precision Location.');
    }
  }

  function maybeReleaseSubscription(){
    if(watchers.size || oneShots.length) return;
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
      const request={success,error,timer:null};
      request.timer=setTimeout(()=>{
        const index=oneShots.indexOf(request);
        if(index>=0) oneShots.splice(index,1);
        setPrecisionState('ERROR','Precision Location');
        try{ if(typeof error==='function') error(positionError(3,'Precision Location request timed out.')); }catch(e){}
        maybeReleaseSubscription();
      },timeout);
      oneShots.push(request);
      ensureStarted();
    },

    watchPosition(success,error,options){
      const id=nextWatchId++;
      watchers.set(id,{success,error,options:options||{}});
      if(lastPosition) setTimeout(()=>{
        const current=watchers.get(id);
        if(current){ try{ current.success(lastPosition); }catch(e){} }
      },0);
      ensureStarted();
      return id;
    },

    clearWatch(id){
      watchers.delete(id);
      maybeReleaseSubscription();
    }
  };

  window.__padGradeNativeLocation=function(payload){
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
    emitError(2,message||'Precision Location unavailable.');
    maybeReleaseSubscription();
  };

  window.__padGradeNativeProviderStopped=function(){
    startRequested=false;
    setPrecisionState('STOPPED',platform.lastLocationMeta.solutionMode||'Precision Location');
  };

  // Navigator.geolocation is normally inherited from Navigator.prototype. An
  // own-property shadows that getter inside the Android WebView without changing
  // anything in the browser build.
  try{
    Object.defineProperty(navigator,'geolocation',{
      value:nativeGeolocation,
      configurable:true,
      enumerable:true
    });
  }catch(e){
    // If a future WebView makes Navigator non-configurable, expose the provider
    // explicitly so Pad Grade can switch to it with a tiny compatibility change.
    platform.geolocation=nativeGeolocation;
  }
})();
