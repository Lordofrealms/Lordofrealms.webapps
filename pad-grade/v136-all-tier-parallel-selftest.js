/* v1.3.6 regression: all progressive tiers use the same atomic Blob-band math,
 * no sequential benchmark is added, and imagery diagnostics preserve unknown
 * resolution values while independently querying the best positive candidate.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const surface=require('./surface-local-v078.js');

const coordinator=fs.readFileSync(path.join(__dirname,'heatmap-raster-worker-v136.js'),'utf8');
const band=fs.readFileSync(path.join(__dirname,'heatmap-raster-band-worker-v136.js'),'utf8');
const surfaceSource=fs.readFileSync(path.join(__dirname,'surface-local-v078.js'),'utf8');
const imagery=fs.readFileSync(path.join(__dirname,'v132-imagery-quality.js'),'utf8');
const privacy=fs.readFileSync(path.join(__dirname,'privacy.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const stripComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const bandCode=stripComments(band);

for(const token of [
  'const PARALLEL_TIERS=new Set([99,297,891])',
  "heatmap-raster-band-worker-v136.js?v=20260901-1",
  "childWorkerKind:'blob-bundled-v136'",
  "parallelTierPolicy:'99-297-891'",
  'sequentialBenchmarkRun:false',
  'atomicFinalBuffer:true',
  'partialFramesPublished:0',
  'bandFramesPublished:0',
  'coordinator.remaining>0)return'
])assert(coordinator.includes(token),token);
assert(!coordinator.includes('if((+msg.tier||0)===891)'));
assert(!coordinator.includes('sequentialReference'));
assert(!coordinator.includes('benchmarkSequential'));
assert(!bandCode.includes('importScripts('));
assert(!bandCode.includes('new Worker('));
assert(!/maplibre|canvas/i.test(bandCode));
new vm.Script(`${surfaceSource}\n;\n${band}\n//# sourceURL=pad-grade-heat-band-v136-bundle.js`);

const width=64,length=76,nWorkers=7,points=[];
for(let r=0;r<4;r++)for(let col=0;col<4;col++)points.push({x:col*width/3,y:r*length/3,v:36.25+col*1.7+r*.85+((r+col)%2)*.2,r,c:col});

function proveTier(ny){
  const nx=18;
  const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
  const values=new Float64Array(nx*ny);values.fill(NaN);
  const counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);
  let cells=0,last=0;
  for(let i=0;i<nWorkers;i++){
    const start=Math.floor(i*ny/nWorkers),end=Math.floor((i+1)*ny/nWorkers),rows=end-start;
    assert.strictEqual(start,last,`tier ${ny}: contiguous bands`);last=end;
    const bottom=length-(end/ny)*length,bandLength=(rows/ny)*length;
    const translated=points.map(q=>({...q,y:q.y-bottom}));
    const part=surface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});cells+=part.cells;
    for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){
      const src=row*nx+col,dst=(start+row)*nx+col;
      values[dst]=part.values[src];counts[dst]=part.counts[src];mask[dst]=part.mask[src];
    }
  }
  assert.strictEqual(last,ny);assert.strictEqual(cells,whole.cells);
  for(let i=0;i<whole.values.length;i++){
    assert.strictEqual(counts[i],whole.counts[i],`tier ${ny} count mismatch ${i}`);
    assert.strictEqual(mask[i],whole.mask[i],`tier ${ny} mask mismatch ${i}`);
    const a=values[i],b=whole.values[i];
    if(Number.isNaN(a)||Number.isNaN(b))assert(Number.isNaN(a)&&Number.isNaN(b),`tier ${ny} NaN mismatch ${i}`);
    else assert(Math.abs(a-b)<1e-9,`tier ${ny} value mismatch ${i}`);
  }
}
for(const tier of [99,297,891])proveTier(tier);

// Evaluate diagnostic API without MapLibre/network so we can exercise parsing.
const marks=[];
const window={PadGradeDiag:{mark:(name,details)=>marks.push({name,details})},addEventListener:()=>{},maplibregl:null};
const document={title:'Pad Grade Mapper v1.3.5 DEV'};
const location={href:'https://appassets.androidplatform.net/assets/index.html'};
const context={window,document,location,console,encodeURIComponent,decodeURIComponent,URL,RegExp,String,JSON,Object,Number,Array,Date,Math,setTimeout,clearTimeout};
context.globalThis=context;vm.createContext(context);vm.runInContext(imagery,context,{filename:'v132-imagery-quality.js'});
const api=window.PadGradeImageryV136;
assert(api);assert.strictEqual(api.version,'1.3.6');assert.strictEqual(document.title,'Pad Grade Mapper v1.3.6 DEV');
assert.strictEqual(api.finiteNumber(null),null);assert.strictEqual(api.finiteNumber(undefined),null);assert.strictEqual(api.finiteNumber(''),null);assert.strictEqual(api.finiteNumber('0.3'),0.3);
const missing=api.itemSummary({attributes:{OBJECTID:1,resolution_value:null,resolution_units:null}});
assert.strictEqual(missing.resolutionMeters,undefined);assert.notStrictEqual(missing.resolutionMeters,0);
const zero=api.itemSummary({attributes:{OBJECTID:2,resolution_value:0,resolution_units:'m'}});
assert.strictEqual(zero.resolutionValue,0);assert.strictEqual(zero.resolutionMeters,undefined);
const good=api.itemSummary({attributes:{OBJECTID:3,resolution_value:.3,resolution_units:'m',MinPS:.3,MaxPS:1200}});
assert.strictEqual(good.resolutionMeters,.3);assert.strictEqual(good.minPS,.3);
const q=new URL(api.bestPositiveQueryUrl({lng:-97.5,lat:35.4}));
assert(/\/USGSNAIPPlus\/ImageServer\/query$/i.test(q.pathname));
assert.strictEqual(q.searchParams.get('where'),'resolution_value > 0');
assert.strictEqual(q.searchParams.get('orderByFields'),'resolution_value ASC');
assert(imagery.includes('selectedMatchesBestPositive'));
assert(imagery.includes("selectionVerdict"));
assert(imagery.includes('diagnosticNullToZeroBugFixed:true'));

const queryEndpoint='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/query';
assert(privacy.includes(`'${queryEndpoint}'`));
assert(privacy.includes('networkBlockedByDefault:true'));
assert(!privacy.includes("'https://imagery.nationalmap.gov/'"));
// The v1.3.6 behavior is carried forward by later DEV builds, so do not pin the
// page title to v1.3.6 here; only require the expected Pad Grade DEV title shape.
assert(/<title>Pad Grade Mapper v1\.3\.\d+ DEV<\/title>/.test(index));
assert(index.includes('privacy.js?v=20260901-2'));
assert(index.includes('v132-worker-bootstrap-fix.js?v=20260901-3'));
assert(index.includes('v132-imagery-quality.js?v=20260901-2'));

console.log('v1.3.6 regression passed: 99/297/891 band math is exact and atomic; imagery null parsing + best-positive catalog proof are active.');
