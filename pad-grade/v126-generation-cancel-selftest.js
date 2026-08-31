'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'v126-dev.js'),'utf8');

class FakeMessageEvent{constructor(type,init={}){this.type=type;this.data=init.data;}}
class FakeWorker{
  constructor(url){this.url=url;this.listeners={};this.posts=[];this.terminated=false;this.__pg113HeatWorker=false;}
  addEventListener(name,fn){(this.listeners[name]||(this.listeners[name]=[])).push(fn);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn.call(this,event);if(event.type==='message'&&typeof this.onmessage==='function')this.onmessage(event);return true;}
  postMessage(message){this.posts.push(message);}
  terminate(){this.terminated=true;}
}
const raf=[];let nativeCloseCount=0;
function HTMLDialogElement(){}
HTMLDialogElement.prototype.close=function(){nativeCloseCount++;this.open=false;};
const dialog=Object.create(HTMLDialogElement.prototype);dialog.open=true;dialog.removeAttribute=()=>{dialog.open=false;};
const marks=[];
const document={title:'',readyState:'complete',getElementById:id=>id==='projectsDlg'?dialog:null,addEventListener(){}};
const localStorage={getItem:key=>key==='padGradeActiveProjectIdV5'?'project-a':null};
const windowObj={Worker:FakeWorker,PadGradeDiag:{mark:(n,d)=>marks.push([n,d])},document,localStorage,performance:{now:()=>100},requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},addEventListener(){}};
windowObj.window=windowObj;
const ctx={window:windowObj,document,localStorage,performance:windowObj.performance,requestAnimationFrame:windowObj.requestAnimationFrame,HTMLDialogElement,MessageEvent:FakeMessageEvent,setTimeout,clearTimeout,console};
vm.runInNewContext(code,ctx,{filename:'v126-dev.js'});

// Redirected v078 workers must be repaired into v113-recognized heat workers.
const w99=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
assert.strictEqual(w99.__pg113HeatWorker,true,'redirected heat worker was not re-identified for v113 cache/preemption');
const build99={type:'build',context:'regular',jobId:'j99',tier:99,settings:{width:64,length:76,target:64,tol:.5},points:[{x:0,y:0,v:64},{x:64,y:0,v:65},{x:0,y:76,v:63}]};
w99.postMessage(build99);
assert.strictEqual(w99.posts.length,1,'regular build did not reach parent worker');

// Same project/surface/tier may never own two CPU workers simultaneously.
const w99b=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
w99b.postMessage({...build99,jobId:'j99b'});
assert.strictEqual(w99.terminated,true,'older duplicate tier worker was not actively terminated');
let snap=windowObj.PadGradeHeatGenerationV126.snapshot();
assert.strictEqual(snap.activeJobs,1,'duplicate tier produced more than one active worker');
assert.strictEqual(Array.from(snap.tiers).join(','),'99');

// Add the companion 297 worker; one generation may own one worker per tier.
const w297=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
w297.postMessage({...build99,jobId:'j297',tier:297});
snap=windowObj.PadGradeHeatGenerationV126.snapshot();
assert.strictEqual(snap.activeJobs,2);
assert.strictEqual(Array.from(snap.tiers).join(','),'99,297');
assert.strictEqual(windowObj.PadGradeHeatGenerationV126.assertInvariant('selftest'),true);

// Switch start alone does not cancel: load could still fail. Once outgoing visuals are
// confirmed hidden, both currently running workers must be terminated immediately.
windowObj.PadGradeDiag.mark('project.switch-v113-start',{from:'project-a',to:'project-b'});
assert.strictEqual(w99b.terminated,false);
dialog.close();
assert.strictEqual(nativeCloseCount,0,'dialog closed before outgoing overlays were removed');
windowObj.PadGradeDiag.mark('project.switch-outgoing-hidden',{elapsedMs:1});
assert.strictEqual(w99b.terminated,true,'99 worker survived outgoing-project removal');
assert.strictEqual(w297.terminated,true,'297 worker survived outgoing-project removal');
snap=windowObj.PadGradeHeatGenerationV126.snapshot();
assert.strictEqual(snap.activeJobs,0,'cancelled generation still owns active jobs');
assert.strictEqual(raf.length,1,'outgoing paint barrier did not schedule first frame');
raf.shift()();assert.strictEqual(nativeCloseCount,0);assert.strictEqual(raf.length,1);
raf.shift()();assert.strictEqual(nativeCloseCount,1,'dialog did not close after outgoing-only two-frame barrier');
assert(!marks.some(([n])=>n==='project.switch-dialog-closed-after-target-paint'),'v1.2.5 target-paint close path should not be authoritative');
assert(marks.some(([n])=>n==='heatmap.v126-generation-cancelled'),'generation cancellation diagnostic missing');
assert(marks.some(([n])=>n==='project.switch-dialog-closed-after-outgoing-paint'),'outgoing-only close diagnostic missing');

// Cache-hit terminal from v113 is explicitly recognized as lower-tier suppression.
const wCache=new windowObj.Worker('heatmap-raster-worker-v078.js?v=x');
wCache.postMessage({...build99,jobId:'cache99'});
wCache.dispatchEvent(new FakeMessageEvent('message',{data:{type:'empty',jobId:'cache99',tier:99,cacheHit:true}}));
assert(marks.some(([n,d])=>n==='heatmap.v126-lower-tier-skipped-final-cache'&&d.tier===99),'cache-hit lower-tier suppression diagnostic missing');

console.log('Pad Grade v1.2.6 generation cancellation self-test passed');
