/* Pad Grade v0.9.4 DEV — non-blocking MapLibre bootstrap.
 *
 * The application UI and local grade grid never wait on a CDN. Android packages
 * pinned MapLibre 5.16.0 locally. Map-specific modules load asynchronously after
 * local project UI is usable.
 *
 * Ordering matters: capture hook -> fast project-grid owner -> map.js. This lets
 * the lightweight grid subscribe before map.js constructs the primary map. The
 * historical map-created event is then released only after style readiness, so
 * heat-map interpolation cannot outrun the project grid on startup.
 */
(function installPadGradeMapLibreLoader(){
  'use strict';

  const LOCAL_JS='vendor/maplibre-gl.js';
  const LOCAL_CSS='vendor/maplibre-gl.css';
  const CDN_JS='https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.js';
  const CDN_CSS='https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.css';
  let started=false;
  let appModulesStarted=false;

  function addCss(){
    if(document.querySelector('link[data-padgrade-maplibre-css]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=LOCAL_CSS;link.dataset.padgradeMaplibreCss='local';
    link.onerror=()=>{if(link.dataset.padgradeMaplibreCss==='cdn')return;link.dataset.padgradeMaplibreCss='cdn';link.href=CDN_CSS;};
    document.head.appendChild(link);
  }

  function loadScript(src,key,onload,onerror){
    const existing=document.querySelector(`script[data-${key}]`);
    if(existing){
      if(existing.dataset.loaded==='1'){onload?.();return existing;}
      existing.addEventListener('load',()=>onload?.(),{once:true});
      if(onerror)existing.addEventListener('error',onerror,{once:true});
      return existing;
    }
    const script=document.createElement('script');script.src=src;script.async=true;script.setAttribute(`data-${key}`,'1');
    script.onload=()=>{script.dataset.loaded='1';onload?.();};if(onerror)script.onerror=onerror;document.body.appendChild(script);return script;
  }

  function dispatchReady(){try{window.dispatchEvent(new CustomEvent('padgrade-maplibre-ready',{detail:{maplibregl:window.maplibregl||null}}));}catch(e){}}

  function loadPadGradeMapModules(){
    if(appModulesStarted)return;appModulesStarted=true;dispatchReady();
    loadScript('map-instance-hook-v064.js?v=20260829-4','padgrade-map-instance-hook-runtime',()=>{
      // Load the grid owner BEFORE map.js so it can subscribe to the immediate
      // primary-map-captured event from the constructor hook.
      loadScript('v087-map-fast-overlay.js?v=20260829-4','padgrade-v087-fast-overlay',()=>{
        loadScript('map.js?v=20260829-2','padgrade-map-runtime',()=>{
          window.__padGradeMapRuntimeReadyV094=true;
          window.__padGradeMapRuntimeReadyV087=true;
          try{window.dispatchEvent(new Event('padgrade-map-runtime-ready'));}catch(e){}
        });
      });
    });
  }

  function mapLibreAvailable(){return !!(window.maplibregl&&typeof window.maplibregl.Map==='function');}

  function loadMapLibre(){
    if(started)return;started=true;addCss();
    if(mapLibreAvailable()){loadPadGradeMapModules();return;}
    let fellBack=false;
    const fallback=()=>{
      if(fellBack||mapLibreAvailable()){if(mapLibreAvailable())loadPadGradeMapModules();return;}
      fellBack=true;const old=document.querySelector('script[data-padgrade-maplibre-local]');if(old)old.remove();
      loadScript(CDN_JS,'padgrade-maplibre-cdn',()=>{if(mapLibreAvailable())loadPadGradeMapModules();else console.error('Pad Grade MapLibre CDN loaded without maplibregl.Map');},()=>console.error('Pad Grade MapLibre unavailable; project/grid UI remains usable.'));
    };
    loadScript(LOCAL_JS,'padgrade-maplibre-local',()=>{if(mapLibreAvailable())loadPadGradeMapModules();else fallback();},fallback);
  }

  window.__padGradeStartMapLibre=loadMapLibre;
  window.__padGradeMapLibraryPolicy='local-apk-first-async-cdn-fallback-never-block-project-grid';
  window.__padGradeMapModuleOrderV094='hook-fast-grid-map-construction-then-heatmap';
  setTimeout(loadMapLibre,0);
})();
