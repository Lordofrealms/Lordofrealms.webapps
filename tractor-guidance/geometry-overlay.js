(()=>{
  const SVG_NS='http://www.w3.org/2000/svg';
  const HIDE_LAYERS=[
    'field-fill','field-line','work-fill','work-line','exclusion-fill','exclusion-line',
    'draft-fill','draft-line','draft-points','plan-line','track-line','gps-point','search-point',
    'plan-swath','completed-swath'
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

    let completedCacheKey='',completedCacheD='';

    function hideOldOperationalLayers(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;
      for(const id of HIDE_LAYERS){
        try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')}catch(e){}
      }
    }

    function project(coord){
      if(!Array.isArray(coord)||coord.length<2)return null;
      const lon=Number(coord[0]),lat=Number(coord[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
      try{const p=map.project([lon,lat]);return Number.isFinite(p.x)&&Number.isFinite(p.y)?[p.x,p.y]:null}catch(e){return null}
    }

    function pathFromCoords(coords,close=false){
      if(!Array.isArray(coords))return '';
      const pts=coords.map(project).filter(Boolean);
      if(!pts.length)return '';
      let d=`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
      for(let i=1;i<pts.length;i++)d+=` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
      if(close&&pts.length>=3)d+=' Z';
      return d;
    }

    function featurePath(feature){
      const g=feature?.geometry;if(!g)return '';
      if(g.type==='Polygon')return (g.coordinates||[]).map(r=>pathFromCoords(r,true)).filter(Boolean).join(' ');
      if(g.type==='MultiPolygon')return (g.coordinates||[]).flatMap(poly=>poly.map(r=>pathFromCoords(r,true))).filter(Boolean).join(' ');
      return '';
    }

    function appendPath(d,stroke,fill,strokeWidth=3,fillOpacity=.15,strokeOpacity=.95,dash=''){
      if(!d)return null;
      const el=document.createElementNS(SVG_NS,'path');
      el.setAttribute('d',d);el.setAttribute('fill',fill||'none');el.setAttribute('fill-opacity',String(fill?fillOpacity:0));
      el.setAttribute('fill-rule','evenodd');el.setAttribute('stroke',stroke||'none');el.setAttribute('stroke-width',String(strokeWidth));
      el.setAttribute('stroke-opacity',String(strokeOpacity));el.setAttribute('stroke-linejoin','round');el.setAttribute('stroke-linecap','round');
      if(dash)el.setAttribute('stroke-dasharray',dash);svg.appendChild(el);return el;
    }

    function appendCircle(coord,fill,stroke='#111',r=7,strokeWidth=2,opacity=1){
      const p=project(coord);if(!p)return null;
      const el=document.createElementNS(SVG_NS,'circle');
      el.setAttribute('cx',p[0]);el.setAttribute('cy',p[1]);el.setAttribute('r',r);el.setAttribute('fill',fill);
      el.setAttribute('stroke',stroke);el.setAttribute('stroke-width',strokeWidth);el.setAttribute('opacity',opacity);svg.appendChild(el);return el;
    }

    function drawFeature(feature,type){
      const d=featurePath(feature);if(!d)return;
      if(type==='property')appendPath(d,'#c5ff91','#75c043',4,.18,.98);
      else if(type==='work')appendPath(d,'#8be9ff','#4fc3df',3,.16,.96);
      else appendPath(d,'#ff8a80','#ff5b4d',4,.22,.98);
    }

    function plannedPathD(){
      if(typeof plannedSegments==='undefined'||!Array.isArray(plannedSegments))return '';
      const parts=[];
      for(const seg of plannedSegments){const d=pathFromCoords(seg?.coords,false);if(d)parts.push(d)}
      return parts.join(' ');
    }

    function implementSwathPixels(){
      try{
        const widthFt=Math.max(.5,Number(cfg().implementWidthFt)||.5);
        const lat=map.getCenter()?.lat||0,zoom=map.getZoom()||0;
        const metersPerPixel=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);
        return Math.max(1.5,Math.min(500,(widthFt*0.3048)/Math.max(.000001,metersPerPixel)));
      }catch(e){return 8}
    }

    function completedPathD(){
      if(typeof planProgressSamples==='undefined'||!Array.isArray(planProgressSamples)||!planProgressSamples.length)return '';
      if(typeof planProgress==='undefined'||!planProgress?.covered)return '';
      const covered=planProgress.covered;
      const key=`${planProgressSamples.length}:${Object.keys(covered).length}`;
      if(key===completedCacheKey)return completedCacheD;
      completedCacheKey=key;
      const bySeg=new Map();
      for(const q of planProgressSamples){let arr=bySeg.get(q.si);if(!arr){arr=[];bySeg.set(q.si,arr)}arr.push(q)}
      const parts=[];
      for(const arr of bySeg.values()){
        arr.sort((a,b)=>a.idx-b.idx);let run=[];
        const flush=()=>{if(run.length>1){const d=pathFromCoords(run.map(q=>[q.lon,q.lat]),false);if(d)parts.push(d)}run=[]};
        for(const q of arr){if(covered[q.idx])run.push(q);else flush()}flush();
      }
      completedCacheD=parts.join(' ');return completedCacheD;
    }

    function drawPlannedAndWorked(){
      const d=plannedPathD();if(!d)return;
      const inDrive=typeof appMode!=='undefined'&&appMode==='drive';
      if(inDrive){
        const sw=implementSwathPixels();
        appendPath(d,'#5fc4d8',null,sw,0,.18);
        const done=completedPathD();if(done)appendPath(done,'#75c043',null,sw,0,.48);
      }
      appendPath(d,'#071015',null,6,0,.90);
      appendPath(d,'#8be9ff',null,2.6,0,1);
    }

    function drawTrack(){
      if(typeof track==='undefined'||!Array.isArray(track)||track.length<2)return;
      let seg=[];const parts=[];
      const flush=()=>{if(seg.length>1){const d=pathFromCoords(seg,false);if(d)parts.push(d)}seg=[]};
      for(const p of track){if(p?.breakBefore)flush();if(Number.isFinite(p?.lon)&&Number.isFinite(p?.lat))seg.push([p.lon,p.lat])}flush();
      if(parts.length){appendPath(parts.join(' '),'#111',null,5,0,.72);appendPath(parts.join(' '),'#ff7f50',null,2.5,0,1)}
    }

    function drawSearch(){
      try{
        const c=searchMarkerFeature?.geometry?.coordinates;if(!c)return;
        appendCircle(c,'#e2b84d','#111',8,2,1);
        appendCircle(c,'#fff','#111',2.5,1,1);
      }catch(e){}
    }

    function drawTractor(){
      if(typeof currentFix==='undefined'||!currentFix||!Number.isFinite(currentFix.lon)||!Number.isFinite(currentFix.lat))return;
      const coord=[currentFix.lon,currentFix.lat];
      const p=project(coord);if(!p)return;
      appendCircle(coord,'rgba(117,192,67,.22)','#fff',13,2,1);
      appendCircle(coord,'#75c043','#071015',7,2,1);
      appendCircle(coord,'#fff','#071015',2.2,1,1);

      let hd=Number(currentFix.headingDeg);
      if(!Number.isFinite(hd)&&typeof track!=='undefined'&&Array.isArray(track)&&track.length>1&&typeof bearing==='function'){
        try{hd=bearing(track.at(-2),track.at(-1))}catch(e){}
      }
      if(Number.isFinite(hd)){
        const mapBearing=Number(map.getBearing?.()||0);
        const len=20,rad=(hd-mapBearing)*Math.PI/180;
        const x2=p[0]+Math.sin(rad)*len,y2=p[1]-Math.cos(rad)*len;
        const line=document.createElementNS(SVG_NS,'line');
        line.setAttribute('x1',p[0]);line.setAttribute('y1',p[1]);line.setAttribute('x2',x2);line.setAttribute('y2',y2);
        line.setAttribute('stroke','#fff');line.setAttribute('stroke-width','3');line.setAttribute('stroke-linecap','round');svg.appendChild(line);
      }
    }

    function drawDraft(){
      const draft=(typeof boundaryDraft!=='undefined'&&Array.isArray(boundaryDraft))?boundaryDraft:[];
      const target=(typeof drawingTarget!=='undefined')?drawingTarget:'property';
      const colors=target==='exclusion'?{stroke:'#ff8a80',fill:'#ff5b4d',point:'#ff6f61'}:target==='work'?{stroke:'#8be9ff',fill:'#4fc3df',point:'#4fc3df'}:{stroke:'#ffe078',fill:'#e2b84d',point:'#ffcc45'};
      if(draft.length>=3)appendPath(pathFromCoords([...draft,draft[0]],true),colors.stroke,colors.fill,5,.20,1);
      else if(draft.length>=2)appendPath(pathFromCoords(draft,false),colors.stroke,null,5,0,1);
      for(const c of draft)appendCircle(c,colors.point,'#111',7,2,1);
    }

    function render(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;
      const canvas=map.getCanvas?.();if(!canvas)return;
      const w=canvas.clientWidth||canvas.width||1,h=canvas.clientHeight||canvas.height||1;
      svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.replaceChildren();hideOldOperationalLayers();
      try{if(typeof boundary!=='undefined'&&boundary)drawFeature(boundary,'property')}catch(e){}
      try{if(typeof workRegions!=='undefined')for(const f of (workRegions||[]))drawFeature(f,'work')}catch(e){}
      try{if(typeof exclusions!=='undefined')for(const f of (exclusions||[]))drawFeature(f,'exclusion')}catch(e){}
      try{drawPlannedAndWorked()}catch(e){console.warn('Path/swath overlay failed',e)}
      try{drawTrack()}catch(e){console.warn('Track overlay failed',e)}
      try{drawSearch()}catch(e){console.warn('Search overlay failed',e)}
      try{drawTractor()}catch(e){console.warn('Tractor overlay failed',e)}
      try{drawDraft()}catch(e){console.warn('Draft overlay failed',e)}
    }

    const originalUpdate=updateMapData;
    updateMapData=function(){const r=originalUpdate.apply(this,arguments);try{render()}catch(e){console.warn('Operational overlay update failed',e)}return r};

    for(const evt of ['move','zoom','rotate','pitch','resize','style.load'])try{map.on(evt,()=>requestAnimationFrame(render))}catch(e){}

    if(typeof ensureOverlaySources==='function'){
      const originalEnsure=ensureOverlaySources;
      ensureOverlaySources=function(){const r=originalEnsure.apply(this,arguments);try{hideOldOperationalLayers()}catch(e){}return r};
    }

    requestAnimationFrame(render);
    return true;
  }

  window.installTractorGeometryOverlay=installGeometryOverlay;
})();
