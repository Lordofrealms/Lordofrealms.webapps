(()=>{
  function installTractorDriveSessionState(){
    if(window.__TRACTOR_DRIVE_SESSION_STATE_INSTALLED)return true;
    if(typeof sessionRecord!=='function'||typeof requireDB!=='function')return false;
    window.__TRACTOR_DRIVE_SESSION_STATE_INSTALLED=true;

    const bindings=new Map();
    let observedSession=null, hydrateToken=0;
    const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});

    async function getSessionRecord(id){
      if(!id)return null;const d=requireDB(),tx=d.transaction('sessions','readonly');return await reqP(tx.objectStore('sessions').get(id));
    }
    async function getSessionPoints(id){
      if(!id)return [];const d=requireDB(),tx=d.transaction('points','readonly'),idx=tx.objectStore('points').index('bySession');
      const rows=await reqP(idx.getAll(IDBKeyRange.only(id)));rows.sort((a,b)=>(a.seq??0)-(b.seq??0));return rows;
    }
    function chooseBinding(rec){
      if(!rec?.id)return null;
      const existing=bindings.get(rec.id);if(existing)return existing;
      const id=rec.drivePathingId||rec.selectedPathingId||null;
      const name=rec.drivePathingName||rec.selectedPathingName||'';
      if(id){const b={id,name};bindings.set(rec.id,b);return b}
      return null;
    }
    function bindCurrentSessionIfNeeded(rec){
      if(!rec?.id)return null;
      let b=chooseBinding(rec);if(b)return b;
      const id=(typeof selectedPathingId!=='undefined'&&selectedPathingId)||null;
      const name=(typeof selectedPathingName!=='undefined'&&selectedPathingName)||'';
      if(id){b={id,name};bindings.set(rec.id,b)}
      return b;
    }

    const originalSessionRecord=sessionRecord;
    sessionRecord=function(statusOverride=null){
      const rec=originalSessionRecord.apply(this,arguments);
      if(!rec?.id)return rec;
      const b=bindCurrentSessionIfNeeded(rec);
      if(b){
        rec.drivePathingId=b.id;rec.drivePathingName=b.name;
        // Keep legacy fields pinned too so old loadSession() code restores the same immutable path.
        rec.selectedPathingId=b.id;rec.selectedPathingName=b.name;
      }
      return rec;
    };

    async function hydrateSession(id){
      const token=++hydrateToken;
      if(!id){try{track=[];currentFix=null;totalDistanceM=0;rejectedCount=0}catch(e){};return}
      try{
        const [rec,pts]=await Promise.all([getSessionRecord(id),getSessionPoints(id)]);if(token!==hydrateToken)return;
        if(rec){chooseBinding(rec);try{currentFix=rec.currentFix||null;rejectedCount=Number(rec.rejectedCount||0);totalDistanceM=Number(rec.distanceM||0)}catch(e){}}
        try{track=pts}catch(e){}
        try{if(typeof updateAll==='function')updateAll()}catch(e){}
        try{if(typeof updateMapData==='function')updateMapData()}catch(e){}
      }catch(e){console.warn('Session-specific GPS history hydrate failed',e)}
    }

    async function ensurePersistedBinding(){
      try{
        if(typeof sessionId==='undefined'||!sessionId)return;
        const rec=await getSessionRecord(sessionId);if(!rec)return;
        let b=chooseBinding(rec);if(!b)b=bindCurrentSessionIfNeeded(rec);if(!b)return;
        if(rec.drivePathingId===b.id&&rec.selectedPathingId===b.id)return;
        rec.drivePathingId=b.id;rec.drivePathingName=b.name;rec.selectedPathingId=b.id;rec.selectedPathingName=b.name;rec.updatedAt=Date.now();
        const d=requireDB(),tx=d.transaction('sessions','readwrite');tx.objectStore('sessions').put(rec);await txDone(tx);
      }catch(e){console.warn('Could not persist immutable drive/path binding',e)}
    }

    // If core loadSession is available, force a session-local history rehydrate after every load.
    if(typeof loadSession==='function'){
      const originalLoadSession=loadSession;
      loadSession=async function(id){const r=await originalLoadSession.apply(this,arguments);await hydrateSession(id);await ensurePersistedBinding();return r};
    }

    // Detect new sessions created by the core and bind them to the path selected at creation time.
    const poll=setInterval(()=>{
      try{
        const sid=(typeof sessionId!=='undefined')?sessionId:null;
        if(sid!==observedSession){observedSession=sid;hydrateSession(sid).then(ensurePersistedBinding)}
      }catch(e){}
    },250);
    window.__TRACTOR_DRIVE_SESSION_STATE_POLL=poll;

    window.TractorDriveState={bindings,hydrateSession,ensurePersistedBinding,getSessionPoints,getSessionRecord,getBinding:id=>bindings.get(id)||null};
    return true;
  }
  window.installTractorDriveSessionState=installTractorDriveSessionState;
})();
