/* Pad Grade v0.8.7 DEV — non-blocking MapLibre bootstrap.
 *
 * The application UI and local grade grid must never wait on a CDN. Android CI
 * stages the pinned MapLibre 5.16.0 JS/CSS under vendor/ so the APK is fully
 * self-contained. Browser-hosted copies try the same local files first and fall
 * back asynchronously to the pinned unpkg URLs when vendor files are absent.
 *
 * Map-specific Pad Grade modules are loaded only after MapLibre is available,
 * preserving constructor hooks without putting map networking on the critical
 * path for project restore or the lower grade grid.
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
    link.rel='stylesheet';
    link.href=LOCAL_CSS;
    link.dataset.padgradeMaplibreCss='local';
    link.onerror=()=>{
      if(link.dataset.padgradeMaplibreCss==='cdn')return;
      link.dataset.padgradeMaplibreCss='cdn';
      link.href=CDN_CSS;
    };
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
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.setAttribute(`data-${key}`,'1');
    script.onload=()=>{script.dataset.loaded='1';onload?.();};
    if(onerror)script.onerror=onerror;
    document.body.appendChild(script);
    return script;
  }

  function dispatchReady(){
    try{window.dispatchEvent(new CustomEvent('padgrade-maplibre-ready',{detail:{maplibregl:window.maplibregl||null}}));}catch(e){}
  }

  function loadPadGradeMapModules(){
    if(appModulesStarted)return;
    appModulesStarted=true;
    dispatchReady();
    loadScript('map-instance-hook-v064.js?v=20260829-2','padgrade-map-instance-hook-runtime',()=>{
      loadScript('map.js?v=20260829-2','padgrade-map-runtime',()=>{
        window.__padGradeMapRuntimeReadyV087=true;
        try{window.dispatchEvent(new Event('padgrade-map-runtime-ready'));}catch(e){}
      });
    });
  }

  function mapLibreAvailable(){return !!(window.maplibregl&&typeof window.maplibregl.Map==='function');}

  function loadMapLibre(){
    if(started)return;
    started=true;
    addCss();
    if(mapLibreAvailable()){loadPadGradeMapModules();return;}

    let fellBack=false;
    const fallback=()=>{
      if(fellBack||mapLibreAvailable()){if(mapLibreAvailable())loadPadGradeMapModules();return;}
      fellBack=true;
      const old=document.querySelector('script[data-padgrade-maplibre-local]');
      if(old)old.remove();
      loadScript(CDN_JS,'padgrade-maplibre-cdn',()=>{
        if(mapLibreAvailable())loadPadGradeMapModules();
        else console.error('Pad Grade MapLibre CDN loaded without maplibregl.Map');
      },()=>console.error('Pad Grade MapLibre unavailable; project/grid UI remains usable.'));
    };

    loadScript(LOCAL_JS,'padgrade-maplibre-local',()=>{
      if(mapLibreAvailable())loadPadGradeMapModules();
      else fallback();
    },fallback);
  }

  window.__padGradeStartMapLibre=loadMapLibre;
  window.__padGradeMapLibraryPolicy='local-apk-first-async-cdn-fallback-never-block-project-grid';

  // Run after the parser has passed init.js. Dynamic loading does not hold
  // DOMContentLoaded or the lower project-grid render.
  setTimeout(loadMapLibre,0);
})();
