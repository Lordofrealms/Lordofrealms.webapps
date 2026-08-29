/* Pad Grade v0.8.7 DEV — style-ready primary GPS grid overlay.
 *
 * The historical v030 overlay waits for MapLibre's full `load` event, which can
 * be delayed by remote raster imagery. This owner installs the same canonical
 * layer/source IDs at style readiness so the saved project grid is independent
 * of imagery completion. v030 continues to own its other GPS workflow UI.
 */
(function installPadGrade087FastMapOverlay(){
  'use strict';

  const LINE_SOURCE='pad-grade-grid-lines';
  const OUTLINE_SOURCE='pad-grade-pad-outline';
  const ROUTE_SOURCE='pad-grade-route';
  const POINT_SOURCE='pad-grade-grid-points';
  const LINE_LAYER='pad-grade-grid-lines-layer';
  const OUTLINE_LAYER='pad-grade-pad-outline-layer';
  const ROUTE_LAYER='pad-grade-route-layer';
  const POINT_LAYER='pad-grade-grid-points-layer';
  const LABEL_LAYER='pad-grade-grid-labels';
  let map=null;
  let timer=null;
  let lastSignature='';

  const fc=features=>({type:'FeatureCollection',features});
  function ready(){try{return !!(map&&map.getStyle&&map.getStyle()?.layers);}catch(e){return false;}}
  function pointLL(r,c){try{return targetLatLon(indexFromPoint(r,c));}catch(e){return null;}}

  function pointFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit)return [];
      const s=cfg(),features=[];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=pointLL(r,c);if(!ll)continue;
        const val=readings[k(r,c)];let status='empty';
        if(Number.isFinite(val)){const diff=diffFor(val);status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';}
        if(idx===gpsTargetIndex)status='target';
        features.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
      }
      return features;
    }catch(e){return [];}
  }

  function lineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit)return [];
      const s=cfg(),features=[];
      for(let r=0;r<s.rows;r++){
        const coords=[];for(let c=0;c<s.cols;c++){const ll=pointLL(r,c);if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      for(let c=0;c<s.cols;c++){
        const coords=[];for(let r=0;r<s.rows;r++){const ll=pointLL(r,c);if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      return features;
    }catch(e){return [];}
  }

  function outlineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof fitPointLatLon!=='function')return [];
      const s=cfg(),pts=[[0,0],[s.width,0],[s.width,s.length],[0,s.length],[0,0]].map(([x,y])=>fitPointLatLon(x,y)).filter(Boolean).map(p=>[p.lon,p.lat]);
      return pts.length===5?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts}}]:[];
    }catch(e){return [];}
  }

  function routeFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||gpsTargetIndex==null||typeof gpsRoute!=='function')return [];
      const route=gpsRoute(),start=Math.max(0,route.indexOf(gpsTargetIndex)),coords=[];
      for(let i=start;i<route.length&&coords.length<6;i++){
        const idx=route[i],p=pointFromIndex(idx);if(Number.isFinite(readings[k(p.r,p.c)]))continue;
        const ll=targetLatLon(idx);if(ll)coords.push([ll.lon,ll.lat]);
      }
      return coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[];
    }catch(e){return [];}
  }

  function ensureSource(id){if(!map.getSource(id))map.addSource(id,{type:'geojson',data:fc([])});}
  function install(){
    if(!ready())return false;
    try{
      ensureSource(LINE_SOURCE);
      if(!map.getLayer(LINE_LAYER))map.addLayer({id:LINE_LAYER,type:'line',source:LINE_SOURCE,paint:{'line-color':'#d8f2ff','line-width':1.5,'line-opacity':.88}});
      ensureSource(OUTLINE_SOURCE);
      if(!map.getLayer(OUTLINE_LAYER))map.addLayer({id:OUTLINE_LAYER,type:'line',source:OUTLINE_SOURCE,paint:{'line-color':'#ffffff','line-width':3,'line-opacity':.95}});
      ensureSource(ROUTE_SOURCE);
      if(!map.getLayer(ROUTE_LAYER))map.addLayer({id:ROUTE_LAYER,type:'line',source:ROUTE_SOURCE,paint:{'line-color':'#ffd166','line-width':3,'line-opacity':.8,'line-dasharray':[2,2]}});
      ensureSource(POINT_SOURCE);
      if(!map.getLayer(POINT_LAYER))map.addLayer({id:POINT_LAYER,type:'circle',source:POINT_SOURCE,paint:{
        'circle-radius':['case',['==',['get','status'],'target'],9,6],
        'circle-color':['match',['get','status'],'target','#ffd166','cut','#a83a2b','fill','#315fa8','grade','#4f8f3a','#66717d'],
        'circle-stroke-color':'#ffffff','circle-stroke-width':['case',['==',['get','status'],'target'],3,1]
      }});
      if(!map.getLayer(LABEL_LAYER))map.addLayer({id:LABEL_LAYER,type:'symbol',source:POINT_SOURCE,minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
      return true;
    }catch(e){return false;}
  }

  function setData(id,data){try{const s=map?.getSource(id);if(s&&typeof s.setData==='function')s.setData(data);}catch(e){}}
  function refresh(force=false){
    if(!map||!install())return;
    let sig='';try{sig=JSON.stringify({fit:gpsFit||null,target:gpsTargetIndex,readings,settings:cfg()});}catch(e){}
    if(!force&&sig===lastSignature)return;lastSignature=sig;
    setData(POINT_SOURCE,fc(pointFeatures()));
    setData(LINE_SOURCE,fc(lineFeatures()));
    setData(OUTLINE_SOURCE,fc(outlineFeatures()));
    setData(ROUTE_SOURCE,fc(routeFeatures()));
    // Foreground geometry is explicit: any heat-map owner can anchor before the
    // grid, and these layers are re-raised after style churn.
    try{for(const id of [LINE_LAYER,OUTLINE_LAYER,ROUTE_LAYER,POINT_LAYER,LABEL_LAYER])if(map.getLayer(id))map.moveLayer(id);}catch(e){}
  }

  function attach(next){
    if(!next||next===map)return;
    map=next;lastSignature='';
    try{
      map.on('style.load',()=>refresh(true));
      map.on('styledata',()=>refresh(false));
      map.on('click',POINT_LAYER,e=>{const f=e.features&&e.features[0];if(!f)return;const r=+f.properties.r,c=+f.properties.c;if(Number.isInteger(r)&&Number.isInteger(c)&&typeof openPoint==='function')openPoint(r,c);});
    }catch(e){}
    refresh(true);
  }

  window.addEventListener('padgrade-map-created',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
  window.addEventListener('padgrade-active-project-applied',()=>refresh(true));
  if(window.__padGradeMapInstance)attach(window.__padGradeMapInstance);
  timer=setInterval(()=>{if(!map&&window.__padGradeMapInstance)attach(window.__padGradeMapInstance);refresh(false);},300);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  window.__padGradePrimaryGridReadinessV087='style-ready-not-imagery-load';
})();
