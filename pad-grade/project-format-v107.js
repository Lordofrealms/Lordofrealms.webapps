/* Pad Grade v1.0.7 DEV — canonical schema 6 project format + schema 5 rollback.
 *
 * Durable .padgrade files advance to schema 6.  The first JSON member is a
 * deliberately small _pgHeader object so Android can identify/version/catalog a
 * project with a bounded prefix read.  Project data remains losslessly
 * downgradeable to the schema-5 shape understood by the v1.0.6 generation.
 */
(function(root,factory){
  const api=factory();
  if(root)root.PadGradeProjectFormatV107=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CURRENT_SCHEMA=6,ROLLBACK_SCHEMA=5,FORMAT='PadGradeProject';
  const FILE_ID_RE=/^[A-HJ-NP-Z]{4}[2-9]{2}$/;
  const PREFIX_RE=/^([A-HJ-NP-Z]{4}[2-9]{2})-/i;

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const nowIso=()=>new Date().toISOString();
  function clamp(n,a,b,d){n=Number(n);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):d;}
  function validFileId(value){const s=String(value||'').toUpperCase();return FILE_ID_RE.test(s)?s:null;}
  function fileIdFromFilename(filename){const m=String(filename||'').match(PREFIX_RE);return m?validFileId(m[1]):null;}
  function stableLegacyId(filename,raw){const seed=String(filename||'legacy')+'|'+JSON.stringify(raw?.settings||raw||{});let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return `pg-legacy-${(h>>>0).toString(36)}`;}

  function normalizeGps(raw){
    const gpsRaw=(raw?.gps&&typeof raw.gps==='object')?raw.gps:{},gps={...gpsRaw};
    if(!gps.reference&&raw?.gpsRef)gps.reference=raw.gpsRef;
    if(!gps.opposite&&raw?.gpsOpposite)gps.opposite=raw.gpsOpposite;
    if(!gps.corners&&raw?.gpsCorners)gps.corners=raw.gpsCorners;
    if(gps.targetIndex==null&&Number.isInteger(raw?.gpsTargetIndex))gps.targetIndex=raw.gpsTargetIndex;
    if(gps.captureIndex==null&&Number.isInteger(raw?.gpsCaptureIndex))gps.captureIndex=raw.gpsCaptureIndex;
    return gps;
  }

  function normalizeProject(raw,filename=null){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    const input=clone(raw),s=(input.settings&&typeof input.settings==='object')?input.settings:input;
    const hasGeometry=['width','length','cols','rows'].some(k=>s[k]!==undefined),hasReadings=input.readings&&typeof input.readings==='object';
    if(!hasGeometry&&!hasReadings)return null;
    const sourceVersion=Number(input.schemaVersion||input.version||1),id=input.id||stableLegacyId(filename,input);
    const createdAt=input.createdAt||input.exportedAt||nowIso(),modifiedAt=input.modifiedAt||input.exportedAt||createdAt;
    const readings={};for(const [key,val] of Object.entries(input.readings||{})){const n=Number(val);if(Number.isFinite(n))readings[key]=n;}
    const fileId=fileIdFromFilename(filename)||validFileId(input.fileId)||undefined;
    delete input._pgHeader;
    return {...input,
      app:'Pad Grade Mapper Mobile',schemaVersion:CURRENT_SCHEMA,version:CURRENT_SCHEMA,id,fileId,createdAt,modifiedAt,
      status:input.status==='archived'?'archived':'open',
      settings:{
        width:clamp(s.width,.1,100000,64),length:clamp(s.length,.1,100000,76),
        cols:Math.round(clamp(s.cols,2,200,9)),rows:Math.round(clamp(s.rows,2,200,9)),
        target:Number.isFinite(Number(s.target))?Number(s.target):64,
        tol:Math.max(0,Number.isFinite(Number(s.tol))?Number(s.tol):.5),
        refCorner:s.refCorner||'SW',name:s.name||input.name||String(filename||'Pad').replace(/\.(padgrade(\.json)?|json)$/i,'')||'Pad'
      },
      readings,readingMeta:(input.readingMeta&&typeof input.readingMeta==='object')?input.readingMeta:{},
      gps:normalizeGps(input),measureMode:input.measureMode==='gps'?'gps':'manual',
      migration:{...(input.migration&&typeof input.migration==='object'?input.migration:{}),sourceVersion:Number(input.migration?.sourceVersion||sourceVersion||1)}
    };
  }

  function fullyMeasured(p){const s=p?.settings||{},need=Math.max(0,Math.round(+s.rows||0)*Math.round(+s.cols||0));if(!need)return false;let count=0;for(const v of Object.values(p?.readings||{}))if(Number.isFinite(Number(v)))count++;return count>=need;}
  function gpsReady(p){const c=p?.gps?.corners;if(!c||typeof c!=='object')return false;return ['SW','SE','NE','NW'].every(k=>c[k]&&Number.isFinite(+c[k].lat)&&Number.isFinite(+c[k].lon));}
  function catalogFromProject(p){const s=p?.settings||{};return {name:String(s.name||'Pad'),width:+s.width||0,length:+s.length||0,cols:Math.round(+s.cols||0),rows:Math.round(+s.rows||0),fullyMeasured:fullyMeasured(p),gpsReady:gpsReady(p)};}
  function headerFromProject(project){const p=normalizeProject(project)||project;if(!p)return null;return {format:FORMAT,schemaVersion:CURRENT_SCHEMA,id:p.id||null,fileId:validFileId(p.fileId)||null,createdAt:p.createdAt||null,modifiedAt:p.modifiedAt||null,status:p.status==='archived'?'archived':'open',catalog:catalogFromProject(p)};}

  function canonicalObject(project,filename=null){
    const p=normalizeProject(project,filename);if(!p)return null;
    const header=headerFromProject(p),rest={...p};
    for(const key of ['_pgHeader','app','schemaVersion','version','id','fileId','createdAt','modifiedAt','status','settings','readings','readingMeta','gps','measureMode','migration'])delete rest[key];
    // Property order is intentional: _pgHeader must remain inside the bounded
    // prefix read even for very large reading sets.
    return {_pgHeader:header,app:p.app,schemaVersion:CURRENT_SCHEMA,version:CURRENT_SCHEMA,id:p.id,fileId:p.fileId,createdAt:p.createdAt,modifiedAt:p.modifiedAt,status:p.status,
      settings:p.settings,readings:p.readings,readingMeta:p.readingMeta,gps:p.gps,measureMode:p.measureMode,migration:p.migration,...rest};
  }
  function serializeV6(project,filename=null){const p=canonicalObject(project,filename);if(!p)throw new Error('Invalid Pad Grade project');return JSON.stringify(p,null,2);}

  function extractFirstObject(text,key){
    text=String(text||'');const marker=`\"${key}\"`,at=text.indexOf(marker);if(at<0)return null;const colon=text.indexOf(':',at+marker.length);if(colon<0)return null;const start=text.indexOf('{',colon+1);if(start<0)return null;
    let depth=0,inString=false,escape=false;
    for(let i=start;i<text.length;i++){
      const ch=text[i];
      if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='\"')inString=false;continue;}
      if(ch==='\"'){inString=true;continue;}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return text.slice(start,i+1);
    }
    return null;
  }
  function parseHeaderText(text){
    const raw=extractFirstObject(text,'_pgHeader');if(!raw)return null;
    try{const h=JSON.parse(raw);if(h?.format!==FORMAT||Number(h.schemaVersion)!==CURRENT_SCHEMA||!h.id)return null;return h;}catch(e){return null;}
  }

  function downgradeToV5(project){
    const p=clone(project);if(!p||typeof p!=='object'||Array.isArray(p))return null;
    delete p._pgHeader;delete p.fileFormat;delete p.formatVersion;delete p.catalog;
    p.app='Pad Grade Mapper Mobile';p.schemaVersion=ROLLBACK_SCHEMA;p.version=ROLLBACK_SCHEMA;
    // Deliberately preserve every non-v6-only field, including dev/read metadata,
    // so rollback loses no information understood by the schema-5 generation.
    return p;
  }
  function serializeV5(project){const p=downgradeToV5(project);if(!p)throw new Error('Invalid Pad Grade project');return JSON.stringify(p,null,2);}

  function v5SemanticView(project){const p=downgradeToV5(project);if(!p)return null;return p;}
  function equivalentV5(a,b){return JSON.stringify(v5SemanticView(a))===JSON.stringify(v5SemanticView(b));}

  return {FORMAT,CURRENT_SCHEMA,ROLLBACK_SCHEMA,validFileId,fileIdFromFilename,normalizeProject,canonicalObject,serializeV6,parseHeaderText,headerFromProject,catalogFromProject,fullyMeasured,gpsReady,downgradeToV5,serializeV5,equivalentV5};
});
