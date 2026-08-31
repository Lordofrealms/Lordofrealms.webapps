'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const code=fs.readFileSync(require('path').join(__dirname,'v123-dev.js'),'utf8');
const marks=[];
let activeProject='project-a';
const sources=new Map();
const layers=new Map();
const operations=[];

function sourceApi(record){
  return {
    getCanvas:()=>record.canvas,
    setCoordinates(coords){record.coordinates=coords;return this;}
  };
}
const map={
  getSource(id){const r=sources.get(String(id));return r?sourceApi(r):null;},
  addSource(id,spec){operations.push(['addSource',String(id)]);sources.set(String(id),{id:String(id),canvas:spec.canvas,coordinates:spec.coordinates,tier:Number(String(id).match(/(99|297|891)$/)?.[1]||0),serial:(sources.size+1),projectSerial:1,removed:false});return this;},
  removeSource(id){operations.push(['removeSource',String(id)]);sources.delete(String(id));return this;},
  getLayer(id){return layers.get(String(id))||null;},
  addLayer(layer){operations.push(['addLayer',String(layer.id)]);layers.set(String(layer.id),{...layer,layout:{visibility:'visible'}});return this;},
  removeLayer(id){operations.push(['removeLayer',String(id)]);layers.delete(String(id));return this;},
  setLayoutProperty(id,name,value){const l=layers.get(String(id));if(l){l.layout=l.layout||{};l.layout[name]=value;}return this;},
  triggerRepaint(){operations.push(['repaint']);}
};
const state={map,sources,layers};
const listeners={};
const context={
  console,
  window:null,
  localStorage:{getItem:k=>k==='padGradeActiveProjectIdV5'?activeProject:null},
  document:{getElementById:id=>id==='heatmapToggle'?{checked:true}:null},
  PadGradeDiag:{mark(name,details){marks.push([name,details]);}},
  __padGradeV120PrimaryHeatState:state,
  pgHeatmapOpacity:()=>0.58,
  setInterval:()=>1,
  setTimeout:fn=>{fn();return 1;},
  clearTimeout:()=>{},
  addEventListener:(name,fn)=>{listeners[name]=fn;}
};
context.window=context;
vm.createContext(context);
vm.runInContext(code,context,{filename:'v123-dev.js'});

const REG='pad-grade-interpolated-surface-canvas-source-';
const INS='pad-grade-v113-inspect-source-891';
const INSL='pad-grade-v113-inspect-layer-891';
const canonicalSource='pad-grade-v120-heat-image-source';
const canonicalLayer='pad-grade-v120-heat-image-layer';
sources.set(canonicalSource,{id:canonicalSource,canvas:{tag:'canonical'},coordinates:[],tier:891,serial:99,projectSerial:1,removed:false});
layers.set(canonicalLayer,{id:canonicalLayer,source:canonicalSource,layout:{visibility:'visible'}});

function publishRegular(slot,canvas,serial,projectSerial=1){
  const id=`${REG}${slot}`;
  sources.set(id,{id,canvas,coordinates:[[0,1],[1,1],[1,0],[0,0]],tier:891,serial,projectSerial,removed:false});
  context.PadGradeDiag.mark('heatmap.v120-canvas-intercepted',{map:'primary',source:id,tier:891,width:750,height:891});
}
function installStaleInspector(canvas){
  sources.set(INS,{id:INS,canvas,coordinates:[[0,1],[1,1],[1,0],[0,0]],tier:891,serial:50,projectSerial:1,removed:false});
  layers.set(INSL,{id:INSL,source:INS,layout:{visibility:'visible'}});
}

const autoA={tag:'auto-A',width:750,height:891};
const stale={tag:'stale',width:750,height:891};
publishRegular(0,autoA,1);
installStaleInspector(stale);
context.PadGradeDiag.mark('heatmap.inspector-mode',{mode:'891'});
assert.strictEqual(sources.get(INS).canvas,autoA,'manual 891 must bind the exact completed Auto 891 canvas');
assert.ok(sources.has(canonicalSource),'canonical source must survive inspector rebinding');
assert.ok(layers.has(canonicalLayer),'canonical layer must survive inspector rebinding');
assert.ok(!operations.some(x=>x[0]==='removeSource'&&x[1]===canonicalSource),'canonical source must never be removed');
assert.ok(!operations.some(x=>x[0]==='removeLayer'&&x[1]===canonicalLayer),'canonical layer must never be removed');

const autoB={tag:'auto-B',width:750,height:891};
publishRegular(1,autoB,2);
assert.strictEqual(sources.get(INS).canvas,autoB,'an in-place manual selection must refresh when Auto completes a newer canvas of the same tier');

context.PadGradeDiag.mark('project.switch-v113-start',{from:'project-a',to:'project-b'});
activeProject='project-b';
const projectBStale={tag:'project-b-stale',width:750,height:891};
installStaleInspector(projectBStale);
context.PadGradeDiag.mark('heatmap.inspector-mode',{mode:'891'});
assert.strictEqual(sources.get(INS).canvas,projectBStale,'old-project Auto canvas must not leak across a project switch');

const autoC={tag:'auto-C',width:750,height:891};
publishRegular(0,autoC,3,2);
assert.strictEqual(sources.get(INS).canvas,autoC,'current-project Auto completion must take over once available');

assert.ok(marks.some(([n,d])=>n==='heatmap.v123-inspector-bound-to-auto-tier'&&d?.sourceRebound===true),'expected inspector rebinding diagnostic');
assert.ok(marks.some(([n])=>n==='heatmap.v123-tier-cache-cleared'),'expected project-switch cache clear diagnostic');
console.log('v1.2.3 inspector consistency self-test passed');
