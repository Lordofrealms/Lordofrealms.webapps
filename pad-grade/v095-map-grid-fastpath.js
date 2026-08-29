/* Pad Grade v0.9.7 DEV — map-grid fast path.
 *
 * The project grid is tiny GeoJSON and must never wait on raster imagery or on
 * heat-map interpolation. On an existing map, a transient isStyleLoaded()==false
 * after layer/source mutation is not treated as a reason to defer the grid: if a
 * live style object exists we attempt the install immediately and retry briefly
 * on animation frames only if MapLibre actually rejects the operation.
 */
(function installPadGrade095MapGridFastPath(){
  'use strict';

  const VERSION='v0.9.7 DEV';
  const SOURCE_IDS=new Set(['pad-grade-grid-lines','pad-grade-pad-outline','pad-grade-route','pad-grade-grid-points']);
  const LAYER_IDS=new Set(['pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels']);
  let lastSignature='';
  let retryRaf=0,retryBudget=0;

  const fc=features=>({type:'FeatureCollection',features:features||[]});
  const mapInstance=()=>window.__padGradeMapInstance||null;
  function styleReady(map){try{const style=map?.getStyle?.();return !!(map&&style&&Array.isArray(style.layers));}catch(e){return false;}}
  function activeId(){try{return localStorage.getItem('padGradeActiveProjectIdV5')||'';}catch(e){return '';}}

  function installDuplicateTolerance(map){
    if(!map||map.__padGrade095DuplicateTolerance)return;
    map.__padGrade095DuplicateTolerance=true;
    const rawAddSource=map.addSource.bind(map),rawAddLayer=map.addLayer.bind(map);
    map.addSource=function(id,source){
      if(SOURCE_IDS.has(String(id||''))&&map.getSource?.(id))return map;
      return rawAddSource(id,source);
    };
    map.addLayer=function(layer,beforeId){
      const id=String(layer?.id||'');
      if(LAYER_IDS.has(id)&&map.getLayer?.(id))return map;
      return rawAddLayer(layer,beforeId);
    };
  }

  function pointFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof cfg!=='function'||typeof targetLatLon!=='function')return [];
      const s=cfg(),pid=activeId(),out=[];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const idx=indexFromPoint(r,c),ll=targetLatLon(idx);if(!ll)continue;
        const val=readings[k(r,c)];let status='empty';
        if(Number.isFinite(val)){const diff=diffFor(val);status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';}
        if(idx===gpsTargetIndex)status='target';
        out.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status,projectId:pid},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
      }
      return out;
    }catch(e){return [];}
  }

  function lineFeatures(){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit)return [];
      const s=cfg(),out=[];
      for(let r=0;r<s.rows;r++){
        const coords=[];for(let c=0;c<s.cols;c++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      for(let c=0;c<s.cols;c++){
        const coords=[];for(let r=0;r<s.rows;r++){const ll=targetLatLon(indexFromPoint(r,c));if(ll)coords.push([ll.lon,ll.lat]);}
        if(coords.length>1)out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
      }
      return out;
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

  function signature(){
    try{return JSON.stringify({project:activeId(),fit:typeof gpsFit!=='undefined'&&gpsFit?gpsFit:null,target:typeof gpsTargetIndex==='undefined'?null:gpsTargetIndex,readings,settings:cfg()});}catch(e){return String(Date.now());}
  }

  function ensureFamily(map){
    if(!styleReady(map))return false;
    installDuplicateTolerance(map);
    try{
      if(!map.getSource('pad-grade-grid-lines'))map.addSource('pad-grade-grid-lines',{type:'geojson',data:fc(lineFeatures())});
      if(!map.getLayer('pad-grade-grid-lines-layer'))map.addLayer({id:'pad-grade-grid-lines-layer',type:'line',source:'pad-grade-grid-lines',paint:{'line-color':'#d8f2ff','line-width':1,'line-opacity':0.55}});
      if(!map.getSource('pad-grade-pad-outline'))map.addSource('pad-grade-pad-outline',{type:'geojson',data:fc(outlineFeatures())});
      if(!map.getLayer('pad-grade-pad-outline-layer'))map.addLayer({id:'pad-grade-pad-outline-layer',type:'line',source:'pad-grade-pad-outline',paint:{'line-color':'#ffffff','line-width':3,'line-opacity':0.95}});
      if(!map.getSource('pad-grade-route'))map.addSource('pad-grade-route',{type:'geojson',data:fc(routeFeatures())});
      if(!map.getLayer('pad-grade-route-layer'))map.addLayer({id:'pad-grade-route-layer',type:'line',source:'pad-grade-route',paint:{'line-color':'#ffd166','line-width':3,'line-opacity':0.8,'line-dasharray':[2,2]}});
      if(!map.getSource('pad-grade-grid-points'))map.addSource('pad-grade-grid-points',{type:'geojson',data:fc(pointFeatures())});
      if(!map.getLayer('pad-grade-grid-points-layer'))map.addLayer({id:'pad-grade-grid-points-layer',type:'circle',source:'pad-grade-grid-points',paint:{'circle-radius':['case',['==',['get','status'],'target'],9,6],'circle-color':['match',['get','status'],'target','#ffd166','cut','#a83a2b','fill','#315fa8','grade','#4f8f3a','#66717d'],'circle-stroke-color':'#ffffff','circle-stroke-width':['case',['==',['get','status'],'target'],3,1]}});
      if(!map.getLayer('pad-grade-grid-labels'))map.addLayer({id:'pad-grade-grid-labels',type:'symbol',source:'pad-grade-grid-points',minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
      return true;
    }catch(e){console.warn('Pad Grade v0.9.7 fast grid install deferred',e);return false;}
  }

  function scheduleRetry(){
    if(retryRaf||retryBudget>=4)return;
    retryBudget++;
    retryRaf=requestAnimationFrame(()=>{retryRaf=0;refreshNow(true);});
  }

  function refreshNow(force=false){
    const map=mapInstance();if(!map)return false;
    if(!ensureFamily(map)){scheduleRetry();return false;}
    const sig=signature();if(!force&&sig===lastSignature){retryBudget=0;return true;}lastSignature=sig;
    try{
      map.getSource('pad-grade-grid-lines')?.setData(fc(lineFeatures()));
      map.getSource('pad-grade-pad-outline')?.setData(fc(outlineFeatures()));
      map.getSource('pad-grade-route')?.setData(fc(routeFeatures()));
      map.getSource('pad-grade-grid-points')?.setData(fc(pointFeatures()));
      map.triggerRepaint?.();
      retryBudget=0;
      window.__padGradeMapGridFastPathV095={projectId:activeId(),updatedAt:Date.now(),styleLoad:true,beforeGridAndGpsUi:true};
      try{window.dispatchEvent(new CustomEvent('padgrade-project-grid-ready',{detail:{map,projectId:activeId(),fastPath:'v097'}}));}catch(e){}
      return true;
    }catch(e){console.warn('Pad Grade v0.9.7 fast grid refresh failed',e);scheduleRetry();return false;}
  }

  function attach(map){
    if(!map||map.__padGrade095FastGridAttached)return;
    map.__padGrade095FastGridAttached=true;installDuplicateTolerance(map);
    try{map.on('style.load',()=>refreshNow(true));map.on('styledata',()=>refreshNow(false));}catch(e){}
    if(styleReady(map))refreshNow(true);
  }

  function wrapGpsUi(){
    const base=window.updateGpsUI;if(typeof base!=='function'||base.__padGrade095FastGridWrapped)return;
    function wrappedGpsUi(...args){refreshNow(true);return base.apply(this,args);}
    wrappedGpsUi.__padGrade095FastGridWrapped=true;wrappedGpsUi.__padGrade095Base=base;window.updateGpsUI=wrappedGpsUi;
  }

  function wrapRenderGrid(){
    const base=window.renderGrid;if(typeof base!=='function'||base.__padGrade095FastGridWrapped)return;
    function wrappedRenderGrid(...args){refreshNow(true);return base.apply(this,args);}
    wrappedRenderGrid.__padGrade095FastGridWrapped=true;wrappedRenderGrid.__padGrade095Base=base;window.renderGrid=wrappedRenderGrid;
  }

  function wrapFastPaths(){wrapRenderGrid();wrapGpsUi();attach(mapInstance());}

  window.__padGradeRefreshMapGridNow=refreshNow;
  window.addEventListener('padgrade-map-created',event=>{attach(event?.detail?.map||mapInstance());refreshNow(true);document.title=`Pad Grade Mapper ${VERSION}`;});
  window.addEventListener('padgrade-active-project-applied',()=>refreshNow(true));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{wrapFastPaths();document.title=`Pad Grade Mapper ${VERSION}`;},{once:true});
  else{wrapFastPaths();document.title=`Pad Grade Mapper ${VERSION}`;}

  // Compatibility modules may replace renderGrid/updateGpsUI later; re-wrap them
  // briefly during startup without polling the map forever.
  let wraps=0;const wrapTimer=setInterval(()=>{wrapFastPaths();if(++wraps>=30)clearInterval(wrapTimer);},100);
  window.__padGradeMapGridPriorityV097='live-style-attempt-immediately-retry-on-actual-add-failure-no-heatmap-delay';
  window.__padGradeMapGridPriorityV095=window.__padGradeMapGridPriorityV097;
})();
