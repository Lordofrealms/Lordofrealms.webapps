/* Pad Grade v1.0.5 DEV — configurable GPS-map point hitbox padding + Advanced Settings controls.
 *
 * The existing visible-circle MapLibre layer click remains authoritative for taps
 * directly on a rendered point. This module supplements only near-miss taps that
 * land outside every rendered point circle. It never selects by nearest point
 * alone: a tap must fall inside the configured oriented ellipse for exactly one
 * survey point, otherwise nothing happens.
 */
(function installPadGrade105MapHitbox(){
  'use strict';

  const VERSION='v1.0.5 DEV';
  const PREF_KEY='padGradeAppPrefsV1';
  const POINT_LAYER='pad-grade-grid-points-layer';
  const DEFAULT_PADDING=10;
  const MAX_PADDING=45;
  const TOTAL_RADIUS_CAP=0.45;
  const NORMAL_RADIUS=6;
  const TARGET_RADIUS=9;

  let map=null;
  let attachedMap=null;
  let paddingPct=DEFAULT_PADDING;
  let uiTimer=null;

  const $=id=>document.getElementById(id);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  function readPrefs(){
    try{const p=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');return p&&typeof p==='object'?p:{};}catch(e){return {};}
  }
  function writePrefs(next){
    try{localStorage.setItem(PREF_KEY,JSON.stringify({...readPrefs(),...next}));}catch(e){}
  }
  function normalizePadding(v){
    const n=Number(v);return Number.isFinite(n)?clamp(Math.round(n),0,MAX_PADDING):DEFAULT_PADDING;
  }
  function loadPadding(){
    const p=readPrefs();paddingPct=normalizePadding(p.mapGridHitboxPaddingPct===undefined?DEFAULT_PADDING:p.mapGridHitboxPaddingPct);return paddingPct;
  }
  function setPadding(v,persist=true){
    paddingPct=normalizePadding(v);
    if(persist)writePrefs({mapGridHitboxPaddingPct:paddingPct});
    const slider=$('v105MapHitboxPadding'),out=$('v105MapHitboxPaddingValue');
    if(slider&&+slider.value!==paddingPct)slider.value=String(paddingPct);
    if(out)out.textContent=`${paddingPct}%`;
    window.__padGradeMapHitboxPaddingPct=paddingPct;
    try{window.PadGradeDiag?.mark?.('map.hitbox-padding-changed',{paddingPct});}catch(e){}
    return paddingPct;
  }

  function pointData(m){
    const out=[];
    try{
      if(typeof cfg!=='function'||typeof targetLatLon!=='function'||typeof indexFromPoint!=='function'||typeof label!=='function')return out;
      const s=cfg();
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=targetLatLon(idx);if(!ll)continue;
        const p=m.project([+ll.lon,+ll.lat]);if(!p||!Number.isFinite(+p.x)||!Number.isFinite(+p.y))continue;
        out.push({r,c,idx,label:label(r,c),x:+p.x,y:+p.y,target:typeof gpsTargetIndex!=='undefined'&&idx===gpsTargetIndex});
      }
    }catch(e){}
    return out;
  }

  function getPoint(points,r,c){return points.find(p=>p.r===r&&p.c===c)||null;}
  function averageSpacing(center,a,b){
    const vals=[];
    if(a)vals.push(Math.hypot(a.x-center.x,a.y-center.y));
    if(b)vals.push(Math.hypot(b.x-center.x,b.y-center.y));
    return vals.length?vals.reduce((x,y)=>x+y,0)/vals.length:null;
  }
  function axisVector(center,a,b){
    let dx=0,dy=0;
    if(a&&b){dx=b.x-a.x;dy=b.y-a.y;}
    else if(b){dx=b.x-center.x;dy=b.y-center.y;}
    else if(a){dx=center.x-a.x;dy=center.y-a.y;}
    const d=Math.hypot(dx,dy);return d>0?{x:dx/d,y:dy/d}:null;
  }

  function ellipseFor(points,p){
    const left=getPoint(points,p.r,p.c-1),right=getPoint(points,p.r,p.c+1),down=getPoint(points,p.r-1,p.c),up=getPoint(points,p.r+1,p.c);
    const colSpacing=averageSpacing(p,left,right),rowSpacing=averageSpacing(p,down,up);
    const u=axisVector(p,left,right),v=axisVector(p,down,up);
    if(!u||!v||!Number.isFinite(colSpacing)||!Number.isFinite(rowSpacing)||colSpacing<=0||rowSpacing<=0)return null;
    const visible=p.target?TARGET_RADIUS:NORMAL_RADIUS,frac=paddingPct/100;
    const a=Math.min(visible+colSpacing*frac,colSpacing*TOTAL_RADIUS_CAP);
    const b=Math.min(visible+rowSpacing*frac,rowSpacing*TOTAL_RADIUS_CAP);
    if(a<=visible&&b<=visible)return null;
    return {u,v,a,b,visible,colSpacing,rowSpacing};
  }

  function insideEllipse(dx,dy,e){
    // Mercator is locally conformal and the fitted pad axes are orthogonal; use
    // the two projected grid-axis unit vectors so the oval rotates with the pad.
    const x=dx*e.u.x+dy*e.u.y,y=dx*e.v.x+dy*e.v.y;
    return (x*x)/(e.a*e.a)+(y*y)/(e.b*e.b)<=1;
  }

  function directRenderedPointHit(m,point){
    try{return !!(m.getLayer?.(POINT_LAYER)&&(m.queryRenderedFeatures(point,{layers:[POINT_LAYER]})||[]).length);}catch(e){return false;}
  }
  function probeModeActive(){return $('surfaceProbeBtn')?.getAttribute('aria-pressed')==='true';}

  function handleClick(ev){
    const m=map||window.__padGradeMapInstance;if(!m||!ev?.point||paddingPct<=0||probeModeActive())return;
    // Taps already on a rendered point are handled by the existing layer click.
    if(directRenderedPointHit(m,ev.point))return;
    const points=pointData(m);if(!points.length)return;
    const matches=[];
    for(const p of points){
      const e=ellipseFor(points,p);if(!e)continue;
      const dx=+ev.point.x-p.x,dy=+ev.point.y-p.y;
      if(insideEllipse(dx,dy,e))matches.push({p,e,d:Math.hypot(dx,dy)});
    }
    // Preserve genuine dead space and never guess when geometry becomes ambiguous.
    if(matches.length!==1)return;
    const hit=matches[0];
    try{
      window.PadGradeDiag?.mark?.('map.hitbox-expanded-hit',{label:hit.p.label,paddingPct,centerDistancePx:+hit.d.toFixed(2),radiusXPx:+hit.e.a.toFixed(2),radiusYPx:+hit.e.b.toFixed(2)});
    }catch(e){}
    if(typeof window.openPoint==='function')window.openPoint(hit.p.r,hit.p.c);
  }

  function detach(){if(attachedMap){try{attachedMap.off('click',handleClick);}catch(e){}}attachedMap=null;}
  function attach(next){
    if(!next||next===attachedMap)return false;detach();map=attachedMap=next;
    try{next.on('click',handleClick);}catch(e){return false;}
    window.__padGradeMapHitboxV105='visible-circle-plus-configured-spacing-padding-capped-45pct-deadspace-no-nearest-fallback';
    return true;
  }

  function installUi(){
    const body=$('v069AdvancedSettingsBody');if(!body)return false;
    if(!$('v105MapTapDiagnostics')){
      const row=document.createElement('div');row.id='v105MapTapDiagnosticsRow';row.style.cssText='display:grid;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)';
      row.innerHTML=`<label style="display:flex;gap:9px;align-items:flex-start"><input id="v105MapTapDiagnostics" type="checkbox" style="width:20px;height:20px;flex:0 0 auto"><span><b>Map tap diagnostics</b><span class="small" style="display:block;margin-top:2px">Shows the temporary ML crosshair and records detailed GPS-map tap alignment data. Leave off unless troubleshooting point selection. The general Diagnostic timing log must also be on to save/export these records.</span></span></label>`;
      body.appendChild(row);
      const t=$('v105MapTapDiagnostics');
      t.checked=!!window.PadGradeMapTapDiagnosticsV104?.enabled?.();
      t.addEventListener('change',()=>window.PadGradeMapTapDiagnosticsV104?.setEnabled?.(t.checked,'advanced-settings'));
      window.addEventListener('padgrade-map-tap-diagnostics-setting',ev=>{if(t)t.checked=!!ev?.detail?.enabled;});
    }
    if(!$('v105MapHitboxPadding')){
      const row=document.createElement('div');row.id='v105MapHitboxPaddingRow';row.className='v040-rangeRow';
      row.innerHTML=`<div class="v040-rangeHeader"><b>Map grid hitbox padding</b><span id="v105MapHitboxPaddingValue">${paddingPct}%</span></div><input id="v105MapHitboxPadding" type="range" min="0" max="45" step="1" value="${paddingPct}" aria-label="Map grid hitbox padding"><div class="v040-rangeEnds"><span>0% • visible point only</span><span>45% • maximum</span></div><div class="small">Adds this percentage of point-to-point spacing outside the visible map point. Total radius is capped at 45% of spacing so adjacent targets retain dead space and never intentionally overlap.</div>`;
      body.appendChild(row);
      const slider=$('v105MapHitboxPadding');
      slider.addEventListener('input',()=>setPadding(slider.value,false));
      slider.addEventListener('change',()=>setPadding(slider.value,true));
    }
    setPadding(paddingPct,false);
    return true;
  }

  function boot(){
    loadPadding();setPadding(paddingPct,false);attach(window.__padGradeMapInstance);installUi();
    window.addEventListener('padgrade-primary-map-captured',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
    window.addEventListener('padgrade-map-created',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
    let tries=0;uiTimer=setInterval(()=>{if(!attachedMap)attach(window.__padGradeMapInstance);installUi();if(++tries>=60&&attachedMap&&$('v105MapHitboxPadding')&&$('v105MapTapDiagnostics')){clearInterval(uiTimer);uiTimer=null;}},100);
    window.addEventListener('beforeunload',()=>{if(uiTimer)clearInterval(uiTimer);detach();},{once:true});
    document.title=`Pad Grade Mapper ${VERSION}`;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
