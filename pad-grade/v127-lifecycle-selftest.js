'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'v127-dev.js'),'utf8');

class FakeMessageEvent{constructor(type,init={}){this.type=type;this.data=init.data;}}
class FakeWorker{
  constructor(url){this.url=url;this.listeners={};this.posts=[];this.terminated=false;}
  addEventListener(name,fn){(this.listeners[name]||(this.listeners[name]=[])).push(fn);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn.call(this,event);if(event.type==='message'&&typeof this.onmessage==='function')this.onmessage(event);return true;}
  postMessage(message){this.posts.push(message);}
  terminate(){this.terminated=true;}
}
function classList(){const s=new Set();return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x),_set:s};}
const rootClass=classList(),marks=[],windowListeners={};
const styleHost={appendChild(){}};
const document={
  title:'',readyState:'complete',__padGradeV127MutationCapture:false,documentElement:{classList:rootClass},head:styleHost,
  createElement(tag){return tag==='style'?{id:'',textContent:'',remove(){}}:{width:0,height:0};},
  getElementById(){return null;},addEventListener(){},querySelector(){return null;}
};
const store=new Map([
  ['padGradeActiveProjectIdV5','project-a'],
  ['padGradeProjectV5:project-a',JSON.stringify({id:'project-a',measureMode:'manual',settings:{width:64,length:76,target:64,tol:.5}})]
]);
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
let points=[{x:0,y:0,v:64},{x:64,y:0,v:65},{x:0,y:76,v:63}];
const cfg=()=>({width:64,length:76,target:64,tol:.5});
const raf=[];
const windowObj={
  Worker:FakeWorker,PadGradeDiag:{mark:(n,d)=>marks.push([n,d])},PadGradeHeatGenerationV126:{cancel:()=>0},
  document,localStorage,cfg,pgMeasuredSurfacePoints:()=>points,performance:{now:()=>100},
  requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},
  addEventListener(name,fn){(windowListeners[name]||(windowListeners[name]=[])).push(fn);},
  dispatchEvent(event){for(const fn of windowListeners[event.type]||[])fn.call(this,event);return true;},
  __padGradeBeginRecoveryVisualHold(){rootClass.add('padGradeRecoveryHold');},
  __padGradeEndRecoveryVisualHold(){rootClass.remove('padGradeRecoveryHold');}
};
windowObj.window=windowObj;
function CustomEvent(type,init={}){this.type=type;this.detail=init.detail;}
const ctx={window:windowObj,document,localStorage,performance:windowObj.performance,requestAnimationFrame:windowObj.requestAnimationFrame,MessageEvent:FakeMessageEvent,CustomEvent,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},console};
vm.runInNewContext(code,ctx,{filename:'v127-dev.js'});

// Patch a fake MapLibre instance through the same map-created event used by the app.
const added=[];
const fakeMap={
  addSource(id,spec){added.push([id,spec]);return this;},
  getCanvas(){return {width:400,height:300,getBoundingClientRect(){return {width:400,height:300};}};},
  once(){},triggerRepaint(){},loaded(){return false;},isStyleLoaded(){return false;}
};
windowObj.__padGradeMapInstance=fakeMap;
windowObj.dispatchEvent(new CustomEvent('padgrade-map-created',{detail:{map:fakeMap}}));
assert.strictEqual(fakeMap.__padGradeV127ProvenanceGuard,true,'map provenance guard was not installed');

const build={type:'build',context:'regular',jobId:1,tier:99,settings:cfg(),points};
const w99=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
w99.postMessage(build);
assert.strictEqual(w99.posts.length,1,'99 tier should forward immediately');
const w297=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
w297.postMessage({...build,jobId:2,tier:297});
assert.strictEqual(w297.posts.length,0,'297 tier must queue behind 99 in v1.2.7');
let snap=windowObj.PadGradeHeatGenerationV127.snapshot();
assert.strictEqual(snap.activeJobs.length,2);
assert(snap.activeJobs.some(x=>x.tier===297&&x.queued&&!x.forwarded));
w99.dispatchEvent(new FakeMessageEvent('message',{data:{type:'complete',jobId:1,tier:99,nx:83,ny:99}}));
assert.strictEqual(w297.posts.length,1,'297 tier was not released after current 99 completed');
assert(marks.some(([n])=>n==='heatmap.v127-sequential-tier-released'));

// The next 99 canvas is authorized by that completion and may feed the presenter.
const currentCanvas={width:83,height:99};
fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:currentCanvas,coordinates:[]});
assert.strictEqual(added.length,1,'current-generation canvas was incorrectly rejected');
assert(marks.some(([n])=>n==='heatmap.v127-canvas-provenance-bound'));

// A surface mutation must terminate active work before replacement work starts.
windowObj.PadGradeHeatGenerationV127.beforeSurfaceMutation('selftest-point-change');
assert.strictEqual(w297.terminated,true,'forwarded 297 worker survived point mutation');
assert(marks.some(([n,d])=>n==='heatmap.v127-mutation-cancel-first'&&d.reason==='selftest-point-change'));
assert(marks.some(([n])=>n==='heatmap.v127-worker-physically-terminated'));
points=[{x:0,y:0,v:64},{x:64,y:0,v:66},{x:0,y:76,v:63}];

// Re-adding the exact old canvas after the data changed must be a no-op.
fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:currentCanvas,coordinates:[]});
assert.strictEqual(added.length,1,'stale canvas reached MapLibre after surface mutation');
assert(marks.some(([n,d])=>n==='heatmap.v127-stale-canvas-suppressed'&&d.reason==='immutable-provenance-mismatch'));

// Cache hit from 99 must cancel the queued 297 without ever forwarding its raster work.
const build2={...build,jobId:3,points};
const c99=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');c99.postMessage(build2);
const c297=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');c297.postMessage({...build2,jobId:4,tier:297});
assert.strictEqual(c297.posts.length,0);
windowObj.PadGradeDiag.mark('heatmap.cache-hit',{projectId:'project-a',tier:891,nx:750,ny:891});
const cacheCanvas={width:750,height:891};
fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-1',{type:'canvas',canvas:cacheCanvas,coordinates:[]});
assert.strictEqual(added.length,2,'exact cached 891 canvas was incorrectly rejected');
c99.dispatchEvent(new FakeMessageEvent('message',{data:{type:'empty',jobId:3,tier:99,cacheHit:true}}));
assert.strictEqual(c297.posts.length,0,'cache-hit 297 unexpectedly reached raster worker');
assert.strictEqual(c297.terminated,true,'cache-hit queued 297 was not terminated');
assert(marks.some(([n])=>n==='heatmap.v127-lower-tier-skipped-final-cache'));

// Returning to a prior surface still may not revive a regular canvas from its old generation.
windowObj.PadGradeHeatGenerationV127.beforeSurfaceMutation('selftest-return-original');
points=[{x:0,y:0,v:64},{x:64,y:0,v:65},{x:0,y:76,v:63}];
fakeMap.addSource('pad-grade-interpolated-surface-canvas-source-0',{type:'canvas',canvas:currentCanvas,coordinates:[]});
assert.strictEqual(added.length,2,'old-generation 99 canvas revived when surface key returned');

// Startup UX contracts: first-run remains covered through storage selection and recovered
// GPS projects cannot release the curtain until the base MapLibre frame has rendered.
assert(code.includes('first-run-storage-unresolved'));
assert(code.includes('base-map-not-rendered'));
assert(code.includes('padgrade-base-map-rendered'));
assert(code.includes('padGradeFirstRunSetupV127'));
assert(code.includes("content:'Choose project storage to continue'"));
assert(code.includes('protectedV122PresentationUnchanged:true'));

console.log('Pad Grade v1.2.7 lifecycle/startup self-test passed');
