#!/usr/bin/env node
'use strict';
const fs=require('fs');
const vm=require('vm');
function must(cond,msg){if(!cond)throw new Error(msg);}
const src=fs.readFileSync('pad-grade/v121-dev.js','utf8');
const marks=[];
const intervals=[];
const timeouts=[];
let clock=0;
const context={
  console,
  performance:{now:()=>clock},
  setInterval:(fn)=>{intervals.push(fn);return intervals.length;},
  setTimeout:(fn)=>{timeouts.push(fn);return timeouts.length;},
  clearTimeout:()=>{},
  document:{getElementById:()=>({checked:true}),addEventListener:()=>{}},
  window:{PadGradeDiag:{mark:(n,d)=>marks.push([n,d])},addEventListener:()=>{}}
};
vm.createContext(context);vm.runInContext(src,context);
must(context.window.__padGradeDevV121===true,'v1.2.1 runtime installed');
const frameA={url:'data:image/png;base64,AAAA',width:750,height:891};
const record={id:'legacy-source',serial:1,tier:891,removed:false,frame:frameA};
const layer={id:'legacy-layer',source:'legacy-source',layout:{visibility:'visible'}};
let originalUpdates=0;
const canonical={
  options:{url:frameA.url},url:frameA.url,coordinates:[[0,1],[1,1],[1,0],[0,0]],image:null,_loaded:false,
  loaded(){return this._loaded;},
  updateImage(options){originalUpdates++;this.options.url=options.url;this.url=options.url;this._loaded=false;return this;},
  setCoordinates(coords){this.coordinates=coords;return this;}
};
let visible='none';
const state={
  role:'primary',styleEpoch:1,projectBlank:false,requestSerial:7,verifyTimer:null,currentFrame:null,currentSource:'',currentLayer:'',committedStyleEpoch:-1,visible:false,
  cfg:{canonicalSource:'canonical',canonicalLayer:'canonical-layer',opacity:()=>0.58,inspectMatch:()=>false},
  sources:new Map([['legacy-source',record]]),layers:new Map([['legacy-layer',layer]]),
  baseGetSource:id=>id==='canonical'?canonical:null,
  baseGetLayer:id=>id==='canonical-layer'?{id}:null,
  baseSetPaintProperty:()=>{},baseSetLayoutProperty:(id,name,value)=>{if(id==='canonical-layer'&&name==='visibility')visible=value;},
  map:{triggerRepaint:()=>{}}
};
context.window.__padGradeV120PrimaryHeatState=state;
context.window.pgV121HeatRepairScan();
// v1.2.0 can call updateImage hundreds of times for the same frame while its
// legacy virtual layer toggles. None of those calls may restart MapLibre's load.
for(let i=0;i<250;i++)canonical.updateImage({url:frameA.url,coordinates:canonical.coordinates});
must(originalUpdates===0,`same URL restarted underlying load ${originalUpdates} times`);
// Complete the already-running initial ImageSource load and allow v1.2.1 to
// promote it without depending on v1.2.0's starved verifier.
canonical.image={width:750,height:891};canonical._loaded=true;clock=125;
context.window.pgV121HeatRepairScan();
must(state.currentFrame===frameA,'decoded frame promoted to controller state');
must(state.committedStyleEpoch===1,'style epoch committed');
must(visible==='visible','canonical raster layer made visible');
must(marks.some(([n])=>n==='heatmap.v121-image-committed'),'real completion diagnostic emitted');
// Once committed, same-frame churn remains a no-op.
for(let i=0;i<50;i++)canonical.updateImage({url:frameA.url,coordinates:canonical.coordinates});
must(originalUpdates===0,'same committed URL restarted load');
// A genuinely different completed frame must still be allowed to replace it.
const frameB={url:'data:image/png;base64,BBBB',width:250,height:297};
record.frame=frameB;record.tier=297;canonical.updateImage({url:frameB.url,coordinates:canonical.coordinates});
must(originalUpdates===1,'new URL did not reach MapLibre updateImage exactly once');
canonical.image={width:250,height:297};canonical._loaded=true;clock=250;
context.window.pgV121HeatRepairScan();
must(state.currentFrame===frameB,'replacement frame committed');
console.log('Pad Grade v1.2.1 ImageSource request dedupe self-test passed.');
