(()=>{
  const SVG_NS='http://www.w3.org/2000/svg';
  const HIDE_LAYERS=[
    'field-fill','field-line','work-fill','work-line','exclusion-fill','exclusion-line',
    'draft-fill','draft-line','draft-points'
  ];

  function installGeometryOverlay(){
    if(window.__TRACTOR_GEOMETRY_OVERLAY_INSTALLED)return true;
    if(typeof map==='undefined'||!map||typeof updateMapData!=='function')return false;
    window.__TRACTOR_GEOMETRY_OVERLAY_INSTALLED=true;

    const wrap=document.querySelector('.mapWrap');
    if(!wrap)return false;

    const svg=document.createElementNS(SVG_NS,'svg');
    svg.id='tractorGeometryOverlay';
    Object.assign(svg.style,{
      position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'12',
      pointerEvents:'none',overflow:'hidden'
    });
    svg.setAttribute('aria-hidden','true');
    wrap.appendChild(svg);

    function hideMapLibreGeometry(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;
      for(const id of HIDE_LAYERS){
        try{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')}catch(e){}
      }
    }

    function project(coord){
      if(!Array.isArray(coord)||coord.length<2)return null;
      const lon=Number(coord[0]),lat=Number(coord[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
      try{
        const p=map.project([lon,lat]);
        if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
        return [p.x,p.y];
      }catch(e){return null}
    }

    function pathFromRing(ring,close=true){
      if(!Array.isArray(ring))return '';
      const pts=ring.map(project).filter(Boolean);
      if(!pts.length)return '';
      let d=`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
      for(let i=1;i<pts.length;i++)d+=` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
      if(close&&pts.length>=3)d+=' Z';
      return d;
    }

    function featurePath(feature){
      const g=feature?.geometry;
      if(!g)return '';
      if(g.type==='Polygon')return (g.coordinates||[]).map(r=>pathFromRing(r,true)).filter(Boolean).join(' ');
      if(g.type==='MultiPolygon')return (g.coordinates||[]).flatMap(poly=>poly.map(r=>pathFromRing(r,true))).filter(Boolean).join(' ');
      return '';
    }

    function appendPath(d,stroke,fill,strokeWidth=3,fillOpacity=.15,strokeOpacity=.95,dash=''){
      if(!d)return;
      const el=document.createElementNS(SVG_NS,'path');
      el.setAttribute('d',d);
      el.setAttribute('fill',fill||'none');
      el.setAttribute('fill-opacity',String(fill?fillOpacity:0));
      el.setAttribute('fill-rule','evenodd');
      el.setAttribute('stroke',stroke||'none');
      el.setAttribute('stroke-width',String(strokeWidth));
      el.setAttribute('stroke-opacity',String(strokeOpacity));
      el.setAttribute('stroke-linejoin','round');
      el.setAttribute('stroke-linecap','round');
      if(dash)el.setAttribute('stroke-dasharray',dash);
      svg.appendChild(el);
    }

    function appendCircle(coord,fill,stroke='#111',r=7){
      const p=project(coord);if(!p)return;
      const el=document.createElementNS(SVG_NS,'circle');
      el.setAttribute('cx',p[0]);el.setAttribute('cy',p[1]);el.setAttribute('r',r);
      el.setAttribute('fill',fill);el.setAttribute('stroke',stroke);el.setAttribute('stroke-width','2');
      svg.appendChild(el);
    }

    function drawFeature(feature,type){
      if(!feature)return;
      const d=featurePath(feature);if(!d)return;
      if(type==='property')appendPath(d,'#c5ff91','#75c043',4,.18,.98);
      else if(type==='work')appendPath(d,'#8be9ff','#4fc3df',3,.16,.96);
      else appendPath(d,'#ff8a80','#ff5b4d',4,.22,.98);
    }

    function render(){
      if(typeof mapReady==='undefined'||!mapReady||!map)return;
      const canvas=map.getCanvas?.();
      if(!canvas)return;
      const w=canvas.clientWidth||canvas.width||1,h=canvas.clientHeight||canvas.height||1;
      svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
      svg.replaceChildren();
      hideMapLibreGeometry();

      try{if(typeof boundary!=='undefined'&&boundary)drawFeature(boundary,'property')}catch(e){}
      try{if(typeof workRegions!=='undefined')for(const f of (workRegions||[]))drawFeature(f,'work')}catch(e){}
      try{if(typeof exclusions!=='undefined')for(const f of (exclusions||[]))drawFeature(f,'exclusion')}catch(e){}

      try{
        const draft=(typeof boundaryDraft!=='undefined'&&Array.isArray(boundaryDraft))?boundaryDraft:[];
        const target=(typeof drawingTarget!=='undefined')?drawingTarget:'property';
        const colors=target==='exclusion'
          ?{stroke:'#ff8a80',fill:'#ff5b4d',point:'#ff6f61'}
          :target==='work'
            ?{stroke:'#8be9ff',fill:'#4fc3df',point:'#4fc3df'}
            :{stroke:'#ffe078',fill:'#e2b84d',point:'#ffcc45'};

        if(draft.length>=3){
          const closed=[...draft,draft[0]];
          appendPath(pathFromRing(closed,true),colors.stroke,colors.fill,5,.20,1);
        }else if(draft.length>=2){
          appendPath(pathFromRing(draft,false),colors.stroke,null,5,0,1);
        }
        for(const c of draft)appendCircle(c,colors.point,'#111',7);
      }catch(e){console.warn('Draft overlay render failed',e)}
    }

    const originalUpdate=updateMapData;
    updateMapData=function(){
      const r=originalUpdate.apply(this,arguments);
      try{render()}catch(e){console.warn('Geometry overlay update failed',e)}
      return r;
    };

    for(const evt of ['move','zoom','rotate','pitch','resize','style.load']){
      try{map.on(evt,()=>requestAnimationFrame(render))}catch(e){}
    }

    if(typeof ensureOverlaySources==='function'){
      const originalEnsure=ensureOverlaySources;
      ensureOverlaySources=function(){
        const r=originalEnsure.apply(this,arguments);
        try{hideMapLibreGeometry()}catch(e){}
        return r;
      };
    }

    requestAnimationFrame(render);
    return true;
  }

  window.installTractorGeometryOverlay=installGeometryOverlay;
})();
