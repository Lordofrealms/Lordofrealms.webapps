const $=id=>document.getElementById(id);
let readings={};
let readingMeta={};
let currentIndex=0;
let measureMode='manual';
let gpsRef=null;
let gpsOpposite=null;
let gpsPos=null;
let gpsWatchId=null;
let gpsEnabled=false;
let gpsErrorText='';
let gpsTargetIndex=null;
const FT_PER_M=3.280839895;
const EARTH_M=6378137;

function cfg(){
  return {
    width:+$('width').value||64, length:+$('length').value||76,
    cols:Math.max(2,Math.min(20,+$('cols').value||9)),
    rows:Math.max(2,Math.min(20,+$('rows').value||9)),
    target:+$('target').value||0, tol:Math.max(0,+$('tol').value||0),
    refCorner:$('refCorner').value||'SW',
    name:$('projectName').value||'Pad'
  };
}
function k(r,c){return `${r},${c}`}
function label(r,c){
  const row=String.fromCharCode(65+r);
  return `${row}${c+1}`;
}
function pointFromIndex(i){
  const s=cfg(); return {r:Math.floor(i/s.cols), c:i%s.cols};
}
function indexFromPoint(r,c){return r*cfg().cols+c}

function refCoords(r,c){
  const s=cfg();
  const xAbs=c*s.width/(s.cols-1);
  const yAbs=r*s.length/(s.rows-1);

  let x=0,y=0, xDir='E', yDir='N';

  if(s.refCorner.includes('W')){
    x=xAbs; xDir='E';
  }else{
    x=s.width-xAbs; xDir='W';
  }

  if(s.refCorner.includes('S')){
    y=yAbs; yDir='N';
  }else{
    y=s.length-yAbs; yDir='S';
  }

  return {x,y,xDir,yDir};
}

function selectedCornerPoint(){
  const s=cfg();
  return {
    r:s.refCorner.includes('S')?0:s.rows-1,
    c:s.refCorner.includes('W')?0:s.cols-1
  };
}
function oppositeCornerName(){
  return {SW:'NE',NE:'SW',SE:'NW',NW:'SE'}[cfg().refCorner]||'NE';
}
function oppositeCornerPoint(){
  const s=cfg();
  return {
    r:s.refCorner.includes('S')?s.rows-1:0,
    c:s.refCorner.includes('W')?s.cols-1:0
  };
}
function gpsRoute(){
  const s=cfg();
  // After two-corner calibration the user is physically standing at the
  // opposite corner, so start the serpentine route there.
  const startCorner=gpsOpposite?oppositeCornerName():s.refCorner;
  const rs=[...Array(s.rows).keys()];
  const cs=[...Array(s.cols).keys()];
  if(startCorner.includes('N')) rs.reverse();
  const firstCols=startCorner.includes('E')?[...cs].reverse():cs;
  const route=[];
  rs.forEach((r,i)=>{
    const rowCols=i%2===0?firstCols:[...firstCols].reverse();
    rowCols.forEach(c=>route.push(indexFromPoint(r,c)));
  });
  return route;
}
function routePosition(idx){ return gpsRoute().indexOf(idx); }
function nextGpsRouteIndex(emptyOnly=true,fromIndex=gpsTargetIndex){
  const route=gpsRoute();
  if(!route.length) return null;
  let pos=fromIndex==null?-1:route.indexOf(fromIndex);
  if(pos< -1) pos=-1;
  for(let step=1;step<=route.length;step++){
    const idx=route[(pos+step)%route.length];
    const {r,c}=pointFromIndex(idx);
    if(!emptyOnly || !Number.isFinite(readings[k(r,c)])) return idx;
  }
  return null;
}
function prevGpsRouteIndex(fromIndex=gpsTargetIndex){
  const route=gpsRoute();
  if(!route.length) return null;
  let pos=fromIndex==null?0:route.indexOf(fromIndex);
  if(pos<0) pos=0;
  return route[(pos-1+route.length)%route.length];
}
function ensureGpsTarget(){
  if(!gpsRef || !gpsOpposite){ gpsTargetIndex=null; return; }
  if(gpsTargetIndex!=null){
    const {r,c}=pointFromIndex(gpsTargetIndex);
    if(r<cfg().rows && c<cfg().cols && !Number.isFinite(readings[k(r,c)])) return;
    if(r<cfg().rows && c<cfg().cols){
      gpsTargetIndex=nextGpsRouteIndex(true,gpsTargetIndex);
      if(gpsTargetIndex!=null) return;
    }
  }
  const corner=oppositeCornerPoint();
  const cornerIdx=indexFromPoint(corner.r,corner.c);
  if(!Number.isFinite(readings[k(corner.r,corner.c)])) gpsTargetIndex=cornerIdx;
  else gpsTargetIndex=nextGpsRouteIndex(true,cornerIdx);
}
function calibrationRotationRad(){
  if(!gpsRef || !gpsOpposite) return null;
  const d=localDeltaFeet(gpsRef.lat,gpsRef.lon,gpsOpposite.lat,gpsOpposite.lon);
  const s=cfg();
  const localDiagX=(s.refCorner.includes('W')?1:-1)*s.width;
  const localDiagY=(s.refCorner.includes('S')?1:-1)*s.length;
  const measuredAngle=Math.atan2(d.north,d.east);
  const localDiagAngle=Math.atan2(localDiagY,localDiagX);
  return measuredAngle-localDiagAngle;
}
function calibrationStats(){
  if(!gpsRef || !gpsOpposite) return null;
  const d=localDeltaFeet(gpsRef.lat,gpsRef.lon,gpsOpposite.lat,gpsOpposite.lon);
  const designed=Math.hypot(cfg().width,cfg().length);
  const theta=calibrationRotationRad();
  return {
    measured:d.distance,
    designed,
    mismatch:d.distance-designed,
    rotationDeg:theta*180/Math.PI
  };
}
function targetLatLon(idx){
  if(!gpsRef || !gpsOpposite || idx==null) return null;
  const {r,c}=pointFromIndex(idx), rc=refCoords(r,c);
  const localX=rc.x*(rc.xDir==='E'?1:-1);
  const localY=rc.y*(rc.yDir==='N'?1:-1);
  const theta=calibrationRotationRad();
  const eastFt=localX*Math.cos(theta)-localY*Math.sin(theta);
  const northFt=localX*Math.sin(theta)+localY*Math.cos(theta);
  const northM=northFt/FT_PER_M, eastM=eastFt/FT_PER_M;
  const latRad=gpsRef.lat*Math.PI/180;
  return {
    lat:gpsRef.lat+(northM/EARTH_M)*180/Math.PI,
    lon:gpsRef.lon+(eastM/(EARTH_M*Math.cos(latRad)))*180/Math.PI
  };
}
function localDeltaFeet(fromLat,fromLon,toLat,toLon){
  const lat0=((fromLat+toLat)/2)*Math.PI/180;
  const northM=(toLat-fromLat)*Math.PI/180*EARTH_M;
  const eastM=(toLon-fromLon)*Math.PI/180*EARTH_M*Math.cos(lat0);
  const east=eastM*FT_PER_M, north=northM*FT_PER_M;
  return {east,north,distance:Math.hypot(east,north)};
}
function dirText(value,pos,neg){
  if(Math.abs(value)<0.5) return '0.0 ft';
  return `${Math.abs(value).toFixed(1)} ft ${value>=0?pos:neg}`;
}
function gridMinSpacing(){
  const s=cfg();
  return Math.min(s.width/(s.cols-1),s.length/(s.rows-1));
}
function formatGpsFix(pos){
  if(!pos) return 'No fix';
  return `±${(pos.accuracy*FT_PER_M).toFixed(0)} ft`;
}
function browserContextLabel(){
  const proto=location.protocol||'unknown:';
  if(proto==='https:') return 'HTTPS secure context';
  if(proto==='http:' && (location.hostname==='localhost' || location.hostname==='127.0.0.1')) return 'local development context';
  if(proto==='file:') return 'local file';
  return `${proto.replace(':','').toUpperCase()||'unknown'} context`;
}
async function geolocationPermissionState(){
  try{
    if(navigator.permissions && navigator.permissions.query){
      const p=await navigator.permissions.query({name:'geolocation'});
      return p.state || 'unknown';
    }
  }catch(e){}
  return 'unknown';
}
function explainGpsError(err){
  const context=browserContextLabel();
  if(!navigator.geolocation) return 'This browser does not expose the Geolocation API.';
  if(!window.isSecureContext){
    return `Location is blocked because this page is not running in a secure browser context (${context}). Open the app from an HTTPS website instead of a downloaded/local or restricted preview.`;
  }
  if(err && err.code===1){
    return 'Location permission is blocked for this site or for the browser app. Allow location in the browser/site settings, then tap Enable Location again.';
  }
  if(err && err.code===2) return 'The phone could not determine a location. Make sure Location Services/GPS is on and try outside with a clear sky view.';
  if(err && err.code===3) return 'The location request timed out. Try again outside or after the phone has acquired a GPS fix.';
  return (err && err.message) ? `Location error: ${err.message}` : 'Could not obtain location.';
}
async function refreshGpsContext(){
  const state=await geolocationPermissionState();
  let msg=`Page: ${browserContextLabel()} • secure=${window.isSecureContext?'yes':'no'}`;
  if(state!=='unknown') msg+=` • permission=${state}`;
  if(!window.isSecureContext){
    msg+=' • GPS requires a secure/allowed browser context.';
  }else if(!gpsEnabled){
    msg+=' • Tap Enable Location.';
  }
  $('gpsContextDisp').textContent=msg;
}
function updateGpsUI(){
  const show=measureMode==='gps';
  $('gpsCard').classList.toggle('show',show);
  $('manualModeBtn').classList.toggle('activeMode',!show);
  $('gpsModeBtn').classList.toggle('activeMode',show);
  if(!show) return;

  ensureGpsTarget();
  $('gpsFixDisp').textContent=gpsPos?formatGpsFix(gpsPos):(gpsEnabled?'Waiting…':'Location off');
  $('gpsRefDisp').textContent=gpsRef?`${cfg().refCorner} set • ±${((gpsRef.accuracy||0)*FT_PER_M).toFixed(0)} ft`:'Not set';
  $('gpsOppDisp').textContent=gpsOpposite?`${oppositeCornerName()} set • ±${((gpsOpposite.accuracy||0)*FT_PER_M).toFixed(0)} ft`:'Not set';
  $('setGpsOppBtn').disabled=!gpsRef;
  $('gpsNextBtn').disabled=!(gpsRef&&gpsOpposite);
  $('gpsPrevBtn').disabled=!(gpsRef&&gpsOpposite);
  $('gpsRecordBtn').disabled=!(gpsRef&&gpsOpposite&&gpsTargetIndex!=null);
  $('gpsRefreshBtn').textContent=gpsEnabled?'Refresh GPS':'Enable Location';
  if(gpsErrorText) $('gpsAccuracyWarn').textContent=gpsErrorText;

  if(!gpsRef){
    $('gpsInstruction').textContent=`Step 1 of 2: stand at the ${cfg().refCorner} reference corner and tap Set Reference Here.`;
    $('gpsTargetLabel').textContent=`Set ${cfg().refCorner}`;
    $('gpsTargetOffset').textContent='This anchors the pad position.';
    $('gpsMoveText').textContent='Calibration 1 of 2';
    $('gpsDistanceText').textContent='';
    $('gpsAccuracyWarn').textContent=gpsErrorText || (gpsPos?`Current GPS accuracy is about ±${(gpsPos.accuracy*FT_PER_M).toFixed(0)} ft.`:'Tap Enable Location before capturing the corner.');
    return;
  }

  if(!gpsOpposite){
    const diag=Math.hypot(cfg().width,cfg().length);
    $('gpsInstruction').textContent=`Step 2 of 2: manually walk to the ${oppositeCornerName()} opposite corner and tap Set Opposite Here.`;
    $('gpsTargetLabel').textContent=`Walk to ${oppositeCornerName()}`;
    $('gpsTargetOffset').textContent='No GPS guidance yet — this second fix establishes the pad rotation.';
    $('gpsMoveText').textContent='Manual calibration move';
    $('gpsDistanceText').textContent=`Designed corner-to-corner diagonal: ${diag.toFixed(1)} ft`;
    $('gpsAccuracyWarn').textContent=gpsErrorText || (gpsPos?`Current GPS accuracy is about ±${(gpsPos.accuracy*FT_PER_M).toFixed(0)} ft. Capture the fix while standing directly over the corner.`:'Tap Enable Location before capturing the opposite corner.');
    return;
  }

  if(gpsTargetIndex==null){
    $('gpsInstruction').textContent='All grid points have readings.';
    $('gpsTargetLabel').textContent='Complete ✓';
    $('gpsTargetOffset').textContent='No empty points remain.';
    $('gpsMoveText').textContent='';
    $('gpsDistanceText').textContent='';
    $('gpsAccuracyWarn').textContent='';
    return;
  }

  const {r,c}=pointFromIndex(gpsTargetIndex), rc=refCoords(r,c);
  const cal=calibrationStats();
  $('gpsTargetLabel').textContent=label(r,c);
  $('gpsTargetOffset').textContent=`${rc.x.toFixed(1)} ft ${rc.xDir} • ${rc.y.toFixed(1)} ft ${rc.yDir} of ${cfg().refCorner}`;
  $('gpsInstruction').textContent=`Geometry calibrated. Walk to ${label(r,c)}, record the rod reading, then Save & Next.`;

  if(!gpsPos){
    $('gpsMoveText').textContent=gpsEnabled?'Waiting for GPS fix…':'Location is off — tap Enable Location';
    $('gpsDistanceText').textContent=cal?`Calibration diagonal ${cal.measured.toFixed(1)} ft measured / ${cal.designed.toFixed(1)} ft designed`:'';
    $('gpsAccuracyWarn').textContent='';
    return;
  }

  const tgt=targetLatLon(gpsTargetIndex), d=localDeltaFeet(gpsPos.lat,gpsPos.lon,tgt.lat,tgt.lon);
  $('gpsMoveText').textContent=`${dirText(d.east,'E','W')} • ${dirText(d.north,'N','S')}`;
  $('gpsDistanceText').textContent=`Straight-line distance: ${d.distance.toFixed(1)} ft • GPS ${formatGpsFix(gpsPos)} • pad rotation ${cal.rotationDeg.toFixed(1)}°`;

  const accFt=gpsPos.accuracy*FT_PER_M, half=gridMinSpacing()/2;
  const combinedCalAcc=((gpsRef.accuracy||0)+(gpsOpposite.accuracy||0))*FT_PER_M;
  const diagWarn=Math.abs(cal.mismatch)>Math.max(8,combinedCalAcc);
  if(diagWarn){
    $('gpsAccuracyWarn').textContent=`Calibration check: GPS measured the diagonal as ${cal.measured.toFixed(1)} ft vs ${cal.designed.toFixed(1)} ft designed. Consider recapturing both corners if either fix was poor.`;
  }else if(accFt>half){
    $('gpsAccuracyWarn').textContent=`GPS accuracy is wider than half the ${gridMinSpacing().toFixed(1)} ft grid spacing. Use GPS for rough navigation and verify the final point physically.`;
  }else if(d.distance<=Math.max(3,accFt)){
    $('gpsAccuracyWarn').textContent='You are within the current GPS uncertainty of this target.';
  }else{
    $('gpsAccuracyWarn').textContent='';
  }
}
function stopGpsWatch(){
  if(gpsWatchId!=null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId=null;
}
function startGpsWatch(){
  if(!navigator.geolocation){
    gpsEnabled=false;
    gpsErrorText='GPS/geolocation is not available in this browser.';
    updateGpsUI(); refreshGpsContext();
    return;
  }
  if(gpsWatchId!=null) return;
  gpsWatchId=navigator.geolocation.watchPosition(pos=>{
    gpsEnabled=true;
    gpsErrorText='';
    gpsPos={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,timestamp:pos.timestamp};
    updateGpsUI(); refreshGpsContext();
  },err=>{
    gpsEnabled=false;
    gpsErrorText=explainGpsError(err);
    $('gpsFixDisp').textContent='GPS blocked';
    updateGpsUI(); refreshGpsContext();
    stopGpsWatch();
  },{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}
function requestGpsAccess(onSuccess){
  if(!navigator.geolocation){
    gpsEnabled=false;
    gpsErrorText='GPS/geolocation is not available in this browser.';
    updateGpsUI(); refreshGpsContext();
    return;
  }
  gpsErrorText='';
  $('gpsFixDisp').textContent='Requesting…';
  $('gpsAccuracyWarn').textContent='Requesting location permission…';
  navigator.geolocation.getCurrentPosition(pos=>{
    gpsEnabled=true;
    gpsErrorText='';
    gpsPos={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,timestamp:pos.timestamp};
    if(typeof onSuccess==='function') onSuccess(pos);
    stopGpsWatch();
    startGpsWatch();
    updateGpsUI(); refreshGpsContext();
  },err=>{
    gpsEnabled=false;
    gpsErrorText=explainGpsError(err);
    $('gpsFixDisp').textContent='GPS blocked';
    updateGpsUI(); refreshGpsContext();
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function setGpsReferenceHere(){
  const usePos=p=>{
    gpsPos={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
    gpsRef={lat:gpsPos.lat,lon:gpsPos.lon,accuracy:gpsPos.accuracy,timestamp:Date.now(),corner:cfg().refCorner};
    gpsOpposite=null;
    gpsTargetIndex=null;
    saveLocal(); updateGpsUI(); refreshGpsContext();
  };
  if(gpsPos && gpsEnabled){
    usePos({coords:{latitude:gpsPos.lat,longitude:gpsPos.lon,accuracy:gpsPos.accuracy},timestamp:gpsPos.timestamp||Date.now()});
  }else{
    requestGpsAccess(usePos);
  }
}
function setGpsOppositeHere(){
  if(!gpsRef){ alert('Set the GPS reference corner first.'); return; }
  const usePos=p=>{
    gpsPos={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
    gpsOpposite={lat:gpsPos.lat,lon:gpsPos.lon,accuracy:gpsPos.accuracy,timestamp:Date.now(),corner:oppositeCornerName()};
    const corner=oppositeCornerPoint();
    gpsTargetIndex=indexFromPoint(corner.r,corner.c);
    if(Number.isFinite(readings[k(corner.r,corner.c)])) gpsTargetIndex=nextGpsRouteIndex(true,gpsTargetIndex);
    saveLocal(); updateGpsUI(); refreshGpsContext();
  };
  if(gpsPos && gpsEnabled){
    usePos({coords:{latitude:gpsPos.lat,longitude:gpsPos.lon,accuracy:gpsPos.accuracy},timestamp:gpsPos.timestamp||Date.now()});
  }else{
    requestGpsAccess(usePos);
  }
}
function setMeasureMode(mode){
  measureMode=mode==='gps'?'gps':'manual';
  if(measureMode==='gps'){ ensureGpsTarget(); }
  else stopGpsWatch();
  saveLocal(); updateGpsUI();
}


function updateCornerPicker(){
  const selected=$('refCorner').value||'SW';
  document.querySelectorAll('.cornerBtn').forEach(btn=>{
    btn.classList.toggle('selected',btn.dataset.corner===selected);
  });
  $('cornerChoiceText').textContent=`Reference: ${selected}`;
}

function saveLocal(){
  localStorage.setItem('padGradeMobile',JSON.stringify({settings:cfg(),readings,readingMeta,gps:{reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex},measureMode}));
}
function loadLocal(){
  try{
    const d=JSON.parse(localStorage.getItem('padGradeMobile')||'null');
    if(!d) return;
    readings=d.readings||{};
    readingMeta=d.readingMeta||{};
    gpsRef=d.gps&&d.gps.reference?d.gps.reference:null;
    gpsOpposite=d.gps&&d.gps.opposite?d.gps.opposite:null;
    gpsTargetIndex=d.gps&&Number.isInteger(d.gps.targetIndex)?d.gps.targetIndex:null;
    measureMode=d.measureMode==='gps'?'gps':'manual';
    const s=d.settings||{};
    for(const [id,val] of Object.entries({
      width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name
    })){ if(val!==undefined && $(id)) $(id).value=val; }
  }catch(e){}
}
function diffFor(v){return v-cfg().target}
function classFor(v){
  if(v===undefined || Number.isNaN(v)) return '';
  const d=diffFor(v), t=cfg().tol;
  return Math.abs(d)<=t?'grade':d<0?'cut':'fill';
}
function textFor(v){
  if(v===undefined || Number.isNaN(v)) return ['—',''];
  const d=diffFor(v), t=cfg().tol;
  if(Math.abs(d)<=t) return [v.toFixed(1)+'″','GRADE'];
  if(d<0) return [v.toFixed(1)+'″',`CUT ${Math.abs(d).toFixed(1)}″`];
  return [v.toFixed(1)+'″',`FILL ${d.toFixed(1)}″`];
}
