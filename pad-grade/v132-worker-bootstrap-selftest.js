'use strict';

const fs=require('fs');
const vm=require('vm');
const path=require('path');

class NativeWorker {
  constructor(url,options){
    this.constructedUrl=String(url||'');
    this.constructedOptions=options;
    this.nativePosts=[];
    this.terminated=false;
  }
  postMessage(message){this.nativePosts.push(message);}
  terminate(){this.terminated=true;}
  addEventListener(){}
  removeEventListener(){}
  dispatchEvent(){return true;}
}

// Reproduce the v1.3.1 redirect shape that returned a fresh parent Worker and
// therefore discarded a derived subclass prototype when used through super().
function BrokenV131Bootstrap(url,options){
  const next=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/.test(String(url||''))
    ?'heatmap-raster-worker-v131.js?v=20260901-1':url;
  return options===undefined?new NativeWorker(next):new NativeWorker(next,options);
}
BrokenV131Bootstrap.prototype=NativeWorker.prototype;
Object.setPrototypeOf(BrokenV131Bootstrap,NativeWorker);
BrokenV131Bootstrap.__padGradeV131WorkerBootstrap=true;
BrokenV131Bootstrap.__padGradeV131WorkerParent=NativeWorker;

const marks=[];
const context={
  window:{
    Worker:BrokenV131Bootstrap,
    PadGradeDiag:{mark:(name,details)=>marks.push({name,details})}
  },
  console
};
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'v132-worker-bootstrap-fix.js'),'utf8');
vm.runInContext(source,context,{filename:'v132-worker-bootstrap-fix.js'});

const Fixed=context.window.Worker;
if(!Fixed.__padGradeV132WorkerBootstrapFix)throw new Error('v1.3.2 bootstrap marker missing');

class LifecycleWorker extends Fixed {
  constructor(url,options){
    super(url,options);
    this.lifecycleConstructorRan=true;
  }
  postMessage(message){
    this.lifecyclePostMessageRan=true;
    return NativeWorker.prototype.postMessage.call(this,message);
  }
  terminate(){
    this.lifecycleTerminateRan=true;
    return NativeWorker.prototype.terminate.call(this);
  }
}

const heat=new LifecycleWorker('heatmap-raster-worker-v078.js?v=legacy',{name:'heat'});
if(!(heat instanceof LifecycleWorker))throw new Error('derived lifecycle prototype was discarded');
if(!heat.lifecycleConstructorRan)throw new Error('derived lifecycle constructor did not finish');
if(heat.constructedUrl!=='heatmap-raster-worker-v131.js?v=20260901-1')throw new Error(`heat URL was not redirected: ${heat.constructedUrl}`);
if(heat.constructedOptions?.name!=='heat')throw new Error('worker options were not preserved');
heat.postMessage({type:'build',jobId:1});
if(!heat.lifecyclePostMessageRan||heat.nativePosts.length!==1)throw new Error('derived postMessage lifecycle override was bypassed');
heat.terminate();
if(!heat.lifecycleTerminateRan||!heat.terminated)throw new Error('derived terminate lifecycle override was bypassed');

const nonHeat=new LifecycleWorker('grid-size-worker-v094.js');
if(nonHeat.constructedUrl!=='grid-size-worker-v094.js')throw new Error('non-heat worker URL was unexpectedly redirected');
if(!(nonHeat instanceof LifecycleWorker))throw new Error('non-heat derived prototype was discarded');

if(!marks.some(m=>m.name==='heatmap.v132-worker-bootstrap-fixed'))throw new Error('installation diagnostic marker missing');
console.log('v1.3.2 worker bootstrap subclass-preservation self-test passed');
