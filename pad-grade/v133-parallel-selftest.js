/* v1.3.3 regression: dedicated heat bands remain mathematically identical
 * to a monolithic raster and can never publish partial visible frames.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const surface=require('./surface-local-v078.js');

const coordinator=fs.readFileSync(path.join(__dirname,'heatmap-raster-worker-v133.js'),'utf8');
const bandWorker=fs.readFileSync(path.join(__dirname,'heatmap-raster-band-worker-v133.js'),'utf8');
const stripComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
const bandCode=stripComments(bandWorker);

assert(coordinator.includes("heatmap-raster-band-worker-v133.js?v=20260901-1"));
assert(coordinator.includes("childWorkerKind:'dedicated-v133'"));
assert(coordinator.includes('partialFramesPublished:0'));
assert(coordinator.includes('bandFramesPublished:0'));
assert(coordinator.includes("if(activeCoordinator!==coordinator||coordinator.cancelled||coordinator.remaining>0)return;"));
assert(!coordinator.includes("if(msg.type==='build-band')"));
assert(!coordinator.includes("type:'band-complete'"));
assert(!bandCode.includes('new Worker('));
assert(!/maplibre/i.test(bandCode));
assert(!/canvas/i.test(bandCode));
assert(bandWorker.includes("type:'band-complete'"));
assert(bandWorker.includes('Compute transport only'));

const nx=18,ny=891,width=64,length=76,workers=7;
const points=[];
for(let r=0;r<4;r++)for(let c=0;c<4;c++){
  const x=c*width/3,y=r*length/3;
  points.push({x,y,v:36.25+c*1.7+r*.85+((r+c)%2)*.2,r,c,label:`${r},${c}`});
}

const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
assert(whole.cells>0);
const values=new Float64Array(nx*ny);values.fill(NaN);
const counts=new Uint16Array(nx*ny);
const mask=new Uint8Array(nx*ny);
let cells=0,lastEnd=0;

for(let i=0;i<workers;i++){
  const startRow=Math.floor(i*ny/workers);
  const endRow=Math.floor((i+1)*ny/workers);
  assert.strictEqual(startRow,lastEnd,'bands must be contiguous with no row gaps/overlap');
  lastEnd=endRow;
  const rows=endRow-startRow;
  const yBottom=length-(endRow/ny)*length;
  const bandLength=(rows/ny)*length;
  const translated=points.map(p=>({...p,y:p.y-yBottom}));
  const part=surface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
  cells+=part.cells;
  for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){
    const src=row*nx+col,dst=(startRow+row)*nx+col;
    values[dst]=part.values[src];counts[dst]=part.counts[src];mask[dst]=part.mask[src];
  }
}
assert.strictEqual(lastEnd,ny);
assert.strictEqual(cells,whole.cells);

for(let i=0;i<whole.values.length;i++){
  assert.strictEqual(counts[i],whole.counts[i],`count mismatch at ${i}`);
  assert.strictEqual(mask[i],whole.mask[i],`mask mismatch at ${i}`);
  const a=values[i],b=whole.values[i];
  if(Number.isNaN(a)||Number.isNaN(b))assert(Number.isNaN(a)&&Number.isNaN(b),`NaN mismatch at ${i}`);
  else assert(Math.abs(a-b)<1e-9,`value mismatch at ${i}: ${a} vs ${b}`);
}
console.log('v1.3.3 parallel heat regression passed: 7 bands exactly reproduce whole raster; no partial presentation path.');
