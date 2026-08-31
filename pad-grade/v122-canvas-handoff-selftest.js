#!/usr/bin/env node
'use strict';
const fs=require('fs');
const vm=require('vm');
function must(cond,msg){if(!cond)throw new Error(msg);}
const src=fs.readFileSync('pad-grade/v122-dev.js','utf8');
const marks=[];
const timeouts=[];
class FakeContext{
  constructor(canvas){this.canvas=canvas;this.globalCompositeOperation='source-over';}
  save(){}
  restore(){}
  drawImage(source){this.canvas.tag=source.tag;this.canvas.width=source.width;this.canvas.height=source.height;}
}
class FakeCanvas{
  constructor(width=0,height=0,tag=''){this.width=width;this.height=height;this.tag=tag;this.ctx=new FakeContext(this);}
  getContext(){return this.ctx;}
}
let visible='none',paintOpacity=0,realAdds=0,realRemoves=0,layerAdds=0,layerRemoves=0,uploads=0,lastUploadedTag='';
let canonical=null;
const context={
  console,
  clearTimeout:()=>{},
  setTimeout:(fn)=>{timeouts.push(fn);return timeouts.length;},
  setInterval:()=>1,
  document:{
    createElement:(name)=>{must(name==='canvas','only canvas creation expected');return new FakeCanvas();},
    getElementById:()=>({checked:true})
  },
  window:{PadGradeDiag:{mark:(n,d)=>marks.push([n,d])},addEventListener:()=>{}}
};
vm.createContext(context);vm.runInContext(src,context);
must(context.window.__padGradeDevV122===true,'v1.2.2 runtime installed');
must(context.window.__padGradeDevV121===true,'v1.2.1 runtime suppressed');

const coords=[[0,1],[1,1],[1,0],[0,0]];
const canvasA=new FakeCanvas(83,99,'A');
const frameA={url:'data:image/png;base64,AAAA',width:83,height:99};
const record={id:'legacy-source',serial:1,tier:99,removed:false,frame:frameA,canvas:canvasA,coordinates:coords};
const layer={id:'legacy-layer',source:'legacy-source',layout:{visibility:'visible'}};
const state={
  role:'primary',styleEpoch:1,projectBlank:false,requestSerial:3,verifyTimer:null,currentFrame:null,currentSource:'',currentLayer:'',committedStyleEpoch:-1,visible:false,
  cfg:{canonicalSource:'canonical',canonicalLayer:'canonical-layer',opacity:()=>0.58,inspectMatch:()=>false},
  sources:new Map([['legacy-source',record]]),layers:new Map([['legacy-layer',layer]]),
  baseAddSource:(id,spec)=>{
    realAdds++;must(id==='canonical','canonical id');must(spec.type==='canvas','v1.2.2 must replace ImageSource with CanvasSource');
    canonical={
      type:'canvas',canvas:spec.canvas,coordinates:spec.coordinates,options:spec,tiles:{one:{}},texture:{destroy(){throw new Error('visible texture should update in place, not be destroyed');}},_playing:false,_loaded:true,
      loaded(){return this._loaded;},
      setCoordinates(c){this.coordinates=c;return this;},
      prepare(){uploads++;lastUploadedTag=this.canvas.tag;},
      map:{triggerRepaint:()=>{}}
    };
    return state.map;
  },
  baseGetSource:id=>id==='canonical'?canonical:null,
  baseRemoveSource:()=>{realRemoves++;},
  baseGetLayer:id=>id==='canonical-layer'?{id}:null,
  baseAddLayer:()=>{layerAdds++;},
  baseRemoveLayer:()=>{layerRemoves++;},
  baseSetPaintProperty:(id,name,value)=>{if(id==='canonical-layer'&&name==='raster-opacity')paintOpacity=value;},
  baseSetLayoutProperty:(id,name,value)=>{if(id==='canonical-layer'&&name==='visibility')visible=value;},
  map:{triggerRepaint:()=>{}}
};
context.window.__padGradeV120PrimaryHeatState=state;
context.window.PadGradeDiag.mark('heatmap.v120-map-controller-installed',{map:'primary'});

state.baseAddSource('canonical',{type:'image',url:frameA.url,coordinates:coords});
must(realAdds===1,'canonical source created once');
must(canonical.type==='canvas','real canonical source is canvas backed');
must(canonical.canvas.tag==='A','initial completed canvas copied before presentation');
while(timeouts.length)timeouts.shift()();
must(state.currentFrame===frameA,'initial frame promoted');
must(visible==='visible','initial canonical layer shown');
must(paintOpacity===0.58,'heat opacity preserved');

// Flood the current frame. No texture refresh, source recreation, or layer churn.
const uploadsAfterA=uploads;
for(let i=0;i<250;i++)canonical.updateImage({url:frameA.url,coordinates:coords});
must(realAdds===1,'same-frame churn recreated canonical source');
must(uploads===uploadsAfterA,'same-frame churn re-uploaded texture');
must(realRemoves===0&&layerAdds===0&&layerRemoves===0,'same-frame churn changed source/layer authority');

// Different resolution: complete canvas copy + in-place texture upload, same source.
const canvasB=new FakeCanvas(250,297,'B');
const frameB={url:'data:image/png;base64,BBBB',width:250,height:297};
record.canvas=canvasB;record.frame=frameB;record.tier=297;record.serial++;
canonical.updateImage({url:frameB.url,coordinates:coords});
must(realAdds===1,'99->297 recreated canonical source');
must(canonical.canvas.tag==='B'&&canonical.canvas.width===250&&canonical.canvas.height===297,'297 complete canvas copied');
must(lastUploadedTag==='B','297 texture uploaded from complete canvas');
must(state.currentFrame===frameB,'297 frame promoted');

// Same dimensions but changed pixels: _playing refresh path must still upload.
const canvasC=new FakeCanvas(250,297,'C');
const frameC={url:'data:image/png;base64,CCCC',width:250,height:297};
record.canvas=canvasC;record.frame=frameC;record.serial++;
const beforeC=uploads;
canonical.updateImage({url:frameC.url,coordinates:coords});
must(uploads===beforeC+1,'same-dimension replacement did not refresh texture');
must(lastUploadedTag==='C','same-dimension replacement uploaded wrong pixels');
must(realAdds===1&&realRemoves===0,'replacement recreated/removed canonical source');
must(layerAdds===0&&layerRemoves===0,'replacement recreated/removed canonical layer');
must(marks.some(([n])=>n==='heatmap.v122-canvas-source-created'),'canvas source creation diagnostic missing');
must(marks.filter(([n])=>n==='heatmap.v122-canvas-committed').length>=3,'commit diagnostics missing');
console.log('Pad Grade v1.2.2 direct completed-canvas handoff self-test passed.');
