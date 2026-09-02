'use strict';

const fs=require('fs');
const vm=require('vm');
const path=require('path');

const listeners=new Map();
const marks=[];
const windowObject={
  addEventListener(name,handler){listeners.set(name,handler);},
  PadGradeDiag:{mark:(name,details)=>marks.push({name,details})}
};
const context={window:windowObject,console};
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'v132-imagery-quality.js'),'utf8');
vm.runInContext(source,context,{filename:'v132-imagery-quality.js'});

class MockMap {
  constructor(options){this.options=options;this.added=[];}
  addSource(id,spec){this.added.push({id,spec});return this;}
}
windowObject.maplibregl={Map:MockMap};
const ready=listeners.get('padgrade-maplibre-ready');
if(typeof ready!=='function')throw new Error('maplibre-ready hook was not registered');
ready();

const highUrl='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=false&f=image&renderingRule=%7B%22rasterFunction%22%3A%22NaturalColor%22%7D';
const MapCtor=windowObject.maplibregl.Map;
const map=new MapCtor({
  container:'gpsMap',
  style:{version:8,sources:{'usgs-naip-plus':{type:'raster',tiles:[highUrl],tileSize:256,minzoom:14,maxzoom:22}},layers:[]}
});
const initial=map.options.style.sources['usgs-naip-plus'].tiles[0];
if(!initial.includes('size=512,512'))throw new Error(`initial high-res source was not upgraded: ${initial}`);
if(!initial.includes('compressionQuality=95'))throw new Error('initial high-res compression quality was not upgraded');
if(map.options.style.sources['usgs-naip-plus'].tileSize!==256)throw new Error('logical tile geography changed');

map.addSource('usgs-naip-plus',{type:'raster',tiles:[highUrl],tileSize:256});
const recovered=map.added[0]?.spec?.tiles?.[0]||'';
if(!recovered.includes('size=512,512')||!recovered.includes('compressionQuality=95'))throw new Error('recovery addSource path was not upgraded');

map.addSource('unrelated',{type:'raster',tiles:['https://example.invalid/tile/{z}/{x}/{y}.png'],tileSize:256});
if(map.added[1]?.spec?.tiles?.[0]!=='https://example.invalid/tile/{z}/{x}/{y}.png')throw new Error('unrelated raster source was modified');

if(!marks.some(m=>m.name==='imagery.v132-quality-policy-installed'&&m.details?.exportPixels===512))throw new Error('quality policy diagnostic missing');
if(!marks.some(m=>m.name==='imagery.v132-highres-source-upgraded'&&m.details?.densityScale===2))throw new Error('high-res upgrade diagnostic missing');
console.log('v1.3.2 imagery density self-test passed');
