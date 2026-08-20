(()=>{
  const SVG_NS='http://www.w3.org/2000/svg';
  const HIDE_LAYERS=[
    'field-fill','field-line','work-fill','work-line','exclusion-fill','exclusion-line',
    'draft-fill','draft-line','draft-points',
    'plan-swath','completed-swath','plan-line','track-line','gps-point','search-point'
  ];

  function installGeometryOverlay(){
    if(window.__TRACTOR_GEOMETRY_OVERLAY_INSTALLED)return true;
    if(typeof map==='undefined'||!map||typeof updateMapData!=='function')return false;
    window.__TRACTOR_GEOMETRY_OVERLAY_INSTALLED=true;

    const wrap=document.querySelector('.mapWrap');
    if(!wrap)return false;

    const svg=document.createElementNS(SVG_NS,'svg');
    svg.id='tractorGeometryOverlay';
    Object.assign(svg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'12',pointerEvents:'none',overflow:'hidden'});
    svg.setAttribute('aria-hidden','true');
    wrap.appendChild(svg);

    function hideMapLibreGeometry(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;
      for(const id of HIDE_LAYERS){try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')}catch(e){}}
    }
    function project(coord){
      if(!Array.isArray(coord)||coord.length<2)return null;
      const lon=Number(coord[0]),lat=Number(coord[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
      try{const p=map.project([lon,lat]);return Number.isFinite(p.x)&&Number.isFinite(p.y)?[p.x,p.y]:null}catch(e){return null}
    }
    function pathFromRing(ring,close=true){
      if(!Array.isArray(ring))return '';
      const pts=ring.map(project).filter(Boolean);if(!pts.length)return '';
      let d=`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
      for(let i=1;i<pts.length;i++)d+=` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
      if(close&&pts.length>=3)d+=' Z';return d;
    }
    function featurePath(feature){
      const g=feature?.geometry;if(!g)return '';
      if(g.type==='Polygon')return (g.coordinates||[]).map(r=>pathFromRing(r,true)).filter(Boolean).join(' ');
      if(g.type==='MultiPolygon')return (g.coordinates||[]).flatMap(poly=>poly.map(r=>pathFromRing(r,true))).filter(Boolean).join(' ');
      return '';
    }
    function appendPath(d,stroke,fill,strokeWidth=3,fillOpacity=.15,strokeOpacity=.95,dash=''){
      if(!d)return;const el=document.createElementNS(SVG_NS,'path');
      el.setAttribute('d',d);el.setAttribute('fill',fill||'none');el.setAttribute('fill-opacity',String(fill?fillOpacity:0));el.setAttribute('fill-rule','evenodd');
      el.setAttribute('stroke',stroke||'none');el.setAttribute('stroke-width',String(strokeWidth));el.setAttribute('stroke-opacity',String(strokeOpacity));el.setAttribute('stroke-linejoin','round');el.setAttribute('stroke-linecap','round');
      if(dash)el.setAttribute('stroke-dasharray',dash);svg.appendChild(el);
    }
    function appendCircle(coord,fill,stroke='#111',r=7){
      const p=project(coord);if(!p)return;const el=document.createElementNS(SVG_NS,'circle');
      el.setAttribute('cx',p[0]);el.setAttribute('cy',p[1]);el.setAttribute('r',r);el.setAttribute('fill',fill);el.setAttribute('stroke',stroke);el.setAttribute('stroke-width','2');svg.appendChild(el);
    }
    function drawFeature(feature,type){
      if(!feature)return;const d=featurePath(feature);if(!d)return;
      if(type==='property')appendPath(d,'#c5ff91','#75c043',4,.18,.98);
      else if(type==='work')appendPath(d,'#8be9ff','#4fc3df',3,.16,.96);
      else appendPath(d,'#ff8a80','#ff5b4d',4,.22,.98);
    }
    function swathPixels(){
      try{
        const widthFt=Math.max(.5,Number(cfg().implementWidthFt)||.5),lat=map.getCenter()?.lat||0,zoom=map.getZoom()||0;
        const metersPerPixel=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);
        const ftPerMeter=(typeof FT_PER_M!=='undefined'&&Number(FT_PER_M))?Number(FT_PER_M):3.280839895;
        return Math.max(1.5,Math.min(320,(widthFt/ftPerMeter)/Math.max(.000001,metersPerPixel)));
      }catch(e){return 8}
    }
    function completedRuns(){
      if(typeof planProgressSamples==='undefined'||!Array.isArray(planProgressSamples)||!planProgressSamples.length)return [];
      if(typeof planProgress==='undefined'||!planProgress?.covered)return [];
      const bySeg=new Map();for(const q of planProgressSamples){if(!q||!Number.isInteger(q.si))continue;let arr=bySeg.get(q.si);if(!arr){arr=[];bySeg.set(q.si,arr)}arr.push(q)}
      const lines=[];for(const arr of bySeg.values()){arr.sort((a,b)=>a.idx-b.idx);let run=[];const flush=()=>{if(run.length>1)lines.push(run.map(q=>[q.lon,q.lat]));run=[]};for(const q of arr){if(planProgress.covered[q.idx])run.push(q);else flush()}flush()}return lines;
    }
    function drawOperationalSwaths(){
      if(typeof appMode==='undefined'||appMode!=='drive')return;
      if(typeof plannedSegments==='undefined'||!Array.isArray(plannedSegments)||!plannedSegments.length)return;
      const width=swathPixels(),parts=[];for(const seg of plannedSegments){if(seg?.coords?.length>=2){const d=pathFromRing(seg.coords,false);if(d)parts.push(d)}}
      if(parts.length)appendPath(parts.join(' '),'#5fc4d8',null,width,0,.18);
      const complete=completedRuns().map(coords=>pathFromRing(coords,false)).filter(Boolean);if(complete.length)appendPath(complete.join(' '),'#75c043',null,width,0,.42);
    }
    function drawPlannedPath(){
      if(typeof plannedSegments==='undefined'||!Array.isArray(plannedSegments)||!plannedSegments.length)return;
      const parts=[];for(const seg of plannedSegments){if(seg?.coords?.length>=2){const d=pathFromRing(seg.coords,false);if(d)parts.push(d)}}if(!parts.length)return;
      const d=parts.join(' ');appendPath(d,'#071015',null,6,0,.92);appendPath(d,'#8be9ff',null,2.6,0,1);
    }
    function drawGpsTrack(){
      if(typeof track==='undefined'||!Array.isArray(track)||track.length<2)return;
      let seg=[];const flush=()=>{if(seg.length>1){const d=pathFromRing(seg,false);if(d)appendPath(d,'#ff7f50',null,3,0,.95)}seg=[]};
      for(const p of track){if(!p)continue;if(p.breakBefore)flush();if(Number.isFinite(Number(p.lon))&&Number.isFinite(Number(p.lat)))seg.push([Number(p.lon),Number(p.lat)])}flush();
    }
    function drawSearchPoint(){try{const c=searchMarkerFeature?.geometry?.coordinates;if(Array.isArray(c)&&c.length>=2)appendCircle(c,'#e2b84d','#111',8)}catch(e){}}
    function drawTractor(){
      if(typeof currentFix==='undefined'||!currentFix)return;const coord=[Number(currentFix.lon),Number(currentFix.lat)];if(!Number.isFinite(coord[0])||!Number.isFinite(coord[1]))return;
      const p=project(coord);if(!p)return;
      const outer=document.createElementNS(SVG_NS,'circle');outer.setAttribute('cx',p[0]);outer.setAttribute('cy',p[1]);outer.setAttribute('r','10');outer.setAttribute('fill','#75c043');outer.setAttribute('stroke','#fff');outer.setAttribute('stroke-width','3');svg.appendChild(outer);
      const inner=document.createElementNS(SVG_NS,'circle');inner.setAttribute('cx',p[0]);inner.setAttribute('cy',p[1]);inner.setAttribute('r','3');inner.setAttribute('fill','#0b1418');svg.appendChild(inner);
      const hd=Number(currentFix.headingDeg);if(Number.isFinite(hd)){const bearing=Number(map.getBearing?.()||0),rad=(hd-bearing)*Math.PI/180,len=20,x2=p[0]+Math.sin(rad)*len,y2=p[1]-Math.cos(rad)*len;const line=document.createElementNS(SVG_NS,'line');line.setAttribute('x1',p[0]);line.setAttribute('y1',p[1]);line.setAttribute('x2',x2);line.setAttribute('y2',y2);line.setAttribute('stroke','#fff');line.setAttribute('stroke-width','3');line.setAttribute('stroke-linecap','round');svg.appendChild(line)}
    }
    function render(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;const canvas=map.getCanvas?.();if(!canvas)return;
      const w=canvas.clientWidth||canvas.width||1,h=canvas.clientHeight||canvas.height||1;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.replaceChildren();hideMapLibreGeometry();
      try{if(typeof boundary!=='undefined'&&boundary)drawFeature(boundary,'property')}catch(e){}
      try{if(typeof workRegions!=='undefined')for(const f of (workRegions||[]))drawFeature(f,'work')}catch(e){}
      try{if(typeof exclusions!=='undefined')for(const f of (exclusions||[]))drawFeature(f,'exclusion')}catch(e){}
      try{drawOperationalSwaths()}catch(e){console.warn('Drive swath overlay render failed',e)}
      try{drawPlannedPath()}catch(e){console.warn('Planned path overlay render failed',e)}
      try{drawGpsTrack()}catch(e){console.warn('GPS track overlay render failed',e)}
      try{drawSearchPoint()}catch(e){console.warn('Search point overlay render failed',e)}
      try{drawTractor()}catch(e){console.warn('Tractor overlay render failed',e)}
      try{
        const draft=(typeof boundaryDraft!=='undefined'&&Array.isArray(boundaryDraft))?boundaryDraft:[],target=(typeof drawingTarget!=='undefined')?drawingTarget:'property';
        const colors=target==='exclusion'?{stroke:'#ff8a80',fill:'#ff5b4d',point:'#ff6f61'}:target==='work'?{stroke:'#8be9ff',fill:'#4fc3df',point:'#4fc3df'}:{stroke:'#ffe078',fill:'#e2b84d',point:'#ffcc45'};
        if(draft.length>=3)appendPath(pathFromRing([...draft,draft[0]],true),colors.stroke,colors.fill,5,.20,1);else if(draft.length>=2)appendPath(pathFromRing(draft,false),colors.stroke,null,5,0,1);for(const c of draft)appendCircle(c,colors.point,'#111',7);
      }catch(e){console.warn('Draft overlay render failed',e)}
    }
    const originalUpdate=updateMapData;updateMapData=function(){const r=originalUpdate.apply(this,arguments);try{render()}catch(e){console.warn('Geometry overlay update failed',e)}return r};
    for(const evt of ['move','zoom','rotate','pitch','resize','style.load']){try{map.on(evt,()=>requestAnimationFrame(render))}catch(e){}}
    if(typeof ensureOverlaySources==='function'){const originalEnsure=ensureOverlaySources;ensureOverlaySources=function(){const r=originalEnsure.apply(this,arguments);try{hideMapLibreGeometry()}catch(e){}return r}}
    requestAnimationFrame(render);return true;
  }
  window.installTractorGeometryOverlay=installGeometryOverlay;
})();
