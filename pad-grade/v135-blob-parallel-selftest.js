/* v1.3.5 regression: bundled Blob workers preserve exact band math, retain the
 * atomic whole-frame presentation boundary, and open only the exact USGS NAIP
 * Plus identify endpoint needed for source-resolution diagnostics.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const surface=require('./surface-local-v078.js');

const coordinator=fs.readFileSync(path.join(__dirname,'heatmap-raster-worker-v135.js'),'utf8');
const band=fs.readFileSync(path.join(__dirname,'heatmap-raster-band-worker-v135.js'),'utf8');
const surfaceSource=fs.readFileSync(path.join(__dirname,'surface-local-v078.js'),'utf8');
const privacy=fs.readFileSync(path.join(__dirname,'privacy.js'),'utf8');
const stripComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const bandCode=stripComments(band);

// The exact Android field-log workaround: fetch local source, build one Blob,
// and spawn children from that Blob URL instead of the external appassets URL.
for(const token of [
  "heatmap-raster-band-worker-v135.js?v=20260901-1",
  'prepareBundledWorkerBlob',
  'new Blob([source]',
  'URL.createObjectURL',
  'new Worker(coordinator.blobUrl)',
  "childWorkerKind:'blob-bundled-v135'",
  'blobPrepElapsedMs',
  'blobSourceBytes',
  'partialFramesPublished:0',
  'bandFramesPublished:0',
  'coordinator.remaining>0)return'
])assert(coordinator.includes(token),token);
assert(!coordinator.includes('new Worker(BAND_SOURCE_URL)'));
assert(!coordinator.includes('new Worker(BAND_URL)'));

// Child workers are compute-only and self-contained once surface source is
// prepended. No external import and no visible-row/canvas publication path.
for(const token of [
  "stage('script-entered'",
  "stage('surface-bundled'",
  "stage('handler-ready'",
  "stage('build-received'",
  "stage('raster-start'",
  "type:'band-complete'"
])assert(band.includes(token),token);
assert(!bandCode.includes('importScripts('));
assert(!bandCode.includes('new Worker('));
assert(!/maplibre|canvas/i.test(bandCode));
new vm.Script(`${surfaceSource}\n;\n${band}\n//# sourceURL=pad-grade-heat-band-v135-bundle.js`);

// Privacy stays default-deny. Only the exact same USGS NAIP Plus identify
// endpoint used by the diagnostic is newly permitted; no host-wide wildcard.
const identify="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/identify";
const exportImage="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage";
assert(privacy.includes(`'${identify}'`));
assert(privacy.includes(`'${exportImage}'`));
assert(privacy.includes('networkBlockedByDefault:true'));
assert(!privacy.includes("'https://imagery.nationalmap.gov/'"));
assert(!privacy.includes("'https://imagery.nationalmap.gov/arcgis/'"));

// Seven bands must reconstruct the exact same 891 interpolation as one whole
// raster: no row gaps, overlap, seam change, or alternate interpolation math.
const nx=18,ny=891,width=64,length=76,n=7,points=[];
for(let r=0;r<4;r++)for(let col=0;col<4;col++)points.push({x:col*width/3,y:r*length/3,v:36.25+col*1.7+r*.85+((r+col)%2)*.2,r,c:col});
const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
const values=new Float64Array(nx*ny);values.fill(NaN);
const counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);
let cells=0,last=0;
for(let i=0;i<n;i++){
  const start=Math.floor(i*ny/n),end=Math.floor((i+1)*ny/n),rows=end-start;
  assert.strictEqual(start,last,'bands must be contiguous');last=end;
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
  assert.strictEqual(counts[i],whole.counts[i],`count mismatch ${i}`);
  assert.strictEqual(mask[i],whole.mask[i],`mask mismatch ${i}`);
  const a=values[i],b=whole.values[i];
  if(Number.isNaN(a)||Number.isNaN(b))assert(Number.isNaN(a)&&Number.isNaN(b),`NaN mismatch ${i}`);
  else assert(Math.abs(a-b)<1e-9,`value mismatch ${i}`);
}
console.log('v1.3.5 Blob parallel regression passed: exact 7-band math, compute-only child, atomic final gate, scoped USGS identify permission.');
