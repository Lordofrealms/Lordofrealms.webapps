const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

class FakeMap{
  constructor(){this.layers=[];this.sources={};this.layout=new Map();this.__events={};}
  getStyle(){return {layers:this.layers.map(x=>({...x})),sources:{...this.sources}};}
  getLayer(id){return this.layers.find(x=>x.id===id);}
  getSource(id){return this.sources[id];}
  addSource(id,spec){const canvas=spec.canvas||{width:1,height:1};this.sources[id]={...spec,getCanvas:()=>canvas};return this;}
  removeSource(id){delete this.sources[id];return this;}
  addLayer(layer){this.layers.push({...layer});this.layout.set(layer.id,'visible');return this;}
  removeLayer(id){this.layers=this.layers.filter(x=>x.id!==id);this.layout.delete(id);return this;}
  setLayoutProperty(id,name,value){if(name==='visibility')this.layout.set(id,value);return this;}
  getLayoutProperty(id,name){return name==='visibility'?(this.layout.get(id)||'visible'):undefined;}
  getCanvas(){return {width:1080,height:720,id:'map'};}
  triggerRepaint(){}
}

const events=[];
const map=new FakeMap();
const documentListeners={};
const windowListeners={};
const document={
  readyState:'complete',title:'',visibilityState:'visible',
  addEventListener:(n,fn)=>{documentListeners[n]=fn;},
  getElementById:()=>null,
  querySelectorAll:()=>[],
};
const PadGradeDiag={mark:(name,details)=>events.push({name,details})};
const window={
  __padGradeMapInstance:map,PadGradeDiag,
  addEventListener:(n,fn)=>{windowListeners[n]=fn;},
  PadGradeLifecycle:{getMemorySnapshot:()=>JSON.stringify({totalPssKb:12345,graphicsPssKb:2345})},
};
let clock=1000;
const performance={now:()=>clock,memory:{usedJSHeapSize:100,totalJSHeapSize:200,jsHeapSizeLimit:1000}};
const context={window,document,performance,console,setTimeout:(fn,delay=0)=>{clock+=Math.max(0,+delay||0);fn();return 1;},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},Map,JSON,Date,RegExp,Number,String,Math};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('pad-grade/v114-dev.js','utf8'),context,{filename:'v114-dev.js'});

function addNormal(slot){const sid=`pad-grade-interpolated-surface-canvas-source-${slot}`,lid=`pad-grade-interpolated-surface-canvas-layer-${slot}`;map.addSource(sid,{type:'canvas',canvas:{width:83,height:99},coordinates:[]});map.addLayer({id:lid,type:'raster',source:sid});map.setLayoutProperty(lid,'visibility','visible');return lid;}
function visible(id){return !!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';}

const l0=addNormal(0);
const l1=addNormal(1);
assert.strictEqual(visible(l0),false,'older normal slot must be hidden after new slot is added');
assert.strictEqual(visible(l1),true,'newest normal slot should be visible');
map.setLayoutProperty(l0,'visibility','visible');
assert.strictEqual(visible(l0),false,'legacy attempt to re-show retired slot must be suppressed');
assert.strictEqual(visible(l1),true,'active normal slot must stay visible');

const i99='pad-grade-v113-inspect-layer-99';
map.addSource('pad-grade-v113-inspect-source-99',{type:'canvas',canvas:{width:83,height:99},coordinates:[]});
map.addLayer({id:i99,type:'raster',source:'pad-grade-v113-inspect-source-99'});
PadGradeDiag.mark('heatmap.inspector-mode',{mode:'99'});
map.setLayoutProperty(i99,'visibility','visible');
assert.strictEqual(visible(i99),true,'selected inspector tier should be visible');
assert.strictEqual(visible(l1),false,'normal heat must be hidden in manual inspector mode');

PadGradeDiag.mark('heatmap.inspector-mode',{mode:'auto'});
assert.strictEqual(visible(i99),false,'inspector heat must be hidden in Auto mode');
assert.strictEqual(visible(l1),true,'active normal heat should return in Auto mode');

PadGradeDiag.mark('heatmap.cache-visible',{projectId:'p1',tier:891,nx:750,ny:891});
const protectedLayer=context.window.__padGradeMemorySnapshotV114?.heat?.protectedCacheLayer||l1;
const l2=addNormal(0);
assert.strictEqual(visible(protectedLayer),true,'cached final raster must remain visible');
if(l2!==protectedLayer)assert.strictEqual(visible(l2),false,'later normal tier must not cover cached final raster');
map.removeLayer(protectedLayer);
assert.ok(map.getLayer(protectedLayer),'protected cached raster must resist stale retirement');

assert.ok(events.some(e=>e.name==='heatmap.stale-raster-show-suppressed'),'expected stale raster suppression diagnostic');
assert.ok(events.some(e=>e.name==='memory.snapshot'),'expected memory snapshot diagnostic');
assert.strictEqual(context.document.title,'Pad Grade Mapper v1.1.4 DEV');
console.log('Pad Grade v1.1.4 heat/memory self-test passed');
