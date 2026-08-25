/* Pad Grade v0.6.1 dev stability gate.
 * Keep the proven v0.5.4 grid core in charge, start shading OFF, and restore
 * Precision Location now that its companion explicitly whitelists the dev app.
 */
(function installPadGrade062StabilityGate(){
  'use strict';

  const HEATMAP_OPTIN_KEY='padGradeHeatmapOptInV061';
  const $=id=>document.getElementById(id);

  function heatmapEnabled(){
    const toggle=$('heatmapToggle');
    return !!(toggle&&toggle.checked);
  }

  function normalizeGridParent(){
    const grid=$('grid');
    const shell=document.querySelector('.gridShell');
    if(!grid||!shell)return null;

    const stack=$('gradeMapStack');
    if(stack){
      if(grid.parentElement===stack)shell.insertBefore(grid,stack);
      for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer']){
        const el=$(id);
        if(el&&el.parentElement===stack)shell.appendChild(el);
      }
      stack.remove();
    }
    if(grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
    return {grid,shell};
  }

  function clearHeatmapCanvas(){
    const canvas=$('gradeHeatmap');
    if(!canvas)return;
    try{
      const ctx=canvas.getContext&&canvas.getContext('2d');
      if(ctx)ctx.clearRect(0,0,canvas.width||0,canvas.height||0);
    }catch(e){}
    canvas.remove();
  }

  normalizeGridParent();

  // Existing dev installs may have persisted the old default-on heat map. Treat
  // v0.6.1 as a fresh opt-in: it stays off until the user explicitly enables it.
  const baseApplyDevPayload=window.pgApplyDevPayload;
  if(typeof baseApplyDevPayload==='function'){
    window.pgApplyDevPayload=function(dev){
      const next=dev&&typeof dev==='object'?{...dev}:{};
      if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')next.heatmap=false;
      baseApplyDevPayload(next);
      const toggle=$('heatmapToggle');
      if(toggle&&localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    };
  }

  const toggle=$('heatmapToggle');
  if(toggle){
    if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    toggle.addEventListener('change',()=>{
      if(toggle.checked)localStorage.setItem(HEATMAP_OPTIN_KEY,'1');
      else localStorage.removeItem(HEATMAP_OPTIN_KEY);
      if(toggle.checked){
        if(typeof window.pgScheduleSurfaceDraw==='function')window.pgScheduleSurfaceDraw();
      }else{
        clearHeatmapCanvas();
      }
    });
  }

  // Do not create or redraw the heat-map canvas as a side effect of normal grid
  // renders while shading is off. Laser drawing remains independent.
  const baseScheduleSurfaceDraw=window.pgScheduleSurfaceDraw;
  if(typeof baseScheduleSurfaceDraw==='function'){
    window.pgScheduleSurfaceDraw=function(){
      if(!heatmapEnabled()){
        clearHeatmapCanvas();
        try{ if(typeof window.pgDrawLaser==='function')requestAnimationFrame(()=>window.pgDrawLaser()); }catch(e){}
        return;
      }
      return baseScheduleSurfaceDraw();
    };
  }

  const baseDrawSurface=window.pgDrawSurface;
  if(typeof baseDrawSurface==='function'){
    window.pgDrawSurface=function(){
      if(!heatmapEnabled()){
        clearHeatmapCanvas();
        return;
      }
      return baseDrawSurface();
    };
  }

  // v0.6.0 temporarily forced DEV back to ordinary WebView GPS. Precision
  // Location v0.4.5 now whitelists both stable and dev Pad Grade package IDs, so
  // restore the original Precision Location-backed geolocation provider.
  function restorePrecisionProvider(){
    const platform=window.PadGradePlatform;
    const nativeBridge=window.PadGradeNative;
    if(!platform||!nativeBridge||!platform.precisionGeolocation)return false;
    let available=false;
    try{
      available=typeof nativeBridge.isPrecisionLocationAvailable==='function'
        ? !!nativeBridge.isPrecisionLocationAvailable()
        : true;
    }catch(e){available=false;}
    if(!available)return false;
    try{
      Object.defineProperty(navigator,'geolocation',{
        value:platform.precisionGeolocation,
        configurable:true,
        enumerable:true
      });
      platform.nativePrecisionLocation=true;
      platform.lastLocationMeta={
        provider:'precision-location',
        solutionMode:'Precision Location',
        solutionState:'STARTING',
        fixAgeMs:0,
        timestamp:0
      };
      return true;
    }catch(e){return false;}
  }
  restorePrecisionProvider();

  // capture-fix.js intentionally hides the grid until grid-core.js completes its
  // final sizing solve. Wait for that single production owner, then ask it for a
  // clean render. If it fails to load for any reason, reveal the existing grid as
  // a diagnostic fallback rather than leaving the whole pad permanently blank.
  function finishGridStartup(){
    const host=normalizeGridParent();
    if(!host)return false;
    if(window.__padGradeGridOwned&&typeof window.__padGradeRenderGrid==='function'){
      try{window.__padGradeRenderGrid('dev-v0.6.1-stability');}catch(e){console.warn('Pad Grade grid-core render failed',e);}
      host.shell.removeAttribute('data-grid-booting');
      host.shell.style.visibility='visible';
      return true;
    }
    return false;
  }

  function waitForGridCore(){
    let tries=0;
    const poll=()=>{
      if(finishGridStartup())return;
      tries++;
      if(tries<30){setTimeout(poll,100);return;}
      const host=normalizeGridParent();
      if(!host)return;
      try{if(typeof window.renderGrid==='function')window.renderGrid();}catch(e){console.warn('Pad Grade fallback grid render failed',e);}
      host.shell.removeAttribute('data-grid-booting');
      host.shell.style.visibility='visible';
    };
    poll();
  }

  if(document.readyState==='complete')waitForGridCore();
  else window.addEventListener('load',waitForGridCore,{once:true});

  clearHeatmapCanvas();
  window.__padGradeDev061StabilityGate=true;
})();

/* v0.6.2 is deliberately loaded after the stability gate. It removes the old
 * bottom-grid interpolation architecture and installs the continuous surface on
 * the calibrated GPS map instead. */
(function loadPadGrade063(){
  const script=document.createElement('script');
  script.src='v063-dev.js?v=20260825-1';
  script.dataset.padgradeV063='1';
  script.onerror=()=>console.error('Pad Grade v0.6.2 GPS heat-map module failed to load');
  document.body.appendChild(script);
})();
