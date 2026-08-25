/* Pad Grade v0.6.6 DEV — heatmap usability and magnitude scale.
 * Heatmap defaults ON, uses independently anchored CUT/GRADE/FILL spectra,
 * has a compact map toggle, persisted transparency slider, and no debug line.
 */
(function installPadGrade066HeatmapUi(){
  'use strict';

  const HEATMAP_OPTIN_KEY='padGradeHeatmapOptInV061';
  const DEFAULT_ON_MIGRATION='padGradeHeatmapDefaultOnV066';
  const DEFAULT_TRANSPARENCY=42; // previous mesh was 58% opaque
  const SURFACE_LAYER='pad-grade-interpolated-surface-layer';
  const $=id=>document.getElementById(id);

  // v0.6.1 intentionally forced existing installs to opt in while the renderer
  // was unstable. The renderer is now proven; migrate exactly once to default ON.
  try{
    if(localStorage.getItem(DEFAULT_ON_MIGRATION)!=='1'){
      localStorage.setItem(HEATMAP_OPTIN_KEY,'1');
      localStorage.setItem(DEFAULT_ON_MIGRATION,'1');
    }
  }catch(e){}

  let scale={maxCut:0,maxFill:0};
  let scaleTimer=null;
  let opacityTimer=null;

  function clampTransparency(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.max(0,Math.min(90,Math.round(n))):DEFAULT_TRANSPARENCY;
  }
  function transparency(){
    const input=$('heatmapTransparency');
    return clampTransparency(input?input.value:DEFAULT_TRANSPARENCY);
  }
  function heatmapOpacity(){return Math.max(.10,Math.min(1,1-transparency()/100));}
  window.pgHeatmapOpacity=heatmapOpacity;

  function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  const GRADE=[79,143,58];
  const CUT_MID=[230,166,48];
  const CUT_MAX=[180,45,35];
  const FILL_MID=[55,170,190];
  const FILL_MAX=[40,80,200];

  function twoStopSpectrum(center,mid,end,t){
    t=Math.max(0,Math.min(1,t));
    return t<=.5?lerp(center,mid,t*2):lerp(mid,end,(t-.5)*2);
  }

  // Override only the display color mapping. Interpolation remains the existing
  // magnitude-aware IDW² calculation. CUT and FILL scale independently so the
  // deepest measured cut and deepest measured fill each reach their full color.
  window.pgSurfaceColor=function(diff,_legacyMaxAbs,tol){
    tol=Math.max(0,Number(tol)||0);
    if(Math.abs(diff)<=tol)return [GRADE[0],GRADE[1],GRADE[2],92];
    if(diff<0){
      const span=Math.max(scale.maxCut-tol,1e-9);
      const t=(Math.abs(diff)-tol)/span;
      const c=twoStopSpectrum(GRADE,CUT_MID,CUT_MAX,t);
      return [c[0],c[1],c[2],92];
    }
    const span=Math.max(scale.maxFill-tol,1e-9);
    const t=(diff-tol)/span;
    const c=twoStopSpectrum(GRADE,FILL_MID,FILL_MAX,t);
    return [c[0],c[1],c[2],92];
  };

  function computeScale(){
    let maxCut=0,maxFill=0,target=0;
    try{target=Number(cfg().target)||0;}catch(e){}
    try{
      for(const raw of Object.values(readings||{})){
        const v=Number(raw);if(!Number.isFinite(v))continue;
        const d=v-target;
        if(d<0)maxCut=Math.max(maxCut,-d);
        else if(d>0)maxFill=Math.max(maxFill,d);
      }
    }catch(e){}
    return {maxCut,maxFill};
  }

  function sameScale(a,b){return Math.abs(a.maxCut-b.maxCut)<1e-9&&Math.abs(a.maxFill-b.maxFill)<1e-9;}

  function fmtGrade(v){
    try{return pgFmtGrade(v,1);}catch(e){return `${Number(v||0).toFixed(1)}″`;}
  }

  function updateScaleLegend(){
    const cut=$('heatmapLegendCut'),fill=$('heatmapLegendFill');
    if(cut)cut.textContent=scale.maxCut>0?`CUT ${fmtGrade(scale.maxCut)}`:'CUT —';
    if(fill)fill.textContent=scale.maxFill>0?`FILL ${fmtGrade(scale.maxFill)}`:'FILL —';
  }

  function refreshScale(force=false){
    const next=computeScale();
    const changed=!sameScale(next,scale);
    scale=next;
    window.__padGradeHeatmapScale={...scale};
    updateScaleLegend();
    if((changed||force)&&typeof window.pgDrawSurface==='function'){
      try{window.pgDrawSurface();}catch(e){}
    }
  }

  function toggle(){return $('heatmapToggle');}
  function updateQuickToggle(){
    const btn=$('heatmapQuickToggle'),enabled=!!(toggle()&&toggle().checked);
    if(!btn)return;
    btn.textContent=enabled?'Heatmap: On':'Heatmap: Off';
    btn.setAttribute('aria-pressed',enabled?'true':'false');
    btn.classList.toggle('primary',enabled);
  }

  function updateTransparencyLabel(){
    const out=$('heatmapTransparencyValue');
    if(out)out.textContent=`${transparency()}%`;
  }

  function applyOpacity(){
    const map=window.__padGradeMapInstance;
    if(!map)return false;
    try{
      const layer=map.getLayer(SURFACE_LAYER);if(!layer)return false;
      const prop=layer.type==='raster'?'raster-opacity':'fill-opacity';
      const target=heatmapOpacity();
      let current=null;try{current=map.getPaintProperty(SURFACE_LAYER,prop);}catch(e){}
      if(typeof current==='number'&&Math.abs(current-target)<1e-6)return true;
      map.setPaintProperty(SURFACE_LAYER,prop,target);
      map.triggerRepaint();
      return true;
    }catch(e){return false;}
  }

  function removeHeatmapDebug(){
    const status=$('mapSurfaceStatus');
    if(status)status.remove();
  }

  function installSettingsSlider(){
    if($('heatmapTransparency'))return;
    const settings=$('settingsDlg');
    const block=settings&&settings.querySelector('.devSettingsBlock');
    if(!block)return;

    // Fast ON/OFF now lives beneath the map. Keep the checkbox as the persisted
    // state owner so older project files remain compatible, but hide its label.
    const oldToggle=toggle();
    const oldLabel=oldToggle&&oldToggle.closest('label');
    if(oldLabel)oldLabel.style.display='none';

    const label=document.createElement('label');
    label.className='heatmapTransparencySetting';
    label.innerHTML=`<span>Heatmap transparency <b id="heatmapTransparencyValue">${DEFAULT_TRANSPARENCY}%</b></span><input id="heatmapTransparency" type="range" min="0" max="90" step="1" value="${DEFAULT_TRANSPARENCY}" aria-label="Heatmap transparency percent">`;
    const route=$('routeMode');
    const routeLabel=route&&route.closest('label');
    if(routeLabel)routeLabel.insertAdjacentElement('afterend',label);
    else block.prepend(label);
    Object.assign(label.style,{display:'grid',gap:'6px'});

    const slider=$('heatmapTransparency');
    slider.addEventListener('input',()=>{updateTransparencyLabel();applyOpacity();});
    slider.addEventListener('change',()=>applyOpacity());
  }

  function installMapHeatmapUi(){
    const controls=$('gpsMapFieldControls');
    if(!controls)return;
    removeHeatmapDebug();

    if(!$('heatmapQuickToggle')){
      const btn=document.createElement('button');
      btn.id='heatmapQuickToggle';btn.type='button';
      Object.assign(btn.style,{justifySelf:'start',padding:'5px 9px',fontSize:'12px',lineHeight:'1.1'});
      btn.onclick=()=>{
        const input=toggle();if(!input)return;
        input.checked=!input.checked;
        input.dispatchEvent(new Event('change',{bubbles:true}));
        updateQuickToggle();
      };
      controls.insertBefore(btn,controls.firstChild||null);
    }

    if(!$('heatmapScaleLegend')){
      const legend=document.createElement('div');
      legend.id='heatmapScaleLegend';
      legend.innerHTML='<div style="height:8px;border-radius:5px;background:linear-gradient(90deg,#b42d23 0%,#e6a630 25%,#4f8f3a 50%,#37aabe 75%,#2850c8 100%)"></div><div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;margin-top:2px"><span id="heatmapLegendCut">CUT —</span><span>GRADE</span><span id="heatmapLegendFill">FILL —</span></div>';
      Object.assign(legend.style,{width:'100%',minWidth:'180px',maxWidth:'360px'});
      const btn=$('heatmapQuickToggle');
      btn.insertAdjacentElement('afterend',legend);
    }
    updateQuickToggle();
    updateScaleLegend();
  }

  // Persist transparency in the same dev payload as the other project options.
  const basePayload=window.pgDevPayload;
  if(typeof basePayload==='function'){
    window.pgDevPayload=function(){
      const out=basePayload();
      out.heatmapTransparency=transparency();
      return out;
    };
  }
  const baseApply=window.pgApplyDevPayload;
  if(typeof baseApply==='function'){
    window.pgApplyDevPayload=function(dev){
      baseApply(dev);
      const slider=$('heatmapTransparency');
      if(slider)slider.value=clampTransparency(dev&&dev.heatmapTransparency);
      updateTransparencyLabel();updateQuickToggle();
      setTimeout(()=>{applyOpacity();refreshScale(true);},0);
    };
  }

  function boot(){
    document.title='Pad Grade Mapper v0.7.3 DEV';
    installSettingsSlider();
    installMapHeatmapUi();
    removeHeatmapDebug();
    const input=toggle();
    if(input){
      if(localStorage.getItem(HEATMAP_OPTIN_KEY)==='1')input.checked=true;
      input.addEventListener('change',()=>{updateQuickToggle();setTimeout(applyOpacity,0);});
    }
    const apply=$('applySettings');
    if(apply)apply.addEventListener('click',()=>{try{saveLocal();}catch(e){}setTimeout(()=>{applyOpacity();refreshScale(true);},0);});
    refreshScale(true);updateTransparencyLabel();updateQuickToggle();

    scaleTimer=setInterval(()=>{installMapHeatmapUi();removeHeatmapDebug();refreshScale(false);},700);
    opacityTimer=setInterval(applyOpacity,700);
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{applyOpacity();refreshScale(true);},0));
    window.addEventListener('beforeunload',()=>{if(scaleTimer)clearInterval(scaleTimer);if(opacityTimer)clearInterval(opacityTimer);},{once:true});
    window.__padGradeHeatmapUiV066=true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
