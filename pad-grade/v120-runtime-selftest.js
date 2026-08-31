const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('pad-grade/v120-dev.js','utf8');
const marks=[];
class ImageSrc{
  constructor(spec){this.spec=spec;this.url=spec.url;this.image=null;this._loaded=false;this.requests=[spec.url];this._load(spec.url);}
  _load(url){this._loaded=false;setTimeout(()=>{if(this.url!==url)return;const m=String(url).match(/FAKE-(\d+)x(\d+)/);this.image={width:m?+m[1]:1,height:m?+m[2]:1,token:url};this._loaded=true;},4);}
  updateImage(o){if(!o.url)return this;this.url=o.url;this.requests.push(o.url);this._load(o.url);return this;}
  loaded(){return this._loaded;}
  setCoordinates(c){this.coords=c;return this;}
}
class FakeMap{
  constructor(opts){this.opts=opts;this._styleLoaded=false;this.sources=new Map();this.layers=new Map();this.events=new Map();this.realAdds=[];this.realLayerAdds=[];}
  on(n,fn){(this.events.get(n)||this.events.set(n,[]).get(n)).push(fn);return this;}
  once(n,fn){const wrap=(...a)=>{this.off(n,wrap);fn(...a)};return this.on(n,wrap);}
  off(n,fn){this.events.set(n,(this.events.get(n)||[]).filter(x=>x!==fn));return this;}
  fire(n){for(const fn of [...(this.events.get(n)||[])])fn();return this;}
  isStyleLoaded(){return this._styleLoaded;}
  addSource(id,spec){this.realAdds.push({id,spec});if(spec.type==='canvas')throw new Error('real CanvasSource forbidden');this.sources.set(id,spec.type==='image'?new ImageSrc(spec):{spec});return this;}
  getSource(id){return this.sources.get(id);}
  removeSource(id){this.sources.delete(id);return this;}
  addLayer(layer,before){this.realLayerAdds.push({layer,before});this.layers.set(layer.id,JSON.parse(JSON.stringify(layer)));return this;}
  getLayer(id){return this.layers.get(id);}
  removeLayer(id){this.layers.delete(id);return this;}
  setLayoutProperty(id,n,v){const l=this.layers.get(id);if(l){l.layout=l.layout||{};l.layout[n]=v;}return this;}
  getLayoutProperty(id,n){return this.layers.get(id)?.layout?.[n];}
  setPaintProperty(id,n,v){const l=this.layers.get(id);if(l){l.paint=l.paint||{};l.paint[n]=v;}return this;}
  getPaintProperty(id,n){return this.layers.get(id)?.paint?.[n];}
  moveLayer(){return this;}
  getStyle(){return {version:8,sources:Object.fromEntries([...this.sources].map(([k,v])=>[k,v.spec||{}])),layers:[...this.layers.values()]};}
  triggerRepaint(){return this;}
}
const heatToggle={checked:true},manual={classList:{contains:()=>false},click(){this.clicked=(this.clicked||0)+1;}},instruction={textContent:''};
let gid=0;
const geo={watchPosition(){return ++gid;},clearWatch(){},getCurrentPosition(){}};
const document={visibilityState:'visible',getElementById(id){return id==='heatmapToggle'?heatToggle:id==='manualModeBtn'?manual:id==='gpsInstruction'?instruction:null;},addEventListener(){},createElement(){throw new Error('probe canvas intentionally unavailable in node');}};
const fakeCanvas=(w,h)=>({width:w,height:h,toDataURL(){return `data:image/png;base64,FAKE-${w}x${h}`;}});
const performance={now:()=>Date.now()};
const sandbox={console,Map,Set,Promise,JSON,Math,Number,String,Date,Array,Object,RegExp,Error,Uint8Array,document,performance,navigator:{geolocation:geo},maplibregl:{Map:FakeMap},setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),CustomEvent:function(){}};
sandbox.window=sandbox;sandbox.addEventListener=()=>{};sandbox.PadGradeDiag={mark:(n,d)=>marks.push([n,d])};
vm.runInNewContext(code,sandbox,{filename:'v120-dev.js'});
const tick=(ms=35)=>new Promise(r=>setTimeout(r,ms));
async function exercise(container,prefix,layerPrefix,canonical){
  const map=new sandbox.maplibregl.Map({container});
  const coords=[[0,1],[1,1],[1,0],[0,0]];
  map.addSource(prefix+'0',{type:'canvas',canvas:fakeCanvas(83,99),coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'0',type:'raster',source:prefix+'0',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  await tick(15);
  if(map.realAdds.some(x=>x.spec.type==='canvas'))throw new Error(container+' leaked real CanvasSource');
  if(map.getSource(canonical))throw new Error(container+' canonical created before style.load');
  // Critical regression: pinned MapLibre can still report false here because raster imagery is loading.
  map._styleLoaded=false;map.fire('style.load');await tick();await tick();
  const src=map.getSource(canonical);if(!src)throw new Error(container+' canonical source missing after style.load with isStyleLoaded=false');
  if(!src.requests[0]?.includes('FAKE-83x99'))throw new Error(container+' initial image source did not use real frame URL');
  if(map.getLayoutProperty(canonical.replace('source','layer'),'visibility')!=='visible')throw new Error(container+' canonical layer not shown after verified URL load');
  const created=map.realAdds.filter(x=>x.id===canonical).length;
  map.addSource(prefix+'1',{type:'canvas',canvas:fakeCanvas(250,297),coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'1',type:'raster',source:prefix+'1',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  map.setLayoutProperty(layerPrefix+'0','visibility','none');
  await tick();await tick();
  if(map.getSource(canonical)!==src)throw new Error(container+' replaced canonical source during resolution change');
  if(src.requests.length<2||!src.requests.at(-1).includes('FAKE-250x297'))throw new Error(container+' second frame did not use MapLibre 5.16 URL update contract');
  if(map.realAdds.filter(x=>x.id===canonical).length!==created)throw new Error(container+' recreated canonical source without style reload');
  return map;
}
(async()=>{
  await exercise('gpsMap','pad-grade-interpolated-surface-canvas-source-','pad-grade-interpolated-surface-canvas-layer-','pad-grade-v120-heat-image-source');
  await exercise('pgCompareMap','pg-compare-heat-source-','pg-compare-heat-layer-','pad-grade-v120-compare-heat-image-source');
  const commits=marks.filter(x=>x[0]==='heatmap.v120-image-committed');
  if(commits.filter(x=>x[1].map==='primary').length<2||commits.filter(x=>x[1].map==='compare').length<2)throw new Error('missing verified main/compare commits');
  if(marks.some(x=>x[0]==='heatmap.v120-image-verify-failed'))throw new Error('unexpected verification failure');
  console.log('Pad Grade v1.2.0 MapLibre 5.16 URL-image runtime self-test passed');
})().catch(e=>{console.error(e);process.exit(1);});
