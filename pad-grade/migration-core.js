/* Pad Grade v0.5.4 — project/GPS migration without any grid ownership. */
(function installPadGradeMigrationCore(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREFIX='padGradeProjectV5:';
  const FT_PER_M=3.280839895;
  const EARTH_M=6378137;

  function number(v){const n=Number(v);return Number.isFinite(n)?n:null;}

  function normalizePoint(p){
    if(!p||typeof p!=='object')return null;
    const lat=number(p.lat??p.latitude??p.Latitude??p.y);
    const lon=number(p.lon??p.lng??p.longitude??p.Longitude??p.x);
    if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    const accuracy=number(p.accuracy??p.accuracy_m??p.horizontalAccuracy??p.hAcc);
    const out={...p,lat,lon};
    if(accuracy!==null)out.accuracy=accuracy;
    delete out.latitude;delete out.longitude;delete out.lng;
    return out;
  }

  function normalizeCorners(raw){
    if(!raw)return {};
    const out={};
    if(Array.isArray(raw)){
      for(const p of raw){
        const name=String(p?.corner??p?.name??p?.id??'').toUpperCase();
        const q=normalizePoint(p);
        if(q&&['SW','SE','NE','NW'].includes(name))out[name]=q;
      }
      return out;
    }
    if(typeof raw==='object'){
      for(const [name,p] of Object.entries(raw)){
        const key=String(name).toUpperCase();
        const q=normalizePoint(p);
        if(q&&['SW','SE','NE','NW'].includes(key))out[key]=q;
      }
    }
    return out;
  }

  function repairCanonicalGps(raw){
    if(!raw||typeof raw!=='object')return {project:raw,changed:false};
    const p=JSON.parse(JSON.stringify(raw));
    const oldGps=(p.gps&&typeof p.gps==='object')?p.gps:{};
    const gps={...oldGps};
    let changed=false;

    const reference=normalizePoint(gps.reference??p.gpsRef??p.referenceGps??p.reference);
    const opposite=normalizePoint(gps.opposite??p.gpsOpposite??p.oppositeGps??p.opposite);
    const corners=normalizeCorners(gps.corners??p.gpsCorners??p.corners);
    if(reference&&JSON.stringify(reference)!==JSON.stringify(gps.reference)){gps.reference=reference;changed=true;}
    if(opposite&&JSON.stringify(opposite)!==JSON.stringify(gps.opposite)){gps.opposite=opposite;changed=true;}
    if(Object.keys(corners).length&&JSON.stringify(corners)!==JSON.stringify(gps.corners)){gps.corners=corners;changed=true;}

    const ti=Number.isInteger(gps.targetIndex)?gps.targetIndex:(Number.isInteger(p.gpsTargetIndex)?p.gpsTargetIndex:null);
    if(ti!==null&&gps.targetIndex!==ti){gps.targetIndex=ti;changed=true;}
    const ci=Number.isInteger(gps.captureIndex)?gps.captureIndex:(Number.isInteger(p.gpsCaptureIndex)?p.gpsCaptureIndex:null);
    if(ci!==null&&gps.captureIndex!==ci){gps.captureIndex=ci;changed=true;}

    if(JSON.stringify(gps)!==JSON.stringify(oldGps)){p.gps=gps;changed=true;}
    return {project:p,changed};
  }

  function localDelta(a,b){
    const lat0=((a.lat+b.lat)/2)*Math.PI/180;
    return {
      east:(b.lon-a.lon)*Math.PI/180*EARTH_M*Math.cos(lat0)*FT_PER_M,
      north:(b.lat-a.lat)*Math.PI/180*EARTH_M*FT_PER_M
    };
  }

  function llFromFeet(origin,eastFt,northFt){
    const latRad=origin.lat*Math.PI/180;
    return {
      lat:origin.lat+((northFt/FT_PER_M)/EARTH_M)*180/Math.PI,
      lon:origin.lon+((eastFt/FT_PER_M)/(EARTH_M*Math.cos(latRad)))*180/Math.PI
    };
  }

  function cornerXY(name,w,l){return {SW:{x:0,y:0},SE:{x:w,y:0},NE:{x:w,y:l},NW:{x:0,y:l}}[name];}

  function synthesizeLegacyCorners(p){
    if(!p||typeof p!=='object')return false;
    const gps=p.gps&&typeof p.gps==='object'?p.gps:(p.gps={});
    if(gps.corners&&Object.keys(gps.corners).length>=4)return false;
    const ref=gps.reference,opp=gps.opposite,s=p.settings||{};
    if(!ref||!opp||!Number.isFinite(+ref.lat)||!Number.isFinite(+ref.lon)||!Number.isFinite(+opp.lat)||!Number.isFinite(+opp.lon))return false;
    const w=+s.width,l=+s.length;
    if(!(w>0&&l>0))return false;
    const refName=String(s.refCorner||'SW').toUpperCase();
    const oppositeName={SW:'NE',NE:'SW',SE:'NW',NW:'SE'}[refName]||'NE';
    const qRef=cornerXY(refName,w,l),qOpp=cornerXY(oppositeName,w,l);
    if(!qRef||!qOpp)return false;

    const measured=localDelta(ref,opp);
    const theta=Math.atan2(measured.north,measured.east)-Math.atan2(qOpp.y-qRef.y,qOpp.x-qRef.x);
    const ct=Math.cos(theta),st=Math.sin(theta);
    const acc=Math.max(0,+ref.accuracy||0,+opp.accuracy||0);
    const corners={};
    for(const name of ['SW','SE','NE','NW']){
      const q=cornerXY(name,w,l),dx=q.x-qRef.x,dy=q.y-qRef.y;
      const ll=llFromFeet(ref,ct*dx-st*dy,st*dx+ct*dy);
      corners[name]={...ll,accuracy:acc,legacySynthesized:true,timestamp:ref.timestamp||opp.timestamp||Date.now(),sampleCount:1,spreadFt:0};
    }
    corners[refName]={...corners[refName],...ref,lat:+ref.lat,lon:+ref.lon,legacySynthesized:false};
    corners[oppositeName]={...corners[oppositeName],...opp,lat:+opp.lat,lon:+opp.lon,legacySynthesized:false};
    gps.corners=corners;
    gps.captureIndex=4;
    p.gps=gps;
    p.migration={...(p.migration||{}),legacyTwoCornerExpanded:true};
    return true;
  }

  function repairProject(raw){
    const first=repairCanonicalGps(raw);
    const project=first.project;
    let changed=first.changed;
    if(project&&synthesizeLegacyCorners(project))changed=true;
    return {project,changed};
  }

  function repairStoredProjects(){
    let repaired=0;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(PREFIX))continue;
      let raw=null;
      try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch(e){continue;}
      const fixed=repairProject(raw);
      if(fixed.changed){localStorage.setItem(key,JSON.stringify(fixed.project));repaired++;}
    }
    if(repaired){try{window.__padGradeRefreshProjectIndex?.();}catch(e){}}
    return repaired;
  }

  function applyRepairedActive(){
    const id=localStorage.getItem(ACTIVE_KEY);
    if(!id)return;
    let p=null;
    try{p=JSON.parse(localStorage.getItem(PREFIX+id)||'null');}catch(e){}
    if(!p)return;
    const fixed=repairProject(p);
    if(fixed.changed)localStorage.setItem(PREFIX+id,JSON.stringify(fixed.project));
  }

  window.__padGradeRepairProject=repairProject;
  window.__padGradeRepairStoredProjects=repairStoredProjects;

  repairStoredProjects();
  applyRepairedActive();

  // Reconciliation may bring older projects in from the durable folder. Repair
  // their schema/GPS representation, but deliberately DO NOT draw the grid here.
  window.addEventListener('padgrade-projects-reconciled',()=>{
    repairStoredProjects();
    applyRepairedActive();
  });
})();
