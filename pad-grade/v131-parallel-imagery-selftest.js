'use strict';
const fs=require('fs');
const assert=require('assert');
const path=require('path');
const root=__dirname;
const surface=require(path.join(root,'surface-local-v078.js'));
const worker=fs.readFileSync(path.join(root,'heatmap-raster-worker-v131.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'v131-dev.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const gradle=fs.readFileSync(path.join(root,'../pad-grade-android/app/build.gradle.kts'),'utf8');

assert(worker.includes("desiredComputeWorkers(){return Math.max(1,hardwareConcurrency()-1);}"),'891 worker policy must be max(1, hardwareConcurrency - 1)');
assert(worker.includes("if((+msg.tier||0)===891)startParallel(msg);else buildWhole(msg);"),'only 891 should enter parallel path');
assert(worker.includes("type:'complete'"),'coordinator must publish one complete final buffer');
assert(worker.includes("type:'build-band'"),'parallel work must be partitioned into independent bands');
assert(runtime.includes('atomicFinalBuffer:true'),'runtime must explicitly preserve atomic final presentation');
assert(runtime.includes('protectedV122PresenterUnchanged:true'),'protected v1.2.2 presenter must remain unchanged');
assert(runtime.includes('imagery.v131-resource-summary'),'resource timing summary diagnostics missing');
assert(runtime.includes('imagery.v131-source-activity'),'MapLibre source activity diagnostics missing');
assert(runtime.includes('imagery.v131-highres-probe-slow'),'late NAIP probe threshold diagnostic missing');
assert(runtime.includes('matchesConfiguredNaturalColorRequest:true'),'high-res probe must match configured NaturalColor request');
assert(index.includes('v131-dev.js?v=20260901-1'),'v1.3.1 runtime must be linked');
assert(index.includes('Pad Grade Mapper v1.3.1 DEV'),'index title must match v1.3.1');
assert(/versionCode\s*=\s*103\b/.test(gradle),'Android build must be 103');
assert(/versionName\s*=\s*"1\.3\.1"/.test(gradle),'Android version must be 1.3.1');

function points(){
  const out=[];
  const rows=5,cols=5,width=64,length=76;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const x=c*width/(cols-1),y=r*length/(rows-1);
    const v=64 + Math.sin((r+1)*0.7)*1.8 + Math.cos((c+1)*0.55)*1.3 + r*c*0.035;
    out.push({x,y,v,r,c,label:`${r},${c}`});
  }
  return out;
}
function splitRaster(nx,ny,width,length,pts,count){
  const values=new Float64Array(nx*ny),counts=new Uint16Array(nx*ny),mask=new Uint8Array(nx*ny);values.fill(NaN);
  let cells=0;
  for(let i=0;i<count;i++){
    const start=Math.floor(i*ny/count),end=Math.floor((i+1)*ny/count),rows=end-start;if(!rows)continue;
    const yBottom=length-(end/ny)*length,bandLength=(rows/ny)*length;
    const translated=pts.map(p=>({...p,y:p.y-yBottom}));
    const band=surface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
    for(let by=0;by<rows;by++)for(let x=0;x<nx;x++){
      const bo=by*nx+x,go=(start+by)*nx+x;
      values[go]=band.values[bo];counts[go]=band.counts[bo];mask[go]=band.mask[bo];
    }
    cells+=band.cells;
  }
  return {values,counts,mask,cells};
}
function compare(count){
  const nx=61,ny=73,width=64,length=76,pts=points();
  const whole=surface.rasterize({nx,ny,width,length,points:pts,flipY:true});
  const split=splitRaster(nx,ny,width,length,pts,count);
  assert.strictEqual(split.cells,whole.cells,`cell count mismatch for ${count} bands`);
  for(let i=0;i<whole.values.length;i++){
    assert.strictEqual(split.counts[i],whole.counts[i],`tie count mismatch at ${i}, bands=${count}`);
    assert.strictEqual(split.mask[i],whole.mask[i],`mask mismatch at ${i}, bands=${count}`);
    const a=whole.values[i],b=split.values[i];
    if(Number.isNaN(a)||Number.isNaN(b)){assert(Number.isNaN(a)&&Number.isNaN(b),`NaN mismatch at ${i}, bands=${count}`);continue;}
    assert(Math.abs(a-b)<1e-10,`surface mismatch at ${i}, bands=${count}: ${a} vs ${b}`);
  }
}
for(const count of [1,2,3,4,7,12])compare(count);

console.log('Pad Grade v1.3.1 parallel heat / imagery self-test passed');
