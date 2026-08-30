'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');

const elements=new Map();
function makeEl(id,value=''){
  const el={
    id,value:String(value),textContent:'',innerHTML:'',checked:true,style:{},dataset:{},
    classList:{add(){},remove(){},toggle(){}},
    parentElement:{firstChild:{nodeValue:''},querySelector(){return {textContent:''};}},
    addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},
    closest(){return {insertAdjacentHTML(){}};},insertAdjacentHTML(){},
    getBoundingClientRect(){return {width:600,height:600,left:0,top:0};},appendChild(){}
  };
  elements.set(id,el);
  return el;
}
function $(id){if(!elements.has(id))makeEl(id);return elements.get(id);}
for(const [id,val] of Object.entries({
  width:40,length:20,cols:5,rows:3,target:100,tol:1,refCorner:'SW',projectName:'Test',
  unitMode:'inches',routeMode:'serpentine',projectNotes:''
}))makeEl(id,val);

Object.assign(global,{
  $,readings:{},readingMeta:{},gpsRef:null,gpsOpposite:null,gpsTargetIndex:null,gpsCorners:{},
  gpsCaptureIndex:0,measureMode:'manual',gpsPos:null,FT_PER_M:3.280839895,
  cfg(){return {width:+$('width').value,length:+$('length').value,cols:+$('cols').value,rows:+$('rows').value,target:+$('target').value,tol:+$('tol').value,refCorner:$('refCorner').value,name:$('projectName').value};},
  k:(r,c)=>`${r},${c}`,
  label:(r,c)=>`${String.fromCharCode(65+r)}${c+1}`,
  indexFromPoint:(r,c)=>r*(+$('cols').value)+c,
  pointFromIndex(i){const cols=+$('cols').value;return {r:Math.floor(i/cols),c:i%cols};},
  refCoords(r,c){const s=global.cfg();return {x:c*s.width/(s.cols-1),y:r*s.length/(s.rows-1),xDir:'E',yDir:'N'};},
  diffFor(v){return v-global.cfg().target;},classFor(){return '';},
  gpsRoute(){const s=global.cfg(),out=[];for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++)out.push(global.indexFromPoint(r,c));return out;},
  formatGpsFix(pos){return pos?'±0 ft':'No fix';},updateGpsUI(){},ensureGpsTarget(){},updateCornerPicker(){},syncLegacyCalibration(){},
  renderGrid(){},updateStats(){},openPoint(){},updateModalResult(){},saveCurrent(){},nextPoint(){},prevPoint(){},nextEmpty(){},
  saveLocal(){},loadLocal(){},exportProjectShared(){},exportProject(){},importProjectFile(){},textFor(){return['',''];},exportCSV(){},
  requestAnimationFrame(){},window:{addEventListener(){},scrollTo(){},PadGradePlatform:null},
  document:{querySelector(){return null;},querySelectorAll(){return [];},createTreeWalker(){return {nextNode(){return null;}};}},
  NodeFilter:{SHOW_TEXT:4},localStorage:{getItem(){return null;},setItem(){}},Blob:function(){},
  URL:{createObjectURL(){return '';},revokeObjectURL(){}},setTimeout(){},alert(){},console
});

const root=__dirname;
let v060=fs.readFileSync(path.join(root,'v060-dev.js'),'utf8');
const boot060=v060.indexOf('\npgAugmentUi();');
assert.ok(boot060>0,'Could not locate v060 boot boundary');
v060=v060.slice(0,boot060);
vm.runInThisContext(v060,{filename:'v060-dev.js'});

let v061=fs.readFileSync(path.join(root,'v061-dev.js'),'utf8');
const boot061=v061.indexOf('\n  installLaserCoordinateInputs();');
assert.ok(boot061>0,'Could not locate v061 boot boundary');
v061=v061.slice(0,boot061)+'\n})();\n';
vm.runInThisContext(v061,{filename:'v061-dev.js'});

function near(a,b,tol=1e-9,msg=''){
  assert.ok(Math.abs(a-b)<=tol,`${msg} expected ${b}, got ${a}`);
}

for(const mode of ['inches','tenths','metric']){
  padGradeUnitMode=mode;
  const ft=63.75,inch=71.375,tolIn=0.625;
  near(pgPlanInputToFt(pgPlanFtToInput(ft,mode),mode),ft,1e-9,`${mode} plan`);
  near(pgRodInputToIn(pgRodInToInput(inch,mode),mode),inch,1e-9,`${mode} rod`);
  near(pgTolInputToIn(pgTolInToInput(tolIn,mode),mode),tolIn,1e-9,`${mode} tolerance`);
}

padGradeUnitMode='inches';
$('width').value='40';$('length').value='20';$('cols').value='3';$('rows').value='3';$('target').value='100';$('tol').value='1';
readings={};
for(let r=0;r<3;r++)for(let c=0;c<3;c++)readings[k(r,c)]=100;
let calc=pgCalculateTargets();
assert.ok(!calc.error,calc.error);
near(calc.neutral,100,1e-9,'flat neutral');
near(calc.neutralWork.cutYd3,0,1e-9,'flat cut');
near(calc.neutralWork.fillYd3,0,1e-9,'flat fill');

readings={};
for(let r=0;r<3;r++)for(let c=0;c<3;c++)readings[k(r,c)]=96+2*c+3*r;
calc=pgCalculateTargets();
assert.ok(!calc.error,calc.error);
near(calc.neutralWork.signedNetYd3,0,1e-9,'neutral signed volume');
near(calc.neutralWork.cutYd3,calc.neutralWork.fillYd3,1e-7,'neutral cut/fill');

const neutralTol=pgEarthworkAt(calc.neutral,calc.surface,calc.tolerance);
assert.ok(calc.minAreaWork.disturbedFt2<=neutralTol.disturbedFt2+1e-9,'minimum-area optimizer increased disturbed area');

$('cols').value='2';$('rows').value='2';$('width').value='40';$('length').value='20';
readings={'0,0':100,'0,1':101,'1,0':102};
const surface=pgSurfaceSamples(100);
assert.ok(surface.coveredFt2>340&&surface.coveredFt2<460,`three-corner coverage should be about 400 ft², got ${surface.coveredFt2}`);

const asymmetric=[{x:0,y:0,v:50},{x:1,y:0,v:102}];
near(pgIdw2(.5,0,asymmetric),76,1e-9,'asymmetric midpoint reading');
assert.ok(pgIdw2(.5,0,asymmetric)-100<-20,'asymmetric midpoint must remain cut');
near(pgIdw2(5/6,0,asymmetric),100,1e-9,'magnitude-aware IDW² zero crossing');

$('cols').value='5';$('rows').value='3';$('width').value='40';$('length').value='20';$('routeMode').value='away';
padGradeLaser={xFt:-10,yFt:10};
let route=gpsRoute().map(pointFromIndex);
for(let r=0;r<3;r++)assert.deepStrictEqual(route.filter(p=>p.r===r).map(p=>p.c),[0,1,2,3,4],`outside-laser row ${r}`);

padGradeLaser={xFt:20,yFt:10};
route=gpsRoute().map(pointFromIndex);
for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];
  if(a.r!==b.r)continue;
  const da=pgDistToLaser(a.r,a.c),db=pgDistToLaser(b.r,b.c);
  if(db+1e-9<da)assert.ok(Math.abs(b.c-2)<=1,'interior reset must return near the laser before second outward leg');
}

const localSurface=require(path.join(root,'surface-local-v077.js'));
const localityPoints=[
  {x:0,y:0,v:10,label:'E5'},
  {x:1,y:0,v:20,label:'E6'},
  {x:0,y:1,v:30,label:'F5'},
  {x:4,y:1,v:90,label:'F9'}
];
let localResult=localSurface.interpolateAt(.2,.2,localityPoints,true);
assert.ok(localResult&&localResult.tieCount===1,'local point should have one winning triangle');
assert.deepStrictEqual(localResult.triangles[0],[0,1,2],'local point must use E5/E6/F5, not distant F9');

const squarePoints=[
  {x:0,y:0,v:10,label:'SW'},
  {x:1,y:0,v:20,label:'SE'},
  {x:1,y:1,v:30,label:'NE'},
  {x:0,y:1,v:40,label:'NW'}
];
localResult=localSurface.interpolateAt(.5,.5,squarePoints,true);
assert.ok(localResult&&localResult.tieCount===4,'square center should retain four genuine locality ties');
near(localResult.value,25,1e-9,'square-center tie average');
localResult=localSurface.interpolateAt(0,0,squarePoints,true);
assert.ok(localResult&&localResult.exact,'measured point should be exact');
assert.deepStrictEqual(localResult.triangles,[[0]],'exact point should list only its contributing measurement');

// v0.9.4+ regression guards for project transition, lower-grid latency, and legal preload.
const gridCoreText=fs.readFileSync(path.join(root,'grid-core.js'),'utf8');
const gridWorkerText=fs.readFileSync(path.join(root,'grid-size-worker-v094.js'),'utf8');
assert.ok(gridCoreText.includes('grid-size-worker-v094.js'),'lower grid must delegate text sizing to the worker');
assert.ok(gridCoreText.includes('applyProvisional'),'lower grid must paint before final text sizing');
assert.ok(gridCoreText.includes('paint-cells-first-worker-offscreen-measure-then-one-css-resize'),'lower grid one-resize policy marker missing');
assert.ok(gridWorkerText.includes('OffscreenCanvas'),'grid sizing worker must use OffscreenCanvas when available');
assert.ok(gridWorkerText.includes('measureText'),'grid sizing worker must measure text off the UI thread');
const firstRunText=fs.readFileSync(path.join(root,'v090-first-run-guard.js'),'utf8');
assert.ok(firstRunText.includes('launchFolderPickerAfterCoverPaint'),'folder picker must be launched after recovery-cover paint');
assert.ok(firstRunText.includes('startPickerCoverKeepalive'),'recovery cover must stay armed while native picker is open');
assert.ok(firstRunText.includes('legalPreloadActive()'),'first-run storage flow must detect legal preload');
assert.ok(firstRunText.includes('padgrade-legal-accepted'),'first-run storage choice must resume only after legal acceptance');
assert.ok(firstRunText.includes('layout-may-preload-under-legal-storage-choice-after-acceptance'),'legal preload policy marker missing');
const mapLoaderText=fs.readFileSync(path.join(root,'maplibre-loader.js'),'utf8');
assert.ok(mapLoaderText.includes('legalPreloadActive()'),'MapLibre loader must detect legal preload');
assert.ok(mapLoaderText.includes('legal.preload-map-deferred'),'map/network startup must be deferred during legal preload');
assert.ok(mapLoaderText.includes("window.addEventListener('padgrade-legal-accepted'"),'MapLibre must resume after legal acceptance');
const switchText=fs.readFileSync(path.join(root,'v090-project-switch-boundary.js'),'utf8');
assert.ok(switchText.includes('removeGridFamily(map)'),'project switching must remove old map grid layers/sources');
assert.ok(switchText.includes('installProjectGridFamily'),'project switching must recreate map grid layers/sources for the new project');
assert.ok(switchText.includes('closeProjectsDialog();'),'Open must close Projects before project work starts');
assert.ok(switchText.includes('requestAnimationFrame'),'project switch must give dialog close a paint frame');
const styleText=fs.readFileSync(path.join(root,'style.css'),'utf8');
assert.ok(styleText.includes('padding-bottom:1.18rem'),'project rows must reserve File-ID height before hydration');
assert.ok(styleText.includes('.pgFileIdInline{\n  position:absolute'),'File-ID text must live inside the pre-reserved slot');

console.log('Pad Grade dev self-test PASS');
