(()=>{
 function installDriveSwath(){
  if(typeof map==='undefined'||typeof ensureOverlaySources!=='function'||typeof updateMapData!=='function')return false;
  if(window.__TRACTOR_SWATH_INSTALLED)return true;
  window.__TRACTOR_SWATH_INSTALLED=true;
  let completedDirty=true;
  let completedData={type:'FeatureCollection',features:[]};
  function swathPixels(){
   if(!map)return 8;
   const widthFt=Math.max(.5,Number(cfg().implementWidthFt)||.5);
   const lat=map.getCenter()?.lat||0;
   const zoom=map.getZoom()||0;
   const metersPerPixel=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);
   return Math.max(1.5,Math.min(320,(widthFt/FT_PER_M)/Math.max(.000001,metersPerPixel)));
  }
  function ensureSwathLayers(){
   if(!mapReady||!map)return;
   if(!map.getSource('completed-plan'))map.addSource('completed-plan',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   if(!map.getLayer('plan-swath'))map.addLayer({id:'plan-swath',type:'line',source:'plan',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#5fc4d8','line-width':8,'line-opacity':.18}},map.getLayer('plan-line')?'plan-line':undefined);
   if(!map.getLayer('completed-swath'))map.addLayer({id:'completed-swath',type:'line',source:'completed-plan',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'#75c043','line-width':8,'line-opacity':.42}},map.getLayer('plan-line')?'plan-line':undefined);
   if(map.getLayer('plan-line')){
    try{map.setLayoutProperty('plan-line','line-cap','round')}catch(e){}
    try{map.setLayoutProperty('plan-line','line-join','round')}catch(e){}
    try{map.setPaintProperty('plan-line','line-width',3)}catch(e){}
    try{map.setPaintProperty('plan-line','line-opacity',.95)}catch(e){}
   }
  }
  function updateSwathStyle(){
   if(!mapReady||!map)return;
   ensureSwathLayers();
   const show=appMode==='drive'&&plannedSegments.length>0;
   const width=swathPixels();
   for(const id of ['plan-swath','completed-swath']){
    if(!map.getLayer(id))continue;
    try{map.setLayoutProperty(id,'visibility',show?'visible':'none')}catch(e){}
    try{map.setPaintProperty(id,'line-width',width)}catch(e){}
   }
  }
  function buildCompleted(){
   if(!completedDirty)return completedData;
   completedDirty=false;
   if(!planProgressSamples.length||!plannedSegments.length){
    completedData={type:'FeatureCollection',features:[]};
    return completedData;
   }
   const bySeg=new Map();
   for(const q of planProgressSamples){
    let arr=bySeg.get(q.si);if(!arr){arr=[];bySeg.set(q.si,arr)}arr.push(q);
   }
   const lines=[];
   for(const arr of bySeg.values()){
    arr.sort((a,b)=>a.idx-b.idx);
    let run=[];
    const flush=()=>{if(run.length>1)lines.push(run.map(q=>[q.lon,q.lat]));run=[]};
    for(const q of arr){if(planProgress.covered?.[q.idx])run.push(q);else flush()}
    flush();
   }
   completedData=lines.length?{type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'completed-swath'},geometry:{type:'MultiLineString',coordinates:lines}}]}:{type:'FeatureCollection',features:[]};
   return completedData;
  }
  const originalEnsure=ensureOverlaySources;
  ensureOverlaySources=function(){const r=originalEnsure.apply(this,arguments);ensureSwathLayers();return r};
  const originalUpdate=updateMapData;
  updateMapData=function(){
   const r=originalUpdate.apply(this,arguments);
   if(mapReady&&map){ensureSwathLayers();map.getSource('completed-plan')?.setData(buildCompleted());updateSwathStyle()}
   return r;
  };
  const originalProgress=updatePlanProgressFromFix;
  updatePlanProgressFromFix=function(p){
   const before=Object.keys(planProgress.covered||{}).length;
   const r=originalProgress.apply(this,arguments);
   if(Object.keys(planProgress.covered||{}).length!==before)completedDirty=true;
   return r;
  };
  if(typeof buildPlanProgressSamples==='function'){
   const originalBuild=buildPlanProgressSamples;
   buildPlanProgressSamples=function(){completedDirty=true;return originalBuild.apply(this,arguments)};
  }
  if(typeof buildPlanProgressSamplesAsync==='function'){
   const originalBuildAsync=buildPlanProgressSamplesAsync;
   buildPlanProgressSamplesAsync=async function(){completedDirty=true;return await originalBuildAsync.apply(this,arguments)};
  }
  const originalSetMode=setAppMode;
  setAppMode=function(mode){const r=originalSetMode.apply(this,arguments);updateSwathStyle();return r};
  if(map){
   map.on('zoomend',updateSwathStyle);
   map.on('moveend',updateSwathStyle);
  }
  updateSwathStyle();
  if(typeof updateMapData==='function')updateMapData();
  return true;
 }
 window.installTractorDriveSwath=installDriveSwath;
})();
