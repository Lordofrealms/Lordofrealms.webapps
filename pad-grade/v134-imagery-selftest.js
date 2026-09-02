/* v1.3.4 regression: prove the USGS imagery policy is still 512/resolution-first
 * while field diagnostics can validate live request parameters and compare the
 * selected source resolution against the service default.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const marks=[];
const window={PadGradeDiag:{mark:(name,details)=>marks.push({name,details})},addEventListener:()=>{},maplibregl:null};
const document={title:'Pad Grade Mapper v1.3.3 DEV'};
const location={href:'https://appassets.androidplatform.net/assets/index.html'};
const context={window,document,location,console,encodeURIComponent,decodeURIComponent,URL,RegExp,String,JSON,Object,Number,Array,Date,Math,setTimeout,clearTimeout};
context.globalThis=context;
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'v132-imagery-quality.js'),'utf8');
vm.runInContext(source,context,{filename:'v132-imagery-quality.js'});

const api=window.PadGradeImageryV134;
assert(api);
assert.strictEqual(api.version,'1.3.4');
assert.strictEqual(document.title,'Pad Grade Mapper v1.3.4 DEV');

const base='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage'
  +'?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256'
  +'&format=jpgpng&transparent=false&f=image&renderingRule=%7B%22rasterFunction%22%3A%22NaturalColor%22%7D';
const upgraded=api.upgradeTileUrl(base);
assert(/size=512,512/i.test(upgraded));
assert(/compressionQuality=95/i.test(upgraded));
assert(/interpolation=RSP_CubicConvolution/i.test(upgraded));
const proof=api.classifyHighResRequest(upgraded);
assert(proof&&proof.size512&&proof.resolutionFirst&&proof.cubic&&proof.naturalColor&&proof.quality95&&proof.policy);
const legacy=api.classifyHighResRequest(base);
assert(legacy&&legacy.size256&&!legacy.policy);

const match=upgraded.match(/[?&]mosaicRule=([^&]+)/i);
assert(match);
const rule=JSON.parse(decodeURIComponent(match[1]));
assert.strictEqual(rule.mosaicMethod,'esriMosaicAttribute');
assert.strictEqual(rule.sortField,'resolution_value');
assert.strictEqual(rule.sortValue,0);
assert.strictEqual(rule.mosaicOperation,'MT_FIRST');

for(const s of ['imagery.v134-live-request-policy-observed','imagery.v134-live-request-summary','imagery.v134-source-selection-proof','/identify','comparesResolutionFirstToServiceDefault','policyActuallyObservedOnLiveRequests','coordinatesLogged:false','urlsLogged:false'])assert(source.includes(s),s);
assert(!/arcgisonline|world_imagery/i.test(source));
const other='https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
assert.strictEqual(api.upgradeTileUrl(other),other);
console.log('v1.3.4 imagery diagnostic regression passed');
