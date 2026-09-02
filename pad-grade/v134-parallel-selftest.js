'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),surface=require('./surface-local-v078.js');
const c=fs.readFileSync(path.join(__dirname,'heatmap-raster-worker-v134.js'),'utf8');
const b=fs.readFileSync(path.join(__dirname,'heatmap-raster-band-worker-v134.js'),'utf8');
const executable=b.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
for(const s of ["heatmap-raster-band-worker-v134.js?v=20260901-1","childWorkerKind:'dedicated-v134'",'nestedBlobProbe','assetProbe(BAND_URL)','assetProbe(SURFACE_URL)','partialFramesPublished:0','bandFramesPublished:0'])assert(c.includes(s),s);
for(const s of ["stage('script-entered'","stage('surface-imported'","stage('handler-ready'","stage('build-received'","stage('raster-start'","type:'band-bootstrap-error'","type:'band-complete'"])assert(b.includes(s),s);
assert(!executable.includes('new Worker('));
assert(!/maplibre|canvas/i.test(executable));

const nx=18,ny=891,width=64,length=76,n=7,points=[];
for(let r=0;r<4;r++)for(let col=0;col<4;col++)points.push({x:col*width/3,y:r*length/3,v:36.25+col*1.7+r*.85+((r+col)%2)*.2,r,c:col});
const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
const values=new Float64Array(nx*ny);values.fill(NaN);
const counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);
let cells=0,last=0;
for(let i=0;i<n;i++){
 const start=Math.floor(i*ny/n),end=Math.floor((i+1)*ny/n),rows=end-start;
 assert.strictEqual(start,last);last=end;
 const bottom=length-(end/ny)*length,bl=(rows/ny)*length;
 const p=points.map(q=>({...q,y:q.y-bottom}));
 const part=surface.rasterize({nx,ny:rows,width,length:bl,points:p,flipY:true});cells+=part.cells;
 for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){const s=row*nx+col,d=(start+row)*nx+col;values[d]=part.values[s];counts[d]=part.counts[s];mask[d]=part.mask[s];}
}
assert.strictEqual(last,ny);assert.strictEqual(cells,whole.cells);
for(let i=0;i<whole.values.length;i++){
 assert.strictEqual(counts[i],whole.counts[i]);assert.strictEqual(mask[i],whole.mask[i]);
 const a=values[i],z=whole.values[i];if(Number.isNaN(a)||Number.isNaN(z))assert(Number.isNaN(a)&&Number.isNaN(z));else assert(Math.abs(a-z)<1e-9);
}
console.log('v1.3.4 parallel diagnostics regression passed');
