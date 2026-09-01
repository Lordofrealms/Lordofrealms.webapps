/* Pad Grade v1.3.3 DEV — USGS-only best-available close-zoom imagery.
 *
 * Keeps USGSNAIPPlus + NaturalColor, the 512-for-256 density policy, and the
 * existing cached USGS fallback. The NAIP Plus ImageServer is instructed to
 * choose the overlapping source raster whose catalog resolution_value is closest
 * to zero (therefore the smallest positive ground-pixel size) for every tile.
 * This is server-side and nationwide: no state/local coverage is hard-coded.
 */
(function installPadGrade133ImageryQuality(){
  'use strict';
  if(window.__padGradeV133ImageryQuality)return;
  window.__padGradeV133ImageryQuality=true;

  const HIGH_SOURCE='usgs-naip-plus';
  const EXPORT_SIZE=512;
  const COMPRESSION_QUALITY=95;
  const INTERPOLATION='RSP_CubicConvolution';
  const MOSAIC_RULE={
    mosaicMethod:'esriMosaicAttribute',
    sortField:'resolution_value',
    sortValue:0,
    ascending:true,
    mosaicOperation:'MT_FIRST'
  };
  let mapLibrePatched=false;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

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

  function upgradeSource(id,spec,reason){
    if(String(id||'')!==HIGH_SOURCE||!spec||spec.type!=='raster'||!Array.isArray(spec.tiles))return spec;
    const tiles=spec.tiles.map(upgradeTileUrl),changed=tiles.some((v,i)=>v!==spec.tiles[i]);
    if(!changed)return spec;
    const next={...spec,tiles};
    mark('imagery.v133-best-source-upgraded',{
      reason,provider:'HIGH_RES_NAIP_PLUS',selection:'smallest-resolution_value',
      selectionScope:'server-side-per-tile',exportPixels:EXPORT_SIZE,
      logicalTilePixels:+spec.tileSize||256,densityScale:+((EXPORT_SIZE/(+spec.tileSize||256))).toFixed(2),
      compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,
      providerUnchanged:true,naturalColorUnchanged:true,noEsriProvider:true,
      noLocalCoverageHardcode:true,urlsLogged:false,coordinatesLogged:false
    });
    return next;
  }
  function upgradeStyle(style){
    if(!style||typeof style!=='object'||!style.sources?.[HIGH_SOURCE])return style;
    const sources={...style.sources,[HIGH_SOURCE]:upgradeSource(HIGH_SOURCE,style.sources[HIGH_SOURCE],'initial-style')};
    return {...style,sources};
  }

  function patchMapLibre(){
    if(mapLibrePatched)return true;
    const ml=window.maplibregl,OriginalMap=ml?.Map;
    if(typeof OriginalMap!=='function')return false;
    mapLibrePatched=true;

    class PadGrade133QualityMap extends OriginalMap{
      constructor(options){
        const next=options&&typeof options==='object'?{...options,style:upgradeStyle(options.style)}:options;
        super(next);
      }
    }
    try{Object.setPrototypeOf(PadGrade133QualityMap,OriginalMap);}catch(e){}
    ml.Map=PadGrade133QualityMap;

    const proto=OriginalMap.prototype;
    if(proto&&typeof proto.addSource==='function'&&!proto.addSource.__padGradeV133ImageryQuality){
      const base=proto.addSource;
      const wrapped=function(id,spec){return base.call(this,id,upgradeSource(id,spec,'add-source'));};
      wrapped.__padGradeV133ImageryQuality=true;
      wrapped.__padGradeV133Base=base;
      proto.addSource=wrapped;
    }

    mark('imagery.v133-best-available-policy-installed',{
      provider:'USGSNAIPPlus',renderingRule:'NaturalColor',
      selection:'resolution_value-nearest-zero',selectionScope:'server-side-per-tile',
      exportPixels:EXPORT_SIZE,logicalTilePixels:256,densityScale:2,
      compressionQuality:COMPRESSION_QUALITY,interpolation:INTERPOLATION,
      cachedUsfsFallbackUnchanged:true,layerOrderUnchanged:true,noEsriProvider:true,
      noLocalCoverageHardcode:true
    });
    return true;
  }

  window.PadGradeImageryV133={version:'1.3.3',upgradeTileUrl,mosaicRule:{...MOSAIC_RULE},interpolation:INTERPOLATION};
  try{document.title='Pad Grade Mapper v1.3.3 DEV';}catch(e){}
  window.addEventListener('padgrade-maplibre-ready',patchMapLibre);
  if(window.maplibregl?.Map)patchMapLibre();
})();
