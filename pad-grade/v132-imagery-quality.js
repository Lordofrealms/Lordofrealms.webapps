/* Pad Grade v1.3.4 DEV — USGS-only best-available imagery + field-proof diagnostics.
 *
 * Imagery behavior is unchanged from v1.3.3: USGSNAIPPlus + NaturalColor,
 * 512-for-256 exports, resolution_value-nearest-zero mosaic selection, cubic
 * resampling, and the existing cached-USGS fallback/layer order.
 *
 * v1.3.4 adds diagnostics that prove two separate things without logging map
 * coordinates or request URLs:
 *   1) live MapLibre exportImage resources actually carry the 512/mosaic/cubic
 *      policy rather than merely having that policy in the configured style;
 *   2) paired ImageServer identify calls compare the source raster ranked first
 *      by our rule against the service's default mosaic at the same map center.
 */
(function installPadGrade134ImageryQuality(){
  'use strict';
  if(window.__padGradeV134ImageryQuality)return;
  window.__padGradeV134ImageryQuality=true;

  const HIGH_SOURCE='usgs-naip-plus';
  const HIGH_HOST='imagery.nationalmap.gov';
  const SERVICE_ROOT=`https://${HIGH_HOST}/arcgis/rest/services/USGSNAIPPlus/ImageServer`;
  const EXPORT_SIZE=512;
  const COMPRESSION_QUALITY=95;
  const INTERPOLATION='RSP_CubicConvolution';
  const MOSAIC_RULE={mosaicMethod:'esriMosaicAttribute',sortField:'resolution_value',sortValue:0,ascending:true,mosaicOperation:'MT_FIRST'};
  const IDENTIFY_MIN_ZOOM=14;
  const IDENTIFY_THROTTLE_MS=25000;
  const IDENTIFY_TIMEOUT_MS=30000;
  const REQUEST_SUMMARY_MS=5000;
  let mapLibrePatched=false,resourceObserver=null,requestSummaryTimer=null,lastIdentifyAt=0,identifySerial=0,identifyInFlight=false;

  const requestStats={observed:0,policy512:0,diagnostic256:0,other:0,mosaicRulePresent:0,cubicPresent:0,naturalColorPresent:0,quality95Present:0,firstPolicyLogged:false,lastFlushed:{observed:0,policy512:0,diagnostic256:0,other:0}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const round=(value,digits=3)=>Number.isFinite(+value)?+(+value).toFixed(digits):null;
  const clean=(value,max=80)=>String(value==null?'':value).replace(/[\r\n]/g,' ').slice(0,max);

  function setParam(value,name,rawValue){
    let url=String(value||'');
    const encoded=encodeURIComponent(String(rawValue));
    const re=new RegExp(`([?&])${name}=[^&]*`,'i');
    if(re.test(url))return url.replace(re,`$1${name}=${encoded}`);
    return url+`${url.includes('?')?'&':'?'}${name}=${encoded}`;
  }
  function upgradeTileUrl(value){
    let url=String(value||'');
    if(!/imagery\.nationalmap\.gov\/arcgis\/rest\/services\/USGSNAIPPlus\/ImageServer\/exportImage/i.test(url))return url;
    if(/[?&]size=\d+%2C\d+/i.test(url))url=url.replace(/([?&]size=)\d+%2C\d+/i,`$1${EXPORT_SIZE}%2C${EXPORT_SIZE}`);
    else if(/[?&]size=\d+,\d+/i.test(url))url=url.replace(/([?&]size=)\d+,\d+/i,`$1${EXPORT_SIZE},${EXPORT_SIZE}`);
    else url+=`${url.includes('?')?'&':'?'}size=${EXPORT_SIZE},${EXPORT_SIZE}`;
    if(/[?&]compressionQuality=\d+/i.test(url))url=url.replace(/([?&]compressionQuality=)\d+/i,`$1${COMPRESSION_QUALITY}`);
    else url+=`&compressionQuality=${COMPRESSION_QUALITY}`;
    url=setParam(url,'mosaicRule',JSON.stringify(MOSAIC_RULE));
    url=setParam(url,'interpolation',INTERPOLATION);
    return url;
  }

  function parseJsonParam(params,name){try{const raw=params.get(name);return raw?JSON.parse(raw):null;}catch(e){return null;}}
  function classifyHighResRequest(value){
    try{
      const u=new URL(String(value||''),location.href);
      if(u.hostname!==HIGH_HOST||!/\/USGSNAIPPlus\/ImageServer\/exportImage$/i.test(u.pathname))return null;
      const p=u.searchParams,size=String(p.get('size')||'').replace(/\s/g,'');
      const mosaic=parseJsonParam(p,'mosaicRule')||{},rendering=parseJsonParam(p,'renderingRule')||{};
      const interpolation=String(p.get('interpolation')||''),quality=Number(p.get('compressionQuality'));
      const resolutionFirst=String(mosaic.sortField||'').toLowerCase()==='resolution_value'&&Number(mosaic.sortValue)===0&&String(mosaic.mosaicOperation||'').toUpperCase()==='MT_FIRST';
      const cubic=interpolation===INTERPOLATION,naturalColor=String(rendering.rasterFunction||'').toLowerCase()==='naturalcolor';
      const size512=size==='512,512',size256=size==='256,256';
      return {size,size512,size256,resolutionFirst,cubic,naturalColor,quality95:quality===COMPRESSION_QUALITY,policy:size512&&resolutionFirst&&cubic&&quality===COMPRESSION_QUALITY};
    }catch(e){return null;}
  }

  function observeRequest(entry){
    const proof=classifyHighResRequest(entry?.name);if(!proof)return;
    requestStats.observed++;
    if(proof.resolutionFirst)requestStats.mosaicRulePresent++;
    if(proof.cubic)requestStats.cubicPresent++;
    if(proof.naturalColor)requestStats.naturalColorPresent++;
    if(proof.quality95)requestStats.quality95Present++;
    if(proof.policy){
      requestStats.policy512++;
      if(!requestStats.firstPolicyLogged){
        requestStats.firstPolicyLogged=true;
        mark('imagery.v134-live-request-policy-observed',{provider:'HIGH_RES_NAIP_PLUS',actualResourceObserved:true,requestedPixels:'512x512',logicalTilePixels:256,densityScale:2,resolutionFirstMosaic:true,interpolation:INTERPOLATION,compressionQuality:COMPRESSION_QUALITY,naturalColor:proof.naturalColor,initiatorType:String(entry?.initiatorType||'unknown'),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
      }
    }else if(proof.size256&&!proof.resolutionFirst)requestStats.diagnostic256++;
    else{
      requestStats.other++;
      if(requestStats.other<=3)mark('imagery.v134-live-request-unexpected',{provider:'HIGH_RES_NAIP_PLUS',actualResourceObserved:true,requestedPixels:proof.size||'unknown',resolutionFirstMosaic:proof.resolutionFirst,cubicInterpolation:proof.cubic,compressionQuality95:proof.quality95,naturalColor:proof.naturalColor,initiatorType:String(entry?.initiatorType||'unknown'),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    }
  }
  function flushRequestProof(reason='periodic'){
    const prev=requestStats.lastFlushed,delta={observed:requestStats.observed-prev.observed,policy512:requestStats.policy512-prev.policy512,diagnostic256:requestStats.diagnostic256-prev.diagnostic256,other:requestStats.other-prev.other};
    requestStats.lastFlushed={observed:requestStats.observed,policy512:requestStats.policy512,diagnostic256:requestStats.diagnostic256,other:requestStats.other};
    if(!delta.observed&&reason==='periodic')return;
    mark('imagery.v134-live-request-summary',{reason,highResExportResources:requestStats.observed,policy512Requests:requestStats.policy512,legacyDiagnostic256Requests:requestStats.diagnostic256,unexpectedRequests:requestStats.other,mosaicRuleRequests:requestStats.mosaicRulePresent,cubicRequests:requestStats.cubicPresent,naturalColorRequests:requestStats.naturalColorPresent,compression95Requests:requestStats.quality95Present,policyObserved:requestStats.policy512>0,delta,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
  }
  function installResourceProof(){
    if(resourceObserver||typeof PerformanceObserver!=='function')return !!resourceObserver;
    try{
      resourceObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())observeRequest(entry);});
      resourceObserver.observe({type:'resource',buffered:true});
      requestSummaryTimer=setInterval(()=>flushRequestProof('periodic'),REQUEST_SUMMARY_MS);
      mark('imagery.v134-live-request-proof-installed',{provider:'HIGH_RES_NAIP_PLUS',provesActualResourceParameters:true,expectedPixels:'512x512',expectedMosaicSortField:'resolution_value',expectedInterpolation:INTERPOLATION,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
      return true;
    }catch(error){mark('imagery.v134-live-request-proof-unavailable',{error:clean(error?.message||error,120),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});return false;}
  }

  function resolutionMeters(value,units){
    const v=Number(value);if(!Number.isFinite(v)||v<=0)return null;
    const u=String(units||'').toLowerCase().trim();
    if(!u||u==='m'||u.startsWith('meter')||u.startsWith('metre'))return v;
    if(u==='ft'||u.startsWith('foot')||u.startsWith('feet'))return v*0.3048;
    if(u==='cm')return v/100;
    if(u==='in'||u.startsWith('inch'))return v*0.0254;
    return null;
  }
  function dateOnly(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return undefined;try{return new Date(n).toISOString().slice(0,10);}catch(e){return undefined;}}
  function catalogFeatures(payload){const f=payload?.catalogItems?.features;return Array.isArray(f)?f:[];}
  function itemSummary(feature){
    const a=feature?.attributes||{},raw=Number(a.resolution_value),units=clean(a.resolution_units||'',12);
    return {resolutionValue:Number.isFinite(raw)?round(raw,4):undefined,resolutionUnits:units||undefined,resolutionMeters:round(resolutionMeters(raw,units),4),year:Number.isFinite(+a.Year)?+a.Year:undefined,acquisitionDate:dateOnly(a.acquisition_date),agency:clean(a.agency||'',20)||undefined,category:Number.isFinite(+a.Category)?+a.Category:undefined,objectId:Number.isFinite(+a.OBJECTID)?+a.OBJECTID:undefined};
  }
  function identifyUrl(center,mosaicRule){
    const u=new URL(`${SERVICE_ROOT}/identify`);
    u.searchParams.set('geometry',JSON.stringify({x:+center.lng,y:+center.lat,spatialReference:{wkid:4326}}));
    u.searchParams.set('geometryType','esriGeometryPoint');
    if(mosaicRule)u.searchParams.set('mosaicRule',JSON.stringify(mosaicRule));
    u.searchParams.set('returnGeometry','false');u.searchParams.set('returnCatalogItems','true');u.searchParams.set('returnPixelValues','false');u.searchParams.set('maxItemCount','10');u.searchParams.set('f','json');
    return u.href;
  }
  async function fetchJson(url){
    const controller=typeof AbortController==='function'?new AbortController():null;let timer=null;
    try{
      if(controller)timer=setTimeout(()=>controller.abort(),IDENTIFY_TIMEOUT_MS);
      const response=await fetch(url,{cache:'no-store',signal:controller?.signal});const payload=await response.json();
      if(!response.ok||payload?.error)throw new Error(payload?.error?.message||`HTTP ${response.status}`);return payload;
    }finally{if(timer)clearTimeout(timer);}
  }
  async function runSelectionProof(map,reason){
    if(identifyInFlight)return;let center=null,zoom=0;
    try{center=map?.getCenter?.();zoom=+map?.getZoom?.()||0;}catch(e){}if(!center||zoom<IDENTIFY_MIN_ZOOM)return;
    identifyInFlight=true;lastIdentifyAt=Date.now();const serial=++identifySerial,started=performance?.now?.()||Date.now();
    mark('imagery.v134-source-selection-proof-start',{serial,reason,zoomBand:Math.round(zoom),pairedIdentify:true,comparesResolutionFirstToServiceDefault:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    try{
      const [custom,baseline]=await Promise.all([fetchJson(identifyUrl(center,MOSAIC_RULE)),fetchJson(identifyUrl(center,null))]);
      const customFeatures=catalogFeatures(custom),defaultFeatures=catalogFeatures(baseline),selected=itemSummary(customFeatures[0]),serviceDefault=itemSummary(defaultFeatures[0]);
      const bestMeters=Number(selected.resolutionMeters),defaultMeters=Number(serviceDefault.resolutionMeters),comparable=Number.isFinite(bestMeters)&&bestMeters>0&&Number.isFinite(defaultMeters)&&defaultMeters>0;
      const ratio=comparable?defaultMeters/bestMeters:null,sameRaster=selected.objectId!=null&&serviceDefault.objectId!=null?selected.objectId===serviceDefault.objectId:undefined;
      mark('imagery.v134-source-selection-proof',{serial,reason,elapsedMs:round((performance?.now?.()||Date.now())-started,1),resolutionFirst:{resolutionValue:selected.resolutionValue,resolutionUnits:selected.resolutionUnits,resolutionMeters:selected.resolutionMeters,year:selected.year,acquisitionDate:selected.acquisitionDate,agency:selected.agency,category:selected.category},serviceDefault:{resolutionValue:serviceDefault.resolutionValue,resolutionUnits:serviceDefault.resolutionUnits,resolutionMeters:serviceDefault.resolutionMeters,year:serviceDefault.year,acquisitionDate:serviceDefault.acquisitionDate,agency:serviceDefault.agency,category:serviceDefault.category},customCatalogItemsReturned:customFeatures.length,defaultCatalogItemsReturned:defaultFeatures.length,sameRaster,comparableResolution:comparable,resolutionImproved:comparable?bestMeters<defaultMeters:undefined,linearResolutionGain:comparable?round(ratio,2):undefined,bestCandidateResolutionsMeters:customFeatures.slice(0,5).map(f=>itemSummary(f).resolutionMeters).filter(Number.isFinite),serviceDefaultCandidateResolutionsMeters:defaultFeatures.slice(0,5).map(f=>itemSummary(f).resolutionMeters).filter(Number.isFinite),policyActuallyObservedOnLiveRequests:requestStats.policy512>0,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    }catch(error){mark('imagery.v134-source-selection-proof-failed',{serial,reason,errorName:clean(error?.name||'Error',40),error:clean(error?.message||error,160),policyActuallyObservedOnLiveRequests:requestStats.policy512>0,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});}
    finally{identifyInFlight=false;}
  }
  function scheduleSelectionProof(map,reason,force=false){if(!map||identifyInFlight)return;const nowMs=Date.now();if(!force&&nowMs-lastIdentifyAt<IDENTIFY_THROTTLE_MS)return;setTimeout(()=>runSelectionProof(map,reason),force?900:150);}
  function attachSelectionDiagnostics(map){
    if(!map||map.__padGradeV134ImageryProof)return;map.__padGradeV134ImageryProof=true;
    try{map.on?.('moveend',()=>scheduleSelectionProof(map,'moveend',false));}catch(e){}
    try{map.on?.('load',()=>scheduleSelectionProof(map,'map-load',true));}catch(e){}
    setTimeout(()=>scheduleSelectionProof(map,'initial',true),1400);
    mark('imagery.v134-selection-proof-attached',{pairedIdentify:true,minimumZoom:IDENTIFY_MIN_ZOOM,throttleMs:IDENTIFY_THROTTLE_MS,providerUnchanged:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
  }

  function upgradeSource(id,spec,reason){
    if(String(id||'')!==HIGH_SOURCE||!spec||spec.type!=='raster'||!Array.isArray(spec.tiles))return spec;
    const tiles=spec.tiles.map(upgradeTileUrl),changed=tiles.some((v,i)=>v!==spec.tiles[i]);if(!changed)return spec;
    const next={...spec,tiles};
    mark('imagery.v133-best-source-upgraded',{reason,provider:'HIGH_RES_NAIP_PLUS',selection:'smallest-resolution_value',selectionScope:'server-side-per-tile',exportPixels:EXPORT_SIZE,logicalTilePixels:+spec.tileSize||256,densityScale:+((EXPORT_SIZE/(+spec.tileSize||256))).toFixed(2),compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,providerUnchanged:true,naturalColorUnchanged:true,noEsriProvider:true,noLocalCoverageHardcode:true,urlsLogged:false,coordinatesLogged:false});
    return next;
  }
  function upgradeStyle(style){if(!style||typeof style!=='object'||!style.sources?.[HIGH_SOURCE])return style;const sources={...style.sources,[HIGH_SOURCE]:upgradeSource(HIGH_SOURCE,style.sources[HIGH_SOURCE],'initial-style')};return {...style,sources};}

  function patchMapLibre(){
    if(mapLibrePatched)return true;const ml=window.maplibregl,OriginalMap=ml?.Map;if(typeof OriginalMap!=='function')return false;mapLibrePatched=true;
    class PadGrade134QualityMap extends OriginalMap{constructor(options){const next=options&&typeof options==='object'?{...options,style:upgradeStyle(options.style)}:options;super(next);attachSelectionDiagnostics(this);}}
    try{Object.setPrototypeOf(PadGrade134QualityMap,OriginalMap);}catch(e){}ml.Map=PadGrade134QualityMap;
    const proto=OriginalMap.prototype;
    if(proto&&typeof proto.addSource==='function'&&!proto.addSource.__padGradeV134ImageryQuality){const base=proto.addSource;const wrapped=function(id,spec){return base.call(this,id,upgradeSource(id,spec,'add-source'));};wrapped.__padGradeV134ImageryQuality=true;wrapped.__padGradeV133ImageryQuality=true;wrapped.__padGradeV134Base=base;proto.addSource=wrapped;}
    mark('imagery.v133-best-available-policy-installed',{provider:'USGSNAIPPlus',renderingRule:'NaturalColor',selection:'resolution_value-nearest-zero',selectionScope:'server-side-per-tile',exportPixels:EXPORT_SIZE,logicalTilePixels:256,densityScale:2,compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,cachedUsfsFallbackUnchanged:true,layerOrderUnchanged:true,noEsriProvider:true,noLocalCoverageHardcode:true});
    mark('imagery.v134-proof-diagnostics-installed',{version:'1.3.4',build:106,behaviorChanged:false,liveResourcePolicyProof:true,pairedSourceSelectionProof:true,comparesAgainstServiceDefault:true,noAdditionalImageryProvider:true,urlsLogged:false,coordinatesLogged:false});
    return true;
  }

  installResourceProof();
  window.PadGradeImageryV134={version:'1.3.4',upgradeTileUrl,mosaicRule:{...MOSAIC_RULE},interpolation:INTERPOLATION,classifyHighResRequest};
  window.PadGradeImageryV133=window.PadGradeImageryV134;
  try{document.title='Pad Grade Mapper v1.3.4 DEV';}catch(e){}
  window.addEventListener('padgrade-maplibre-ready',patchMapLibre);
  if(window.maplibregl?.Map)patchMapLibre();
})();
