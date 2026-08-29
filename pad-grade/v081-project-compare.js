/* Pad Grade v0.8.1 DEV — temporary two-project elevation-change comparison view. */
(function installPadGrade081ProjectComparison(){
  'use strict';

  const VERSION='v0.8.1 DEV';
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const LOW_TIER=304;
  const HIGH_TIER=888;
  const WORKER_URL='heatmap-raster-worker-v078.js?v=20260826-3';
  const CACHED_TILE_URL='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
  const CACHED_SOURCE='pg-compare-usgs-cached';
  const HIGH_RES_SOURCE='pg-compare-usgs-naip';
  const GRID_SOURCE='pg-compare-grid';
  const POINT_SOURCE='pg-compare-points';
  const OUTLINE_SOURCE='pg-compare-outline';
  const GRID_LAYER='pg-compare-grid-layer';
  const POINT_LAYER='pg-compare-point-layer';
  const OUTLINE_LAYER='pg-compare-outline-layer';
  const HEAT_SOURCE_PREFIX='pg-compare-heat-source-';
  const HEAT_LAYER_PREFIX='pg-compare-heat-layer-';
  const core=window.PadGradeProjectCompareCore;
  const $=id=>document.getElementById(id);

  let compareMap=null;
  let compareWorker=null;
  let compareOverlay=null;
  let comparePopup=null;
  let compareMarker=null;
  let activeSlot=null;
  let slotCanvases=[null,null];
  let compareState=null;
  let renderSerial=0;

  if(!core){console.error('Pad Grade v0.8.1 comparison core is unavailable');return;}

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function projectKey(id){return `${PROJECT_PREFIX}${id}`;}
  function safeProject(raw,id){if(!raw||typeof raw!=='object')return null;const p=JSON.parse(JSON.stringify(raw));if(!p.id)p.id=id;return p;}

  function currentMemoryProject(id,stored){
    const active=localStorage.getItem(ACTIVE_KEY);
    if(!id||id!==active)return stored;
    try{
      const p=safeProject(stored,id)||{id};
      p.settings=typeof cfg==='function'?{...cfg()}:(p.settings||{});
      p.readings=typeof readings==='object'?{...readings}:(p.readings||{});
      p.readingMeta=typeof readingMeta==='object'?{...readingMeta}:(p.readingMeta||{});
      p.measureMode=typeof measureMode==='string'?measureMode:p.measureMode;
      p.gps=p.gps&&typeof p.gps==='object'?{...p.gps}:{};
      if(typeof gpsCorners!=='undefined'&&gpsCorners&&typeof gpsCorners==='object')p.gps.corners=JSON.parse(JSON.stringify(gpsCorners));
      if(typeof gpsCaptureIndex==='number')p.gps.captureIndex=gpsCaptureIndex;
      if(typeof gpsTargetIndex==='number')p.gps.targetIndex=gpsTargetIndex;
      if(typeof gpsRef!=='undefined')p.gps.reference=gpsRef;
      if(typeof gpsOpposite!=='undefined')p.gps.opposite=gpsOpposite;
      return p;
    }catch(e){return stored;}
  }

  function loadProjects(){
    const idx=parse(localStorage.getItem(INDEX_KEY),[]),items=Array.isArray(idx)?idx:[];
    const seen=new Set(),projects=[];
    for(const meta of items){
      if(!meta||!meta.id||seen.has(meta.id))continue;seen.add(meta.id);
      const stored=safeProject(parse(localStorage.getItem(projectKey(meta.id)),null),meta.id);
      const p=currentMemoryProject(meta.id,stored);if(!p)continue;
      p.__meta=meta;projects.push(p);
    }
    // Include any project storage keys that predate or temporarily escaped the index.
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key||!key.startsWith(PROJECT_PREFIX))continue;
      const id=key.slice(PROJECT_PREFIX.length);if(seen.has(id))continue;seen.add(id);
      const stored=safeProject(parse(localStorage.getItem(key),null),id),p=currentMemoryProject(id,stored);if(p)projects.push(p);
    }
    return projects;
  }

  function projectName(p){return String(p?.settings?.name||p?.__meta?.name||'Pad');}
  function projectFileId(p){return String(p?.fileId||p?.__meta?.fileId||'').toUpperCase();}
  function projectDate(p){const raw=p?.modifiedAt||p?.createdAt||p?.__meta?.modifiedAt;const t=Date.parse(raw||'');return Number.isFinite(t)?t:0;}
  function optionLabel(p){const fid=projectFileId(p),gps=core.hasFourGpsCorners(p)?'GPS ready':'GPS incomplete';return `${projectName(p)}${fid?` [${fid}]`:''} — ${gps}`;}

  function ensureSelectorDialog(){
    if($('projectCompareDlg'))return $('projectCompareDlg');
    const dlg=document.createElement('dialog');dlg.id='projectCompareDlg';
    dlg.innerHTML=`<div class="modal pgComparePicker"><h2>Compare Projects</h2><div class="small">Only projects with every grid point measured are available. First and Second control the direction of the elevation-change calculation.</div><label>First measurement<select id="projectCompareFirst"></select></label><label>Second measurement<select id="projectCompareSecond"></select></label><div id="projectComparePickerStatus" class="pgComparePickerStatus"></div><div class="modalActions"><button id="projectCompareCancel">Cancel</button><button id="projectCompareStart" class="primary">Compare</button></div></div>`;
    document.body.appendChild(dlg);
    $('projectCompareCancel').onclick=()=>dlg.close();
    $('projectCompareStart').onclick=startSelectedComparison;
    $('projectCompareFirst').addEventListener('change',updatePickerStatus);
    $('projectCompareSecond').addEventListener('change',updatePickerStatus);
    return dlg;
  }

  function eligibleProjects(){return loadProjects().filter(core.isFullyFilled).sort((a,b)=>projectDate(a)-projectDate(b)||projectName(a).localeCompare(projectName(b)));}

  function openPicker(){
    try{if(typeof saveLocal==='function')saveLocal();}catch(e){}
    const dlg=ensureSelectorDialog(),eligible=eligibleProjects();
    if(eligible.length<2){alert(`Compare Projects needs two fully measured projects. Found ${eligible.length}.`);return;}
    const first=$('projectCompareFirst'),second=$('projectCompareSecond');
    first.innerHTML=second.innerHTML='';
    for(const p of eligible){
      for(const select of [first,second]){const opt=document.createElement('option');opt.value=p.id;opt.textContent=optionLabel(p);select.appendChild(opt);}
    }
    first.value=eligible[Math.max(0,eligible.length-2)].id;
    second.value=eligible[eligible.length-1].id;
    updatePickerStatus();dlg.showModal();
  }

  function selectedProjects(){
    const all=loadProjects(),byId=new Map(all.map(p=>[p.id,p]));
    return {first:byId.get($('projectCompareFirst')?.value),second:byId.get($('projectCompareSecond')?.value)};
  }

  function updatePickerStatus(){
    const status=$('projectComparePickerStatus'),{first,second}=selectedProjects();if(!status)return;
    if(!first||!second){status.textContent='Choose two projects.';status.className='pgComparePickerStatus bad';return;}
    if(first.id===second.id){status.textContent='First and Second must be different projects.';status.className='pgComparePickerStatus bad';return;}
    if(!core.sameLogicalGrid(first,second)){status.textContent='These projects use different row/column counts and cannot be matched by logical grid position.';status.className='pgComparePickerStatus bad';return;}
    if(!core.hasFourGpsCorners(first)||!core.hasFourGpsCorners(second)){status.textContent='Both projects are fully measured, but both also need four-corner GPS calibration to build the shared GPS comparison map.';status.className='pgComparePickerStatus bad';return;}
    const a=first.settings||{},b=second.settings||{},different=Math.abs(Number(a.width)-Number(b.width))>1e-6||Math.abs(Number(a.length)-Number(b.length))>1e-6;
    status.textContent=different?'Ready. Pad dimensions differ, so the shared comparison grid will use their average dimensions.':'Ready. Corresponding GPS corners will be averaged into one shared grid.';
    status.className='pgComparePickerStatus good';
  }

  function startSelectedComparison(){
    const {first,second}=selectedProjects();
    try{
      if(!first||!second)throw new Error('Choose two projects.');
      if(first.id===second.id)throw new Error('First and Second must be different projects.');
      const comparison=core.buildComparison(first,second);
      const geometry=core.buildSharedGeometry(first,second,comparison);
      $('projectCompareDlg')?.close();
      showComparison(first,second,comparison,geometry);
    }catch(e){const status=$('projectComparePickerStatus');if(status){status.textContent=e.message||String(e);status.className='pgComparePickerStatus bad';}else alert(e.message||String(e));}
  }

  function fmtDelta(inches){
    const v=Number(inches);if(!Number.isFinite(v))return '—';
    try{return typeof pgFmtGrade==='function'?pgFmtGrade(Math.abs(v),2):`${Math.abs(v).toFixed(2)}″`;}catch(e){return `${Math.abs(v).toFixed(2)}″`;}
  }
  function signedDelta(inches){const v=Number(inches);if(!Number.isFinite(v))return '—';const abs=fmtDelta(v);return `${v>=0?'+':'−'}${abs}`;}
  function deltaAction(v,tol){v=Number(v);if(Math.abs(v)<=tol)return `NO CHANGE ${signedDelta(v)}`;return v<0?`CUT ${fmtDelta(v)}`:`FILL ${fmtDelta(v)}`;}

  function installStyles(){
    if($('pgCompareStyles'))return;
    const style=document.createElement('style');style.id='pgCompareStyles';style.textContent=`
      .bottom #compareProjectsBottomBtn{min-width:112px}
      .pgComparePicker{display:grid;gap:11px}.pgComparePicker>label{display:grid;gap:5px;color:var(--muted);font-size:.75rem}
      .pgComparePicker select{width:100%;background:#0d1218;color:var(--ink);border:1px solid #3a4756;border-radius:10px;padding:10px;font:inherit}
      .pgComparePickerStatus{padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:#0d1218;font-size:.75rem;line-height:1.35}
      .pgComparePickerStatus.good{border-color:#548637;color:#c8f5a1}.pgComparePickerStatus.bad{border-color:#744238;color:#ffad9f}
      .pgCompareOverlay{position:fixed;inset:0;z-index:2147483000;background:#0b0f14;color:#f3f4f6;display:grid;grid-template-rows:auto 1fr;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .pgCompareHeader{display:grid;gap:7px;padding:10px 12px;border-bottom:1px solid #2a3440;background:rgba(11,15,20,.98)}
      .pgCompareHeaderTop{display:flex;align-items:center;justify-content:space-between;gap:10px}.pgCompareHeaderTop h2{margin:0;font-size:1.08rem}
      .pgCompareHeader button{padding:8px 11px}.pgCompareDirection{font-size:.78rem;color:#dce5ed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pgCompareDirection b{color:#b7ef83}.pgCompareStats{display:flex;gap:7px;flex-wrap:wrap}.pgCompareChip{padding:5px 8px;border:1px solid #34404e;border-radius:999px;background:#141b23;font-size:.7rem}
      .pgCompareMapWrap{position:relative;min-height:0}.pgCompareMap{position:absolute;inset:0}.pgCompareMapMessage{position:absolute;z-index:6;left:50%;top:50%;transform:translate(-50%,-50%);padding:8px 11px;border-radius:9px;background:rgba(11,15,20,.9);border:1px solid rgba(255,255,255,.18);font-size:.76rem;pointer-events:none}.pgCompareMapMessage.hidden{display:none}
      .pgCompareLegend{position:absolute;z-index:7;left:10px;bottom:10px;display:flex;gap:8px;flex-wrap:wrap;padding:7px 9px;border-radius:10px;background:rgba(11,15,20,.9);border:1px solid rgba(255,255,255,.16);font-size:.68rem}.pgCompareLegend span{display:flex;align-items:center;gap:4px}.pgCompareLegend i{width:10px;height:10px;border-radius:3px;display:inline-block}
      .pgCompareProbeMarker{width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:rgba(8,15,22,.82);box-shadow:0 1px 5px rgba(0,0,0,.65);position:relative}.pgCompareProbeMarker::before,.pgCompareProbeMarker::after{content:'';position:absolute;background:#fff;left:50%;top:50%;transform:translate(-50%,-50%)}.pgCompareProbeMarker::before{width:14px;height:2px}.pgCompareProbeMarker::after{width:2px;height:14px}
      .pgComparePopup{display:grid;gap:4px;min-width:205px;color:#111;font:13px system-ui,sans-serif}.pgComparePopup .big{font-size:18px;font-weight:850}.pgComparePopup .small{font-size:11px;color:#444}
      @media(max-width:520px){.bottom{gap:5px}.bottom button{min-width:0!important;flex:1;padding-left:7px;padding-right:7px}.pgCompareHeader{padding:8px}.pgCompareDirection{font-size:.7rem}}
    `;document.head.appendChild(style);
  }

  function highResTileUrl(){
    const renderingRule=encodeURIComponent(JSON.stringify({rasterFunction:'NaturalColor'}));
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=false&f=image&renderingRule='+renderingRule;
  }
  function mapStyle(){return {version:8,sources:{[CACHED_SOURCE]:{type:'raster',tiles:[CACHED_TILE_URL],tileSize:256,minzoom:0,maxzoom:16,attribution:'USGS, USDA, The National Map'},[HIGH_RES_SOURCE]:{type:'raster',tiles:[highResTileUrl()],tileSize:256,minzoom:14,maxzoom:22,attribution:'USGS, USDA, The National Map'}},layers:[{id:'pg-compare-usgs-cached-layer',type:'raster',source:CACHED_SOURCE},{id:'pg-compare-usgs-highres-layer',type:'raster',source:HIGH_RES_SOURCE,minzoom:14,paint:{'raster-opacity':1}}]};}

  function fitLL(x,y){return core.fitPointLatLon(compareState.geometry.fit,x,y);}
  function canvasCoordinates(){const c=compareState.comparison,tl=fitLL(0,c.length),tr=fitLL(c.width,c.length),br=fitLL(c.width,0),bl=fitLL(0,0);return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];}

  function featureCollections(){
    const c=compareState.comparison,grid=[],points=[];
    for(let r=0;r<c.rows;r++){
      const coords=[];for(let col=0;col<c.cols;col++){const x=col*c.width/(c.cols-1),y=r*c.length/(c.rows-1),ll=fitLL(x,y);coords.push([ll.lon,ll.lat]);}
      grid.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
    }
    for(let col=0;col<c.cols;col++){
      const coords=[];for(let r=0;r<c.rows;r++){const x=col*c.width/(c.cols-1),y=r*c.length/(c.rows-1),ll=fitLL(x,y);coords.push([ll.lon,ll.lat]);}
      grid.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
    }
    for(const p of c.points){const ll=fitLL(p.x,p.y);points.push({type:'Feature',properties:{r:p.r,c:p.c,delta:p.v},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});}
    const corners=[[0,0],[c.width,0],[c.width,c.length],[0,c.length],[0,0]].map(([x,y])=>fitLL(x,y)).map(ll=>[ll.lon,ll.lat]);
    return {
      grid:{type:'FeatureCollection',features:grid},
      points:{type:'FeatureCollection',features:points},
      outline:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:corners}}]}
    };
  }

  function addGeometryLayers(){
    if(!compareMap)return;const f=featureCollections();
    compareMap.addSource(GRID_SOURCE,{type:'geojson',data:f.grid});
    compareMap.addSource(POINT_SOURCE,{type:'geojson',data:f.points});
    compareMap.addSource(OUTLINE_SOURCE,{type:'geojson',data:f.outline});
    compareMap.addLayer({id:GRID_LAYER,type:'line',source:GRID_SOURCE,paint:{'line-color':'#d9ecff','line-width':1.25,'line-opacity':.72}});
    compareMap.addLayer({id:OUTLINE_LAYER,type:'line',source:OUTLINE_SOURCE,paint:{'line-color':'#ffffff','line-width':2.5,'line-opacity':.95}});
    compareMap.addLayer({id:POINT_LAYER,type:'circle',source:POINT_SOURCE,paint:{'circle-radius':3.5,'circle-color':'#ffffff','circle-stroke-color':'#101820','circle-stroke-width':1}});
  }

  function resolution(tier){const c=compareState.comparison,longest=Math.max(c.width,c.length,1);return {nx:Math.max(64,Math.round(tier*c.width/longest)),ny:Math.max(64,Math.round(tier*c.length/longest))};}
  function sourceId(slot){return `${HEAT_SOURCE_PREFIX}${slot}`;}function layerId(slot){return `${HEAT_LAYER_PREFIX}${slot}`;}
  function removeHeatSlot(slot){if(!compareMap)return;try{if(compareMap.getLayer(layerId(slot)))compareMap.removeLayer(layerId(slot));}catch(e){}try{if(compareMap.getSource(sourceId(slot)))compareMap.removeSource(sourceId(slot));}catch(e){}slotCanvases[slot]=null;}
  function canvasFromWorker(msg){const canvas=document.createElement('canvas');canvas.width=msg.nx;canvas.height=msg.ny;const ctx=canvas.getContext('2d',{alpha:true});const image=ctx.createImageData(msg.nx,msg.ny);image.data.set(new Uint8ClampedArray(msg.buffer));ctx.putImageData(image,0,0);return canvas;}
  function installHeatCanvas(canvas,tier){
    if(!compareMap||!canvas)return false;const previous=activeSlot,next=previous===0?1:0;removeHeatSlot(next);
    try{
      compareMap.addSource(sourceId(next),{type:'canvas',canvas,coordinates:canvasCoordinates(),animate:false});
      compareMap.addLayer({id:layerId(next),type:'raster',source:sourceId(next),paint:{'raster-opacity':.62,'raster-fade-duration':0}},GRID_LAYER);
      slotCanvases[next]=canvas;activeSlot=next;try{compareMap.getSource(sourceId(next))?.play?.();compareMap.triggerRepaint();}catch(e){}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{try{compareMap.getSource(sourceId(next))?.pause?.();}catch(e){}if(previous!==null&&previous!==next&&activeSlot===next)removeHeatSlot(previous);}));
      window.__padGradeComparisonHeatmap={tier,nx:canvas.width,ny:canvas.height,canvasSource:true,sharedGrid:true};return true;
    }catch(e){console.warn('Pad Grade comparison heat map install failed',e);removeHeatSlot(next);return false;}
  }

  function buildHeat(tier,serial){
    if(!compareState||!compareMap||serial!==renderSerial)return;
    const r=resolution(tier);if(compareWorker){try{compareWorker.terminate();}catch(e){}compareWorker=null;}
    let worker;try{worker=new Worker(WORKER_URL);}catch(e){showMapMessage('Heat-map worker could not start.');return;}compareWorker=worker;
    worker.onmessage=ev=>{
      const msg=ev.data||{};if(serial!==renderSerial||worker!==compareWorker)return;
      if(msg.type==='error'){showMapMessage('Heat-map calculation failed.');try{worker.terminate();}catch(e){}compareWorker=null;return;}
      if(msg.type!=='complete')return;
      try{worker.terminate();}catch(e){}compareWorker=null;
      if(serial!==renderSerial||!compareState)return;
      const installed=installHeatCanvas(canvasFromWorker(msg),tier);if(installed){hideMapMessage();if(tier===LOW_TIER)setTimeout(()=>buildHeat(HIGH_TIER,serial),120);}
    };
    worker.onerror=()=>{if(worker===compareWorker)compareWorker=null;showMapMessage('Heat-map calculation failed.');};
    const c=compareState.comparison;
    worker.postMessage({type:'build',jobId:serial,tier,nx:r.nx,ny:r.ny,rowsPerSlice:tier===LOW_TIER?18:10,settings:{width:c.width,length:c.length,target:0,tol:c.tolerance},points:c.points});
  }

  function showMapMessage(text){const el=$('pgCompareMapMessage');if(el){el.textContent=text;el.classList.remove('hidden');}}
  function hideMapMessage(){const el=$('pgCompareMapMessage');if(el)el.classList.add('hidden');}

  function probeAt(ev){
    if(!compareState||!compareMap||!ev?.lngLat||!window.PadGradeLocalSurface)return;
    const c=compareState.comparison,xy=core.padXYFromLatLon(compareState.geometry.fit,ev.lngLat.lat,ev.lngLat.lng),margin=Math.max(c.width,c.length)*1e-5;
    if(!xy||xy.x< -margin||xy.x>c.width+margin||xy.y< -margin||xy.y>c.length+margin)return;
    const x=Math.max(0,Math.min(c.width,xy.x)),y=Math.max(0,Math.min(c.length,xy.y));
    const result=PadGradeLocalSurface.interpolateAt(x,y,c.points,true);if(!result||!Number.isFinite(result.value))return;
    if(comparePopup){try{comparePopup.remove();}catch(e){}comparePopup=null;}if(compareMarker){try{compareMarker.remove();}catch(e){}compareMarker=null;}
    const marker=document.createElement('div');marker.className='pgCompareProbeMarker';compareMarker=new maplibregl.Marker({element:marker,anchor:'center'}).setLngLat([ev.lngLat.lng,ev.lngLat.lat]).addTo(compareMap);
    const box=document.createElement('div');box.className='pgComparePopup';
    const action=document.createElement('div');action.className='big';action.textContent=deltaAction(result.value,c.tolerance);
    const detail=document.createElement('div');detail.className='small';detail.textContent=`Second − First elevation: ${signedDelta(result.value)}`;
    const pos=document.createElement('div');pos.className='small';try{pos.textContent=`${pgFmtPlan(x,1)} E • ${pgFmtPlan(y,1)} N of SW`;}catch(e){pos.textContent=`${x.toFixed(1)} ft E • ${y.toFixed(1)} ft N of SW`;}
    const pair=document.createElement('div');pair.className='small';pair.textContent=`${projectName(compareState.first)} → ${projectName(compareState.second)}`;
    box.append(action,detail,pos,pair);
    comparePopup=new maplibregl.Popup({closeButton:true,closeOnClick:false,offset:14,maxWidth:'320px'}).setLngLat([ev.lngLat.lng,ev.lngLat.lat]).setDOMContent(box).addTo(compareMap);
    comparePopup.on('close',()=>{comparePopup=null;});
  }

  function fitMapToPad(){
    const c=compareState.comparison,pts=[[0,0],[c.width,0],[c.width,c.length],[0,c.length]].map(([x,y])=>fitLL(x,y));
    const bounds=new maplibregl.LngLatBounds();for(const p of pts)bounds.extend([p.lon,p.lat]);compareMap.fitBounds(bounds,{padding:45,maxZoom:21,duration:0});
  }

  function showComparison(first,second,comparison,geometry){
    closeComparison();compareState={first,second,comparison,geometry};renderSerial++;
    compareOverlay=document.createElement('div');compareOverlay.id='pgCompareOverlay';compareOverlay.className='pgCompareOverlay';
    const dimsNote=comparison.dimensionsDiffer?' • averaged pad dimensions':'';
    compareOverlay.innerHTML=`<div class="pgCompareHeader"><div class="pgCompareHeaderTop"><h2>Project Comparison</h2><button id="pgCompareExit">Exit Comparison</button></div><div class="pgCompareDirection"><b>First:</b> ${escapeHtml(projectName(first))} &nbsp;→&nbsp; <b>Second:</b> ${escapeHtml(projectName(second))}</div><div class="pgCompareStats"><span class="pgCompareChip">Max cut occurred ${fmtDelta(-comparison.maxCut)}</span><span class="pgCompareChip">Max fill occurred ${fmtDelta(comparison.maxFill)}</span><span class="pgCompareChip">Tap map to probe change</span><span class="pgCompareChip">GPS corners averaged${dimsNote}</span></div></div><div class="pgCompareMapWrap"><div id="pgCompareMap" class="pgCompareMap"></div><div id="pgCompareMapMessage" class="pgCompareMapMessage">Building shared GPS comparison grid…</div><div class="pgCompareLegend"><span><i style="background:var(--cut)"></i>Cut occurred</span><span><i style="background:var(--grade)"></i>No change</span><span><i style="background:var(--fill)"></i>Fill occurred</span></div></div>`;
    document.body.appendChild(compareOverlay);$('pgCompareExit').onclick=closeComparison;
    if(!window.maplibregl){showMapMessage('Map library unavailable.');return;}
    compareMap=new maplibregl.Map({container:'pgCompareMap',center:[geometry.fit.originLon,geometry.fit.originLat],zoom:18,minZoom:3,maxZoom:22,attributionControl:true,style:mapStyle()});
    compareMap.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    compareMap.on('load',()=>{try{addGeometryLayers();fitMapToPad();compareMap.on('click',probeAt);buildHeat(LOW_TIER,renderSerial);}catch(e){console.error(e);showMapMessage(e.message||'Could not render comparison map.');}});
  }

  function closeComparison(){
    renderSerial++;if(compareWorker){try{compareWorker.terminate();}catch(e){}compareWorker=null;}
    if(comparePopup){try{comparePopup.remove();}catch(e){}comparePopup=null;}if(compareMarker){try{compareMarker.remove();}catch(e){}compareMarker=null;}
    if(compareMap){try{compareMap.off('click',probeAt);compareMap.remove();}catch(e){}compareMap=null;}
    if(compareOverlay){compareOverlay.remove();compareOverlay=null;}activeSlot=null;slotCanvases=[null,null];compareState=null;
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function installBottomButton(){
    const bottom=document.querySelector('.bottom');if(!bottom||$('compareProjectsBottomBtn'))return false;
    const btn=document.createElement('button');btn.id='compareProjectsBottomBtn';btn.type='button';btn.textContent='Compare';btn.addEventListener('click',openPicker);bottom.appendChild(btn);return true;
  }

  function boot(){
    installStyles();ensureSelectorDialog();installBottomButton();
    let tries=0;const timer=setInterval(()=>{if(installBottomButton()||++tries>20)clearInterval(timer);},200);
    document.title=`Pad Grade Mapper ${VERSION}`;
    window.PadGradeProjectCompare={open:openPicker,close:closeComparison,eligibleProjects};
    window.__padGradeDevVersion081=VERSION;
    window.addEventListener('beforeunload',()=>{clearInterval(timer);closeComparison();},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
