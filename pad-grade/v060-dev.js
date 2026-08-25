/* Pad Grade Mapper v0.6.0-dev — units, notes, laser-aware routing, heat map, grading optimizers */
const PAD_GRADE_DEV_VERSION='0.6.0-dev';
const IN_PER_FT=12;
const MM_PER_IN=25.4;
const M_PER_FT=0.3048;
const M3_PER_YD3=0.764554857984;
let padGradeUnitMode='inches';
let padGradeLaser=null; // canonical pad coordinates in feet from SW corner
let padGradeSettingsSnapshot=null;
let padGradePlacingLaser=false;
let padGradeLastCalc=null;

function pgUnitMode(){return padGradeUnitMode||'inches';}
function pgPlanInputToFt(v,mode=pgUnitMode()){return mode==='metric'?v/M_PER_FT:v;}
function pgPlanFtToInput(v,mode=pgUnitMode()){return mode==='metric'?v*M_PER_FT:v;}
function pgRodInputToIn(v,mode=pgUnitMode()){return mode==='metric'?v*1000/MM_PER_IN:mode==='tenths'?v*IN_PER_FT:v;}
function pgRodInToInput(v,mode=pgUnitMode()){return mode==='metric'?v*MM_PER_IN/1000:mode==='tenths'?v/IN_PER_FT:v;}
function pgTolInputToIn(v,mode=pgUnitMode()){return mode==='metric'?v/MM_PER_IN:mode==='tenths'?v*IN_PER_FT:v;}
function pgTolInToInput(v,mode=pgUnitMode()){return mode==='metric'?v*MM_PER_IN:mode==='tenths'?v/IN_PER_FT:v;}
function pgRoundInput(v,d){return Number.isFinite(v)?Number(v.toFixed(d)):'';}
function pgFmtPlan(ft,digits=1){return pgUnitMode()==='metric'?`${(ft*M_PER_FT).toFixed(digits===1?2:digits)} m`:`${ft.toFixed(digits)} ft`;}
function pgFmtRod(inches){if(pgUnitMode()==='metric')return `${(inches*MM_PER_IN/1000).toFixed(3)} m`;if(pgUnitMode()==='tenths')return `${(inches/12).toFixed(2)} ft`;return `${inches.toFixed(2)}″`;}
function pgFmtGrade(inches,digits=1){if(pgUnitMode()==='metric')return `${(inches*MM_PER_IN).toFixed(0)} mm`;if(pgUnitMode()==='tenths')return `${(inches/12).toFixed(2)} ft`;return `${inches.toFixed(digits)}″`;}
function pgFmtArea(ft2){return pgUnitMode()==='metric'?`${(ft2*M_PER_FT*M_PER_FT).toFixed(0)} m²`:`${ft2.toFixed(0)} ft²`;}
function pgFmtVolumeYd(yd3){return pgUnitMode()==='metric'?`${(yd3*M3_PER_YD3).toFixed(1)} m³`:`${yd3.toFixed(1)} yd³`;}
function pgCanonicalSettingsFromUi(mode=pgUnitMode()){
  return {
    width:pgPlanInputToFt(+$('width').value||64,mode),
    length:pgPlanInputToFt(+$('length').value||76,mode),
    cols:Math.max(2,Math.min(20,+$('cols').value||9)),
    rows:Math.max(2,Math.min(20,+$('rows').value||9)),
    target:pgRodInputToIn(+$('target').value||0,mode),
    tol:Math.max(0,pgTolInputToIn(+$('tol').value||0,mode)),
    refCorner:$('refCorner').value||'SW',
    name:$('projectName').value||'Pad'
  };
}
function pgWriteCanonicalSettings(s,mode=pgUnitMode()){
  if(!s)return;
  $('width').value=pgRoundInput(pgPlanFtToInput(Number(s.width)||0,mode),mode==='metric'?2:1);
  $('length').value=pgRoundInput(pgPlanFtToInput(Number(s.length)||0,mode),mode==='metric'?2:1);
  if(s.cols!==undefined)$('cols').value=s.cols;
  if(s.rows!==undefined)$('rows').value=s.rows;
  $('target').value=pgRoundInput(pgRodInToInput(Number(s.target)||0,mode),mode==='metric'?3:mode==='tenths'?2:2);
  $('tol').value=pgRoundInput(pgTolInToInput(Number(s.tol)||0,mode),mode==='metric'?0:mode==='tenths'?2:2);
  if(s.refCorner!==undefined)$('refCorner').value=s.refCorner||'SW';
  if(s.name!==undefined)$('projectName').value=s.name||'Pad';
  pgRefreshUnitLabels();
}

// Keep the existing app's canonical storage: feet for horizontal geometry and inches for rod/grade values.
cfg=function(){return pgCanonicalSettingsFromUi(pgUnitMode());};

function pgRefreshUnitLabels(){
  const mode=pgUnitMode();
  const planUnit=mode==='metric'?'m':'ft';
  const targetUnit=mode==='metric'?'m':mode==='tenths'?'decimal ft':'in.';
  const tolUnit=mode==='metric'?'mm':mode==='tenths'?'ft':'in.';
  const w=$('width')&&$('width').parentElement,l=$('length')&&$('length').parentElement,t=$('target')&&$('target').parentElement,tol=$('tol')&&$('tol').parentElement;
  if(w&&w.firstChild)w.firstChild.nodeValue=`Pad width ${planUnit}`;
  if(l&&l.firstChild)l.firstChild.nodeValue=`Pad length ${planUnit}`;
  if(t&&t.firstChild)t.firstChild.nodeValue=`Target rod ${targetUnit}`;
  if(tol&&tol.firstChild)tol.firstChild.nodeValue=`Tolerance ${tolUnit}`;
  const readingLabel=$('readingInput')&&$('readingInput').parentElement.querySelector('label');
  if(readingLabel)readingLabel.textContent=`Actual rod reading (${targetUnit})`;
  if($('width'))$('width').step=mode==='metric'?'0.1':'0.1';
  if($('length'))$('length').step=mode==='metric'?'0.1':'0.1';
  if($('target'))$('target').step=mode==='metric'?'0.001':mode==='tenths'?'0.01':'0.01';
  if($('tol'))$('tol').step=mode==='metric'?'1':mode==='tenths'?'0.01':'0.05';
  if($('readingInput'))$('readingInput').step=mode==='metric'?'0.001':mode==='tenths'?'0.01':'0.01';
  const corner=$('cornerChoiceText'); if(corner)corner.textContent=`Reference: ${cfg().refCorner}`;
  pgUpdateLaserSummary();
}

function pgSetUnitMode(next){
  if(!['metric','tenths','inches'].includes(next))next='inches';
  const old=pgUnitMode();
  if(old===next){padGradeUnitMode=next;pgRefreshUnitLabels();return;}
  const canonical=pgCanonicalSettingsFromUi(old);
  padGradeUnitMode=next;
  if($('unitMode'))$('unitMode').value=next;
  pgWriteCanonicalSettings(canonical,next);
  if(typeof renderGrid==='function')renderGrid();
  if(typeof updateGpsUI==='function')updateGpsUI();
}

function pgDevPayload(){return {
  unitMode:pgUnitMode(),
  notes:$('projectNotes')?$('projectNotes').value:'',
  heatmap:$('heatmapToggle')?!!$('heatmapToggle').checked:true,
  routeMode:$('routeMode')?$('routeMode').value:'serpentine',
  laser:padGradeLaser
};}
function pgApplyDevPayload(dev){
  dev=dev&&typeof dev==='object'?dev:{};
  padGradeUnitMode=['metric','tenths','inches'].includes(dev.unitMode)?dev.unitMode:'inches';
  if($('unitMode'))$('unitMode').value=padGradeUnitMode;
  if($('projectNotes'))$('projectNotes').value=typeof dev.notes==='string'?dev.notes:'';
  if($('heatmapToggle'))$('heatmapToggle').checked=dev.heatmap!==false;
  if($('routeMode'))$('routeMode').value=dev.routeMode==='away'?'away':'serpentine';
  padGradeLaser=dev.laser&&Number.isFinite(+dev.laser.xFt)&&Number.isFinite(+dev.laser.yFt)?{xFt:+dev.laser.xFt,yFt:+dev.laser.yFt}:null;
  pgRefreshUnitLabels(); pgUpdateLaserSummary(); pgUpdateNotesSummary();
}

saveLocal=function(){
  const gpsPayload={reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex};
  if(typeof gpsCorners!=='undefined'){
    gpsPayload.corners=gpsCorners||{};
    gpsPayload.captureIndex=typeof gpsCaptureIndex==='number'?gpsCaptureIndex:Object.keys(gpsCorners||{}).length;
  }
  localStorage.setItem('padGradeMobile',JSON.stringify({settings:cfg(),readings,readingMeta,gps:gpsPayload,measureMode,dev:pgDevPayload()}));
};
loadLocal=function(){
  try{
    const d=JSON.parse(localStorage.getItem('padGradeMobile')||'null');
    if(!d){pgApplyDevPayload({unitMode:'inches',heatmap:true,routeMode:'serpentine'});pgWriteCanonicalSettings({width:64,length:76,cols:9,rows:9,target:64,tol:.5,refCorner:'SW',name:'60×72 Shop Pad'});return;}
    readings=d.readings||{};readingMeta=d.readingMeta||{};measureMode=d.measureMode==='gps'?'gps':'manual';
    pgApplyDevPayload(d.dev||{});
    pgWriteCanonicalSettings(d.settings||{},pgUnitMode());
    if(typeof gpsCorners!=='undefined'){
      gpsCorners=d.gps&&d.gps.corners&&typeof d.gps.corners==='object'?d.gps.corners:{};
      gpsCaptureIndex=d.gps&&Number.isInteger(d.gps.captureIndex)?Math.max(0,Math.min(4,d.gps.captureIndex)):Object.keys(gpsCorners).length;
    }
    gpsTargetIndex=d.gps&&Number.isInteger(d.gps.targetIndex)?d.gps.targetIndex:null;
    gpsRef=d.gps&&d.gps.reference?d.gps.reference:null; gpsOpposite=d.gps&&d.gps.opposite?d.gps.opposite:null;
    if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();
  }catch(e){console.warn('Pad Grade dev load failed',e);}
};

function pgSaveTextDownload(filename,mimeType,text){
  if(window.PadGradePlatform&&typeof window.PadGradePlatform.saveTextFile==='function'){
    try{if(window.PadGradePlatform.saveTextFile(filename,mimeType,text))return;}catch(e){}
  }
  const blob=new Blob([text],{type:mimeType}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);
}
exportProjectShared=function(){
  const s=cfg(),gpsPayload={reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex};
  if(typeof gpsCorners!=='undefined'){gpsPayload.corners=gpsCorners||{};gpsPayload.captureIndex=typeof gpsCaptureIndex==='number'?gpsCaptureIndex:Object.keys(gpsCorners||{}).length;}
  const payload={app:'Pad Grade Mapper Mobile',version:5,mapperVersion:PAD_GRADE_DEV_VERSION,exportedAt:new Date().toISOString(),settings:s,readings,readingMeta,gps:gpsPayload,measureMode,dev:pgDevPayload()};
  pgSaveTextDownload((s.name||'pad_grade').replace(/[^\w-]+/g,'_')+'_project.json','application/json',JSON.stringify(payload,null,2));
};
exportProject=exportProjectShared;
importProjectFile=async function(file){
  const data=JSON.parse(await file.text()); if(!data||typeof data!=='object'||!data.settings||!data.readings)throw new Error('Not a valid Pad Grade Mapper project file.');
  readings={};for(const [key,val] of Object.entries(data.readings||{})){const n=Number(val);if(Number.isFinite(n))readings[key]=n;}
  readingMeta=data.readingMeta&&typeof data.readingMeta==='object'?data.readingMeta:{}; measureMode=data.measureMode==='gps'?'gps':'manual';
  pgApplyDevPayload(data.dev||{});pgWriteCanonicalSettings(data.settings,pgUnitMode());
  if(typeof gpsCorners!=='undefined'){gpsCorners=data.gps&&data.gps.corners&&typeof data.gps.corners==='object'?data.gps.corners:{};gpsCaptureIndex=data.gps&&Number.isInteger(data.gps.captureIndex)?Math.max(0,Math.min(4,data.gps.captureIndex)):Object.keys(gpsCorners).length;}
  gpsTargetIndex=data.gps&&Number.isInteger(data.gps.targetIndex)?data.gps.targetIndex:null;gpsRef=data.gps&&data.gps.reference?data.gps.reference:null;gpsOpposite=data.gps&&data.gps.opposite?data.gps.opposite:null;
  if(typeof syncLegacyCalibration==='function')syncLegacyCalibration(); saveLocal();updateCornerPicker();renderGrid();updateGpsUI();pgUpdateNotesSummary();
};

textFor=function(v){
  if(v===undefined||Number.isNaN(v))return ['—',''];
  const d=diffFor(v),t=cfg().tol,reading=pgFmtRod(v);
  if(Math.abs(d)<=t)return [reading,'GRADE'];
  if(d<0)return [reading,`CUT ${pgFmtGrade(Math.abs(d))}`];
  return [reading,`FILL ${pgFmtGrade(d)}`];
};
renderGrid=function(){
  const s=cfg(),g=$('grid');g.innerHTML='';g.style.gridTemplateColumns=`repeat(${s.cols},minmax(52px,1fr))`;
  for(let rr=s.rows-1;rr>=0;rr--){for(let c=0;c<s.cols;c++){
    const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);d.className='cell '+classFor(val);d.dataset.r=rr;d.dataset.c=c;
    d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy">${pgFmtPlan(rc.x,1)} ${rc.xDir}<br>${pgFmtPlan(rc.y,1)} ${rc.yDir}</div><div class="main">${main}</div><div class="sub">${sub}</div>`;
    d.onclick=()=>{if(!padGradePlacingLaser)openPoint(rr,c);};g.appendChild(d);
  }}
  updateStats();pgScheduleSurfaceDraw();
};

const pgBaseUpdateStats=updateStats;
updateStats=function(){
  pgBaseUpdateStats();const s=cfg(),vals=Object.values(readings).filter(Number.isFinite);
  $('targetDisp').textContent=pgFmtRod(s.target);$('dimDisp').textContent=`${pgFmtPlan(s.width,1)} × ${pgFmtPlan(s.length,1)} • ${s.cols} × ${s.rows} points • Ref ${s.refCorner}`;
  let maxCut=0,maxFill=0;for(const v of vals){const d=diffFor(v);if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}
  $('cutDisp').textContent=maxCut?pgFmtGrade(maxCut):'—';$('fillDisp').textContent=maxFill?pgFmtGrade(maxFill):'—';
  const spans=document.querySelectorAll('.volume .vol span');
  if(pgUnitMode()==='metric'){
    if(spans[0])spans[0].textContent='cut m³';if(spans[1])spans[1].textContent='fill m³';if(spans[2])spans[2].textContent='net m³';
    for(const id of ['cutYd','fillYd','netYd']){const el=$(id),n=parseFloat(el&&el.textContent);if(el&&Number.isFinite(n))el.textContent=(n*M3_PER_YD3>=0&&id==='netYd'?'+':'')+(n*M3_PER_YD3).toFixed(1);}
  }else{if(spans[0])spans[0].textContent='cut yd³';if(spans[1])spans[1].textContent='fill yd³';if(spans[2])spans[2].textContent='net yd³';}
};
openPoint=function(r,c){
  const s=cfg();currentIndex=indexFromPoint(r,c);$('locText').textContent=label(r,c);const rc=refCoords(r,c);$('coordText').textContent=`${pgFmtPlan(rc.x,1)} ${rc.xDir==='E'?'east':'west'} • ${pgFmtPlan(rc.y,1)} ${rc.yDir==='N'?'north':'south'} of ${s.refCorner} corner`;
  const val=readings[k(r,c)];$('readingInput').value=Number.isFinite(val)?pgRoundInput(pgRodInToInput(val),pgUnitMode()==='metric'?3:2):'';updateModalResult();$('entryDlg').showModal();setTimeout(()=>$('readingInput').focus(),80);
};
updateModalResult=function(){
  if($('readingInput').value===''){$('resultBox').textContent='Enter a reading';return;}const v=pgRodInputToIn(+$('readingInput').value),d=v-cfg().target,t=cfg().tol;
  if(Math.abs(d)<=t)$('resultBox').textContent=`ON GRADE • ${d>=0?'+':''}${pgFmtGrade(d,2)}`;else if(d<0)$('resultBox').textContent=`CUT ${pgFmtGrade(Math.abs(d),2)}`;else $('resultBox').textContent=`FILL ${pgFmtGrade(d,2)}`;
};
saveCurrent=function(){
  const {r,c}=pointFromIndex(currentIndex),key=k(r,c),raw=$('readingInput').value;if(raw===''){delete readings[key];delete readingMeta[key];}else{readings[key]=pgRodInputToIn(+raw);if(measureMode==='gps'&&gpsPos)readingMeta[key]={lat:gpsPos.lat,lon:gpsPos.lon,accuracy_m:gpsPos.accuracy,timestamp:new Date().toISOString()};}saveLocal();renderGrid();
};
exportCSV=function(){
  const s=cfg(),dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),metric=pgUnitMode()==='metric',decimal=pgUnitMode()==='tenths';
  const planUnit=metric?'m':'ft',rodUnit=metric?'m':decimal?'ft':'in',gradeUnit=metric?'mm':decimal?'ft':'in';let out=[`location,x_${planUnit},y_${planUnit},rod_reading_${rodUnit},target_${rodUnit},status,difference_${gradeUnit},measured_lat,measured_lon,gps_accuracy_${planUnit}`];
  for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){const v=readings[k(r,c)];if(!Number.isFinite(v))continue;const d=diffFor(v),status=Math.abs(d)<=s.tol?'GRADE':d<0?'CUT':'FILL',m=readingMeta[k(r,c)]||{},x=c*dx,y=r*dy;
    const xp=metric?x*M_PER_FT:x,yp=metric?y*M_PER_FT:y,rv=metric?v*MM_PER_IN/1000:decimal?v/12:v,tv=metric?s.target*MM_PER_IN/1000:decimal?s.target/12:s.target,dv=metric?d*MM_PER_IN:decimal?d/12:d,acc=Number.isFinite(m.accuracy_m)?(metric?m.accuracy_m:m.accuracy_m*FT_PER_M):'';
    out.push([label(r,c),xp.toFixed(2),yp.toFixed(2),rv.toFixed(metric?3:2),tv.toFixed(metric?3:2),status,dv.toFixed(metric?0:2),m.lat??'',m.lon??'',Number.isFinite(acc)?acc.toFixed(1):''].join(','));}
  pgSaveTextDownload((s.name||'pad_grade').replace(/[^\w-]+/g,'_')+'_readings.csv','text/csv',out.join('\n'));
};

function pgRouteMode(){return $('routeMode')&&$('routeMode').value==='away'?'away':'serpentine';}
function pgGridPointXY(r,c){const s=cfg();return{x:c*s.width/(s.cols-1),y:r*s.length/(s.rows-1)};}
function pgDistToLaser(r,c){if(!padGradeLaser)return Infinity;const p=pgGridPointXY(r,c);return Math.hypot(p.x-padGradeLaser.xFt,p.y-padGradeLaser.yFt);}
const pgBaseGpsRoute=gpsRoute;
gpsRoute=function(){
  if(pgRouteMode()!=='away'||!padGradeLaser)return pgBaseGpsRoute();const s=cfg(),rs=[...Array(s.rows).keys()];
  const rowDistance=r=>{const y=r*s.length/(s.rows-1),x=Math.max(0,Math.min(s.width,padGradeLaser.xFt));return Math.hypot(x-padGradeLaser.xFt,y-padGradeLaser.yFt);};
  rs.sort((a,b)=>rowDistance(a)-rowDistance(b));const route=[];
  for(const r of rs){let cs=[...Array(s.cols).keys()];if(pgDistToLaser(r,s.cols-1)<pgDistToLaser(r,0))cs.reverse();for(const c of cs)route.push(indexFromPoint(r,c));}
  return route;
};
const pgBaseUpdateGpsUI=updateGpsUI;
updateGpsUI=function(){pgBaseUpdateGpsUI();if(measureMode!=='gps'||pgRouteMode()!=='away'||!padGradeLaser||gpsTargetIndex==null)return;const route=gpsRoute(),pos=route.indexOf(gpsTargetIndex);if(pos>0){const a=pointFromIndex(route[pos-1]),b=pointFromIndex(route[pos]);if(a.r!==b.r&&$('gpsInstruction'))$('gpsInstruction').textContent=`Return to the near end of the next row at ${label(b.r,b.c)} without taking readings; then survey that row away from the laser.`;}};

function pgMeasuredSurfacePoints(){const s=cfg(),pts=[];for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){const v=readings[k(r,c)];if(Number.isFinite(v)){const p=pgGridPointXY(r,c);pts.push({x:p.x,y:p.y,v,r,c});}}return pts;}
function pgCircumcircle(a,b,c){const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(d)<1e-9)return null;const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y,ux=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,uy=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d;return{x:ux,y:uy,r2:(ux-a.x)*(ux-a.x)+(uy-a.y)*(uy-a.y)};}
function pgDelaunay(input){
  if(input.length<3)return[];const pts=input.map(p=>({x:p.x,y:p.y}));let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}const dx=maxX-minX,dy=maxY-minY,span=Math.max(dx,dy)||1,cx=(minX+maxX)/2,cy=(minY+maxY)/2,n=pts.length;
  pts.push({x:cx-20*span,y:cy-10*span},{x:cx,y:cy+20*span},{x:cx+20*span,y:cy-10*span});let tris=[[n,n+1,n+2]];
  for(let i=0;i<n;i++){
    const bad=[];for(let ti=0;ti<tris.length;ti++){const tr=tris[ti],cc=pgCircumcircle(pts[tr[0]],pts[tr[1]],pts[tr[2]]);if(cc&&((pts[i].x-cc.x)**2+(pts[i].y-cc.y)**2)<=cc.r2+1e-7)bad.push(ti);}
    const edgeCount=new Map();for(const ti of bad){const tr=tris[ti];for(const [a,b] of [[tr[0],tr[1]],[tr[1],tr[2]],[tr[2],tr[0]]]){const lo=Math.min(a,b),hi=Math.max(a,b),key=`${lo},${hi}`;edgeCount.set(key,(edgeCount.get(key)||0)+1);}}
    const badSet=new Set(bad);tris=tris.filter((_,ti)=>!badSet.has(ti));for(const [key,count] of edgeCount){if(count!==1)continue;const [a,b]=key.split(',').map(Number);tris.push([a,b,i]);}
  }
  return tris.filter(t=>t[0]<n&&t[1]<n&&t[2]<n&&Math.abs((pts[t[1]].x-pts[t[0]].x)*(pts[t[2]].y-pts[t[0]].y)-(pts[t[1]].y-pts[t[0]].y)*(pts[t[2]].x-pts[t[0]].x))>1e-8);
}
function pgPointInTriangle(x,y,a,b,c){const v0x=c.x-a.x,v0y=c.y-a.y,v1x=b.x-a.x,v1y=b.y-a.y,v2x=x-a.x,v2y=y-a.y,d00=v0x*v0x+v0y*v0y,d01=v0x*v1x+v0y*v1y,d02=v0x*v2x+v0y*v2y,d11=v1x*v1x+v1y*v1y,d12=v1x*v2x+v1y*v2y,den=d00*d11-d01*d01;if(Math.abs(den)<1e-12)return false;const u=(d11*d02-d01*d12)/den,v=(d00*d12-d01*d02)/den;return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7;}
function pgTriangleAt(x,y,pts,tris){for(const tr of tris){const a=pts[tr[0]],b=pts[tr[1]],c=pts[tr[2]];if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||y<Math.min(a.y,b.y,c.y)||y>Math.max(a.y,b.y,c.y))continue;if(pgPointInTriangle(x,y,a,b,c))return tr;}return null;}
function pgIdw2(x,y,pts){let sw=0,sv=0;for(const p of pts){const d2=(p.x-x)**2+(p.y-y)**2;if(d2<1e-10)return p.v;const w=1/d2;sw+=w;sv+=w*p.v;}return sw?sv/sw:NaN;}
function pgSurfaceSamples(res=80){const s=cfg(),pts=pgMeasuredSurfacePoints(),tris=pgDelaunay(pts);if(!tris.length)return{pts,tris,samples:[],coveredFt2:0};const nx=Math.max(24,Math.min(res,120)),ny=Math.max(24,Math.round(nx*s.length/Math.max(s.width,1))),area=s.width*s.length/(nx*ny),samples=[];for(let iy=0;iy<ny;iy++){const y=(iy+.5)/ny*s.length;for(let ix=0;ix<nx;ix++){const x=(ix+.5)/nx*s.width;if(!pgTriangleAt(x,y,pts,tris))continue;const v=pgIdw2(x,y,pts);if(Number.isFinite(v))samples.push({x,y,v,areaFt2:area});}}return{pts,tris,samples,coveredFt2:samples.length*area};}
function pgEarthworkAt(targetIn,surface,tolIn=cfg().tol){let cutFt3=0,fillFt3=0,disturbedFt2=0,signedFt3=0;for(const p of surface.samples){const d=p.v-targetIn,signed=p.areaFt2*d/12;signedFt3+=signed;if(d< -tolIn){cutFt3+=p.areaFt2*(-d)/12;disturbedFt2+=p.areaFt2;}else if(d>tolIn){fillFt3+=p.areaFt2*d/12;disturbedFt2+=p.areaFt2;}}return{cutYd3:cutFt3/27,fillYd3:fillFt3/27,netYd3:(fillFt3-cutFt3)/27,signedNetYd3:signedFt3/27,disturbedFt2};}
function pgCalculateTargets(){
  const surface=pgSurfaceSamples(90);if(surface.samples.length<3)return{error:'At least three non-collinear measured points are required before the surface can be interpolated.'};
  const values=surface.samples.map(p=>p.v),neutral=values.reduce((a,b)=>a+b,0)/values.length,tol=cfg().tol,sorted=[...values].sort((a,b)=>a-b);let bestI=0,bestJ=0,bestCount=0,bestTarget=neutral;
  for(let i=0,j=0;i<sorted.length;i++){if(j<i)j=i;while(j<sorted.length&&sorted[j]-sorted[i]<=2*tol+1e-9)j++;const count=j-i;if(count>bestCount){bestCount=count;bestI=i;bestJ=j-1;bestTarget=(sorted[i]+sorted[j-1])/2;}else if(count===bestCount&&count>0){const candidate=(sorted[i]+sorted[j-1])/2;if(Math.abs(candidate-neutral)<Math.abs(bestTarget-neutral)){bestI=i;bestJ=j-1;bestTarget=candidate;}}}
  const neutralWork=pgEarthworkAt(neutral,surface,tol),minWork=pgEarthworkAt(bestTarget,surface,tol);return{surface,neutral,neutralWork,minAreaTarget:bestTarget,minAreaWork:minWork,coveredFt2:surface.coveredFt2,tolerance:tol};
}
function pgRenderCalc(){const el=$('gradeCalcResults');if(!el)return;const r=padGradeLastCalc;if(!r){el.innerHTML='<div class="small">Calculate after enough survey points are recorded.</div>';return;}if(r.error){el.innerHTML=`<div class="warnText">${r.error}</div>`;return;}el.innerHTML=`
  <div class="calcOption"><div><b>Net-zero earthwork target</b><span>${pgFmtRod(r.neutral)} • cut ${pgFmtVolumeYd(r.neutralWork.cutYd3)} • fill ${pgFmtVolumeYd(r.neutralWork.fillYd3)}</span></div><button id="applyNeutralTarget">Apply</button></div>
  <div class="calcOption"><div><b>Minimum disturbed-area target</b><span>${pgFmtRod(r.minAreaTarget)} • disturb ${pgFmtArea(r.minAreaWork.disturbedFt2)} of ${pgFmtArea(r.coveredFt2)} • tolerance ${pgFmtGrade(r.tolerance)}</span></div><button id="applyMinAreaTarget">Apply</button></div>
  <div class="small">Minimum disturbed area treats locations within the current tolerance as requiring no dirt work. Neither result changes the target until you tap Apply.</div>`;
  $('applyNeutralTarget').onclick=()=>pgApplySuggestedTarget(r.neutral);$('applyMinAreaTarget').onclick=()=>pgApplySuggestedTarget(r.minAreaTarget);
}
function pgApplySuggestedTarget(targetIn){$('target').value=pgRoundInput(pgRodInToInput(targetIn),pgUnitMode()==='metric'?3:2);saveLocal();renderGrid();updateGpsUI();padGradeLastCalc=pgCalculateTargets();pgRenderCalc();}

function pgSurfaceColor(diff,maxAbs,tol){const grade=[79,143,58],cut=[168,58,43],fill=[49,95,168];if(maxAbs<=0)return grade;const mag=Math.min(1,Math.abs(diff)/maxAbs);const base=diff<0?cut:fill;const near=Math.abs(diff)<=tol?Math.abs(diff)/Math.max(tol,1e-6)*.25:.25+.75*mag;const t=Math.min(1,near),rgb=grade.map((g,i)=>Math.round(g+(base[i]-g)*t));return[rgb[0],rgb[1],rgb[2],92];}
function pgEnsureGridLayers(){
  const g=$('grid');if(!g||$('gradeMapStack'))return;const stack=document.createElement('div');stack.id='gradeMapStack';stack.className='gradeMapStack';g.parentNode.insertBefore(stack,g);stack.appendChild(g);const canvas=document.createElement('canvas');canvas.id='gradeHeatmap';canvas.className='gradeHeatmap';stack.appendChild(canvas);const marker=document.createElement('div');marker.id='laserMarker';marker.className='laserMarker';marker.innerHTML='<span>✦</span><b>LASER</b>';stack.appendChild(marker);const layer=document.createElement('div');layer.id='laserPlacementLayer';layer.className='laserPlacementLayer';stack.appendChild(layer);
  layer.addEventListener('pointerdown',ev=>{if(!padGradePlacingLaser)return;const rect=layer.getBoundingClientRect(),s=cfg(),x=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width)),y=Math.max(0,Math.min(1,(ev.clientY-rect.top)/rect.height));padGradeLaser={xFt:x*s.width,yFt:(1-y)*s.length};padGradePlacingLaser=false;layer.classList.remove('active');pgUpdateLaserSummary();saveLocal();renderGrid();});
}
function pgScheduleSurfaceDraw(){requestAnimationFrame(()=>{pgEnsureGridLayers();pgDrawSurface();pgDrawLaser();});}
function pgDrawSurface(){
  const canvas=$('gradeHeatmap'),g=$('grid');if(!canvas||!g)return;const enabled=!$('heatmapToggle')||$('heatmapToggle').checked,rect=g.getBoundingClientRect();if(rect.width<1||rect.height<1)return;const w=Math.max(120,Math.min(260,Math.round(rect.width/3))),h=Math.max(120,Math.min(260,Math.round(rect.height/3)));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);if(!enabled)return;
  const s=cfg(),pts=pgMeasuredSurfacePoints(),tris=pgDelaunay(pts);if(!tris.length)return;const img=ctx.createImageData(w,h),target=s.target,tol=s.tol,maxAbs=Math.max(tol*2,...pts.map(p=>Math.abs(p.v-target)),1);
  for(let py=0;py<h;py++){const y=(1-(py+.5)/h)*s.length;for(let px=0;px<w;px++){const x=(px+.5)/w*s.width;if(!pgTriangleAt(x,y,pts,tris))continue;const v=pgIdw2(x,y,pts);if(!Number.isFinite(v))continue;const col=pgSurfaceColor(v-target,maxAbs,tol),i=(py*w+px)*4;img.data[i]=col[0];img.data[i+1]=col[1];img.data[i+2]=col[2];img.data[i+3]=col[3];}}
  ctx.putImageData(img,0,0);
}
function pgDrawLaser(){const marker=$('laserMarker');if(!marker)return;if(!padGradeLaser){marker.classList.remove('show');return;}const s=cfg();marker.style.left=(padGradeLaser.xFt/s.width*100)+'%';marker.style.top=((1-padGradeLaser.yFt/s.length)*100)+'%';marker.classList.add('show');}
function pgStartLaserPlacement(){pgEnsureGridLayers();padGradePlacingLaser=true;$('laserPlacementLayer').classList.add('active');if($('settingsDlg').open)$('settingsDlg').close();window.scrollTo({top:$('grid').getBoundingClientRect().top+window.scrollY-100,behavior:'smooth'});}
function pgUpdateLaserSummary(){const el=$('laserSummary');if(!el)return;el.textContent=padGradeLaser?`${pgFmtPlan(padGradeLaser.xFt,1)} east • ${pgFmtPlan(padGradeLaser.yFt,1)} north of SW`:'Not placed';pgDrawLaser();}
function pgUpdateNotesSummary(){const card=$('notesSummaryCard'),text=$('notesSummaryText'),notes=$('projectNotes')?$('projectNotes').value.trim():'';if(!card||!text)return;card.hidden=!notes;text.textContent=notes;}

function pgAugmentUi(){
  const sg=$('settingsDlg').querySelector('.settingsGrid');
  if(!$('unitMode'))sg.insertAdjacentHTML('beforeend',`<label>Units<select id="unitMode"><option value="inches">Inches</option><option value="tenths">Feet &amp; tenths</option><option value="metric">Metric</option></select></label>`);
  const field=$('projectName').closest('.field');
  if(!$('projectNotes'))field.insertAdjacentHTML('afterend',`<div class="field"><label>Project / survey notes</label><textarea id="projectNotes" rows="4" placeholder="Benchmarks, laser setup, site conditions, assumptions…"></textarea></div>`);
  if(!$('routeMode'))field.insertAdjacentHTML('afterend',`<div class="devSettingsBlock"><label>Survey route<select id="routeMode"><option value="serpentine">Serpentine — fastest</option><option value="away">Away from laser — return to row start</option></select></label><label class="checkLine"><input type="checkbox" id="heatmapToggle" checked> Show interpolated IDW² heat map</label><div class="laserRow"><div><b>Laser level</b><div class="small" id="laserSummary">Not placed</div></div><div><button type="button" id="placeLaserBtn">Place on pad</button><button type="button" id="clearLaserBtn">Clear</button></div></div></div>`);
  const gridCard=$('grid').closest('.card');
  if(!$('notesSummaryCard'))gridCard.insertAdjacentHTML('beforebegin',`<div class="card" id="notesSummaryCard" hidden><b>Project Notes</b><div class="notesSummary" id="notesSummaryText"></div></div>`);
  const volumeCard=$('cutYd').closest('.card');
  if(!$('gradeCalcCard'))volumeCard.insertAdjacentHTML('afterend',`<div class="card" id="gradeCalcCard"><div class="gridHeader"><div><b>Grade Optimization</b><div class="small">Uses the interpolated measured surface only; unspanned areas remain excluded.</div></div><button id="calcGradeOptions" type="button">Calculate</button></div><div id="gradeCalcResults"><div class="small">Calculate after enough survey points are recorded.</div></div></div>`);
  pgEnsureGridLayers();
  $('unitMode').addEventListener('change',e=>pgSetUnitMode(e.target.value));
  $('heatmapToggle').addEventListener('change',()=>{saveLocal();pgScheduleSurfaceDraw();});
  $('routeMode').addEventListener('change',()=>{gpsTargetIndex=null;ensureGpsTarget();saveLocal();updateGpsUI();});
  $('projectNotes').addEventListener('input',()=>pgUpdateNotesSummary());
  $('placeLaserBtn').onclick=pgStartLaserPlacement;$('clearLaserBtn').onclick=()=>{padGradeLaser=null;saveLocal();pgUpdateLaserSummary();renderGrid();};
  $('calcGradeOptions').onclick=()=>{padGradeLastCalc=pgCalculateTargets();pgRenderCalc();};
  window.addEventListener('resize',pgScheduleSurfaceDraw);
}

pgAugmentUi();
// init.js installs the legacy button handlers after this script. Add non-destructive wrappers on the next task.
setTimeout(()=>{
  $('settingsBtn').addEventListener('click',()=>{padGradeSettingsSnapshot={settings:cfg(),dev:pgDevPayload(),laser:padGradeLaser?{...padGradeLaser}:null};});
  $('cancelSettings').addEventListener('click',()=>{if(!padGradeSettingsSnapshot)return;pgApplyDevPayload(padGradeSettingsSnapshot.dev);padGradeLaser=padGradeSettingsSnapshot.laser;pgWriteCanonicalSettings(padGradeSettingsSnapshot.settings,pgUnitMode());pgUpdateLaserSummary();padGradeSettingsSnapshot=null;});
  $('applySettings').addEventListener('click',()=>{padGradeSettingsSnapshot=null;pgUpdateNotesSummary();pgScheduleSurfaceDraw();});
  pgRefreshUnitLabels();pgUpdateNotesSummary();pgUpdateLaserSummary();
},0);
