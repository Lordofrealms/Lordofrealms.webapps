/* Pad Grade v1.3.7 DEV — positive-resolution USGS NAIP selection fix.
 *
 * v1.3.6 proved that the resolution_value-nearest-zero rule could select a
 * zero/unknown-resolution catalog record ahead of a real positive-resolution
 * candidate. v1.3.7 preserves the existing USGS NAIP Plus provider, Natural
 * Color, 512-for-256 export density, cubic interpolation and quality 95, but
 * adds a server-side mosaic subset: resolution_value > 0.
 *
 * This file operates at the request boundary so it corrects both live exportImage
 * requests and the existing paired identify proof without replacing the provider.
 */
(function installPadGrade137ImagerySelectionFix(){
  'use strict';
  if(window.__padGradeV137ImagerySelectionFix)return;
  window.__padGradeV137ImagerySelectionFix=true;

  const HOST='imagery.nationalmap.gov';
  const SERVICE='/arcgis/rest/services/USGSNAIPPlus/ImageServer/';
  const POSITIVE_WHERE='resolution_value > 0';
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  function targetPath(pathname){return pathname===SERVICE+'exportImage'||pathname===SERVICE+'identify';}
  function normalizedWhere(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function mergePositiveWhere(existing){
    const current=normalizedWhere(existing);
    if(!current)return POSITIVE_WHERE;
    if(/resolution_value\s*>\s*0/i.test(current))return current;
    return `(${current}) AND (${POSITIVE_WHERE})`;
  }
  function rewriteUrl(value){
    let u;
    try{u=new URL(String(value||''),location.href);}catch(e){return String(value||'');}
    if(u.hostname!==HOST||!targetPath(u.pathname))return u.href;
    const raw=u.searchParams.get('mosaicRule');
    if(!raw)return u.href;
    let rule;
    try{rule=JSON.parse(raw);}catch(e){return u.href;}
    const mosaicMethod=String(rule?.mosaicMethod||'');
    const sortField=String(rule?.sortField||'');
    if(mosaicMethod!=='esriMosaicAttribute'||sortField!=='resolution_value'||Number(rule?.sortValue)!==0)return u.href;
    const nextWhere=mergePositiveWhere(rule.where);
    if(nextWhere===rule.where)return u.href;
    rule={...rule,where:nextWhere};
    u.searchParams.set('mosaicRule',JSON.stringify(rule));
    return u.href;
  }
  function classify(value){
    try{
      const u=new URL(String(value||''),location.href);
      if(u.hostname!==HOST||!targetPath(u.pathname))return null;
      const raw=u.searchParams.get('mosaicRule');if(!raw)return null;
      const rule=JSON.parse(raw),where=normalizedWhere(rule?.where);
      return {
        target:true,
        mosaicMethod:String(rule?.mosaicMethod||''),
        sortField:String(rule?.sortField||''),
        sortValue:Number(rule?.sortValue),
        positiveFiltered:/resolution_value\s*>\s*0/i.test(where),
        wherePresent:!!where
      };
    }catch(e){return null;}
  }

  const baseFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
  if(baseFetch){
    window.fetch=function(input,init){
      try{
        if(typeof input==='string'||input instanceof URL){
          return baseFetch(rewriteUrl(String(input)),init);
        }
        if(input&&typeof input.url==='string'&&typeof Request==='function'){
          const next=rewriteUrl(input.url);
          if(next!==input.url)return baseFetch(new Request(next,input),init);
        }
      }catch(e){}
      return baseFetch(input,init);
    };
  }

  const xhrOpen=XMLHttpRequest?.prototype?.open;
  if(typeof xhrOpen==='function'){
    XMLHttpRequest.prototype.open=function(method,url,...rest){
      return xhrOpen.call(this,method,rewriteUrl(String(url||'')),...rest);
    };
  }

  let firstObserved=false,observer=null;
  if(typeof PerformanceObserver==='function'){
    try{
      observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          const proof=classify(entry?.name);if(!proof?.positiveFiltered)continue;
          if(!firstObserved){
            firstObserved=true;
            mark('imagery.v137-positive-resolution-policy-observed',{
              actualResourceObserved:true,
              provider:'USGSNAIPPlus',
              positiveResolutionFilter:true,
              filter:POSITIVE_WHERE,
              sortField:'resolution_value',sortValue:0,
              zeroUnknownExcluded:true,
              urlsLogged:false,coordinatesLogged:false
            });
          }
        }
      });
      observer.observe({type:'resource',buffered:true});
    }catch(e){}
  }

  window.PadGradeImageryV137={version:'1.3.7',positiveWhere:POSITIVE_WHERE,rewriteUrl,classify,mergePositiveWhere};
  try{document.title='Pad Grade Mapper v1.3.7 DEV';}catch(e){}
  mark('imagery.v137-selection-policy-installed',{
    version:'1.3.7',build:109,
    provider:'USGSNAIPPlus',providerUnchanged:true,
    filter:POSITIVE_WHERE,zeroUnknownExcluded:true,
    resolutionOrderingUnchanged:true,
    naturalColorUnchanged:true,exportDensityUnchanged:true,
    cubicInterpolationUnchanged:true,compressionQualityUnchanged:true,
    behaviorChanged:true,noAdditionalImageryProvider:true,
    urlsLogged:false,coordinatesLogged:false
  });
})();
