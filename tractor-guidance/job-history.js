(()=>{
  function installTractorJobHistory(){
    if(window.__TRACTOR_JOB_HISTORY_INSTALLED)return true;
    if(typeof requireDB!=='function')return false;
    window.__TRACTOR_JOB_HISTORY_INSTALLED=true;
    const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});
    const txP=tx=>new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
    const metrics=new Map();
    function num(v,d=0){v=Number(v);return Number.isFinite(v)?v:d}
    function txt(id){return (document.getElementById(id)?.textContent||'').trim()}
    function val(id){return document.getElementById(id)?.value??null}
    async function getSession(id){if(!id)return null;const d=requireDB(),tx=d.transaction('sessions','readonly');return await reqP(tx.objectStore('sessions').get(id))}
    async function putSession(rec){const d=requireDB(),tx=d.transaction('sessions','readwrite');tx.objectStore('sessions').put(rec);await txP(tx);return rec}
    async function pointsFor(id){const d=requireDB(),tx=d.transaction('points','readonly'),idx=tx.objectStore('points').index('bySession');const rows=await reqP(idx.getAll(IDBKeyRange.only(id)));rows.sort((a,b)=>num(a.seq)-num(b.seq));return rows}
    function hav(a,b){if(!a||!b)return 0;const R=6371000,rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,s=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s))}
    function stateFor(id,rec=null){let m=metrics.get(id);if(m)return m;const j=rec?.jobMetrics||{};m={gpsOnMs:num(j.gpsOnMs),gpsDistanceM:num(j.gpsDistanceM),maxSpeedMps:num(j.maxSpeedMps),accuracySumM:num(j.accuracySumM),accuracyCount:num(j.accuracyCount),lastGpsFix:null,gpsRunStartedAt:null};metrics.set(id,m);return m}
    async function persistMetrics(id){if(!id)return;const rec=await getSession(id);if(!rec)return;const m=stateFor(id,rec);rec.jobMetrics={gpsOnMs:m.gpsOnMs+(m.gpsRunStartedAt?Date.now()-m.gpsRunStartedAt:0),gpsDistanceM:m.gpsDistanceM,maxSpeedMps:m.maxSpeedMps,accuracySumM:m.accuracySumM,accuracyCount:m.accuracyCount};rec.updatedAt=Date.now();await putSession(rec)}

    if(typeof onPosition==='function'){
      const orig=onPosition;onPosition=async function(pos){
        const sid=(typeof sessionId!=='undefined')?sessionId:null;
        if(sid){const rec=await getSession(sid),m=stateFor(sid,rec),c=pos?.coords,p={lat:c?.latitude,lon:c?.longitude,time:pos?.timestamp||Date.now()};if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)){if(m.lastGpsFix){const dt=(p.time-m.lastGpsFix.time)/1000,d=hav(m.lastGpsFix,p);if(dt>0&&dt<30&&d<250)m.gpsDistanceM+=d}m.lastGpsFix=p}if(Number.isFinite(c?.speed))m.maxSpeedMps=Math.max(m.maxSpeedMps,c.speed);if(Number.isFinite(c?.accuracy)){m.accuracySumM+=c.accuracy;m.accuracyCount++}}
        const r=await orig.apply(this,arguments);if(sid&&Date.now()%7000<700)persistMetrics(sid).catch(()=>{});return r
      }
    }
    if(typeof startGPS==='function'){
      const orig=startGPS;startGPS=async function(){const r=await orig.apply(this,arguments);const sid=(typeof sessionId!=='undefined')?sessionId:null;if(sid&&typeof tracking!=='undefined'&&tracking){const rec=await getSession(sid),m=stateFor(sid,rec);if(!m.gpsRunStartedAt)m.gpsRunStartedAt=Date.now()}return r}
    }
    if(typeof stopGPS==='function'){
      const orig=stopGPS;stopGPS=async function(){const sid=(typeof sessionId!=='undefined')?sessionId:null;if(sid){const rec=await getSession(sid),m=stateFor(sid,rec);if(m.gpsRunStartedAt){m.gpsOnMs+=Date.now()-m.gpsRunStartedAt;m.gpsRunStartedAt=null}await persistMetrics(sid).catch(()=>{})}return await orig.apply(this,arguments)}
    }

    function parsePct(s){const n=parseFloat(String(s||'').replace('%',''));return Number.isFinite(n)?n:null}
    function parseNum(s){const n=parseFloat(String(s||'').replace(/[^0-9.+-]/g,''));return Number.isFinite(n)?n:null}
    async function finishCurrentDrive(){
      const sid=(typeof sessionId!=='undefined')?sessionId:null;if(!sid){alert('No active drive session.');return}
      if(!confirm('Finish this drive and move it to Completed Jobs? You can reopen it later.'))return;
      try{if(typeof tracking!=='undefined'&&tracking&&typeof stopGPS==='function')await stopGPS()}catch(e){}
      try{window.__TRACTOR_WORK_ACTIVE=false}catch(e){}
      const rec=await getSession(sid);if(!rec){alert('Drive session record could not be found.');return}
      const now=Date.now(),m=stateFor(sid,rec);if(m.gpsRunStartedAt){m.gpsOnMs+=now-m.gpsRunStartedAt;m.gpsRunStartedAt=null}
      const activeMs=num(typeof driveElapsedMs!=='undefined'?driveElapsedMs:rec.driveElapsedMs)+(typeof driveRunStartedAt!=='undefined'&&driveRunStartedAt?now-driveRunStartedAt:0);
      const workDistM=num(typeof totalDistanceM!=='undefined'?totalDistanceM:rec.distanceM);
      const summary={
        startedAt:rec.createdAt||rec.sessionCreatedAt||now,finishedAt:now,elapsedMs:Math.max(0,now-(rec.createdAt||now)),activeWorkMs:activeMs,gpsOnMs:m.gpsOnMs,gpsDistanceM:m.gpsDistanceM,workDistanceM:workDistM,
        avgWorkingMph:activeMs>0?(workDistM/1609.344)/(activeMs/3600000):0,maxSpeedMph:m.maxSpeedMps*2.236936,avgAccuracyFt:m.accuracyCount?(m.accuracySumM/m.accuracyCount)*3.28084:null,
        coveragePct:parsePct(txt('progressPct')),plannedAcres:parseNum(txt('estimateAcres'))??parseNum(txt('fieldAcres')),nominalWorkedAcres:parseNum(txt('acres')),
        implementWidthFt:num(val('implWidth'),null),overlapFt:num(val('overlap'),null),pathType:val('pathType')||rec?.settings?.pathType||null,operation:val('operation')||rec?.settings?.operation||null,
        propertyName:rec.propertyProfileName||null,pathName:rec.drivePathingName||rec.selectedPathingName||null,pointCount:(await pointsFor(sid)).length
      };
      rec.status='completed';rec.finishedAt=now;rec.completionSummary=summary;rec.jobMetrics={gpsOnMs:m.gpsOnMs,gpsDistanceM:m.gpsDistanceM,maxSpeedMps:m.maxSpeedMps,accuracySumM:m.accuracySumM,accuracyCount:m.accuracyCount};rec.updatedAt=now;await putSession(rec);
      try{if(typeof sessionStatus!=='undefined')sessionStatus='completed'}catch(e){}
      try{if(typeof saveMeta==='function')await saveMeta('drive completed')}catch(e){}
      try{if(typeof setAppMode==='function')setAppMode('plan')}catch(e){}
      try{window.openTractorCompletedJobs?.()}catch(e){}
      try{window.TractorIntegrity?.refreshPathLibrary?.()}catch(e){}
    }

    async function reopen(id){const rec=await getSession(id);if(!rec)throw Error('Completed job not found.');const prior=rec.completionSummary;if(prior){rec.completionHistory=Array.isArray(rec.completionHistory)?rec.completionHistory:[];rec.completionHistory.push(prior)}rec.status='in-progress';rec.reopenedCount=num(rec.reopenedCount)+1;rec.finishedAt=null;rec.completionSummary=null;rec.updatedAt=Date.now();await putSession(rec);return rec}
    async function exportJob(id){const rec=await getSession(id);if(!rec)throw Error('Job not found.');const pts=await pointsFor(id);const payload={schema:'tractor-guidance-completed-job-v1',exportedAt:new Date().toISOString(),session:rec,points:pts};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=((rec.driveName||'completed-job').replace(/[^a-z0-9_-]+/gi,'_'))+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

    for(const id of ['finishSessionBtn']){const b=document.getElementById(id);if(b)b.onclick=finishCurrentDrive}
    window.TractorJobs={getSession,putSession,pointsFor,finishCurrentDrive,reopen,exportJob,persistMetrics};
    return true
  }
  window.installTractorJobHistory=installTractorJobHistory;
})();