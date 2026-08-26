/* Pad Grade v0.7.6 DEV — local 3-point surface + interactive map probe.
 *
 * - Redirects the GPS heat-map worker to the v0.7.6 local-triangle renderer.
 * - Makes the same local-triangle interpolation authoritative for optimizer samples.
 * - Adds a map probe for exact interpolated rod/cut/fill values and optional GPS
 *   navigation to the probed location.
 */
(function installPadGrade076(){
  'use strict';

  const VERSION='v0.7.6 DEV';
  const WORKER_OLD=/heatmap-raster-worker-v073\.js(?:\?|$)/;
  const WORKER_NEW='heatmap-raster-worker-v076.js?v=20260826-1';
  const $=id=>document.getElementById(id);

  let probeMode=false;
  let probe=null;
  let probeMarker=null;
  let probePopup=null;
  let probeNavigating=false;
  let attachedMap=null;
  let navTimer=null;

  function installWorkerRedirect(){
    const NativeWorker=window.Worker;
    if(typeof NativeWorker!=='function'||NativeWorker.__padGrade076Redirect)return;
    function PadGradeWorker(url,options){
      let next=url;
      try{if(WORKER_OLD.test(String(url)))next=WORKER_NEW;}catch(e){}
      return new NativeWorker(next,options);
    }
    PadGradeWorker.prototype=NativeWorker.prototype;
    try{Object.setPrototypeOf(PadGradeWorker,NativeWorker);}catch(e){}
    PadGradeWorker.__padGrade076Redirect=true;
    PadGradeWorker.__padGrade076Native=NativeWorker;
    window.Worker=PadGradeWorker;
  }

  function measuredPoints(){
    let pts=[];
    try{pts=typeof pgMeasuredSurfacePoints==='function'?pgMeasuredSurfacePoints():[];}catch(e){pts=[];}
    return (pts||[]).map(p=>({
      x:+p.x,y:+p.y,v:+p.v,r:p.r,c:p.c,
      label:Number.isInteger(p.r)&&Number.isInteger(p.c)&&typeof label==='function'?label(p.r,p.c):null
    })).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.v));
  }

  function interpolateSurfaceAt(x,y,includeDetails=true){
    if(!window.PadGradeLocalSurface)return null;
    return PadGradeLocalSurface.interpolateAt(+x,+y,measuredPoints(),!!includeDetails);
  }
  window.pgInterpolateSurfaceAt=interpolateSurfaceAt;

  function installAuthoritativeSamples(){
    if(!window.PadGradeLocalSurface||typeof window.pgSurfaceSamples!=='function')return false;
    window.pgSurfaceSamples=function(res=80){
      const s=cfg(),pts=measuredPoints();
      if(pts.length<3)return {pts,tris:[],samples:[],coveredFt2:0};
      const nx=Math.max(24,Math.min(+res||80,120));
      const ny=Math.max(24,Math.round(nx*s.length/Math.max(s.width,1)));
      const areaFt2=s.width*s.length/(nx*ny);
      const raster=PadGradeLocalSurface.rasterize({nx,ny,width:s.width,length:s.length,points:pts,flipY:false});
      const samples=[];
      for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
        const o=iy*nx+ix;if(!raster.counts[o])continue;
        const v=raster.values[o];if(!Number.isFinite(v))continue;
        samples.push({x:(ix+.5)/nx*s.width,y:(iy+.5)/ny*s.length,v,areaFt2});
      }
      return {pts,tris:[],samples,coveredFt2:samples.length*areaFt2,localTriangle:true};
    };
    window.__padGradeSurfaceModel='smallest-containing-triangle-idw2-tie-average';
    return true;
  }

  function padXYFromLatLon(lat,lon){
    try{
      if(typeof gpsFit==='undefined'||!gpsFit||typeof localDeltaFeet!=='function')return null;
      const d=localDeltaFeet(gpsFit.originLat,gpsFit.originLon,+lat,+lon);
      const ex=d.east-gpsFit.tx,ny=d.north-gpsFit.ty;
      const ct=Math.cos(gpsFit.theta),st=Math.sin(gpsFit.theta);
      return {x:ct*ex+st*ny,y:-st*ex+ct*ny};
    }catch(e){return null;}
  }

  function fmtPosition(x,y){
    try{return `${pgFmtPlan(x,1)} E • ${pgFmtPlan(y,1)} N of SW`;}catch(e){return `${x.toFixed(1)} ft E • ${y.toFixed(1)} ft N of SW`;}
  }

  function fmtRod(v){try{return pgFmtRod(v);}catch(e){return `${v.toFixed(2)}″`;}}
  function fmtGrade(v){try{return pgFmtGrade(v,2);}catch(e){return `${v.toFixed(2)}″`;}}

  function resultText(v){
    const s=cfg(),d=v-s.target;
    if(Math.abs(d)<=s.tol)return {kind:'GRADE',detail:`${d>=0?'+':''}${fmtGrade(d)} from target`};
    if(d<0)return {kind:`CUT ${fmtGrade(Math.abs(d))}`,detail:''};
    return {kind:`FILL ${fmtGrade(d)}`,detail:''};
  }

  function referenceLabels(result){
    if(!result||!Array.isArray(result.triangles)||!result.triangles.length)return [];
    const out=[],seen=new Set();
    for(const tr of result.triangles)for(const idx of tr){
      const name=result.points&&result.points[idx]&&result.points[idx].label;
      if(name&&!seen.has(name)){seen.add(name);out.push(name);}
    }
    return out;
  }

  function markerElement(){
    const el=document.createElement('div');el.className='padGradeProbeMarker';el.setAttribute('aria-label','Surface probe');
    el.innerHTML='<span></span>';
    return el;
  }

  function clearProbe(){
    probe=null;probeNavigating=false;
    if(probeMarker){try{probeMarker.remove();}catch(e){}probeMarker=null;}
    if(probePopup){try{probePopup.remove();}catch(e){}probePopup=null;}
    updateProbeControls();updateNavigationStatus();
  }

  function popupContent(sample){
    const box=document.createElement('div');box.className='padGradeProbeCallout';
    if(!sample.result){
      const title=document.createElement('b');title.textContent='No interpolated surface here';
      const pos=document.createElement('div');pos.className='small';pos.textContent=fmtPosition(sample.x,sample.y);
      box.append(title,pos);return box;
    }
    const value=sample.result.value,status=resultText(value),refs=referenceLabels(sample.result);
    const title=document.createElement('div');title.className='probeValue';title.textContent=fmtRod(value);
    const label1=document.createElement('div');label1.className='probeLabel';label1.textContent='interpolated rod';
    const result=document.createElement('div');result.className='probeResult';result.textContent=status.kind;
    const target=document.createElement('div');target.className='small';target.textContent=`Target ${fmtRod(cfg().target)}${status.detail?` • ${status.detail}`:''}`;
    const pos=document.createElement('div');pos.className='small';pos.textContent=fmtPosition(sample.x,sample.y);
    box.append(title,label1,result,target,pos);
    if(refs.length){const ref=document.createElement('div');ref.className='small probeRefs';ref.textContent=`References: ${refs.join(', ')}`;box.appendChild(ref);}
    const actions=document.createElement('div');actions.className='probeActions';
    const nav=document.createElement('button');nav.type='button';nav.textContent='Navigate to Probe';nav.addEventListener('click',ev=>{ev.stopPropagation();probeNavigating=true;probeMode=false;updateProbeControls();updateNavigationStatus();});
    const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';clear.addEventListener('click',ev=>{ev.stopPropagation();clearProbe();});
    actions.append(nav,clear);box.appendChild(actions);
    return box;
  }

  function setProbeAt(map,lngLat){
    if(!map||!lngLat)return;
    const xy=padXYFromLatLon(lngLat.lat,lngLat.lng);if(!xy)return;
    const s=cfg(),margin=Math.max(s.width,s.length)*1e-6;
    if(xy.x < -margin||xy.x > s.width+margin||xy.y < -margin||xy.y > s.length+margin)return;
    const x=Math.max(0,Math.min(s.width,xy.x)),y=Math.max(0,Math.min(s.length,xy.y));
    const result=interpolateSurfaceAt(x,y,true);
    probe={x,y,lat:+lngLat.lat,lon:+lngLat.lng,result};probeNavigating=false;
    if(!window.maplibregl)return;
    if(!probeMarker)probeMarker=new maplibregl.Marker({element:markerElement(),anchor:'center'}).setLngLat([probe.lon,probe.lat]).addTo(map);
    else probeMarker.setLngLat([probe.lon,probe.lat]);
    if(probePopup){try{probePopup.remove();}catch(e){}}
    probePopup=new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:14,maxWidth:'300px'})
      .setLngLat([probe.lon,probe.lat]).setDOMContent(popupContent(probe)).addTo(map);
    probePopup.on('close',()=>{probePopup=null;});
    updateProbeControls();updateNavigationStatus();
  }

  function updateProbeControls(){
    const btn=$('surfaceProbeBtn'),clear=$('surfaceProbeClearBtn');
    if(btn){btn.textContent=probeMode?'Probe: On':'Probe Surface';btn.classList.toggle('primary',probeMode);btn.setAttribute('aria-pressed',probeMode?'true':'false');}
    if(clear)clear.disabled=!probe;
    const map=attachedMap||window.__padGradeMapInstance;
    try{if(map&&map.getCanvas)map.getCanvas().style.cursor=probeMode?'crosshair':'';}catch(e){}
  }

  function stopProbeNavigation(){probeNavigating=false;updateNavigationStatus();}

  function directionText(v,pos,neg){
    try{return `${pgFmtPlan(Math.abs(v),1)} ${v>=0?pos:neg}`;}catch(e){return `${Math.abs(v).toFixed(1)} ft ${v>=0?pos:neg}`;}
  }

  function updateNavigationStatus(){
    const panel=$('surfaceProbeNav');if(!panel)return;
    if(!probeNavigating||!probe){panel.classList.remove('show');panel.innerHTML='';return;}
    panel.classList.add('show');
    let fix=null;try{if(typeof gpsPos!=='undefined'&&gpsPos)fix=gpsPos;}catch(e){}
    if(!fix||!Number.isFinite(+fix.lat)||!Number.isFinite(+fix.lon)){
      panel.innerHTML='<b>Probe navigation</b><span>Waiting for GPS fix…</span>';
    }else{
      let d=null;try{d=localDeltaFeet(+fix.lat,+fix.lon,probe.lat,probe.lon);}catch(e){}
      if(d){
        panel.innerHTML=`<b>Probe navigation</b><span>${directionText(d.east,'E','W')} • ${directionText(d.north,'N','S')} • ${pgFmtPlan(d.distance,1)} straight-line</span>`;
      }else panel.innerHTML='<b>Probe navigation</b><span>Position unavailable</span>';
    }
    const stop=document.createElement('button');stop.type='button';stop.textContent='Stop';stop.addEventListener('click',stopProbeNavigation);panel.appendChild(stop);
  }

  function installProbeControls(){
    const controls=$('gpsMapFieldControls');if(!controls||$('surfaceProbeBtn'))return false;
    const row=document.createElement('div');row.className='surfaceProbeControls';
    const probeBtn=document.createElement('button');probeBtn.id='surfaceProbeBtn';probeBtn.type='button';probeBtn.textContent='Probe Surface';probeBtn.setAttribute('aria-pressed','false');
    const clearBtn=document.createElement('button');clearBtn.id='surfaceProbeClearBtn';clearBtn.type='button';clearBtn.textContent='Clear Probe';clearBtn.disabled=true;
    probeBtn.addEventListener('click',()=>{probeMode=!probeMode;if(probeMode)probeNavigating=false;updateProbeControls();updateNavigationStatus();});
    clearBtn.addEventListener('click',clearProbe);
    row.append(probeBtn,clearBtn);controls.appendChild(row);
    const nav=document.createElement('div');nav.id='surfaceProbeNav';nav.className='surfaceProbeNav';controls.appendChild(nav);
    updateProbeControls();return true;
  }

  function attachMap(map){
    if(!map||attachedMap===map)return;
    if(attachedMap){try{attachedMap.off('click',onMapClick);}catch(e){}}
    attachedMap=map;
    try{map.on('click',onMapClick);}catch(e){}
    updateProbeControls();
  }

  function onMapClick(ev){
    if(!probeMode||!ev||!ev.lngLat)return;
    setProbeAt(attachedMap||window.__padGradeMapInstance,ev.lngLat);
  }

  function installStyles(){
    if($('padGrade076Styles'))return;
    const style=document.createElement('style');style.id='padGrade076Styles';style.textContent=`
      .surfaceProbeControls{display:flex;gap:5px;flex-wrap:wrap}
      .surfaceProbeNav{display:none;gap:5px;padding:7px 8px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(15,22,30,.78);font-size:11px}
      .surfaceProbeNav.show{display:grid;grid-template-columns:1fr auto;align-items:center}
      .surfaceProbeNav b{grid-column:1/-1}.surfaceProbeNav span{min-width:0}
      .surfaceProbeNav button{grid-column:2;grid-row:2;padding:4px 8px;font-size:11px}
      .padGradeProbeMarker{width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:rgba(8,15,22,.8);box-shadow:0 1px 5px rgba(0,0,0,.65);position:relative}
      .padGradeProbeMarker::before,.padGradeProbeMarker::after{content:'';position:absolute;background:#fff;left:50%;top:50%;transform:translate(-50%,-50%)}
      .padGradeProbeMarker::before{width:14px;height:2px}.padGradeProbeMarker::after{width:2px;height:14px}
      .padGradeProbeCallout{display:grid;gap:3px;min-width:190px;color:#111;font:13px system-ui,sans-serif}
      .padGradeProbeCallout .probeValue{font-size:21px;font-weight:800;line-height:1.05}
      .padGradeProbeCallout .probeLabel{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#555}
      .padGradeProbeCallout .probeResult{font-size:15px;font-weight:800;margin-top:3px}
      .padGradeProbeCallout .small{font-size:11px;color:#444}.padGradeProbeCallout .probeRefs{margin-top:2px}
      .padGradeProbeCallout .probeActions{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
      .padGradeProbeCallout button{font:600 11px system-ui,sans-serif;padding:5px 7px}
    `;document.head.appendChild(style);
  }

  function boot(){
    installStyles();installAuthoritativeSamples();installProbeControls();
    const map=window.__padGradeMapInstance;if(map)attachMap(map);
    window.addEventListener('padgrade-map-created',ev=>{const m=ev?.detail?.map||window.__padGradeMapInstance;if(m)attachMap(m);setTimeout(installProbeControls,0);});
    let tries=0;const timer=setInterval(()=>{
      installProbeControls();installAuthoritativeSamples();
      const m=window.__padGradeMapInstance;if(m)attachMap(m);
      if(++tries>40)clearInterval(timer);
    },150);
    navTimer=setInterval(updateNavigationStatus,350);
    document.title=`Pad Grade Mapper ${VERSION}`;
    window.__padGradeDevVersion076=VERSION;
    window.addEventListener('beforeunload',()=>{
      clearInterval(timer);if(navTimer)clearInterval(navTimer);navTimer=null;
      if(attachedMap)try{attachedMap.off('click',onMapClick);}catch(e){}
    },{once:true});
  }

  installWorkerRedirect();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
})();
