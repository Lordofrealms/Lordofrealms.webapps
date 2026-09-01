/* Pad Grade v1.3.1 DEV — adaptive 891 worker diagnostics and deeper imagery timing.
 *
 * Heat presentation remains protected and unchanged. This module observes the raw
 * final-worker parallel metrics emitted by heatmap-raster-worker-v131.js and adds
 * passive/sanitized imagery request diagnostics. It does not change imagery
 * providers, layer order, opacity, retry behavior, or the v1.2.2 heat presenter.
 */
(function installPadGrade131Dev(){
  'use strict';
  if(window.__padGradeDevV131)return;
  window.__padGradeDevV131=true;

  const VERSION='1.3.1';
  const BUILD=103;
  const HEAT_WORKER_RE=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const BASE_SOURCE='usgs-cached-imagery';
  const HIGH_SOURCE='usgs-naip-plus';
  const BASE_LAYER='usgs-cached';
  const HIGH_LAYER='usgs-highres';
  const HIGH_HOST='imagery.nationalmap.gov';
  const BASE_HOST='basemap.nationalmap.gov';
  const WEB_MERCATOR_HALF=20037508.342789244;
  const WORLD_METERS=WEB_MERCATOR_HALF*2;
  const SLOW_MS=1500;
  const PROBE_SLOW_MS=6500;
  const PROBE_HARD_MS=30000;
  const RESOURCE_FLUSH_MS=5000;

  const resourceEntries={BASE_USGS:[],HIGH_RES_NAIP_PLUS:[]};
  const sourceStats={
    [BASE_SOURCE]:{loadingEvents:0,dataEvents:0,errors:0,active:new Set(),maxActive:0,firstLoadedAt:null,lastEmitted:{loadingEvents:0,dataEvents:0,errors:0}},
    [HIGH_SOURCE]:{loadingEvents:0,dataEvents:0,errors:0,active:new Set(),maxActive:0,firstLoadedAt:null,lastEmitted:{loadingEvents:0,dataEvents:0,errors:0}}
  };
  let resourceObserver=null;
  let resourceFlushTimer=null;
  let attachTimer=null;
  let attachedMap=null;
  let probeSerial=0;
  let activeProbe=null;
  let lastProbeAt=0;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const round=n=>Number.isFinite(+n)?+(+n).toFixed(1):null;

  function connectionSnapshot(){
    try{
      const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
      return {online:navigator.onLine!==false,effectiveType:c?.effectiveType||undefined,downlinkMbps:Number.isFinite(+c?.downlink)?round(c.downlink):undefined,rttMs:Number.isFinite(+c?.rtt)?round(c.rtt):undefined,saveData:!!c?.saveData};
    }catch(e){return {online:true};}
  }

  function installWorkerObserver(){
    const Parent=window.Worker;if(typeof Parent!=='function')return false;
    if(Parent.__padGradeV131Observer)return true;
    function PadGrade131Worker(url,options){
      const constructedAt=now();
      const worker=options===undefined?new Parent(url):new Parent(url,options);
      if(HEAT_WORKER_RE.test(String(url||''))){
        const shimConstructMs=round(now()-constructedAt);
        try{worker.addEventListener('message',event=>{
          const data=event?.data||{},pm=data.parallelMetrics;
          if(!pm)return;
          mark('heatmap.v131-parallel-891-complete',{
            tier:+data.tier||0,nx:+data.nx||0,ny:+data.ny||0,jobId:+data.jobId||0,
            shimConstructMs,enabled:!!pm.enabled,hardwareConcurrency:+pm.hardwareConcurrency||1,
            computeWorkers:+pm.computeWorkers||1,bandsCompleted:+pm.bandsCompleted||0,
            childCreateElapsedMs:round(pm.childCreateElapsedMs),firstBandResultMs:round(pm.firstBandResultMs),wallElapsedMs:round(pm.wallElapsedMs),
            bandWorkerMinMs:round(pm.bandWorkerMinMs),bandWorkerAvgMs:round(pm.bandWorkerAvgMs),bandWorkerMaxMs:round(pm.bandWorkerMaxMs),
            bandRasterizeTotalMs:round(pm.bandRasterizeTotalMs),bandRasterizeMaxMs:round(pm.bandRasterizeMaxMs),bandColorTotalMs:round(pm.bandColorTotalMs),bandSetupTotalMs:round(pm.bandSetupTotalMs),
            fallbackReason:pm.fallbackReason||undefined,atomicFinalBuffer:true,protectedPresenterUnchanged:true
          });
        });}catch(e){}
      }
      return worker;
    }
    PadGrade131Worker.prototype=Parent.prototype;
    try{Object.setPrototypeOf(PadGrade131Worker,Parent);}catch(e){}
    PadGrade131Worker.__padGradeV131Observer=true;
    PadGrade131Worker.__padGradeV131Parent=Parent;
    // Carry forward the markers v1.3.0 polls so it does not attempt to install a
    // second lazy wrapper outside this passive observer.
    if(Parent.__padGradeV130Lazy)PadGrade131Worker.__padGradeV130Lazy=true;
    if(Parent.__padGradeV127Lifecycle)PadGrade131Worker.__padGradeV127Lifecycle=true;
    window.Worker=PadGrade131Worker;
    mark('heatmap.v131-worker-observer-installed',{parallelTier:891,computeWorkerPolicy:'max(1, hardwareConcurrency - 1)',protectedPresenterUnchanged:true});
    return true;
  }

  function providerForUrl(name){
    try{const host=new URL(String(name||''),location.href).hostname;if(host===HIGH_HOST)return 'HIGH_RES_NAIP_PLUS';if(host===BASE_HOST)return 'BASE_USGS';}catch(e){}
    return '';
  }
  function percentile(values,p){
    if(!values.length)return null;const a=values.slice().sort((x,y)=>x-y),i=Math.max(0,Math.min(a.length-1,Math.ceil(p*a.length)-1));return a[i];
  }
  function overlapMax(entries){
    const edges=[];
    for(const e of entries){const s=+e.startTime||0,d=Math.max(0,+e.duration||0);edges.push([s,1],[s+d,-1]);}
    edges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let active=0,max=0;for(const [,delta] of edges){active+=delta;if(active>max)max=active;}return max;
  }
  function resourceSummary(provider,entries,reason){
    if(!entries.length)return;
    const durations=entries.map(e=>Math.max(0,+e.duration||0));
    const statuses={ok:0,http4xx:0,http5xx:0,other:0,unknown:0};
    let transferBytes=0,decodedBytes=0,timingRestricted=0;
    const initiators={};
    for(const e of entries){
      const status=Number(e.responseStatus);
      if(!Number.isFinite(status)||status===0)statuses.unknown++;
      else if(status>=200&&status<400)statuses.ok++;
      else if(status>=400&&status<500)statuses.http4xx++;
      else if(status>=500)statuses.http5xx++;
      else statuses.other++;
      transferBytes+=Number.isFinite(+e.transferSize)?+e.transferSize:0;
      decodedBytes+=Number.isFinite(+e.decodedBodySize)?+e.decodedBodySize:0;
      if((+e.responseStart||0)===0)timingRestricted++;
      const type=String(e.initiatorType||'unknown');initiators[type]=(initiators[type]||0)+1;
    }
    mark('imagery.v131-resource-summary',{
      provider,reason,completed:entries.length,durationAvgMs:round(durations.reduce((a,b)=>a+b,0)/durations.length),durationP50Ms:round(percentile(durations,.50)),durationP95Ms:round(percentile(durations,.95)),durationMaxMs:round(Math.max(...durations)),
      maxObservedOverlap:overlapMax(entries),statuses,transferBytes,decodedBytes,timingRestricted,initiators,connection:connectionSnapshot(),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true
    });
  }
  function flushResources(reason='timer'){
    for(const provider of Object.keys(resourceEntries)){
      const entries=resourceEntries[provider].splice(0);resourceSummary(provider,entries,reason);
    }
  }
  function observeResourceEntry(entry){
    const provider=providerForUrl(entry?.name);if(!provider)return;
    resourceEntries[provider].push(entry);
    const duration=Math.max(0,+entry.duration||0),status=Number(entry.responseStatus);
    if(duration>=SLOW_MS||(Number.isFinite(status)&&status>=400)){
      mark('imagery.v131-resource-slow-or-error',{
        provider,durationMs:round(duration),responseStatus:Number.isFinite(status)&&status?status:undefined,
        transferBytes:Number.isFinite(+entry.transferSize)?+entry.transferSize:undefined,decodedBytes:Number.isFinite(+entry.decodedBodySize)?+entry.decodedBodySize:undefined,
        initiatorType:String(entry.initiatorType||'unknown'),timingRestricted:(+entry.responseStart||0)===0,connection:connectionSnapshot(),urlLogged:false,coordinatesLogged:false,diagnosticOnly:true
      });
    }
  }
  function installResourceObserver(){
    if(resourceObserver||typeof PerformanceObserver!=='function')return !!resourceObserver;
    try{
      resourceObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())observeResourceEntry(entry);});
      resourceObserver.observe({type:'resource',buffered:true});
      resourceFlushTimer=setInterval(()=>flushResources('periodic'),RESOURCE_FLUSH_MS);
      mark('imagery.v131-resource-observer-installed',{hosts:[BASE_HOST,HIGH_HOST],slowThresholdMs:SLOW_MS,resourceTiming:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
      return true;
    }catch(e){mark('imagery.v131-resource-observer-unavailable',{error:String(e?.message||e).slice(0,120),diagnosticOnly:true});return false;}
  }

  function tileEventKey(event){
    try{
      const c=event?.coord?.canonical||event?.coord||event?.tile?.tileID?.canonical||event?.tile?.tileID;if(!c)return '';
      const z=Number(c.z),x=Number(c.x),y=Number(c.y),wrap=Number(event?.coord?.wrap??event?.tile?.tileID?.wrap??0);
      return [z,x,y,wrap].every(Number.isFinite)?`${z}/${x}/${y}/${wrap}`:'';
    }catch(e){return '';}
  }
  function sourceLoaded(map,id){try{return !!map.isSourceLoaded?.(id);}catch(e){return false;}}
  function sourceSummary(map,id,reason){
    const s=sourceStats[id];if(!s)return;
    const prev=s.lastEmitted,delta={loadingEvents:s.loadingEvents-prev.loadingEvents,dataEvents:s.dataEvents-prev.dataEvents,errors:s.errors-prev.errors};
    s.lastEmitted={loadingEvents:s.loadingEvents,dataEvents:s.dataEvents,errors:s.errors};
    mark('imagery.v131-source-activity',{
      provider:id===HIGH_SOURCE?'HIGH_RES_NAIP_PLUS':'BASE_USGS',reason,zoom:round(map?.getZoom?.()),loaded:sourceLoaded(map,id),
      loadingEvents:s.loadingEvents,dataEvents:s.dataEvents,errors:s.errors,currentOutstandingTiles:s.active.size,maxOutstandingTiles:s.maxActive,delta,
      firstLoadedElapsedMs:s.firstLoadedAt==null?undefined:round(s.firstLoadedAt),tileCoordinatesLogged:false,diagnosticOnly:true
    });
  }
  function configuredSourceInfo(map){
    try{
      const style=map.getStyle?.(),base=style?.sources?.[BASE_SOURCE]||{},high=style?.sources?.[HIGH_SOURCE]||{},highTemplate=String(high.tiles?.[0]||'');
      mark('imagery.v131-source-config',{
        base:{type:base.type,tileSize:+base.tileSize||undefined,minzoom:+base.minzoom||undefined,maxzoom:+base.maxzoom||undefined,templateHost:providerForUrl(base.tiles?.[0])?'basemap.nationalmap.gov':undefined},
        highRes:{type:high.type,tileSize:+high.tileSize||undefined,minzoom:+high.minzoom||undefined,maxzoom:+high.maxzoom||undefined,usesExportImage:/\/exportImage/i.test(highTemplate),hasNaturalColor:/NaturalColor/i.test(decodeURIComponent(highTemplate)),templateHost:HIGH_HOST},
        providersUnchanged:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true
      });
    }catch(e){}
  }
  function attachMapDiagnostics(map){
    if(!map||map.__padGradeV131ImageryDiagnostics)return !!map;
    map.__padGradeV131ImageryDiagnostics=true;attachedMap=map;const attachedAt=now();
    configuredSourceInfo(map);
    map.on?.('sourcedataloading',event=>{
      const id=String(event?.sourceId||'');if(!sourceStats[id]||event?.dataType!=='source')return;
      const s=sourceStats[id];s.loadingEvents++;const key=tileEventKey(event);if(key)s.active.add(key);if(s.active.size>s.maxActive)s.maxActive=s.active.size;
    });
    map.on?.('sourcedata',event=>{
      const id=String(event?.sourceId||'');if(!sourceStats[id]||event?.dataType!=='source')return;
      const s=sourceStats[id];s.dataEvents++;const key=tileEventKey(event);if(key)s.active.delete(key);
      if(s.firstLoadedAt==null&&sourceLoaded(map,id))s.firstLoadedAt=now()-attachedAt;
    });
    map.on?.('error',event=>{
      const text=String(event?.error?.message||event?.message||''),id=String(event?.sourceId||event?.source?.id||'');
      let source=id;if(!sourceStats[source]){if(/imagery\.nationalmap\.gov|naip|exportimage/i.test(text))source=HIGH_SOURCE;else if(/basemap\.nationalmap\.gov/i.test(text))source=BASE_SOURCE;}
      if(sourceStats[source])sourceStats[source].errors++;
    });
    map.on?.('idle',()=>{sourceSummary(map,BASE_SOURCE,'idle');sourceSummary(map,HIGH_SOURCE,'idle');flushResources('map-idle');});
    map.on?.('moveend',()=>{sourceSummary(map,BASE_SOURCE,'moveend');sourceSummary(map,HIGH_SOURCE,'moveend');scheduleHighProbe(map,'moveend');});
    setTimeout(()=>scheduleHighProbe(map,'initial',true),400);
    mark('imagery.v131-map-diagnostics-attached',{sourceEventAccounting:true,resourceTiming:true,lateProbeTracking:true,providersUnchanged:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    return true;
  }

  function lonLatToTile(lon,lat,z){const n=2**z,x=Math.max(0,Math.min(n-1,Math.floor((lon+180)/360*n))),rad=Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180,y=Math.max(0,Math.min(n-1,Math.floor((1-Math.asinh(Math.tan(rad))/Math.PI)/2*n)));return {x,y};}
  function exactHighProbeUrl(center,z){
    z=Math.max(14,Math.min(22,z));const t=lonLatToTile(+center.lng,+center.lat,z),span=WORLD_METERS/(2**z),minx=-WEB_MERCATOR_HALF+t.x*span,maxx=minx+span,maxy=WEB_MERCATOR_HALF-t.y*span,miny=maxy-span;
    const renderingRule=encodeURIComponent(JSON.stringify({rasterFunction:'NaturalColor'}));
    return `https://${HIGH_HOST}/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=${minx},${miny},${maxx},${maxy}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=false&f=image&renderingRule=${renderingRule}`;
  }
  function scheduleHighProbe(map,reason,force=false){
    if(!map||activeProbe)return;
    const t=Date.now();if(!force&&t-lastProbeAt<20000)return;
    let zoom=0,center=null;try{zoom=+map.getZoom?.()||0;center=map.getCenter?.();}catch(e){}if(zoom<14||!center)return;
    lastProbeAt=t;const serial=++probeSerial,started=now(),image=new Image();
    const p={serial,started,image,done:false,slow:false,slowTimer:null,hardTimer:null};activeProbe=p;
    const finish=(ok,reasonText)=>{
      if(p.done)return;p.done=true;if(p.slowTimer)clearTimeout(p.slowTimer);if(p.hardTimer)clearTimeout(p.hardTimer);if(activeProbe===p)activeProbe=null;
      mark('imagery.v131-highres-probe-result',{
        serial,trigger:reason,ok,reason:reasonText,zoom:round(zoom),elapsedMs:round(now()-started),late:p.slow,width:+image.naturalWidth||0,height:+image.naturalHeight||0,
        mapSourceLoaded:sourceLoaded(map,HIGH_SOURCE),configuredNaturalColor:true,configuredExportImage:true,connection:connectionSnapshot(),urlLogged:false,coordinatesLogged:false,diagnosticOnly:true
      });
    };
    p.slowTimer=setTimeout(()=>{
      if(p.done)return;p.slow=true;
      mark('imagery.v131-highres-probe-slow',{
        serial,trigger:reason,zoom:round(zoom),elapsedMs:PROBE_SLOW_MS,mapSourceLoaded:sourceLoaded(map,HIGH_SOURCE),currentOutstandingTiles:sourceStats[HIGH_SOURCE].active.size,
        connection:connectionSnapshot(),probeStillRunning:true,urlLogged:false,coordinatesLogged:false,diagnosticOnly:true
      });
    },PROBE_SLOW_MS);
    p.hardTimer=setTimeout(()=>finish(false,'timeout-30s'),PROBE_HARD_MS);
    image.onload=()=>finish(true,'load');image.onerror=()=>finish(false,'error');image.src=exactHighProbeUrl(center,Math.floor(zoom));
    mark('imagery.v131-highres-probe-start',{serial,trigger:reason,zoom:round(zoom),slowThresholdMs:PROBE_SLOW_MS,hardTimeoutMs:PROBE_HARD_MS,matchesConfiguredNaturalColorRequest:true,urlLogged:false,coordinatesLogged:false,diagnosticOnly:true});
  }

  function attach(){
    installWorkerObserver();installResourceObserver();
    const map=window.__padGradeMapInstance||null;if(map)attachMapDiagnostics(map);
    try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}
    const ready=!!window.Worker?.__padGradeV131Observer&&!!map?.__padGradeV131ImageryDiagnostics;
    if(ready&&attachTimer){clearInterval(attachTimer);attachTimer=null;}
    return ready;
  }

  window.PadGradeDiagnosticsV131={version:VERSION,flushImagery:()=>flushResources('manual'),snapshot:()=>({version:VERSION,build:BUILD,workerPolicy:'max(1, hardwareConcurrency - 1)',highSource:{...sourceStats[HIGH_SOURCE],active:sourceStats[HIGH_SOURCE].active.size},baseSource:{...sourceStats[BASE_SOURCE],active:sourceStats[BASE_SOURCE].active.size}})};
  window.addEventListener('padgrade-map-created',event=>setTimeout(()=>{const map=event?.detail?.map||window.__padGradeMapInstance;if(map)attachMapDiagnostics(map);attach();},0));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,0),{once:true});else setTimeout(attach,0);
  attachTimer=setInterval(attach,150);
  window.addEventListener('beforeunload',()=>{
    if(attachTimer)clearInterval(attachTimer);if(resourceFlushTimer)clearInterval(resourceFlushTimer);flushResources('beforeunload');
    try{resourceObserver?.disconnect?.();}catch(e){};resourceObserver=null;
    if(activeProbe){activeProbe.done=true;if(activeProbe.slowTimer)clearTimeout(activeProbe.slowTimer);if(activeProbe.hardTimer)clearTimeout(activeProbe.hardTimer);activeProbe=null;}
  },{once:true});
  mark('v131.installed',{version:VERSION,build:BUILD,parallelFinal891:true,computeWorkerPolicy:'max(1, hardwareConcurrency - 1)',tiers99And297Unchanged:true,atomicFinalBuffer:true,protectedV122PresenterUnchanged:true,imageryDiagnosticsOnly:true});
})();
