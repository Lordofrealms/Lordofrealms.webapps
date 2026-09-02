/* Pad Grade v1.0.6 DEV — field-selected fixed GPS-map point hitbox padding.
 *
 * v1.0.5 exposed a 0–45% Advanced Settings slider for field testing. Device
 * testing established 15% as the preferred near-miss padding. This release-
 * candidate module bakes that value into normal behavior and intentionally has
 * no user-facing slider or map-tap diagnostic control.
 *
 * The existing visible-circle MapLibre layer click remains authoritative for
 * taps directly on a rendered point. This module supplements only near-miss
 * taps that land outside every rendered point circle. A tap must fall inside
 * the fixed oriented ellipse for exactly one survey point; otherwise nothing
 * happens. There is no nearest-point fallback or tie-breaking guess.
 */
(function installPadGrade106MapHitbox(){
  'use strict';

  const VERSION='v1.0.6 DEV';
  const POINT_LAYER='pad-grade-grid-points-layer';
  const HITBOX_PADDING_PCT=15;
  const TOTAL_RADIUS_CAP=0.45;
  const NORMAL_RADIUS=6;
  const TARGET_RADIUS=9;

  let map=null;
  let attachedMap=null;
  let attachTimer=null;

  const $=id=>document.getElementById(id);

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
    const visible=p.target?TARGET_RADIUS:NORMAL_RADIUS,frac=HITBOX_PADDING_PCT/100;
    const a=Math.min(visible+colSpacing*frac,colSpacing*TOTAL_RADIUS_CAP);
    const b=Math.min(visible+rowSpacing*frac,rowSpacing*TOTAL_RADIUS_CAP);
    if(a<=visible&&b<=visible)return null;
    return {u,v,a,b,visible,colSpacing,rowSpacing};
  }

  function insideEllipse(dx,dy,e){
    const x=dx*e.u.x+dy*e.u.y,y=dx*e.v.x+dy*e.v.y;
    return (x*x)/(e.a*e.a)+(y*y)/(e.b*e.b)<=1;
  }

  function directRenderedPointHit(m,point){
    try{return !!(m.getLayer?.(POINT_LAYER)&&(m.queryRenderedFeatures(point,{layers:[POINT_LAYER]})||[]).length);}catch(e){return false;}
  }
  function probeModeActive(){return $('surfaceProbeBtn')?.getAttribute('aria-pressed')==='true';}

  function handleClick(ev){
    const m=map||window.__padGradeMapInstance;if(!m||!ev?.point||probeModeActive())return;
    // Taps already on a rendered point stay on the established layer-click path.
    if(directRenderedPointHit(m,ev.point))return;
    const points=pointData(m);if(!points.length)return;
    const matches=[];
    for(const p of points){
      const e=ellipseFor(points,p);if(!e)continue;
      const dx=+ev.point.x-p.x,dy=+ev.point.y-p.y;
      if(insideEllipse(dx,dy,e))matches.push({p,e,d:Math.hypot(dx,dy)});
    }
    // Preserve genuine dead space and refuse ambiguous geometry.
    if(matches.length!==1)return;
    const hit=matches[0];
    try{
      window.PadGradeDiag?.mark?.('map.hitbox-expanded-hit',{label:hit.p.label,paddingPct:HITBOX_PADDING_PCT,centerDistancePx:+hit.d.toFixed(2),radiusXPx:+hit.e.a.toFixed(2),radiusYPx:+hit.e.b.toFixed(2)});
    }catch(e){}
    if(typeof window.openPoint==='function')window.openPoint(hit.p.r,hit.p.c);
  }

  function detach(){if(attachedMap){try{attachedMap.off('click',handleClick);}catch(e){}}attachedMap=null;}
  function attach(next){
    if(!next||next===attachedMap)return false;detach();map=attachedMap=next;
    try{next.on('click',handleClick);}catch(e){return false;}
    window.__padGradeMapHitboxV106='fixed-15pct-visible-circle-plus-spacing-padding-capped-45pct-deadspace-no-nearest-fallback';
    window.__padGradeMapHitboxPaddingPct=HITBOX_PADDING_PCT;
    return true;
  }

  function boot(){
    attach(window.__padGradeMapInstance);
    window.addEventListener('padgrade-primary-map-captured',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
    window.addEventListener('padgrade-map-created',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
    let tries=0;attachTimer=setInterval(()=>{if(!attachedMap)attach(window.__padGradeMapInstance);if(++tries>=60&&attachedMap){clearInterval(attachTimer);attachTimer=null;}},100);
    window.addEventListener('beforeunload',()=>{if(attachTimer)clearInterval(attachTimer);detach();},{once:true});
    document.title=`Pad Grade Mapper ${VERSION}`;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
