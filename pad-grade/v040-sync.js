/* Pad Grade v0.4.5 durable-folder reconciliation.
 * Non-reloading, legacy tolerant, and synchronized with the live project manager.
 */
(function installPadGradeDurableSync(){
  'use strict';
  if(window.PadGradeFiles&&typeof window.PadGradeFiles.read==='function'){
    window.__padGradeDurableSyncV040='superseded-by-v096-async-reconcile';
    try{window.dispatchEvent(new Event('padgrade-durable-sync-ready'));}catch(e){}
    return;
  }
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROMPT_KEY='padGradeDurableFolderPromptedV1';
  const projectKey=id=>`padGradeProjectV5:${id}`;
  const native=window.PadGradeNative;
  if(!native||typeof native.listProjectFiles!=='function') return;

  const nowIso=()=>new Date().toISOString();
  function getIndex(){try{const x=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function setIndex(x){localStorage.setItem(INDEX_KEY,JSON.stringify(x));}
  function getLocal(id){try{return JSON.parse(localStorage.getItem(projectKey(id))||'null');}catch(e){return null;}}
  function putLocal(p){localStorage.setItem(projectKey(p.id),JSON.stringify(p));}
  function modified(p){const t=Date.parse(p?.modifiedAt||p?.exportedAt||p?.createdAt||'');return Number.isFinite(t)?t:0;}
  function statusOf(p,item){return (p?.status||item?.status)==='archived'?'archived':'open';}
  function clamp(n,a,b,d){n=Number(n);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):d;}
  function isCandidate(name){const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json')||n.endsWith('.json');}
  function indexReady(){try{return typeof native.isProjectFolderIndexReady==='function'?!!native.isProjectFolderIndexReady():true;}catch(e){return false;}}
  function hasFolder(){try{return typeof native.hasProjectFolder==='function'&&!!native.hasProjectFolder();}catch(e){return false;}}

  function stableLegacyId(filename,raw){
    const seed=String(filename||'legacy')+'|'+JSON.stringify(raw?.settings||raw||{});
    let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return `pg-legacy-${(h>>>0).toString(36)}`;
  }

  function normalizeOne(raw,filename){
    if(!raw||typeof raw!=='object') return null;
    const s=(raw.settings&&typeof raw.settings==='object')?raw.settings:raw;
    const hasGeometry=['width','length','cols','rows'].some(k=>s[k]!==undefined);
    const hasReadings=raw.readings&&typeof raw.readings==='object';
    if(!hasGeometry&&!hasReadings) return null;
    const id=raw.id||stableLegacyId(filename,raw);
    const gpsRaw=(raw.gps&&typeof raw.gps==='object')?raw.gps:{};const gps={...gpsRaw};
    if(!gps.reference&&raw.gpsRef)gps.reference=raw.gpsRef;if(!gps.opposite&&raw.gpsOpposite)gps.opposite=raw.gpsOpposite;if(!gps.corners&&raw.gpsCorners)gps.corners=raw.gpsCorners;if(gps.targetIndex==null&&Number.isInteger(raw.gpsTargetIndex))gps.targetIndex=raw.gpsTargetIndex;
    const readings={};for(const [key,val] of Object.entries(raw.readings||{})){const n=Number(val);if(Number.isFinite(n))readings[key]=n;}
    const createdAt=raw.createdAt||raw.exportedAt||nowIso(),modifiedAt=raw.modifiedAt||raw.exportedAt||createdAt;
    return {...raw,app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,createdAt,modifiedAt,status:raw.status==='archived'?'archived':'open',settings:{width:clamp(s.width,0.1,100000,64),length:clamp(s.length,0.1,100000,76),cols:Math.round(clamp(s.cols,2,200,9)),rows:Math.round(clamp(s.rows,2,200,9)),target:Number.isFinite(Number(s.target))?Number(s.target):64,tol:Math.max(0,Number.isFinite(Number(s.tol))?Number(s.tol):0.5),refCorner:s.refCorner||'SW',name:s.name||raw.name||String(filename||'Pad').replace(/\.(padgrade(\.json)?|json)$/i,'')||'Pad'},readings,readingMeta:(raw.readingMeta&&typeof raw.readingMeta==='object')?raw.readingMeta:{},gps,measureMode:raw.measureMode==='gps'?'gps':'manual',migration:{sourceVersion:Number(raw.schemaVersion||raw.version||1),sourceFile:filename||null}};
  }

  function projectsFromFile(raw,filename){
    if(raw?.backupType==='all-projects'||Array.isArray(raw?.projects))return (raw.projects||[]).map((p,i)=>normalizeOne(p,`${filename}#${i}`)).filter(Boolean);
    const one=normalizeOne(raw,filename);return one?[one]:[];
  }

  function refreshManager(){try{window.__padGradeRefreshProjectIndex?.();}catch(e){}try{window.dispatchEvent(new CustomEvent('padgrade-projects-reconciled',{detail:window.__padGradeLastFolderSync}));}catch(e){}}

  function reconcile(){
    if(hasFolder()&&!indexReady())return null;
    let names=[];try{names=JSON.parse(native.listProjectFiles()||'[]');}catch(e){names=[];}
    const idx=getIndex(),byId=new Map(idx.map(x=>[x.id,x]));let imported=0,skipped=0,recognized=0;
    for(const name of names){
      if(typeof name!=='string'||!isCandidate(name))continue;
      let raw=null;try{raw=JSON.parse(native.readProjectFile(name)||'null');}catch(e){skipped++;continue;}
      const projects=projectsFromFile(raw,name);if(!projects.length){skipped++;continue;}recognized+=projects.length;
      for(const remote of projects){const local=getLocal(remote.id),remoteWins=!local||modified(remote)>modified(local),best=remoteWins?remote:local;if(remoteWins){putLocal(remote);imported++;}byId.set(best.id,{id:best.id,name:best.settings?.name||'Pad',modifiedAt:best.modifiedAt||best.exportedAt||nowIso(),createdAt:best.createdAt||best.exportedAt||nowIso(),status:statusOf(best,byId.get(best.id)),fileId:best.fileId});}
    }
    const next=[...byId.values()];setIndex(next);
    const activeId=localStorage.getItem(ACTIVE_KEY),active=next.find(x=>x.id===activeId&&x.status!=='archived');if(!active){const open=next.filter(x=>x.status!=='archived').sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt)));if(open.length)localStorage.setItem(ACTIVE_KEY,open[0].id);}
    for(const item of next){const p=getLocal(item.id);if(!p)continue;p.status=statusOf(p,item);try{native.writeProjectFile(`${p.fileId?`${p.fileId}-`:''}${item.id}.padgrade`,JSON.stringify(p));}catch(e){}}
    window.__padGradeLastFolderSync={imported,skipped,recognized,total:names.length,at:Date.now()};refreshManager();return window.__padGradeLastFolderSync;
  }

  function reconcileWhenReady(){
    if(!hasFolder())return false;
    if(!indexReady())return false;
    try{reconcile();return true;}catch(e){return false;}
  }

  window.__padGradeProjectFolderChanged=function(){
    if(reconcileWhenReady())return;
    // The native bridge dispatches padgrade-project-folder-indexed when its
    // background SAF scan completes. Do not infer "empty folder" from an
    // unready cache and do not synchronously enumerate it from JavaScript.
  };
  window.addEventListener('padgrade-project-folder-indexed',()=>setTimeout(reconcileWhenReady,0));

  window.__padGradeDurableSyncV040=true;
  try{window.dispatchEvent(new Event('padgrade-durable-sync-ready'));}catch(e){}

  if(hasFolder())setTimeout(reconcileWhenReady,0);else if(!localStorage.getItem(PROMPT_KEY)){
    localStorage.setItem(PROMPT_KEY,'1');
    setTimeout(()=>{const ok=confirm('Choose a durable Pad Grade project folder now? Projects in that folder survive app uninstall/reinstall. You can also do this later from Projects.');if(ok&&typeof native.chooseProjectFolder==='function'){try{native.chooseProjectFolder();}catch(e){}}},700);
  }
})();
