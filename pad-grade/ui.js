function renderGrid(){
  const s=cfg(), g=$('grid');
  g.innerHTML=''; g.style.gridTemplateColumns=`repeat(${s.cols},minmax(52px,1fr))`;
  for(let rr=s.rows-1; rr>=0; rr--){
    for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)];
      const [main,sub]=textFor(val);
      const d=document.createElement('div');
      d.className='cell '+classFor(val);
      const rc=refCoords(rr,c);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div>
                   <div class="xy">${rc.x.toFixed(1)}′ ${rc.xDir}<br>${rc.y.toFixed(1)}′ ${rc.yDir}</div>
                   <div class="main">${main}</div>
                   <div class="sub">${sub}</div>`;
      d.onclick=()=>openPoint(rr,c);
      g.appendChild(d);
    }
  }
  updateStats();
}
function updateStats(){
  const s=cfg();
  $('targetDisp').textContent=s.target.toFixed(1)+'″';
  $('nameDisp').textContent=s.name;
  $('dimDisp').textContent=`${s.width} × ${s.length} ft • ${s.cols} × ${s.rows} points • Ref ${s.refCorner}`;

  const vals=Object.values(readings).filter(Number.isFinite);
  $('countDisp').textContent=`${vals.length} / ${s.cols*s.rows}`;
  let maxCut=0,maxFill=0;
  for(const v of vals){
    const d=diffFor(v);
    if(d<0) maxCut=Math.max(maxCut,-d); else maxFill=Math.max(maxFill,d);
  }
  $('cutDisp').textContent=maxCut?maxCut.toFixed(1)+'″':'—';
  $('fillDisp').textContent=maxFill?maxFill.toFixed(1)+'″':'—';

  const dx=s.width/(s.cols-1), dy=s.length/(s.rows-1);
  let cutFt3=0, fillFt3=0;
  for(let r=0;r<s.rows;r++){
    for(let c=0;c<s.cols;c++){
      const v=readings[k(r,c)];
      if(!Number.isFinite(v)) continue;
      let area=dx*dy;
      if(r===0 || r===s.rows-1) area*=0.5;
      if(c===0 || c===s.cols-1) area*=0.5;
      const dIn=diffFor(v);
      const vol=area*Math.abs(dIn)/12;
      if(dIn< -s.tol) cutFt3+=vol;
      else if(dIn> s.tol) fillFt3+=vol;
    }
  }
  const cutY=cutFt3/27, fillY=fillFt3/27, netY=fillY-cutY;
  $('cutYd').textContent=vals.length?cutY.toFixed(1):'—';
  $('fillYd').textContent=vals.length?fillY.toFixed(1):'—';
  $('netYd').textContent=vals.length?(netY>=0?'+':'')+netY.toFixed(1):'—';
}
function openPoint(r,c){
  const s=cfg();
  currentIndex=indexFromPoint(r,c);
  $('locText').textContent=label(r,c);
  const rc=refCoords(r,c);
  $('coordText').textContent=`${rc.x.toFixed(1)} ft ${rc.xDir === 'E' ? 'east' : 'west'} • ${rc.y.toFixed(1)} ft ${rc.yDir === 'N' ? 'north' : 'south'} of ${s.refCorner} corner`;
  const val=readings[k(r,c)];
  $('readingInput').value=Number.isFinite(val)?val:'';
  updateModalResult();
  $('entryDlg').showModal();
  setTimeout(()=>$('readingInput').focus(),80);
}
function updateModalResult(){
  const v=+$('readingInput').value;
  if($('readingInput').value===''){ $('resultBox').textContent='Enter a reading'; return; }
  const d=diffFor(v), t=cfg().tol;
  if(Math.abs(d)<=t) $('resultBox').textContent=`ON GRADE • ${d>=0?'+':''}${d.toFixed(2)}″`;
  else if(d<0) $('resultBox').textContent=`CUT ${Math.abs(d).toFixed(2)}″`;
  else $('resultBox').textContent=`FILL ${d.toFixed(2)}″`;
}
function saveCurrent(){
  const {r,c}=pointFromIndex(currentIndex), key=k(r,c);
  const raw=$('readingInput').value;
  if(raw===''){ delete readings[key]; delete readingMeta[key]; }
  else{
    readings[key]=+raw;
    if(measureMode==='gps' && gpsPos){
      readingMeta[key]={lat:gpsPos.lat,lon:gpsPos.lon,accuracy_m:gpsPos.accuracy,timestamp:new Date().toISOString()};
    }
  }
  saveLocal(); renderGrid();
}
function nextPoint(emptyOnly=false){
  const s=cfg(), total=s.rows*s.cols;
  let start=currentIndex;
  for(let step=1;step<=total;step++){
    const idx=(start+step)%total;
    const {r,c}=pointFromIndex(idx);
    if(!emptyOnly || !Number.isFinite(readings[k(r,c)])){
      openPoint(r,c); return;
    }
  }
}
function prevPoint(){
  const s=cfg(), total=s.rows*s.cols;
  const idx=(currentIndex-1+total)%total;
  const {r,c}=pointFromIndex(idx); openPoint(r,c);
}
function nextEmpty(){
  const s=cfg(), total=s.rows*s.cols;
  for(let idx=0;idx<total;idx++){
    const {r,c}=pointFromIndex(idx);
    if(!Number.isFinite(readings[k(r,c)])){ openPoint(r,c); return; }
  }
  alert('All grid points have readings.');
}

function saveTextDownload(filename,mimeType,text){
  if(window.PadGradePlatform && typeof window.PadGradePlatform.saveTextFile==='function'){
    try{
      if(window.PadGradePlatform.saveTextFile(filename,mimeType,text)) return;
    }catch(e){}
  }
  const blob=new Blob([text],{type:mimeType});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
}

function exportProjectShared(){
  const s=cfg();
  const gpsPayload={reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex};
  let version=3;
  if(typeof gpsCorners!=='undefined' && gpsCorners && typeof gpsCorners==='object'){
    gpsPayload.corners=gpsCorners;
    gpsPayload.captureIndex=(typeof gpsCaptureIndex==='number')?gpsCaptureIndex:Object.keys(gpsCorners).length;
    version=4;
  }
  const payload={
    app:"Pad Grade Mapper Mobile",
    version,
    exportedAt:new Date().toISOString(),
    settings:s,
    readings:readings,
    readingMeta:readingMeta,
    gps:gpsPayload,
    measureMode:measureMode
  };
  const filename=(s.name||'pad_grade').replace(/[^\w-]+/g,'_')+'_project.json';
  saveTextDownload(filename,'application/json',JSON.stringify(payload,null,2));
}
function exportProject(){ return exportProjectShared(); }

async function importProjectFile(file){
  const raw=await file.text();
  const data=JSON.parse(raw);
  if(!data || typeof data!=='object' || !data.settings || !data.readings){
    throw new Error('Not a valid Pad Grade Mapper project file.');
  }
  const s=data.settings;
  const values={
    width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,
    tol:s.tol,refCorner:s.refCorner||'SW',projectName:s.name||'Pad'
  };
  for(const [id,val] of Object.entries(values)){
    if($(id) && val!==undefined) $(id).value=val;
  }
  readings={};
  for(const [key,val] of Object.entries(data.readings||{})){
    const n=Number(val);
    if(Number.isFinite(n)) readings[key]=n;
  }
  readingMeta=(data.readingMeta && typeof data.readingMeta==='object')?data.readingMeta:{};
  gpsRef=data.gps&&data.gps.reference?data.gps.reference:null;
  gpsOpposite=data.gps&&data.gps.opposite?data.gps.opposite:null;
  gpsTargetIndex=data.gps&&Number.isInteger(data.gps.targetIndex)?data.gps.targetIndex:null;
  measureMode=data.measureMode==='gps'?'gps':'manual';
  saveLocal();
  updateCornerPicker();
  renderGrid();
  updateGpsUI();
}

function exportCSV(){
  const s=cfg(), dx=s.width/(s.cols-1), dy=s.length/(s.rows-1);
  let rows=['location,x_ft,y_ft,rod_reading_in,target_in,status,difference_in,measured_lat,measured_lon,gps_accuracy_ft'];
  for(let r=0;r<s.rows;r++) for(let c=0;c<s.cols;c++){
    const v=readings[k(r,c)];
    if(!Number.isFinite(v)) continue;
    const d=diffFor(v);
    const status=Math.abs(d)<=s.tol?'GRADE':d<0?'CUT':'FILL';
    const m=readingMeta[k(r,c)]||{};
    rows.push([label(r,c),(c*dx).toFixed(2),(r*dy).toFixed(2),v,s.target,status,d.toFixed(2),m.lat??'',m.lon??'',Number.isFinite(m.accuracy_m)?(m.accuracy_m*FT_PER_M).toFixed(1):''].join(','));
  }
  const filename=(s.name||'pad_grade').replace(/[^\w-]+/g,'_')+'_readings.csv';
  saveTextDownload(filename,'text/csv',rows.join('\n'));
}
