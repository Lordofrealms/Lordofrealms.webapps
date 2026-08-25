/* Pad Grade v0.6.7 DEV — categorical on-grade band, separate cut/fill spectra.
 *
 * The interpolation still produces a signed numerical grade difference. Only
 * values inside the configured tolerance are allowed to use the green GRADE
 * color. Values even slightly outside tolerance immediately use a cut-only or
 * fill-only spectrum, independently scaled to the observed max cut/max fill.
 */
(function installPadGrade067CategoricalGrade(){
  'use strict';

  const $=id=>document.getElementById(id);
  const GRADE=[79,143,58];
  const CUT_NEAR=[247,196,92];
  const CUT_MID=[230,126,45];
  const CUT_MAX=[180,45,35];
  const FILL_NEAR=[103,205,220];
  const FILL_MID=[54,137,205];
  const FILL_MAX=[40,80,200];

  function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  function spectrum(near,mid,end,t){
    t=Math.max(0,Math.min(1,t));
    return t<=.5?lerp(near,mid,t*2):lerp(mid,end,(t-.5)*2);
  }

  function scale(){
    const s=window.__padGradeHeatmapScale||{};
    return {
      maxCut:Number.isFinite(+s.maxCut)?Math.max(0,+s.maxCut):0,
      maxFill:Number.isFinite(+s.maxFill)?Math.max(0,+s.maxFill):0
    };
  }

  function installColorMapping(){
    window.pgSurfaceColor=function(diff,_legacyMaxAbs,tol){
      diff=Number(diff)||0;
      tol=Math.max(0,Number(tol)||0);
      // Green is categorical: ONLY the accepted tolerance band can be green.
      if(Math.abs(diff)<=tol)return [GRADE[0],GRADE[1],GRADE[2],92];

      const s=scale();
      if(diff<0){
        const span=Math.max(s.maxCut-tol,1e-9);
        const t=(Math.abs(diff)-tol)/span;
        const c=spectrum(CUT_NEAR,CUT_MID,CUT_MAX,t);
        return [c[0],c[1],c[2],92];
      }

      const span=Math.max(s.maxFill-tol,1e-9);
      const t=(diff-tol)/span;
      const c=spectrum(FILL_NEAR,FILL_MID,FILL_MAX,t);
      return [c[0],c[1],c[2],92];
    };
  }
  installColorMapping();

  function fmtTol(){
    try{return pgFmtGrade(cfg().tol,1);}catch(e){return 'tolerance';}
  }

  function updateLegend(){
    const legend=$('heatmapScaleLegend');
    if(!legend)return false;
    if(legend.dataset.categoricalGrade!=='1'){
      legend.dataset.categoricalGrade='1';
      // The green band lives inside the bar, but with HARD boundaries. Neither
      // the cut nor fill spectrum blends into green.
      legend.innerHTML=`
        <div style="height:9px;border-radius:5px;background:linear-gradient(90deg,#b42d23 0%,#e67e2d 24%,#f7c45c 46%,#4f8f3a 46%,#4f8f3a 54%,#67cddc 54%,#3689cd 76%,#2850c8 100%)"></div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:8px;font-size:10px;margin-top:3px">
          <span id="heatmapLegendCut">CUT —</span>
          <span id="heatmapGradeBand" style="font-weight:700;white-space:nowrap">GRADE</span>
          <span id="heatmapLegendFill" style="text-align:right">FILL —</span>
        </div>`;
    }
    const band=$('heatmapGradeBand');
    if(band)band.textContent=`GRADE ±${fmtTol()}`;
    const s=scale();
    const cut=$('heatmapLegendCut'),fill=$('heatmapLegendFill');
    if(cut){
      try{cut.textContent=s.maxCut>0?`CUT ${pgFmtGrade(s.maxCut,1)}`:'CUT —';}catch(e){}
    }
    if(fill){
      try{fill.textContent=s.maxFill>0?`FILL ${pgFmtGrade(s.maxFill,1)}`:'FILL —';}catch(e){}
    }
    return true;
  }

  function forceRedraw(){
    try{if(typeof window.pgDrawSurface==='function')window.pgDrawSurface();}catch(e){}
  }

  function boot(){
    document.title='Pad Grade Mapper v0.6.7 DEV';
    let tries=0;
    const timer=setInterval(()=>{
      updateLegend();
      if(window.__padGradeHeatmapUiV066){
        // v0.6.6 may have loaded after this file and installed its older color
        // function, so assert the v0.6.7 categorical mapping again here.
        installColorMapping();
        clearInterval(timer);
        updateLegend();
        forceRedraw();
      }else if(++tries>40){
        clearInterval(timer);
      }
    },100);
    setInterval(updateLegend,700);
    window.__padGradeCategoricalGradeV067=true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
