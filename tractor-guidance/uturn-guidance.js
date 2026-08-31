(()=>{
  function installTractorUTurnGuidance(){
    if(window.__TRACTOR_UTURN_GUIDANCE_INSTALLED)return true;window.__TRACTOR_UTURN_GUIDANCE_INSTALLED=true;
    const mapWrap=document.querySelector('.mapWrap');if(!mapWrap)return false;
    const bar=document.createElement('div');bar.id='uTurnGuidance';bar.className='driveOnly';bar.hidden=true;bar.innerHTML='<b id="uTurnMain">U-TURN</b><span id="uTurnDetail"></span>';
    mapWrap.parentElement.insertBefore(bar,mapWrap);
    const st=document.createElement('style');st.textContent=`#uTurnGuidance{margin:0 0 6px;padding:8px 10px;border:1px solid #e9b949;border-radius:9px;background:#2a220d;display:flex;justify-content:space-between;align-items:center;gap:8px}#uTurnGuidance[hidden]{display:none!important}#uTurnGuidance b{font-size:.95rem;color:#ffd86a}#uTurnGuidance span{font-size:.72rem;color:#f7e4a7;text-align:right}@media(max-width:520px){#uTurnGuidance{align-items:flex-start;flex-direction:column}#uTurnGuidance span{text-align:left}}`;document.head.appendChild(st);
    const main=bar.querySelector('#uTurnMain'),detail=bar.querySelector('#uTurnDetail');
    let lastKey='';
    const mPerFt=.3048;
    function llToXY(ll,o){const lat0=o[1]*Math.PI/180;return{x:(ll[0]-o[0])*Math.PI/180*6371000*Math.cos(lat0),y:(ll[1]-o[1])*Math.PI/180*6371000}}
    function xyToLL(p,o){return[o[0]+p.x/(6371000*Math.cos(o[1]*Math.PI/180))*180/Math.PI,o[1]+p.y/6371000*180/Math.PI]}
    function nearestStraight(){
      if(!currentFix||!Array.isArray(plannedSegments)||!plannedSegments.length||!window.turf)return null;const pt=turf.point([currentFix.lon,currentFix.lat]);let best=null,bd=Infinity;
      for(const s of plannedSegments){if(!(s.kind==='parallel'||s.kind==='skip-parallel')||!s.nextPass||!s.coords?.length)continue;try{const d=turf.pointToLineDistance(pt,turf.lineString(s.coords),{units:'meters'});if(d<bd){bd=d;best=s}}catch(e){}}
      return best?{segment:best,distanceM:bd}:null;
    }
    function nextSegment(s){return plannedSegments.find(x=>(x.kind==='parallel'||x.kind==='skip-parallel')&&x.driveOrder===s.nextDriveOrder)||plannedSegments.find(x=>(x.kind==='parallel'||x.kind==='skip-parallel')&&x.pass===s.nextPass)||null}
    function insideUsable(ll){try{const p=turf.point(ll);if(boundary&&!turf.booleanPointInPolygon(p,turf.polygon([boundary])))return false;for(const e of exclusions||[]){const ring=e?.coords||e?.coordinates||e;if(Array.isArray(ring)&&ring.length>2&&turf.booleanPointInPolygon(p,turf.polygon([[...ring,ring[0]]])))return false}}catch(e){}return true}
    function bulbCoords(s,n){
      const a0=s.coords[0],p0=s.coords[s.coords.length-1],p3=n.coords[0],o=p0,A=llToXY(a0,o),B=llToXY(p0,o),T=llToXY(p3,o),vx=B.x-A.x,vy=B.y-A.y,L=Math.hypot(vx,vy)||1,h={x:vx/L,y:vy/L},rgt={x:h.y,y:-h.x},dx=T.x-B.x,dy=T.y-B.y,lat=dx*rgt.x+dy*rgt.y,sign=lat>=0?1:-1,R=Math.max(1,Number(s.turningRadiusFt)||18)*mPerFt,forward=Math.max(2.1*R,R+Math.abs(lat)*.75);
      const pts=[B,{x:B.x+h.x*(forward*.42)+rgt.x*(-sign*R*.9),y:B.y+h.y*(forward*.42)+rgt.y*(-sign*R*.9)},{x:B.x+h.x*forward+rgt.x*(sign*Math.abs(lat)*.20),y:B.y+h.y*forward+rgt.y*(sign*Math.abs(lat)*.20)},{x:T.x+h.x*(R*.65),y:T.y+h.y*(R*.65)},T].map(p=>xyToLL(p,o));
      try{return turf.bezierSpline(turf.lineString(pts),{resolution:1800,sharpness:.65}).geometry.coordinates}catch(e){return pts}
    }
    function clearGuide(){bar.hidden=true;lastKey='';try{const src=map?.getSource?.('tractor-uturn-guide');if(src)src.setData({type:'FeatureCollection',features:[]})}catch(e){}}
    function showGuide(s){
      const n=nextSegment(s);if(!n)return clearGuide();const coords=bulbCoords(s,n),warn=coords.some(c=>!insideUsable(c)),dir=(s.turnDirection||'right').toUpperCase(),swing=dir==='RIGHT'?'LEFT':'RIGHT',skip=Number(s.turnSkipRows)||0;
      main.textContent=`${dir} U-TURN → ROW ${s.nextPass}`;detail.textContent=`Swing ${swing} wide, then ${dir.toLowerCase()} • skip ${skip} row${skip===1?'':'s'} • ${Math.round(Number(s.turnLateralFt)||0)} ft target offset${warn?' • ⚠ guide may leave usable area':''}`;bar.hidden=false;
      try{if(map?.isStyleLoaded?.()){if(!map.getSource('tractor-uturn-guide')){map.addSource('tractor-uturn-guide',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'tractor-uturn-guide-line',type:'line',source:'tractor-uturn-guide',paint:{'line-width':4,'line-opacity':.9,'line-dasharray':[2,2]}})}map.getSource('tractor-uturn-guide').setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}})}}catch(e){}
    }
    function update(){
      if(typeof appMode!=='undefined'&&appMode!=='drive')return clearGuide();const hit=nearestStraight();if(!hit)return clearGuide();const s=hit.segment,end=s.coords[s.coords.length-1];let endM=Infinity;try{endM=turf.distance(turf.point([currentFix.lon,currentFix.lat]),turf.point(end),{units:'kilometers'})*1000}catch(e){}const trigger=Math.max(45,(Number(s.turningRadiusFt)||18)*3);if(endM>trigger||hit.distanceM>Math.max(25,(Number(document.getElementById('implWidth')?.value)||20)*1.5)*mPerFt)return clearGuide();const key=`${s.driveOrder}:${s.nextDriveOrder}`;if(key!==lastKey){lastKey=key;showGuide(s)}}
    const timer=setInterval(update,500);window.__TRACTOR_UTURN_TIMER=timer;window.TractorUTurnGuidance={update,clear:clearGuide};return true;
  }
  window.installTractorUTurnGuidance=installTractorUTurnGuidance;
})();