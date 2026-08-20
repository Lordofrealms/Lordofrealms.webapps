
const $=id=>document.getElementById(id);

async function updatePrivacyStatus(){
 const secure=window.isSecureContext;
 let permission='unknown';
 try{
   if(navigator.permissions?.query){
     const p=await navigator.permissions.query({name:'geolocation'});
     permission=p.state;
     p.onchange=()=>updatePrivacyStatus();
   }
 }catch(e){}
 const parts=[
   secure?'HTTPS/secure context':'NOT a secure context',
   `location permission: ${permission}`,
   'GPS/project data: local browser storage',
   'network: allowlisted map/geocoder only'
 ];
 if($('privacyStatus'))$('privacyStatus').textContent=parts.join(' • ');
 if($('privacyBadge')){
   $('privacyBadge').textContent=secure?'PRIVACY LOCK ACTIVE':'GPS REQUIRES HTTPS';
   $('privacyBadge').classList.toggle('live',secure);
 }
}

const FT_PER_M=3.280839895, M_PER_MI=1609.344, SQFT_PER_ACRE=43560;
const DB_NAME='TractorGuidanceDB_Fresh1', DB_VERSION=1;
const FRESH_INSTALL_KEY='tractorGuidanceFresh1Initialized';

let db=null,map=null,mapReady=false;
let dbOpenState='not opened',dbOpenStartedAt=0,lastStorageError='';
let sessionId=null,sessionCreatedAt=null,sessionStatus='none';
let track=[],rejectedCount=0,currentFix=null,totalDistanceM=0;
let watchId=null,tracking=false,paused=false,breakNext=false,wakeLock=null,lastSaveTime=0;
let boundary=null,workRegions=[],exclusions=[],boundaryDraft=[],drawingBoundary=false,boundaryDrawMode='tap',drawingTarget='property',plannedSegments=[],planMeta=null;
let tracingBoundary=false,traceLastScreenPoint=null,suppressNextBoundaryClick=false;
let editMarkers=[],editingShape=false,editTargetKey='property',selectedVertexIndex=null;
let edgeInsertPointer=null,edgeInsertVertexIndex=null;
let currentPropertyId=null,currentPropertyName='';
let selectedPathingId=null,selectedPathingName='';
let planCache={miles:0,passGroups:0,segmentCount:0};
let pathLoadToken=0,pathLoading=false,pathLoadMessage='';
let pathGenerationWorker=null,pathGenerationJob=0,pathGenerationActive=false;
let appMode='plan';
let regionPlanState={};
let shapeLabelMarkers=[]; let shapeLabelSignature='';
let driveStartedAt=null,driveElapsedMs=0,driveRunStartedAt=null;
let planProgress={spacingFt:20,covered:{}}; let planProgressSamples=[];
let currentNearestPlan=null;

function cfg(){
 return{
  sessionName:$('sessionName').value||'Field Work',
  operation:$('operation').value,
  implementWidthFt:Math.max(.5,+$('implWidth').value||20),
  maxAccuracyFt:Math.max(1,+$('maxAccuracy').value||50),
  minSpacingFt:Math.max(0,+$('minSpacing').value||0),
  guideTolFt:Math.max(.1,+$('guideTol').value||1),
  overlapFt:Math.max(0,+$('overlap').value||0),
  parallelHeading:(+$('parallelHeading').value||0)%360,
  boundaryMarginFt:Math.max(0,+$('boundaryMargin').value||0),
  expectedSpeedMph:Math.max(.1,+$('expectedSpeed').value||4),
  pathType:$('pathType').value,
  startOrder:$('startOrder').value
 };
}
function applyCfg(s={}){
 const vals={
  sessionName:s.sessionName,operation:s.operation,implWidth:s.implementWidthFt,maxAccuracy:s.maxAccuracyFt,
  minSpacing:s.minSpacingFt,guideTol:s.guideTolFt,overlap:s.overlapFt,parallelHeading:s.parallelHeading,
  boundaryMargin:s.boundaryMarginFt,expectedSpeed:s.expectedSpeedMph,pathType:s.pathType,startOrder:s.startOrder
 };
 for(const [id,v] of Object.entries(vals))if(v!==undefined&&$(id))$(id).value=v;
}
function newId(){return'sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,9)}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function storageErrorMessage(err){
 if(!err)return'Unknown storage error';
 return err?.message||err?.name||String(err);
}
function rememberStorageError(context,err){
 const msg=`${context}: ${storageErrorMessage(err)}`;
 lastStorageError=msg;
 console.error(msg,err);
 if($('saveState'))$('saveState').textContent='⚠ storage error';
 return msg;
}
function openDB(){
 return new Promise((resolve,reject)=>{
  dbOpenState='opening';
  dbOpenStartedAt=Date.now();

  const r=indexedDB.open(DB_NAME,DB_VERSION);

  r.onupgradeneeded=()=>{
   const d=r.result;
   dbOpenState='creating fresh schema';

   if(!d.objectStoreNames.contains('sessions'))d.createObjectStore('sessions',{keyPath:'id'});

   if(!d.objectStoreNames.contains('points')){
     const ps=d.createObjectStore('points',{keyPath:['sessionId','seq']});
     ps.createIndex('bySession','sessionId',{unique:false});
   }

   if(!d.objectStoreNames.contains('properties'))d.createObjectStore('properties',{keyPath:'id'});
   if(!d.objectStoreNames.contains('pathings'))d.createObjectStore('pathings',{keyPath:'id'});

   if(!d.objectStoreNames.contains('pathSegments')){
     const store=d.createObjectStore('pathSegments',{keyPath:['pathingId','chunk']});
     store.createIndex('byPathing','pathingId',{unique:false});
   }
  };

  r.onblocked=()=>{
   dbOpenState='BLOCKED';
   const msg='Fresh database creation is blocked by another copy of this SAME fresh app. Close the other fresh-app tab/window and retry.';
   lastStorageError=msg;
   console.warn(msg);
  };

  r.onerror=()=>{
   dbOpenState='ERROR';
   const err=r.error||new Error('Fresh IndexedDB open failed');
   rememberStorageError('Open fresh database',err);
   reject(err);
  };

  r.onsuccess=()=>{
   db=r.result;
   dbOpenState='ready';
   db.onversionchange=()=>{
     try{db.close()}catch(e){}
     db=null;
     dbOpenState='version change requested';
   };
   resolve(db);
  };
 });
}

function requireDB(){
 if(!db)throw new Error(`Storage database is not ready (${dbOpenState}).`);
 return db;
}

function txDone(tx){return new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
function sessionRecord(statusOverride=null){
 return{
  id:sessionId,status:statusOverride||sessionStatus,createdAt:sessionCreatedAt||Date.now(),updatedAt:Date.now(),settings:cfg(),
  rejectedCount,pointsCount:track.length,distanceM:totalDistanceM,currentFix,
  propertyProfileId:currentPropertyId,propertyProfileName:currentPropertyName,regionPlanState,appMode,
  selectedPathingId,selectedPathingName,
  driveStartedAt,driveElapsedMs,planProgress,paused:Boolean(paused)
 };
}
async function saveMeta(reason='checkpoint'){
 if(!sessionId||!db)return;
 const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(sessionRecord());await txDone(tx);
 localStorage.setItem('tractorActiveSessionId',sessionStatus==='in-progress'?sessionId:'');
 localStorage.setItem('tractorEmergencyMeta',JSON.stringify({
  sessionId,updatedAt:Date.now(),pointsCount:track.length,currentFix,
  selectedPathingId,selectedPathingName,propertyProfileId:currentPropertyId
 }));
 lastSaveTime=Date.now();flashSaved(reason);
}
async function savePoint(p){
 if(!sessionId||!db)return;
 const tx=db.transaction(['points','sessions'],'readwrite');
 tx.objectStore('points').put({...p,sessionId,seq:track.length-1});tx.objectStore('sessions').put(sessionRecord());await txDone(tx);
 localStorage.setItem('tractorActiveSessionId',sessionId);lastSaveTime=Date.now();flashSaved('point saved');
}
function flashSaved(t='saved'){$('saveState').textContent='✓ '+t;setTimeout(()=>{if(Date.now()-lastSaveTime>1100)$('saveState').textContent='Auto-save on'},1300)}
async function getSession(id){
 return await new Promise((res,rej)=>{const tx=db.transaction('sessions','readonly'),r=tx.objectStore('sessions').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)});
}
