/* Pad Grade v1.3.6 DEV — USGS-only best-available imagery + stronger field proof.
 *
 * Imagery behavior remains unchanged from v1.3.3-v1.3.5: USGSNAIPPlus +
 * NaturalColor, 512-for-256 exports, resolution_value-nearest-zero mosaic
 * selection, cubic resampling, and the existing cached-USGS fallback/layer order.
 *
 * v1.3.6 fixes a diagnostic bug where null resolution values could be formatted
 * as numeric zero and adds an independent catalog query for the smallest positive
 * resolution_value intersecting the current map point. This lets the field log
 * prove whether the raster selected by our mosaic rule is actually the finest
 * positive-resolution source available there, without logging coordinates/URLs.
 */
(function installPadGrade136ImageryQuality(){
  'use strict';
  if(window.__padGradeV136ImageryQuality)return;
  window.__padGradeV136ImageryQuality=true;

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
  const finiteNumber=value=>{
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  };
  const round=(value,digits=3)=>{const n=finiteNumber(value);return n===null?null:+n.toFixed(digits);};
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
        mark('imagery.v136-live-request-policy-observed',{provider:'HIGH_RES_NAIP_PLUS',actualResourceObserved:true,requestedPixels:'512x512',logicalTilePixels:256,densityScale:2,resolutionFirstMosaic:true,interpolation:INTERPOLATION,compressionQuality:COMPRESSION_QUALITY,naturalColor:proof.naturalColor,initiatorType:String(entry?.initiatorType||'unknown'),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
      }
    }else if(proof.size256&&!proof.resolutionFirst)requestStats.diagnostic256++;
    else{
      requestStats.other++;
      if(requestStats.other<=3)mark('imagery.v136-live-request-unexpected',{provider:'HIGH_RES_NAIP_PLUS',actualResourceObserved:true,requestedPixels:proof.size||'unknown',resolutionFirstMosaic:proof.resolutionFirst,cubicInterpolation:proof.cubic,compressionQuality95:proof.quality95,naturalColor:proof.naturalColor,initiatorType:String(entry?.initiatorType||'unknown'),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    }
  }
  function flushRequestProof(reason='periodic'){
    const prev=requestStats.lastFlushed,delta={observed:requestStats.observed-prev.observed,policy512:requestStats.policy512-prev.policy512,diagnostic256:requestStats.diagnostic256-prev.diagnostic256,other:requestStats.other-prev.other};
    requestStats.lastFlushed={observed:requestStats.observed,policy512:requestStats.policy512,diagnostic256:requestStats.diagnostic256,other:requestStats.other};
    if(!delta.observed&&reason==='periodic')return;
    mark('imagery.v136-live-request-summary',{reason,highResExportResources:requestStats.observed,policy512Requests:requestStats.policy512,legacyDiagnostic256Requests:requestStats.diagnostic256,unexpectedRequests:requestStats.other,mosaicRuleRequests:requestStats.mosaicRulePresent,cubicRequests:requestStats.cubicPresent,naturalColorRequests:requestStats.naturalColorPresent,compression95Requests:requestStats.quality95Present,policyObserved:requestStats.policy512>0,delta,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
  }
  function installResourceProof(){
    if(resourceObserver||typeof PerformanceObserver!=='function')return !!resourceObserver;
    try{
      resourceObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())observeRequest(entry);});
      resourceObserver.observe({type:'resource',buffered:true});
      requestSummaryTimer=setInterval(()=>flushRequestProof('periodic'),REQUEST_SUMMARY_MS);
      mark('imagery.v136-live-request-proof-installed',{provider:'HIGH_RES_NAIP_PLUS',provesActualResourceParameters:true,expectedPixels:'512x512',expectedMosaicSortField:'resolution_value',expectedInterpolation:INTERPOLATION,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
      return true;
    }catch(error){mark('imagery.v136-live-request-proof-unavailable',{error:clean(error?.message||error,120),urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});return false;}
  }

  function resolutionMeters(value,units){
    const v=finiteNumber(value);if(v===null||v<=0)return null;
    const u=String(units||'').toLowerCase().trim();
    if(!u||u==='m'||u.startsWith('meter')||u.startsWith('metre'))return v;
    if(u==='ft'||u.startsWith('foot')||u.startsWith('feet'))return v*0.3048;
    if(u==='cm')return v/100;
    if(u==='in'||u.startsWith('inch'))return v*0.0254;
    return null;
  }
  function dateOnly(value){const n=finiteNumber(value);if(n===null||n<=0)return undefined;try{return new Date(n).toISOString().slice(0,10);}catch(e){return undefined;}}
  function catalogFeatures(payload){const f=payload?.catalogItems?.features;return Array.isArray(f)?f:[];}
  function queryFeatures(payload){const f=payload?.features;return Array.isArray(f)?f:[];}
  function itemSummary(feature){
    const a=feature?.attributes||{},raw=finiteNumber(a.resolution_value),units=clean(a.resolution_units||'',12);
    const minPS=finiteNumber(a.MinPS),maxPS=finiteNumber(a.MaxPS),meters=resolutionMeters(raw,units);
    return {
      objectId:finiteNumber(a.OBJECTID)??undefined,
      resolutionValue:raw===null?undefined:round(raw,4),resolutionUnits:units||undefined,
      resolutionMeters:meters===null?undefined:round(meters,4),
      minPS:minPS===null?undefined:round(minPS,4),maxPS:maxPS===null?undefined:round(maxPS,4),
      year:finiteNumber(a.Year)??undefined,acquisitionDate:dateOnly(a.acquisition_date),agency:clean(a.agency||'',20)||undefined,
      category:finiteNumber(a.Category)??undefined,
      resolutionFieldPresent:Object.prototype.hasOwnProperty.call(a,'resolution_value'),
      unitsFieldPresent:Object.prototype.hasOwnProperty.call(a,'resolution_units'),
      minPSFieldPresent:Object.prototype.hasOwnProperty.call(a,'MinPS'),maxPSFieldPresent:Object.prototype.hasOwnProperty.call(a,'MaxPS')
    };
  }
  function identifyUrl(center,mosaicRule){
    const u=new URL(`${SERVICE_ROOT}/identify`);
    u.searchParams.set('geometry',JSON.stringify({x:+center.lng,y:+center.lat,spatialReference:{wkid:4326}}));
    u.searchParams.set('geometryType','esriGeometryPoint');
    if(mosaicRule)u.searchParams.set('mosaicRule',JSON.stringify(mosaicRule));
    u.searchParams.set('returnGeometry','false');u.searchParams.set('returnCatalogItems','true');u.searchParams.set('returnPixelValues','false');u.searchParams.set('maxItemCount','10');u.searchParams.set('f','json');
    return u.href;
  }
  function bestPositiveQueryUrl(center){
    const u=new URL(`${SERVICE_ROOT}/query`);
    u.searchParams.set('where','resolution_value > 0');
    u.searchParams.set('geometry',JSON.stringify({x:+center.lng,y:+center.lat,spatialReference:{wkid:4326}}));
    u.searchParams.set('geometryType','esriGeometryPoint');u.searchParams.set('inSR','4326');
    u.searchParams.set('spatialRel','esriSpatialRelIntersects');
    u.searchParams.set('outFields','OBJECTID,MinPS,MaxPS,Category,Year,acquisition_date,agency,resolution_value,resolution_units');
    u.searchParams.set('orderByFields','resolution_value ASC');u.searchParams.set('resultRecordCount','10');
    u.searchParams.set('returnGeometry','false');u.searchParams.set('f','json');
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
    mark('imagery.v136-source-selection-proof-start',{serial,reason,zoomBand:Math.round(zoom),pairedIdentify:true,bestPositiveCatalogQuery:true,comparesResolutionFirstToServiceDefault:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
    try{
      const [custom,baseline,bestPositivePayload]=await Promise.all([
        fetchJson(identifyUrl(center,MOSAIC_RULE)),fetchJson(identifyUrl(center,null)),fetchJson(bestPositiveQueryUrl(center))
      ]);
      const customFeatures=catalogFeatures(custom),defaultFeatures=catalogFeatures(baseline),positiveFeatures=queryFeatures(bestPositivePayload);
      const selected=itemSummary(customFeatures[0]),serviceDefault=itemSummary(defaultFeatures[0]),bestPositive=itemSummary(positiveFeatures[0]);
      const selectedMeters=finiteNumber(selected.resolutionMeters),defaultMeters=finiteNumber(serviceDefault.resolutionMeters),positiveMeters=finiteNumber(bestPositive.resolutionMeters);
      const comparable=selectedMeters!==null&&selectedMeters>0&&defaultMeters!==null&&defaultMeters>0;
      const sameRaster=selected.objectId!=null&&serviceDefault.objectId!=null?selected.objectId===serviceDefault.objectId:undefined;
      const selectedMatchesBestPositive=selected.objectId!=null&&bestPositive.objectId!=null?selected.objectId===bestPositive.objectId:undefined;
      const selectedVsBestComparable=selectedMeters!==null&&selectedMeters>0&&positiveMeters!==null&&positiveMeters>0;
      const selectionVerdict=selectedMatchesBestPositive===true?'selected-is-best-positive':selectedMatchesBestPositive===false?'selected-differs-from-best-positive':'unknown';
      mark('imagery.v136-source-selection-proof',{
        serial,reason,elapsedMs:round((performance?.now?.()||Date.now())-started,1),
        resolutionFirst:selected,serviceDefault,bestPositiveCatalog:bestPositive,
        customCatalogItemsReturned:customFeatures.length,defaultCatalogItemsReturned:defaultFeatures.length,bestPositiveItemsReturned:positiveFeatures.length,
        sameRaster,comparableResolution:comparable,resolutionImproved:comparable?selectedMeters<defaultMeters:undefined,
        linearResolutionGain:comparable?round(defaultMeters/selectedMeters,2):undefined,
        selectedMatchesBestPositive,selectedVsBestComparable,
        selectedVsBestPositiveLinearRatio:selectedVsBestComparable?round(selectedMeters/positiveMeters,2):undefined,
        selectionVerdict,
        resolutionFirstCandidateResolutionsMeters:customFeatures.slice(0,5).map(f=>itemSummary(f).resolutionMeters).filter(v=>finiteNumber(v)!==null),
        serviceDefaultCandidateResolutionsMeters:defaultFeatures.slice(0,5).map(f=>itemSummary(f).resolutionMeters).filter(v=>finiteNumber(v)!==null),
        bestPositiveCandidateResolutionsMeters:positiveFeatures.slice(0,5).map(f=>itemSummary(f).resolutionMeters).filter(v=>finiteNumber(v)!==null),
        diagnosticNullToZeroBugFixed:true,policyActuallyObservedOnLiveRequests:requestStats.policy512>0,
        urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true
      });
    }catch(error){mark('imagery.v136-source-selection-proof-failed',{serial,reason,errorName:clean(error?.name||'Error',40),error:clean(error?.message||error,160),policyActuallyObservedOnLiveRequests:requestStats.policy512>0,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});}
    finally{identifyInFlight=false;}
  }
  function scheduleSelectionProof(map,reason,force=false){if(!map||identifyInFlight)return;const nowMs=Date.now();if(!force&&nowMs-lastIdentifyAt<IDENTIFY_THROTTLE_MS)return;setTimeout(()=>runSelectionProof(map,reason),force?900:150);}
  function attachSelectionDiagnostics(map){
    if(!map||map.__padGradeV136ImageryProof)return;map.__padGradeV136ImageryProof=true;
    try{map.on?.('moveend',()=>scheduleSelectionProof(map,'moveend',false));}catch(e){}
    try{map.on?.('load',()=>scheduleSelectionProof(map,'map-load',true));}catch(e){}
    setTimeout(()=>scheduleSelectionProof(map,'initial',true),1400);
    mark('imagery.v136-selection-proof-attached',{pairedIdentify:true,bestPositiveCatalogQuery:true,minimumZoom:IDENTIFY_MIN_ZOOM,throttleMs:IDENTIFY_THROTTLE_MS,providerUnchanged:true,urlsLogged:false,coordinatesLogged:false,diagnosticOnly:true});
  }

  function upgradeSource(id,spec,reason){
    if(String(id||'')!==HIGH_SOURCE||!spec||spec.type!=='raster'||!Array.isArray(spec.tiles))return spec;
    const tiles=spec.tiles.map(upgradeTileUrl),changed=tiles.some((v,i)=>v!==spec.tiles[i]);if(!changed)return spec;
    const next={...spec,tiles};
    mark('imagery.v136-best-source-upgraded',{reason,provider:'HIGH_RES_NAIP_PLUS',selection:'smallest-resolution_value-nearest-zero',selectionScope:'server-side-per-tile',exportPixels:EXPORT_SIZE,logicalTilePixels:+spec.tileSize||256,densityScale:+((EXPORT_SIZE/(+spec.tileSize||256))).toFixed(2),compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,providerUnchanged:true,naturalColorUnchanged:true,noEsriProvider:true,noLocalCoverageHardcode:true,urlsLogged:false,coordinatesLogged:false});
    return next;
  }
  function upgradeStyle(style){if(!style||typeof style!=='object'||!style.sources?.[HIGH_SOURCE])return style;const sources={...style.sources,[HIGH_SOURCE]:upgradeSource(HIGH_SOURCE,style.sources[HIGH_SOURCE],'initial-style')};return {...style,sources};}

  function patchMapLibre(){
    if(mapLibrePatched)return true;const ml=window.maplibregl,OriginalMap=ml?.Map;if(typeof OriginalMap!=='function')return false;mapLibrePatched=true;
    class PadGrade136QualityMap extends OriginalMap{constructor(options){const next=options&&typeof options==='object'?{...options,style:upgradeStyle(options.style)}:options;super(next);attachSelectionDiagnostics(this);}}
    try{Object.setPrototypeOf(PadGrade136QualityMap,OriginalMap);}catch(e){}ml.Map=PadGrade136QualityMap;
    const proto=OriginalMap.prototype;
    if(proto&&typeof proto.addSource==='function'&&!proto.addSource.__padGradeV136ImageryQuality){const base=proto.addSource;const wrapped=function(id,spec){return base.call(this,id,upgradeSource(id,spec,'add-source'));};wrapped.__padGradeV136ImageryQuality=true;wrapped.__padGradeV134ImageryQuality=true;wrapped.__padGradeV133ImageryQuality=true;wrapped.__padGradeV136Base=base;proto.addSource=wrapped;}
    mark('imagery.v136-best-available-policy-installed',{provider:'USGSNAIPPlus',renderingRule:'NaturalColor',selection:'resolution_value-nearest-zero',selectionScope:'server-side-per-tile',exportPixels:EXPORT_SIZE,logicalTilePixels:256,densityScale:2,compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,cachedUsfsFallbackUnchanged:true,layerOrderUnchanged:true,noEsriProvider:true,noLocalCoverageHardcode:true,behaviorChanged:false});
    mark('imagery.v136-proof-diagnostics-installed',{version:'1.3.6',build:108,behaviorChanged:false,liveResourcePolicyProof:true,pairedSourceSelectionProof:true,bestPositiveCatalogQuery:true,nullToZeroBugFixed:true,comparesAgainstServiceDefault:true,noAdditionalImageryProvider:true,urlsLogged:false,coordinatesLogged:false});
    return true;
  }

  installResourceProof();
  window.PadGradeImageryV136={version:'1.3.6',upgradeTileUrl,mosaicRule:{...MOSAIC_RULE},interpolation:INTERPOLATION,classifyHighResRequest,finiteNumber,itemSummary,bestPositiveQueryUrl};
  window.PadGradeImageryV134=window.PadGradeImageryV136;
  window.PadGradeImageryV133=window.PadGradeImageryV136;
  try{document.title='Pad Grade Mapper v1.3.6 DEV';}catch(e){}
  window.addEventListener('padgrade-maplibre-ready',patchMapLibre);
  if(window.maplibregl?.Map)patchMapLibre();
})();
