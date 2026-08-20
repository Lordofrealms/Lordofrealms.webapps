(()=>{
  function installTractorDriveSessionState(){
    if(window.__TRACTOR_DRIVE_SESSION_STATE_INSTALLED)return true;
    if(typeof sessionRecord!=='function'||typeof requireDB!=='function')return false;
    window.__TRACTOR_DRIVE_SESSION_STATE_INSTALLED=true;

    const bindings=new Map();let hydrateToken=0;
    const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});
    const txP=tx=>new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
    async function getSessionRecord(id){if(!id)return null;const d=requireDB(),tx=d.transaction('sessions','readonly');return await reqP(tx.objectStore('sessions').get(id))}
    async function getSessionPoints(id){if(!id)return [];const d=requireDB(),tx=d.transaction('points','readonly'),idx=tx.objectStore('points').index('bySession');const rows=await reqP(idx.getAll(IDBKeyRange.only(id)));rows.sort((a,b)=>(a.seq??0)-(b.seq??0));return rows}
    async function getAllPaths(){const d=requireDB(),tx=d.transaction('pathings','readonly');return await reqP(tx.objectStore('pathings').getAll())}
    async function getPath(id){const d=requireDB(),tx=d.transaction('pathings','readonly');return await reqP(tx.objectStore('pathings').get(id))}
    async function putSession(rec){const d=requireDB(),tx=d.transaction('sessions','readwrite');tx.objectStore('sessions').put(rec);await txP(tx);return rec}
    function driveLabel(pathName,when=Date.now()){const stamp=new Date(when).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});return `${pathName||'Drive'} — ${stamp}`}
    function bindingFromRecord(rec){if(!rec?.id)return null;const id=rec.drivePathingId||rec.selectedPathingId||null;if(!id)return null;const b={id,name:rec.drivePathingName||rec.selectedPathingName||''};bindings.set(rec.id,b);return b}
    async function persistBinding(id,pathId,pathName,startedAt=null){const rec=await getSessionRecord(id);if(!rec)throw Error('Drive session record was not created.');const existing=bindingFromRecord(rec);if(existing&&existing.id!==pathId)throw Error('This drive is already bound to a different saved path.');const b=existing||{id:pathId,name:pathName||''};bindings.set(id,b);rec.drivePathingId=b.id;rec.drivePathingName=b.name;rec.selectedPathingId=b.id;rec.selectedPathingName=b.name;rec.driveName=rec.driveName||driveLabel(b.name,startedAt||rec.createdAt||Date.now());rec.updatedAt=Date.now();await putSession(rec);return rec}

    const originalSessionRecord=sessionRecord;sessionRecord=function(){const rec=originalSessionRecord.apply(this,arguments);if(!rec?.id)return rec;const b=bindings.get(rec.id);if(b){rec.drivePathingId=b.id;rec.drivePathingName=b.name;rec.selectedPathingId=b.id;rec.selectedPathingName=b.name;rec.driveName=rec.driveName||driveLabel(b.name,rec.createdAt)}return rec};

    async function hydrateSession(id){const token=++hydrateToken;if(!id){track=[];currentFix=null;totalDistanceM=0;rejectedCount=0;try{updateAll()}catch(e){}return}const [rec,pts]=await Promise.all([getSessionRecord(id),getSessionPoints(id)]);if(token!==hydrateToken)return;if(rec)bindingFromRecord(rec);track=pts;currentFix=rec?.currentFix||null;rejectedCount=Number(rec?.rejectedCount||0);totalDistanceM=Number(rec?.distanceM||0);try{updateAll()}catch(e){}try{updateMapData()}catch(e){}}

    async function detachedLoadPath(id,options={}){
      if(typeof loadPathing!=='function')throw Error('Path loading is unavailable.');
      const priorSession=(typeof sessionId!=='undefined')?sessionId:null;
      const priorStatus=(typeof sessionStatus!=='undefined')?sessionStatus:null;
      try{sessionId=null;try{sessionStatus=null}catch(e){};return await loadPathing(id,options)}
      finally{sessionId=priorSession;try{sessionStatus=priorStatus}catch(e){}}
    }
    async function loadPlanPath(id){
      if(!await getPath(id))throw Error('Saved path no longer exists.');
      await detachedLoadPath(id,{preserveProgress:false});
      try{if(typeof setAppMode==='function')setAppMode('plan')}catch(e){}
      try{updateAll()}catch(e){}try{updateMapData()}catch(e){}
      return true;
    }

    async function createNewDrive(){const pathId=(typeof selectedPathingId!=='undefined')?selectedPathingId:null,pathName=(typeof selectedPathingName!=='undefined')?selectedPathingName:'';if(!pathId){alert('Select a saved path before creating a drive session.');return null}try{if(typeof tracking!=='undefined'&&tracking&&typeof stopGPS==='function')await stopGPS()}catch(e){}try{if(typeof sessionId!=='undefined'&&sessionId&&typeof saveMeta==='function')await saveMeta('switching to new drive')}catch(e){}const now=Date.now(),id=typeof newId==='function'?newId():'sess_'+now+'_'+Math.random().toString(36).slice(2,9);sessionId=id;sessionCreatedAt=now;sessionStatus='in-progress';track=[];rejectedCount=0;currentFix=null;totalDistanceM=0;paused=false;breakNext=false;driveStartedAt=null;driveElapsedMs=0;driveRunStartedAt=null;window.__TRACTOR_WORK_ACTIVE=false;const spacing=Number(planProgress?.spacingFt)||20;planProgress={spacingFt:spacing,covered:{}};bindings.set(id,{id:pathId,name:pathName||''});const rec=sessionRecord();rec.drivePathingId=pathId;rec.drivePathingName=pathName||'';rec.selectedPathingId=pathId;rec.selectedPathingName=pathName||'';rec.driveName=driveLabel(pathName,now);rec.createdAt=now;rec.updatedAt=now;await putSession(rec);localStorage.setItem('tractorActiveSessionId',id);const title=document.getElementById('sessionTitle');if(title)title.textContent=rec.driveName;try{document.getElementById('sessionsDlg')?.close()}catch(e){}try{updateAll()}catch(e){}try{updateMapData()}catch(e){}return rec}

    async function restoreBoundDrivePath(){if(typeof sessionId==='undefined'||!sessionId)return true;const sid=sessionId,rec=await getSessionRecord(sid);if(!rec)return true;const b=bindingFromRecord(rec);if(!b)return false;if(!await getPath(b.id))return false;if((typeof selectedPathingId==='undefined')||selectedPathingId!==b.id)await detachedLoadPath(b.id,{preserveProgress:true});sessionId=sid;await hydrateSession(sid);return true}

    if(typeof loadSession==='function'){const originalLoadSession=loadSession;loadSession=async function(id){const previous=(typeof sessionId!=='undefined')?sessionId:null;try{sessionId=null;track=[];currentFix=null;totalDistanceM=0;const r=await originalLoadSession.apply(this,arguments);const rec=await getSessionRecord(id);if(rec)bindingFromRecord(rec);sessionId=id;await restoreBoundDrivePath();await hydrateSession(id);return r}catch(e){sessionId=previous;throw e}}}

    if(typeof startGPS==='function'){const originalStartGPS=startGPS;startGPS=async function(){if(!sessionId){const made=await createNewDrive();if(!made)return}let rec=await getSessionRecord(sessionId),b=bindingFromRecord(rec);if(!b){const pid=(typeof selectedPathingId!=='undefined')?selectedPathingId:null,pn=(typeof selectedPathingName!=='undefined')?selectedPathingName:'';if(!pid){alert('This drive has no saved path binding. Create a new drive from a saved path.');return}rec=await persistBinding(sessionId,pid,pn,rec?.createdAt);b=bindingFromRecord(rec)}if(!await getPath(b.id)){alert('This drive is broken because its saved path no longer exists.');return}await restoreBoundDrivePath();return await originalStartGPS.apply(this,arguments)}}

    const newBtn=document.getElementById('newSessionBtn');if(newBtn)newBtn.onclick=()=>createNewDrive().then(r=>{if(r&&typeof setAppMode==='function')setAppMode('drive')}).catch(e=>alert('Could not create drive: '+(e?.message||e)));
    const driveBtn=document.getElementById('driveModeBtn');if(driveBtn)driveBtn.onclick=async()=>{try{if(sessionId){const ok=await restoreBoundDrivePath();if(!ok){alert('The active drive cannot be loaded because its saved path is missing.');return}}if(typeof setAppMode==='function')setAppMode('drive')}catch(e){alert('Could not open DRIVE: '+(e?.message||e))}};

    const savePathBtn=document.getElementById('savePathingDialogBtn');if(savePathBtn&&savePathBtn.onclick){const originalSave=savePathBtn.onclick;savePathBtn.onclick=async function(ev){const input=document.getElementById('pathingNameInput'),wanted=(input?.value||'').trim();if(wanted){const paths=await getAllPaths(),dup=paths.find(p=>(p.name||p.pathingName||'').trim().toLowerCase()===wanted.toLowerCase()&&p.id!==selectedPathingId);if(dup){alert('A saved path named "'+wanted+'" already exists. Use a unique path name.');return}}const r=await originalSave.call(this,ev);setTimeout(()=>window.TractorIntegrity?.refreshPathLibrary?.(),50);return r}};

    window.TractorDriveState={bindings,hydrateSession,createNewDrive,restoreBoundDrivePath,persistBinding,loadPlanPath,getSessionPoints,getSessionRecord,getBinding:id=>bindings.get(id)||null};return true;
  }window.installTractorDriveSessionState=installTractorDriveSessionState;
})();