/* v1.4.2+ regression: every heat producer uses the local surface engine and
 * legacy global-IDW caches cannot be admitted as current heat.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const surface=require('./surface-local-v078.js');

const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const v113=read('v113-dev.js');
const v130=read('v130-dev.js');
const v078=read('heatmap-raster-worker-v078.js');
const v136=read('heatmap-raster-worker-v136.js');
const index=read('index.html');
const gradle=read('../pad-grade-android/app/build.gradle.kts');

for(const token of [
  "const CACHE_VERSION=2",
  "const CACHE_ENGINE='local-surface-v078-edge-locked'",
  "const WORKER_URL='heatmap-raster-worker-v078.js?v=20260826-2'",
  'raw.engine!==CACHE_ENGINE',
  'engine:CACHE_ENGINE'
])assert(v113.includes(token),`v113 missing ${token}`);
assert(!v113.includes("const WORKER_URL='heatmap-raster-worker-v073.js"),'background/inspector must not use global-IDW v073');
for(const token of [
  "const CACHE_VERSION=2",
  "const CACHE_ENGINE='local-surface-v078-edge-locked'",
  'raw.engine!==CACHE_ENGINE'
])assert(v130.includes(token),`v130 missing ${token}`);
assert(v078.includes("importScripts('surface-local-v078.js?v=20260826-2')"));
assert(v078.includes('PadGradeLocalSurface.rasterize'));
assert(v136.includes("const SURFACE_URL=new URL('surface-local-v078.js?v=20260826-2'"));
assert(v136.includes('PadGradeLocalSurface.rasterize'));

// This gate protects the v1.4.2 heat architecture across later DEV releases;
// ordinary version bumps must not make the heat regression itself fail.
const titleMatch=index.match(/<title>Pad Grade Mapper v(\d+)\.(\d+)\.(\d+) DEV<\/title>/);
assert(titleMatch,'DEV page title/version missing');
const titleVersion=titleMatch.slice(1).map(Number);
const versionAtLeast=(v,a,b,c)=>v[0]>a||(v[0]===a&&(v[1]>b||(v[1]===b&&v[2]>=c)));
assert(versionAtLeast(titleVersion,1,4,2),`heat consistency gate requires DEV v1.4.2+, found ${titleVersion.join('.')}`);
const codeMatch=gradle.match(/versionCode\s*=\s*(\d+)/),nameMatch=gradle.match(/versionName\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
assert(codeMatch&&nameMatch,'Android version metadata missing');
const gradleVersion=nameMatch.slice(1).map(Number);
assert(versionAtLeast(gradleVersion,1,4,2),`Android version must be v1.4.2+, found ${gradleVersion.join('.')}`);
assert(Number(codeMatch[1])>=113,`Android build must be 113+, found ${codeMatch[1]}`);
assert.deepStrictEqual(gradleVersion,titleVersion,'web and Android semantic versions must match');

// A local triangle made entirely of on-grade measurements must not be pulled
// off grade by distant measurements outside its support.
const target=64;
const localTriangle=[
  {x:0,y:0,v:target},
  {x:10,y:0,v:target},
  {x:0,y:10,v:target},
  {x:35,y:35,v:84},
  {x:40,y:10,v:44}
];
const center=surface.interpolateAt(2.5,2.5,localTriangle,true);
assert(center&&Number.isFinite(center.value));
assert(Math.abs(center.value-target)<1e-9,`local triangle was influenced by distant points: ${center.value}`);

// Edge locking: an on-grade measured edge remains on grade even when the other
// two measured corners of the promoted rectangle are strongly off grade.
const rectangle=[
  {x:0,y:0,v:target,r:0,c:0},
  {x:10,y:0,v:target,r:0,c:1},
  {x:0,y:10,v:74,r:1,c:0},
  {x:10,y:10,v:74,r:1,c:1}
];
for(const x of [1,2.5,5,7.5,9]){
  const edge=surface.interpolateAt(x,0,rectangle,true);
  assert(edge&&Number.isFinite(edge.value));
  assert(Math.abs(edge.value-target)<1e-9,`edge lock failed at x=${x}: ${edge.value}`);
}

// The v1.3.6 band split must remain numerically identical to one whole local
// raster, proving foreground parallel output and whole-worker background output
// are the same surface definition.
function proveBandEquivalence(nx,ny,width,length,points,nWorkers=7){
  const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
  const values=new Float64Array(nx*ny);values.fill(NaN);
  const counts=new Uint16Array(nx*ny);
  let last=0,cells=0;
  for(let i=0;i<nWorkers;i++){
    const start=Math.floor(i*ny/nWorkers),end=Math.floor((i+1)*ny/nWorkers),rows=end-start;
    assert.strictEqual(start,last);last=end;
    if(!rows)continue;
    const bottom=length-(end/ny)*length,bandLength=(rows/ny)*length;
    const translated=points.map(p=>({...p,y:p.y-bottom}));
    const part=surface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
    cells+=part.cells;
    for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){
      const src=row*nx+col,dst=(start+row)*nx+col;
      values[dst]=part.values[src];counts[dst]=part.counts[src];
    }
  }
  assert.strictEqual(last,ny);assert.strictEqual(cells,whole.cells);
  for(let i=0;i<whole.values.length;i++){
    assert.strictEqual(counts[i],whole.counts[i],`count mismatch ${i}`);
    const a=values[i],b=whole.values[i];
    if(Number.isNaN(a)||Number.isNaN(b))assert(Number.isNaN(a)&&Number.isNaN(b),`NaN mismatch ${i}`);
    else assert(Math.abs(a-b)<1e-9,`value mismatch ${i}: ${a} vs ${b}`);
  }
}
const width=64,length=76,points=[];
for(let r=0;r<5;r++)for(let c=0;c<5;c++)points.push({x:c*width/4,y:r*length/4,v:58+r*1.7+c*.8+((r+c)%3)*.25,r,c});
for(const tier of [99,297,891]){
  const nx=18,ny=tier;
  proveBandEquivalence(nx,ny,width,length,points,7);
}

console.log(`v1.4.2+ heat regression passed on v${titleVersion.join('.')}: foreground/background/inspector share local-surface-v078; cache schema v2 rejects ambiguous legacy heat; local/edge/band invariants hold.`);
