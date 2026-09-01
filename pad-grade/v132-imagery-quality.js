/* Pad Grade v1.3.2 DEV — higher-density USGS NAIP Plus raster requests.
 *
 * v1.3.1 field diagnostics proved the high-resolution ImageServer source was
 * reaching loaded state without HTTP/source errors. The remaining complaint is
 * visual fidelity, so keep the same USGSNAIPPlus + NaturalColor provider and the
 * same tile geography, but request a 2x (512 px) export for each 256 px logical
 * MapLibre raster tile and raise JPG/JPGPNG compression quality to 95.
 *
 * This wrapper is installed before map.js constructs the primary map and also
 * rewrites later addSource() calls, so the bounded v0.8.9 imagery-recovery path
 * cannot silently revert the source to the older 256 px request.
 */
(function installPadGrade132ImageryQuality(){
  'use strict';
  if(window.__padGradeV132ImageryQuality)return;
  window.__padGradeV132ImageryQuality=true;

  const HIGH_SOURCE='usgs-naip-plus';
  const EXPORT_SIZE=512;
  const COMPRESSION_QUALITY=95;
  let mapLibrePatched=false;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  function upgradeTileUrl(value){
    let url=String(value||'');
    if(!/imagery\.nationalmap\.gov\/arcgis\/rest\/services\/USGSNAIPPlus\/ImageServer\/exportImage/i.test(url))return url;
    if(/[?&]size=\d+%2C\d+/i.test(url))url=url.replace(/([?&]size=)\d+%2C\d+/i,`$1${EXPORT_SIZE}%2C${EXPORT_SIZE}`);
    else if(/[?&]size=\d+,\d+/i.test(url))url=url.replace(/([?&]size=)\d+,\d+/i,`$1${EXPORT_SIZE},${EXPORT_SIZE}`);
    else url+=`${url.includes('?')?'&':'?'}size=${EXPORT_SIZE},${EXPORT_SIZE}`;
    if(/[?&]compressionQuality=\d+/i.test(url))url=url.replace(/([?&]compressionQuality=)\d+/i,`$1${COMPRESSION_QUALITY}`);
    else url+=`&compressionQuality=${COMPRESSION_QUALITY}`;
    return url;
  }

  function upgradeSource(id,spec,reason){
    if(String(id||'')!==HIGH_SOURCE||!spec||spec.type!=='raster'||!Array.isArray(spec.tiles))return spec;
    const tiles=spec.tiles.map(upgradeTileUrl),changed=tiles.some((v,i)=>v!==spec.tiles[i]);
    if(!changed)return spec;
    const next={...spec,tiles};
    mark('imagery.v132-highres-source-upgraded',{
      reason,
      provider:'HIGH_RES_NAIP_PLUS',
      exportPixels:EXPORT_SIZE,
      logicalTilePixels:+spec.tileSize||256,
      densityScale:+((EXPORT_SIZE/(+spec.tileSize||256))).toFixed(2),
      compressionQuality:COMPRESSION_QUALITY,
      providerUnchanged:true,
      naturalColorUnchanged:true,
      urlsLogged:false,
      coordinatesLogged:false
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

    class PadGrade132QualityMap extends OriginalMap{
      constructor(options){
        const next=options&&typeof options==='object'?{...options,style:upgradeStyle(options.style)}:options;
        super(next);
      }
    }
    try{Object.setPrototypeOf(PadGrade132QualityMap,OriginalMap);}catch(e){}
    ml.Map=PadGrade132QualityMap;

    const proto=OriginalMap.prototype;
    if(proto&&typeof proto.addSource==='function'&&!proto.addSource.__padGradeV132ImageryQuality){
      const base=proto.addSource;
      const wrapped=function(id,spec){return base.call(this,id,upgradeSource(id,spec,'add-source'));};
      wrapped.__padGradeV132ImageryQuality=true;
      wrapped.__padGradeV132Base=base;
      proto.addSource=wrapped;
    }

    mark('imagery.v132-quality-policy-installed',{
      provider:'USGSNAIPPlus',
      exportPixels:EXPORT_SIZE,
      logicalTilePixels:256,
      densityScale:2,
      compressionQuality:COMPRESSION_QUALITY,
      providerUnchanged:true,
      renderingRule:'NaturalColor',
      layerOrderUnchanged:true
    });
    return true;
  }

  window.addEventListener('padgrade-maplibre-ready',patchMapLibre);
  if(window.maplibregl?.Map)patchMapLibre();
})();
