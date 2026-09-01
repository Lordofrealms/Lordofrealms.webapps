/* v1.3.3 regression: USGS NAIP Plus stays the provider while the export
 * request asks the ImageServer to select the finest-resolution overlapping raster.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const marks=[];
const window={
  PadGradeDiag:{mark:(name,details)=>marks.push({name,details})},
  addEventListener:()=>{},
  maplibregl:null
};
const document={title:'Pad Grade Mapper v1.3.2 DEV'};
const context={window,document,console,encodeURIComponent,decodeURIComponent,URL,RegExp,String,JSON,Object,Number};
context.globalThis=context;
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'v132-imagery-quality.js'),'utf8');
vm.runInContext(source,context,{filename:'v132-imagery-quality.js'});

const api=window.PadGradeImageryV133;
assert(api);
assert.strictEqual(api.version,'1.3.3');
assert.strictEqual(document.title,'Pad Grade Mapper v1.3.3 DEV');

const base='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage'
  +'?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256'
  +'&format=jpgpng&transparent=false&f=image&renderingRule=%7B%22rasterFunction%22%3A%22NaturalColor%22%7D';
const upgraded=api.upgradeTileUrl(base);
assert(/size=512,512/i.test(upgraded));
assert(/compressionQuality=95/i.test(upgraded));
assert(/interpolation=RSP_CubicConvolution/i.test(upgraded));

const match=upgraded.match(/[?&]mosaicRule=([^&]+)/i);
assert(match);
const rule=JSON.parse(decodeURIComponent(match[1]));
assert.strictEqual(rule.mosaicMethod,'esriMosaicAttribute');
assert.strictEqual(rule.sortField,'resolution_value');
assert.strictEqual(rule.sortValue,0);
assert.strictEqual(rule.mosaicOperation,'MT_FIRST');

const other='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
assert.strictEqual(api.upgradeTileUrl(other),other);
assert(!/arcgisonline|world_imagery/i.test(source));
console.log('v1.3.3 imagery regression passed: USGS-only, 512px, resolution-first server mosaic, cubic resampling.');
