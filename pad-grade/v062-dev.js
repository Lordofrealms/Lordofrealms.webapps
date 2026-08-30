/* Pad Grade v0.6.1 dev stability gate.
 * Keep the proven lower-grid workflow, start shading OFF, and restore Precision
 * Location now that its companion explicitly whitelists the dev app.
 */
(function installPadGrade062StabilityGate(){
  'use strict';

  const HEATMAP_OPTIN_KEY='padGradeHeatmapOptInV061';
  const $=id=>document.getElementById(id);

  function heatmapEnabled(){const toggle=$('heatmapToggle');return !!(toggle&&toggle.checked);}
  function normalizeGridParent(){
    const grid=$('grid'),shell=document.querySelector('.gridShell');if(!grid||!shell)return null;
    const stack=$('gradeMapStack');
    if(stack){
      if(grid.parentElement===stack)shell.insertBefore(grid,stack);
      for(const id of ['gradeHeatmap','laserMarker','laserPlacementLayer']){const el=$(id);if(el&&el.parentElement===stack)shell.appendChild(el);}
      stack.remove();
    }
    if(grid.parentElement!==shell)shell.insertBefore(grid,shell.firstChild||null);
    return {grid,shell};
  }
  function clearHeatmapCanvas(){
    const canvas=$('gradeHeatmap');if(!canvas)return;
    try{const ctx=canvas.getContext&&canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width||0,canvas.height||0);}catch(e){}
    canvas.remove();
  }

  normalizeGridParent();

  const baseApplyDevPayload=window.pgApplyDevPayload;
  if(typeof baseApplyDevPayload==='function'){
    window.pgApplyDevPayload=function(dev){
      const next=dev&&typeof dev==='object'?{...dev}:{};
      if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')next.heatmap=false;
      baseApplyDevPayload(next);
      const toggle=$('heatmapToggle');if(toggle&&localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    };
  }

  const toggle=$('heatmapToggle');
  if(toggle){
    if(localStorage.getItem(HEATMAP_OPTIN_KEY)!=='1')toggle.checked=false;
    toggle.addEventListener('change',()=>{
      if(toggle.checked)localStorage.setItem(HEATMAP_OPTIN_KEY,'1');else localStorage.removeItem(HEATMAP_OPTIN_KEY);
      if(toggle.checked){if(typeof window.pgScheduleSurfaceDraw==='function')window.pgScheduleSurfaceDraw();}else clearHeatmapCanvas();
    });
  }

  const baseScheduleSurfaceDraw=window.pgScheduleSurfaceDraw;
  if(typeof baseScheduleSurfaceDraw==='function'){
    window.pgScheduleSurfaceDraw=function(){
      if(!heatmapEnabled()){
        clearHeatmapCanvas();
        try{if(typeof window.pgDrawLaser==='function')requestAnimationFrame(()=>window.pgDrawLaser());}catch(e){}
        return;
      }
      return baseScheduleSurfaceDraw();
    };
  }
  const baseDrawSurface=window.pgDrawSurface;
  if(typeof baseDrawSurface==='function'){
    window.pgDrawSurface=function(){if(!heatmapEnabled()){clearHeatmapCanvas();return;}return baseDrawSurface();};
  }

  function restorePrecisionProvider(){
    const platform=window.PadGradePlatform,nativeBridge=window.PadGradeNative;
    if(!platform||!nativeBridge||!platform.precisionGeolocation)return false;
    let available=false;
    try{available=typeof nativeBridge.isPrecisionLocationAvailable==='function'?!!nativeBridge.isPrecisionLocationAvailable():true;}catch(e){available=false;}
    if(!available)return false;
    try{
      Object.defineProperty(navigator,'geolocation',{value:platform.precisionGeolocation,configurable:true,enumerable:true});
      platform.nativePrecisionLocation=true;
      platform.lastLocationMeta={provider:'precision-location',solutionMode:'Precision Location',solutionState:'STARTING',fixAgeMs:0,timestamp:0};
      return true;
    }catch(e){return false;}
  }
  restorePrecisionProvider();

  // v0.9.4: the authoritative grid owner now paints immediately and sizes in a
  // worker. This legacy gate may reveal/normalize the host, but MUST NOT request
  // another grid render after load; doing so would rebuild cells after the first
  // paint and defeat the one-final-resize architecture.
  function finishGridStartup(){
    const host=normalizeGridParent();if(!host)return false;
    if(window.__padGradeGridOwned){
      host.shell.removeAttribute('data-grid-booting');host.shell.style.visibility='visible';
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
      const host=normalizeGridParent();if(!host)return;
      try{if(typeof window.renderGrid==='function')window.renderGrid();}catch(e){console.warn('Pad Grade fallback grid render failed',e);}
      host.shell.removeAttribute('data-grid-booting');host.shell.style.visibility='visible';
    };
    poll();
  }
  if(document.readyState==='complete')waitForGridCore();else window.addEventListener('load',waitForGridCore,{once:true});

  clearHeatmapCanvas();
  window.__padGradeDev061StabilityGate=true;
  window.__padGradeGridStartupGateV094='reveal-only-never-rerender-authoritative-grid';
})();

// v1.0.9: v063-dev.js is loaded exactly once by index.html.
