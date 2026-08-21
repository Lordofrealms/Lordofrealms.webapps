/* Pad Grade Mapper v10 — four-corner GPS calibration + visual guidance */
let gpsCorners={};
let gpsCaptureIndex=0;
let gpsFit=null;
let gpsRecentSamples=[];
let activeCornerCapture=null;
let captureProgressTimer=null;
let deviceHeadingDeg=null;
let deviceHeadingSource='north-up';
let deviceHeadingAccuracyDeg=null;
let orientationListenerInstalled=false;
const CORNER_CAPTURE_MS=8000;
const CORNER_MIN_SAMPLES=5;
const CORNER_MAX_ACCURACY_M=25;

(function augmentGpsUi(){
  const card=$('gpsCard');
  const target=card && card.querySelector('.gpsTarget');
  if(!card || !target) return;
  const statusSpans=card.querySelectorAll('.gpsBox span');
  if(statusSpans[1]) statusSpans[1].textContent='corners captured';
  if(statusSpans[2]) statusSpans[2].textContent='geometry fit';
  if(!$('cornerSurveyPanel')){
    target.insertAdjacentHTML('beforebegin', `
      <div class="cornerSurvey" id="cornerSurveyPanel">
        <div class="cornerSurveyTitle">FOUR-CORNER CALIBRATION</div>
        <div class="cornerSurveyGrid" id="cornerSurveyGrid"></div>
        <div class="sampleStatus" id="sampleStatus">Capture each corner while standing still. The app averages several GPS fixes and checks the known rectangle geometry.</div>
        <div class="geometryChecks" id="geometryChecks"></div>
      </div>`);
  }
  if(!$('navVisual')){
    target.insertAdjacentHTML('afterend', `
      <div class="navVisual" id="navVisual">
        <div class="navRing">
          <div class="navNorth">N</div>
          <div class="navArrow" id="navArrow">
            <div class="navArrowHead"></div>
            <div class="navArrowShaft" id="navArrowShaft"></div>
          </div>
          <div class="navBullseye" id="navBullseye">◎</div>
          <div class="navCenterDot"></div>
        </div>
        <div class="navDistance" id="navDistance">—</div>
        <div class="small" id="navHeadingSource">North-up guidance</div>
      </div>`);
  }
  $('setGpsRefBtn').textContent='Stabilize & Capture Corner';
  $('setGpsOppBtn').textContent='Reset Calibration';
})();

function surveyCornerOrder(){
  const start=cfg().refCorner||'SW';
  const orders={SW:['SW','SE','NE','NW'],SE:['SE','SW','NW','NE'],NE:['NE','NW','SW','SE'],NW:['NW','NE','SE','SW']};
  return orders[start]||orders.SW;
}
function currentSurveyCorner(){const order=surveyCornerOrder();return gpsCaptureIndex<order.length?order[gpsCaptureIndex]:null;}
function lastSurveyCorner(){const order=surveyCornerOrder();const i=Math.min(Math.max(gpsCaptureIndex-1,0),order.length-1);return order[i]||cfg().refCorner;}
function cornerXY(name){const s=cfg();return {SW:{x:0,y:0},SE:{x:s.width,y:0},NE:{x:s.width,y:s.length},NW:{x:0,y:s.length}}[name];}
function cornerGridPoint(name){const s=cfg();return {r:name.includes('N')?s.rows-1:0,c:name.includes('E')?s.cols-1:0};}
function designedCornerDistance(a,b){const p=cornerXY(a),q=cornerXY(b);return Math.hypot(q.x-p.x,q.y-p.y);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function circularDifference(a,b){return ((a-b+540)%360)-180;}
function smoothHeading(oldDeg,newDeg,alpha=.22){if(!Number.isFinite(oldDeg))return newDeg;const d=circularDifference(newDeg,oldDeg);return (oldDeg+alpha*d+360)%360;}
function latLonFromLocalFeet(originLat,originLon,eastFt,northFt){const northM=northFt/FT_PER_M,eastM=eastFt/FT_PER_M;const latRad=originLat*Math.PI/180;return {lat:originLat+(northM/EARTH_M)*180/Math.PI,lon:originLon+(eastM/(EARTH_M*Math.cos(latRad)))*180/Math.PI};}
function uncertaintyFt(corner){if(!corner)return Infinity;const reported=Number.isFinite(corner.medianAccuracyFt)?corner.medianAccuracyFt:(Number.isFinite(corner.accuracy)?corner.accuracy*FT_PER_M:20);const spread=Number.isFinite(corner.spreadFt)?corner.spreadFt:0;return Math.max(2,reported,spread*2);}
function sampleFromPosition(pos){return {lat:pos.coords?pos.coords.latitude:pos.lat,lon:pos.coords?pos.coords.longitude:pos.lon,accuracy:pos.coords?pos.coords.accuracy:pos.accuracy,heading:pos.coords?pos.coords.heading:pos.heading,speed:pos.coords?pos.coords.speed:pos.speed,timestamp:pos.timestamp||Date.now()};}
function ingestGpsPosition(pos){const s=sampleFromPosition(pos);gpsPos=s;gpsEnabled=true;gpsErrorText='';const now=Date.now();gpsRecentSamples.push(s);gpsRecentSamples=gpsRecentSamples.filter(x=>now-x.timestamp<=15000).slice(-40);if(activeCornerCapture&&now>=activeCornerCapture.startedAt&&now<=activeCornerCapture.endsAt+500)activeCornerCapture.samples.push(s);updateGpsUI();refreshGpsContext();}
function stabilizeSamples(samples){
  let valid=samples.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Number.isFinite(s.accuracy)&&s.accuracy>0&&s.accuracy<=CORNER_MAX_ACCURACY_M);
  if(valid.length<3)valid=samples.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Number.isFinite(s.accuracy)&&s.accuracy>0);
  if(!valid.length)return null;
  const sortedLat=[...valid].sort((a,b)=>a.lat-b.lat),sortedLon=[...valid].sort((a,b)=>a.lon-b.lon),mid=Math.floor(valid.length/2),medLat=sortedLat[mid].lat,medLon=sortedLon[mid].lon;
  const pts=valid.map(s=>{const d=localDeltaFeet(medLat,medLon,s.lat,s.lon);return {...s,x:d.east,y:d.north};});
  const xs=[...pts].map(p=>p.x).sort((a,b)=>a-b),ys=[...pts].map(p=>p.y).sort((a,b)=>a-b),mx=xs[mid],my=ys[mid];
  const residuals=pts.map(p=>Math.hypot(p.x-mx,p.y-my)).sort((a,b)=>a-b),medR=residuals[mid]||0,deviations=residuals.map(r=>Math.abs(r-medR)).sort((a,b)=>a-b),mad=deviations[mid]||0,medianAccFt=[...pts].map(p=>p.accuracy*FT_PER_M).sort((a,b)=>a-b)[mid];
  const rejectRadius=Math.max(6,medR+3*Math.max(1,mad),medianAccFt*1.25),inliers=pts.filter(p=>Math.hypot(p.x-mx,p.y-my)<=rejectRadius);if(!inliers.length)return null;
  let sw=0,sx=0,sy=0;for(const p of inliers){const w=1/Math.pow(Math.max(1.5,p.accuracy),2);sw+=w;sx+=w*p.x;sy+=w*p.y;}
  const x=sx/sw,y=sy/sw;let spread2=0;for(const p of inliers){const w=1/Math.pow(Math.max(1.5,p.accuracy),2);spread2+=w*(Math.pow(p.x-x,2)+Math.pow(p.y-y,2));}
  const spreadFt=Math.sqrt(spread2/sw),ll=latLonFromLocalFeet(medLat,medLon,x,y),accs=inliers.map(p=>p.accuracy*FT_PER_M).sort((a,b)=>a-b);
  return {lat:ll.lat,lon:ll.lon,accuracy:(accs[Math.floor(accs.length/2)]||medianAccFt)/FT_PER_M,bestAccuracyFt:accs[0],medianAccuracyFt:accs[Math.floor(accs.length/2)],spreadFt,sampleCount:inliers.length,rejectedCount:Math.max(0,valid.length-inliers.length),timestamp:Date.now()};
}
function candidateGeometryChecks(cornerName,candidate){if(!candidate)return [];const checks=[];for(const [otherName,other] of Object.entries(gpsCorners)){if(!other||otherName===cornerName)continue;const expected=designedCornerDistance(otherName,cornerName),d=localDeltaFeet(other.lat,other.lon,candidate.lat,candidate.lon).distance,mismatch=d-expected,u=Math.hypot(uncertaintyFt(other),uncertaintyFt(candidate)),green=Math.max(4,u),yellow=Math.max(8,u*2),level=Math.abs(mismatch)<=green?'good':Math.abs(mismatch)<=yellow?'warn':'bad';checks.push({otherName,expected,observed:d,mismatch,level,green,yellow});}return checks;}
function geometryStatus(checks){if(!checks.length)return 'unknown';if(checks.some(c=>c.level==='bad'))return 'bad';if(checks.some(c=>c.level==='warn'))return 'warn';return 'good';}
function geometryStatusText(checks){const s=geometryStatus(checks);if(s==='good')return 'POSITION PLAUSIBLE';if(s==='warn')return 'POSSIBLE — VERIFY POSITION';if(s==='bad')return 'POSITION DOES NOT FIT RECTANGLE';return 'FIRST CORNER — NO GEOMETRY CHECK YET';}
function solveGpsRectangle(){
  const names=['SW','SE','NE','NW'];if(!names.every(n=>gpsCorners[n]))return null;
  const originLat=names.reduce((s,n)=>s+gpsCorners[n].lat,0)/4,originLon=names.reduce((s,n)=>s+gpsCorners[n].lon,0)/4;
  const obs=names.map(name=>{const c=gpsCorners[name],p=localDeltaFeet(originLat,originLon,c.lat,c.lon),q=cornerXY(name),u=uncertaintyFt(c);return {name,c,px:p.east,py:p.north,qx:q.x,qy:q.y,w:1/Math.pow(Math.max(2,u),2)};});
  const sw=obs.reduce((s,o)=>s+o.w,0),pbar={x:obs.reduce((s,o)=>s+o.w*o.px,0)/sw,y:obs.reduce((s,o)=>s+o.w*o.py,0)/sw},qbar={x:obs.reduce((s,o)=>s+o.w*o.qx,0)/sw,y:obs.reduce((s,o)=>s+o.w*o.qy,0)/sw};
  let a=0,b=0;for(const o of obs){const qx=o.qx-qbar.x,qy=o.qy-qbar.y,px=o.px-pbar.x,py=o.py-pbar.y;a+=o.w*(qx*px+qy*py);b+=o.w*(qx*py-qy*px);}
  const theta=Math.atan2(b,a),ct=Math.cos(theta),st=Math.sin(theta),tx=pbar.x-(ct*qbar.x-st*qbar.y),ty=pbar.y-(st*qbar.x+ct*qbar.y);let wrss=0,worst=0;const residuals={};
  for(const o of obs){const fx=tx+ct*o.qx-st*o.qy,fy=ty+st*o.qx+ct*o.qy,r=Math.hypot(o.px-fx,o.py-fy);residuals[o.name]=r;worst=Math.max(worst,r);wrss+=o.w*r*r;}
  const rms=Math.sqrt(wrss/sw),avgUnc=obs.reduce((s,o)=>s+uncertaintyFt(o.c),0)/4,quality=rms<=Math.max(3,avgUnc*.45)?'GOOD':rms<=Math.max(6,avgUnc)?'FAIR':'POOR';return {originLat,originLon,theta,tx,ty,rmsFt:rms,worstFt:worst,residuals,quality,avgUncertaintyFt:avgUnc};
}
function fitPointLatLon(x,y){if(!gpsFit)return null;const ct=Math.cos(gpsFit.theta),st=Math.sin(gpsFit.theta),east=gpsFit.tx+ct*x-st*y,north=gpsFit.ty+st*x+ct*y;return latLonFromLocalFeet(gpsFit.originLat,gpsFit.originLon,east,north);}
function syncLegacyCalibration(){gpsFit=solveGpsRectangle();if(gpsFit){gpsRef=gpsCorners[cfg().refCorner]||gpsRef;gpsOpposite=gpsCorners[oppositeCornerName()]||gpsOpposite;}else{gpsRef=null;gpsOpposite=null;}}
function resetGpsCalibration(){if(activeCornerCapture)return;gpsCorners={};gpsCaptureIndex=0;gpsFit=null;gpsRef=null;gpsOpposite=null;gpsTargetIndex=null;saveLocal();updateGpsUI();}
function startCornerCapture(){if(activeCornerCapture)return;if(!gpsEnabled||!gpsPos){requestGpsAccess(()=>setTimeout(startCornerCapture,100));return;}const corner=currentSurveyCorner();if(!corner)return;const now=Date.now();activeCornerCapture={corner,startedAt:now,endsAt:now+CORNER_CAPTURE_MS,samples:gpsRecentSamples.filter(s=>now-s.timestamp<=1000)};clearInterval(captureProgressTimer);captureProgressTimer=setInterval(updateGpsUI,200);updateGpsUI();setTimeout(finalizeCornerCapture,CORNER_CAPTURE_MS+100);}
function finalizeCornerCapture(){
  if(!activeCornerCapture)return;clearInterval(captureProgressTimer);captureProgressTimer=null;const cap=activeCornerCapture;activeCornerCapture=null;const stable=stabilizeSamples(cap.samples);
  if(!stable||stable.sampleCount<CORNER_MIN_SAMPLES){gpsErrorText=`Corner capture did not get enough good fixes (${stable?stable.sampleCount:0}/${CORNER_MIN_SAMPLES}). Stay still with a clear sky view and try again.`;updateGpsUI();return;}
  stable.corner=cap.corner;const checks=candidateGeometryChecks(cap.corner,stable);if(geometryStatus(checks)==='bad'){const worst=[...checks].sort((a,b)=>Math.abs(b.mismatch)-Math.abs(a.mismatch))[0],ok=confirm(`${cap.corner} does not fit the known pad geometry well. ${worst.otherName}→${cap.corner} measured ${worst.observed.toFixed(1)} ft vs ${worst.expected.toFixed(1)} ft expected. Capture anyway?`);if(!ok){updateGpsUI();return;}}
  gpsCorners[cap.corner]=stable;gpsCaptureIndex=Math.min(4,gpsCaptureIndex+1);syncLegacyCalibration();if(gpsFit){const p=cornerGridPoint(lastSurveyCorner());gpsTargetIndex=indexFromPoint(p.r,p.c);if(Number.isFinite(readings[k(p.r,p.c)]))gpsTargetIndex=nextGpsRouteIndex(true,gpsTargetIndex);}gpsErrorText='';saveLocal();updateGpsUI();
}
function renderCornerSurvey(){const grid=$('cornerSurveyGrid');if(!grid)return;const current=currentSurveyCorner();grid.innerHTML=['NW','NE','SW','SE'].map(name=>{const c=gpsCorners[name],cls=c?'done':name===current?'active':'',sub=c?`${c.sampleCount} fixes • spread ${c.spreadFt.toFixed(1)} ft`:(name===current?'NEXT':'pending');return `<div class="cornerChip ${cls}"><b>${name}</b><span>${sub}</span></div>`;}).join('');}
function renderGeometryChecks(candidate){const el=$('geometryChecks');if(!el)return;const corner=currentSurveyCorner();if(!corner){if(gpsFit)el.innerHTML=`<div class="checkRow ${gpsFit.quality==='GOOD'?'good':gpsFit.quality==='FAIR'?'warn':'bad'}"><b>${gpsFit.quality} FIT</b><span>RMS ${gpsFit.rmsFt.toFixed(1)} ft • worst ${gpsFit.worstFt.toFixed(1)} ft</span></div>`;else el.innerHTML='';return;}const checks=candidateGeometryChecks(corner,candidate),status=geometryStatus(checks),headline=status==='good'?'good':status==='warn'?'warn':status==='bad'?'bad':'';let html=`<div class="checkHeadline ${headline}">${geometryStatusText(checks)}</div>`;if(!checks.length)html+=`<div class="small">Capture this first corner, then the remaining corners can be checked against known side and diagonal lengths.</div>`;for(const c of checks){const sense=c.mismatch>0?`${Math.abs(c.mismatch).toFixed(1)} ft too far`:`${Math.abs(c.mismatch).toFixed(1)} ft too close`;html+=`<div class="checkRow ${c.level}"><b>${c.otherName} ↔ ${corner}</b><span>${c.observed.toFixed(1)} / ${c.expected.toFixed(1)} ft • ${sense}</span></div>`;}el.innerHTML=html;}
function captureSampleText(){if(!activeCornerCapture)return '';const remain=Math.max(0,(activeCornerCapture.endsAt-Date.now())/1000),stable=stabilizeSamples(activeCornerCapture.samples);if(!stable)return `Hold still… ${remain.toFixed(1)} s remaining • ${activeCornerCapture.samples.length} fixes`;return `Hold still… ${remain.toFixed(1)} s • ${stable.sampleCount} good fixes • best ±${stable.bestAccuracyFt.toFixed(0)} ft • spread ${stable.spreadFt.toFixed(1)} ft`;}
function targetBearingDeg(from,to){const d=localDeltaFeet(from.lat,from.lon,to.lat,to.lon);return (Math.atan2(d.east,d.north)*180/Math.PI+360)%360;}
function preferredHeading(){if(gpsPos&&Number.isFinite(gpsPos.heading)&&Number.isFinite(gpsPos.speed)&&gpsPos.speed>=0.8)return {heading:gpsPos.heading,source:'GPS course'};if(Number.isFinite(deviceHeadingDeg))return {heading:deviceHeadingDeg,source:deviceHeadingSource};return {heading:0,source:'north-up'};}
function arrowShaftPx(distanceFt){if(distanceFt>=50)return 112;if(distanceFt>=20)return 88+(distanceFt-20)/30*24;if(distanceFt>=10)return 66+(distanceFt-10)/10*22;if(distanceFt>=5)return 48+(distanceFt-5)/5*18;return 30+distanceFt/5*18;}
function renderNavigation(tgt,d){const visual=$('navVisual'),arrow=$('navArrow'),shaft=$('navArrowShaft'),bull=$('navBullseye');if(!visual||!arrow||!shaft||!bull)return;if(!gpsFit||!gpsPos||!tgt){visual.classList.remove('show');return;}visual.classList.add('show');const accFt=(gpsPos.accuracy||0)*FT_PER_M,inside=d.distance<=Math.max(2,accFt);$('navDistance').textContent=inside?`Within GPS uncertainty (±${accFt.toFixed(0)} ft)`:`${d.distance.toFixed(1)} ft to center`;const h=preferredHeading(),bearing=targetBearingDeg(gpsPos,tgt),relative=circularDifference(bearing,h.heading);arrow.style.transform=`rotate(${relative.toFixed(1)}deg)`;shaft.style.height=`${arrowShaftPx(d.distance).toFixed(0)}px`;arrow.style.display=inside?'none':'block';bull.style.display=inside?'block':'none';$('navHeadingSource').textContent=h.source==='north-up'?`North-up • target bearing ${bearing.toFixed(0)}°`:`Arrow relative to ${h.source}${Number.isFinite(deviceHeadingAccuracyDeg)?` • compass ±${deviceHeadingAccuracyDeg.toFixed(0)}°`:''}`;}
function handleDeviceOrientation(e){let heading=null,source='device compass',acc=null;if(Number.isFinite(e.webkitCompassHeading)){heading=e.webkitCompassHeading;acc=Number.isFinite(e.webkitCompassAccuracy)?e.webkitCompassAccuracy:null;}else if(e.absolute&&Number.isFinite(e.alpha)){const screenAngle=(screen.orientation&&Number.isFinite(screen.orientation.angle))?screen.orientation.angle:(Number.isFinite(window.orientation)?window.orientation:0);heading=(360-e.alpha+screenAngle+360)%360;source='absolute orientation';}if(Number.isFinite(heading)){deviceHeadingDeg=smoothHeading(deviceHeadingDeg,heading);deviceHeadingSource=source;deviceHeadingAccuracyDeg=acc;if(measureMode==='gps')updateGpsUI();}}
function installOrientationListeners(){if(orientationListenerInstalled)return;orientationListenerInstalled=true;window.addEventListener('deviceorientationabsolute',handleDeviceOrientation,true);window.addEventListener('deviceorientation',handleDeviceOrientation,true);}
async function enableDeviceHeading(){try{if(typeof DeviceOrientationEvent==='undefined')return;if(typeof DeviceOrientationEvent.requestPermission==='function'){const result=await DeviceOrientationEvent.requestPermission();if(result==='granted')installOrientationListeners();}else installOrientationListeners();}catch(e){}}

gpsRoute=function(){const s=cfg(),startCorner=gpsFit?lastSurveyCorner():s.refCorner,rs=[...Array(s.rows).keys()],cs=[...Array(s.cols).keys()];if(startCorner.includes('N'))rs.reverse();const firstCols=startCorner.includes('E')?[...cs].reverse():cs,route=[];rs.forEach((r,i)=>(i%2===0?firstCols:[...firstCols].reverse()).forEach(c=>route.push(indexFromPoint(r,c))));return route;};
ensureGpsTarget=function(){syncLegacyCalibration();if(!gpsFit){gpsTargetIndex=null;return;}if(gpsTargetIndex!=null){const {r,c}=pointFromIndex(gpsTargetIndex);if(r<cfg().rows&&c<cfg().cols&&!Number.isFinite(readings[k(r,c)]))return;if(r<cfg().rows&&c<cfg().cols){gpsTargetIndex=nextGpsRouteIndex(true,gpsTargetIndex);if(gpsTargetIndex!=null)return;}}const p=cornerGridPoint(lastSurveyCorner()),idx=indexFromPoint(p.r,p.c);gpsTargetIndex=!Number.isFinite(readings[k(p.r,p.c)])?idx:nextGpsRouteIndex(true,idx);};
calibrationRotationRad=function(){syncLegacyCalibration();return gpsFit?gpsFit.theta:null;};
calibrationStats=function(){syncLegacyCalibration();if(!gpsFit)return null;return {rotationDeg:gpsFit.theta*180/Math.PI,rmsFt:gpsFit.rmsFt,worstFt:gpsFit.worstFt,quality:gpsFit.quality};};
targetLatLon=function(idx){syncLegacyCalibration();if(!gpsFit||idx==null)return null;const {r,c}=pointFromIndex(idx),s=cfg();return fitPointLatLon(c*s.width/(s.cols-1),r*s.length/(s.rows-1));};
startGpsWatch=function(){if(!navigator.geolocation){gpsEnabled=false;gpsErrorText='GPS/geolocation is not available in this browser.';updateGpsUI();refreshGpsContext();return;}if(gpsWatchId!=null)return;gpsWatchId=navigator.geolocation.watchPosition(pos=>ingestGpsPosition(pos),err=>{gpsEnabled=false;gpsErrorText=explainGpsError(err);updateGpsUI();refreshGpsContext();stopGpsWatch();},{enableHighAccuracy:true,maximumAge:500,timeout:15000});};
requestGpsAccess=function(onSuccess){enableDeviceHeading();if(!navigator.geolocation){gpsEnabled=false;gpsErrorText='GPS/geolocation is not available in this browser.';updateGpsUI();refreshGpsContext();return;}gpsErrorText='';$('gpsFixDisp').textContent='Requesting…';navigator.geolocation.getCurrentPosition(pos=>{ingestGpsPosition(pos);if(typeof onSuccess==='function')onSuccess(pos);stopGpsWatch();startGpsWatch();updateGpsUI();refreshGpsContext();},err=>{gpsEnabled=false;gpsErrorText=explainGpsError(err);updateGpsUI();refreshGpsContext();},{enableHighAccuracy:true,maximumAge:0,timeout:15000});};
setGpsReferenceHere=function(){startCornerCapture();};
setGpsOppositeHere=function(){if(Object.keys(gpsCorners).length&&confirm('Reset all four GPS calibration corners?'))resetGpsCalibration();};
setMeasureMode=function(mode){measureMode=mode==='gps'?'gps':'manual';if(measureMode==='gps')ensureGpsTarget();else stopGpsWatch();saveLocal();updateGpsUI();};

updateGpsUI=function(){
  const show=measureMode==='gps';$('gpsCard').classList.toggle('show',show);$('manualModeBtn').classList.toggle('activeMode',!show);$('gpsModeBtn').classList.toggle('activeMode',show);if(!show)return;
  syncLegacyCalibration();ensureGpsTarget();renderCornerSurvey();$('gpsFixDisp').textContent=gpsPos?formatGpsFix(gpsPos):(gpsEnabled?'Waiting…':'Location off');$('gpsRefDisp').textContent=`${Object.keys(gpsCorners).length} / 4`;$('gpsOppDisp').textContent=gpsFit?`${gpsFit.quality} • ${gpsFit.rmsFt.toFixed(1)} ft RMS`:'Pending';$('gpsRefreshBtn').textContent=gpsEnabled?'Refresh GPS':'Enable Location';$('setGpsOppBtn').disabled=!Object.keys(gpsCorners).length||!!activeCornerCapture;$('gpsNextBtn').disabled=!gpsFit;$('gpsPrevBtn').disabled=!gpsFit;$('gpsRecordBtn').disabled=!(gpsFit&&gpsTargetIndex!=null);$('setGpsRefBtn').disabled=!!activeCornerCapture||!!gpsFit;$('setGpsRefBtn').textContent=activeCornerCapture?'Capturing…':gpsFit?'Calibration Complete':'Stabilize & Capture Corner';
  const sample=$('sampleStatus');
  if(activeCornerCapture){sample.textContent=captureSampleText();renderGeometryChecks(stabilizeSamples(activeCornerCapture.samples)||gpsPos);}
  else if(!gpsFit){const corner=currentSurveyCorner(),liveStable=stabilizeSamples(gpsRecentSamples.filter(s=>Date.now()-s.timestamp<=5000));sample.textContent=gpsPos?`Current ${formatGpsFix(gpsPos)}${liveStable?` • recent spread ${liveStable.spreadFt.toFixed(1)} ft • best ±${liveStable.bestAccuracyFt.toFixed(0)} ft`:''}`:'Tap Enable Location, then stand on the indicated corner.';renderGeometryChecks(liveStable||gpsPos);$('gpsInstruction').textContent=`Corner ${gpsCaptureIndex+1} of 4: stand on ${corner} and hold still while the app stabilizes the GPS fix.`;$('gpsTargetLabel').textContent=`Capture ${corner}`;$('gpsTargetOffset').textContent=gpsCaptureIndex===0?'First corner establishes the starting observation.':'Use the geometry checks below to verify this is a plausible corner location before capture.';$('gpsMoveText').textContent=geometryStatusText(candidateGeometryChecks(corner,liveStable||gpsPos));$('gpsDistanceText').textContent=`Expected pad: ${cfg().width.toFixed(1)} × ${cfg().length.toFixed(1)} ft • diagonal ${Math.hypot(cfg().width,cfg().length).toFixed(1)} ft`;$('gpsAccuracyWarn').textContent=gpsErrorText||(gpsPos&&gpsPos.accuracy*FT_PER_M>15?'GPS uncertainty is high. An 8-second stabilized capture may help, but open sky is important.':'');if($('navVisual'))$('navVisual').classList.remove('show');return;}
  renderGeometryChecks(null);sample.textContent=`Four-corner fit ${gpsFit.quality}: RMS residual ${gpsFit.rmsFt.toFixed(1)} ft, worst corner ${gpsFit.worstFt.toFixed(1)} ft, average corner uncertainty ±${gpsFit.avgUncertaintyFt.toFixed(0)} ft.`;
  if(gpsTargetIndex==null){$('gpsInstruction').textContent='All grid points have readings.';$('gpsTargetLabel').textContent='Complete ✓';$('gpsTargetOffset').textContent='No empty points remain.';$('gpsMoveText').textContent='';$('gpsDistanceText').textContent='';$('gpsAccuracyWarn').textContent='';if($('navVisual'))$('navVisual').classList.remove('show');return;}
  const {r,c}=pointFromIndex(gpsTargetIndex),rc=refCoords(r,c),tgt=targetLatLon(gpsTargetIndex);$('gpsTargetLabel').textContent=label(r,c);$('gpsTargetOffset').textContent=`${rc.x.toFixed(1)} ft ${rc.xDir} • ${rc.y.toFixed(1)} ft ${rc.yDir} of ${cfg().refCorner}`;$('gpsInstruction').textContent=`Walk toward the arrow to ${label(r,c)}, then record the rod reading.`;
  if(!gpsPos||!tgt){$('gpsMoveText').textContent='Waiting for GPS fix…';$('gpsDistanceText').textContent='';renderNavigation(null,null);return;}
  const d=localDeltaFeet(gpsPos.lat,gpsPos.lon,tgt.lat,tgt.lon),accFt=gpsPos.accuracy*FT_PER_M;$('gpsMoveText').textContent=`${d.distance.toFixed(1)} ft to target center`;$('gpsDistanceText').textContent=`${dirText(d.east,'E','W')} • ${dirText(d.north,'N','S')} • fit ${gpsFit.quality} (${gpsFit.rmsFt.toFixed(1)} ft RMS)`;if(d.distance<=Math.max(2,accFt))$('gpsAccuracyWarn').textContent=`Inside the current GPS uncertainty (±${accFt.toFixed(0)} ft). The phone cannot reliably resolve a smaller offset right now.`;else if(accFt>gridMinSpacing()/2)$('gpsAccuracyWarn').textContent=`GPS uncertainty ±${accFt.toFixed(0)} ft is wider than half the ${gridMinSpacing().toFixed(1)} ft grid spacing. Use the arrow for rough navigation and verify final placement physically.`;else $('gpsAccuracyWarn').textContent=gpsErrorText;renderNavigation(tgt,d);
};

saveLocal=function(){localStorage.setItem('padGradeMobile',JSON.stringify({settings:cfg(),readings,readingMeta,gps:{reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex,corners:gpsCorners,captureIndex:gpsCaptureIndex},measureMode}));};
loadLocal=function(){try{const d=JSON.parse(localStorage.getItem('padGradeMobile')||'null');if(!d)return;readings=d.readings||{};readingMeta=d.readingMeta||{};measureMode=d.measureMode==='gps'?'gps':'manual';const s=d.settings||{};for(const [id,val] of Object.entries({width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name})){if(val!==undefined&&$(id))$(id).value=val;}gpsCorners=(d.gps&&d.gps.corners&&typeof d.gps.corners==='object')?d.gps.corners:{};gpsCaptureIndex=d.gps&&Number.isInteger(d.gps.captureIndex)?clamp(d.gps.captureIndex,0,4):Object.keys(gpsCorners).length;gpsTargetIndex=d.gps&&Number.isInteger(d.gps.targetIndex)?d.gps.targetIndex:null;syncLegacyCalibration();}catch(e){gpsCorners={};gpsCaptureIndex=0;gpsFit=null;}};
exportProject=function(){const s=cfg(),payload={app:'Pad Grade Mapper Mobile',version:4,exportedAt:new Date().toISOString(),settings:s,readings,readingMeta,gps:{reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex,corners:gpsCorners,captureIndex:gpsCaptureIndex},measureMode},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(s.name||'pad_grade').replace(/[^\w-]+/g,'_')+'_project.json';a.click();URL.revokeObjectURL(a.href);};
importProjectFile=async function(file){const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||!data.settings||!data.readings)throw new Error('Not a valid Pad Grade Mapper project file.');const s=data.settings;for(const [id,val] of Object.entries({width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner||'SW',projectName:s.name||'Pad'})){if($(id)&&val!==undefined)$(id).value=val;}readings={};for(const [key,val] of Object.entries(data.readings||{})){const n=Number(val);if(Number.isFinite(n))readings[key]=n;}readingMeta=(data.readingMeta&&typeof data.readingMeta==='object')?data.readingMeta:{};gpsCorners=(data.gps&&data.gps.corners&&typeof data.gps.corners==='object')?data.gps.corners:{};gpsCaptureIndex=data.gps&&Number.isInteger(data.gps.captureIndex)?clamp(data.gps.captureIndex,0,4):Object.keys(gpsCorners).length;gpsTargetIndex=data.gps&&Number.isInteger(data.gps.targetIndex)?data.gps.targetIndex:null;measureMode=data.measureMode==='gps'?'gps':'manual';syncLegacyCalibration();saveLocal();updateCornerPicker();renderGrid();updateGpsUI();};
