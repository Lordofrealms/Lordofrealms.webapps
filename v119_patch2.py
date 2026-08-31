from pathlib import Path

# Make initial getCurrentPosition permission failures follow the same Manual fallback
# path as the continuing watchPosition provider.
p=Path('pad-grade/v119-dev.js')
s=p.read_text()
old="geoInstalled=true;geoBase={watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo)};"
new="geoInstalled=true;geoBase={watch:geo.watchPosition.bind(geo),clear:geo.clearWatch.bind(geo),get:typeof geo.getCurrentPosition==='function'?geo.getCurrentPosition.bind(geo):null};"
if old not in s:
    raise SystemExit('v119 geoBase marker missing')
s=s.replace(old,new,1)
old2="""    try{\n      geo.watchPosition=function(success,error,options){const virtualId=nextWatch++,r={virtualId,underlyingId:null,success,error,options:options||{}};geoWatches.set(virtualId,r);start(r);mark('background.gps-watch-registered',{virtualId,activeUnderlying:r.underlyingId!=null,totalVirtual:geoWatches.size});return virtualId;};"""
new2="""    try{\n      if(geoBase.get)geo.getCurrentPosition=function(success,error,options){return geoBase.get(success,err=>{if(+err?.code===1)setTimeout(manualFallbackFromPermission,0);try{error?.(err);}catch(_){}},options);};\n      geo.watchPosition=function(success,error,options){const virtualId=nextWatch++,r={virtualId,underlyingId:null,success,error,options:options||{}};geoWatches.set(virtualId,r);start(r);mark('background.gps-watch-registered',{virtualId,activeUnderlying:r.underlyingId!=null,totalVirtual:geoWatches.size});return virtualId;};"""
if old2 not in s:
    raise SystemExit('v119 geolocation try marker missing')
s=s.replace(old2,new2,1)
p.write_text(s)

# Native Android behavior is authoritative for Not now / OS denial, and can direct
# permanent-denial users to settings without resurrecting the old Enable GPS button.
p=Path('pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/MainActivity.java')
s=p.read_text()
old='''            pendingGeoCallback.invoke(pendingGeoOrigin, fineGranted, false);\n            pendingGeoCallback = null; pendingGeoOrigin = null;\n            if (!fineGranted && coarseGranted) showPreciseLocationRequired();'''
new='''            pendingGeoCallback.invoke(pendingGeoOrigin, fineGranted, false);\n            pendingGeoCallback = null; pendingGeoOrigin = null;\n            if (!fineGranted) {\n                switchToManualAfterLocationDenial();\n                if (coarseGranted) showPreciseLocationRequired();\n                else if (!shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) showLocationPermissionSettingsRequired();\n            }'''
if old not in s:
    raise SystemExit('MainActivity permission-result marker missing')
s=s.replace(old,new,1)
old='''    private void clearPendingGeolocationRequest(boolean grant) {\n        if (pendingGeoCallback == null) return;\n        try { pendingGeoCallback.invoke(pendingGeoOrigin, grant, false); } catch (RuntimeException ignored) {}\n        pendingGeoCallback = null; pendingGeoOrigin = null;\n    }\n\n    private void showLocationPermissionEducationThenRequest() {'''
new='''    private void clearPendingGeolocationRequest(boolean grant) {\n        if (pendingGeoCallback == null) return;\n        try { pendingGeoCallback.invoke(pendingGeoOrigin, grant, false); } catch (RuntimeException ignored) {}\n        pendingGeoCallback = null; pendingGeoOrigin = null;\n        if (!grant) switchToManualAfterLocationDenial();\n    }\n\n    private void switchToManualAfterLocationDenial() {\n        if (webView == null || isFinishing() || isDestroyed()) return;\n        webView.post(() -> webView.evaluateJavascript(\n                \"(function(){var b=document.getElementById('manualModeBtn');if(b&&!b.classList.contains('activeMode'))b.click();var i=document.getElementById('gpsInstruction');if(i)i.textContent='Location permission was not granted. Select GPS Guided to try again.';})();\",\n                null));\n    }\n\n    private void showLocationPermissionEducationThenRequest() {'''
if old not in s:
    raise SystemExit('MainActivity clearPending marker missing')
s=s.replace(old,new,1)
old='''    private void openAppSettings() {\n        try {'''
new='''    private void showLocationPermissionSettingsRequired() {\n        if (isFinishing() || isDestroyed()) return;\n        new AlertDialog.Builder(this)\n                .setTitle(\"Location permission is disabled\")\n                .setMessage(\"GPS Guided requires Precise location. Android is no longer offering the normal permission prompt for Pad Grade. Enable Location and Precise location in App Settings, then return and select GPS Guided again.\")\n                .setNegativeButton(\"Cancel\", null)\n                .setPositiveButton(\"Open App Settings\", (dialog, which) -> openAppSettings())\n                .show();\n    }\n\n    private void openAppSettings() {\n        try {'''
if old not in s:
    raise SystemExit('MainActivity openAppSettings marker missing')
s=s.replace(old,new,1)
p.write_text(s)

# Strengthen static test for the actual initial permission path.
p=Path('pad-grade/v119-heat-cutover-selftest.js')
s=p.read_text()
needle="ok(js.includes('gps.permission-denied-manual-fallback'),'permission denial manual fallback missing');"
replacement=needle+"\nok(js.includes('geo.getCurrentPosition=function'),'initial getCurrentPosition denial fallback missing');"
if needle not in s:
    raise SystemExit('v119 selftest permission marker missing')
p.write_text(s.replace(needle,replacement,1))

# Behavioral controller test: no real CanvasSource, style-gated first commit, and
# same canonical ImageSource reused for subsequent resolution on Main and Compare.
p=Path('pad-grade/v119-runtime-selftest.js')
p.write_text(r'''const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('pad-grade/v119-dev.js','utf8');
const marks=[];
class ImageSrc{constructor(spec){this.spec=spec;this.updates=[];}updateImage(o){this.updates.push(o);this.last=o;return this;}setCoordinates(c){this.coords=c;return this;}}
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
const document={visibilityState:'visible',getElementById(id){return id==='heatmapToggle'?heatToggle:id==='manualModeBtn'?manual:id==='gpsInstruction'?instruction:null;},addEventListener(){}};
const sandbox={console,Map,Set,Promise,JSON,Math,Number,String,Date,Array,Object,RegExp,Error,Uint8Array,document,navigator:{geolocation:geo},maplibregl:{Map:FakeMap},setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),CustomEvent:function(){},createImageBitmap:async c=>({width:c.width,height:c.height,close(){this.closed=true;}})};
sandbox.window=sandbox;sandbox.addEventListener=()=>{};sandbox.PadGradeDiag={mark:(n,d)=>marks.push([n,d])};
vm.runInNewContext(code,sandbox,{filename:'v119-dev.js'});
const tick=()=>new Promise(r=>setTimeout(r,15));
async function exercise(container,prefix,layerPrefix,canonical){
  const map=new sandbox.maplibregl.Map({container});
  const coords=[[0,1],[1,1],[1,0],[0,0]];
  map.addSource(prefix+'0',{type:'canvas',canvas:{width:83,height:99},coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'0',type:'raster',source:prefix+'0',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  await tick();
  if(map.realAdds.some(x=>x.spec.type==='canvas'))throw new Error(container+' leaked real CanvasSource');
  if(map.getSource(canonical))throw new Error(container+' canonical created before style ready');
  map._styleLoaded=true;map.fire('style.load');await tick();await tick();
  const src=map.getSource(canonical);if(!src)throw new Error(container+' canonical source missing after style.load');
  if(src.updates.length!==1)throw new Error(container+' expected first committed update, got '+src.updates.length);
  const created=map.realAdds.filter(x=>x.id===canonical).length;
  map.addSource(prefix+'1',{type:'canvas',canvas:{width:250,height:297},coordinates:coords,animate:false});
  map.addLayer({id:layerPrefix+'1',type:'raster',source:prefix+'1',layout:{visibility:'visible'},paint:{'raster-opacity':.6}});
  map.setLayoutProperty(layerPrefix+'0','visibility','none');
  await tick();await tick();
  if(map.getSource(canonical)!==src)throw new Error(container+' replaced canonical source during resolution change');
  if(src.updates.length<2)throw new Error(container+' second completed frame not committed');
  if(map.realAdds.filter(x=>x.id===canonical).length!==created)throw new Error(container+' recreated canonical source without style reload');
  return map;
}
(async()=>{
  await exercise('gpsMap','pad-grade-interpolated-surface-canvas-source-','pad-grade-interpolated-surface-canvas-layer-','pad-grade-v119-heat-image-source');
  await exercise('pgCompareMap','pg-compare-heat-source-','pg-compare-heat-layer-','pad-grade-v119-compare-heat-image-source');
  const commits=marks.filter(x=>x[0]==='heatmap.v119-image-committed');
  if(commits.filter(x=>x[1].map==='primary').length<2||commits.filter(x=>x[1].map==='compare').length<2)throw new Error('missing main/compare commit diagnostics');
  console.log('Pad Grade v1.1.9 runtime controller self-test passed');
})().catch(e=>{console.error(e);process.exit(1);});
''')

# Changelog already describes denial -> Manual; add permanent denial/settings detail.
for p in [Path('pad-grade/CHANGELOG.md'),Path('pad-grade-android/CHANGELOG.md')]:
    s=p.read_text()
    needle='- Selecting **GPS Guided** again is the retry action; Pad Grade requests foreground location again through the existing informed permission flow. The removed standalone Enable GPS control is not restored.\n'
    add=needle+'- If Android has stopped presenting the normal permission dialog after repeated/permanent denial, the failed retry returns to Manual and offers **Open App Settings** so Precise + While Using access can be restored explicitly.\n'
    if needle in s and 'failed retry returns to Manual and offers **Open App Settings**' not in s:
        s=s.replace(needle,add,1)
    p.write_text(s)
