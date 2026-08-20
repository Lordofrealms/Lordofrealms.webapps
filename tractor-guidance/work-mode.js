(()=>{
  function installTractorWorkMode(){
    if(window.__TRACTOR_WORK_MODE_INSTALLED)return true;
    if(typeof startGPS!=='function'||typeof stopGPS!=='function'||typeof onPosition!=='function'||typeof toggleStart!=='function')return false;
    window.__TRACTOR_WORK_MODE_INSTALLED=true;
    window.__TRACTOR_WORK_ACTIVE=false;

    const mapTools=document.querySelector('.mapTools.driveOnly');
    const bottom=document.querySelector('.bottom.driveOnly');
    const pauseBtn=document.getElementById('pauseBtn');
    if(pauseBtn)pauseBtn.style.display='none';

    function makeWorkButton(id){
      let btn=document.getElementById(id);
      if(btn)return btn;
      btn=document.createElement('button');btn.id=id;btn.textContent='Start Work';btn.className='primary';return btn;
    }

    const workBtn=makeWorkButton('workBtn');
    const workBottom=makeWorkButton('workBottom');
    if(mapTools){const start=document.getElementById('startBtn');if(start?.nextSibling)mapTools.insertBefore(workBtn,start.nextSibling);else mapTools.appendChild(workBtn)}
    if(bottom){const start=document.getElementById('startBottom');if(start?.nextSibling)bottom.insertBefore(workBottom,start.nextSibling);else bottom.appendChild(workBottom)}

    function setWorkButtons(){
      const active=Boolean(window.__TRACTOR_WORK_ACTIVE);
      for(const btn of [workBtn,workBottom]){
        btn.textContent=active?'Stop Work':'Start Work';
        btn.disabled=!tracking;
        btn.classList.toggle('warn',active);btn.classList.toggle('primary',!active);
      }
    }

    async function startWork(){
      if(!tracking){alert('Turn GPS on first.');return}
      if(window.__TRACTOR_WORK_ACTIVE)return;
      window.__TRACTOR_WORK_ACTIVE=true;
      if(track.length)breakNext=true;
      if(!driveStartedAt)driveStartedAt=Date.now();
      if(!driveRunStartedAt)driveRunStartedAt=Date.now();
      setStatus('live','GPS on • WORKING');setWorkButtons();
      try{await saveMeta('work started')}catch(e){}
      try{updateAll()}catch(e){}
    }

    async function stopWork(){
      if(!window.__TRACTOR_WORK_ACTIVE)return;
      window.__TRACTOR_WORK_ACTIVE=false;
      if(track.length)breakNext=true;
      if(driveRunStartedAt){driveElapsedMs+=Date.now()-driveRunStartedAt;driveRunStartedAt=null}
      setStatus(tracking?'live':'',tracking?'GPS on • work stopped':'GPS stopped');setWorkButtons();
      try{await saveMeta('work stopped')}catch(e){}
      try{updateAll()}catch(e){}
    }

    async function toggleWork(){window.__TRACTOR_WORK_ACTIVE?await stopWork():await startWork()}
    workBtn.onclick=toggleWork;workBottom.onclick=toggleWork;

    const originalStartGPS=startGPS;
    startGPS=async function(){
      const priorDriveStart=driveStartedAt;
      const result=await originalStartGPS.apply(this,arguments);
      if(!window.__TRACTOR_WORK_ACTIVE){
        if(priorDriveStart==null)driveStartedAt=null;
        driveRunStartedAt=null;
        if(tracking)setStatus('live','GPS on • work stopped');
      }
      setWorkButtons();return result;
    };

    const originalStopGPS=stopGPS;
    stopGPS=async function(){
      if(window.__TRACTOR_WORK_ACTIVE)await stopWork();
      const result=await originalStopGPS.apply(this,arguments);setWorkButtons();return result;
    };

    const originalOnPosition=onPosition;
    onPosition=async function(pos){
      if(window.__TRACTOR_WORK_ACTIVE)return await originalOnPosition.apply(this,arguments);
      const c=pos.coords;
      const p={lat:c.latitude,lon:c.longitude,accuracyM:Number.isFinite(c.accuracy)?c.accuracy:null,altitudeM:Number.isFinite(c.altitude)?c.altitude:null,speedMps:Number.isFinite(c.speed)?c.speed:null,headingDeg:Number.isFinite(c.heading)?c.heading:null,time:pos.timestamp||Date.now()};
      currentFix=p;
      const lf=document.getElementById('lastFix'),acc=document.getElementById('accuracy'),spd=document.getElementById('speed');
      if(lf)lf.textContent='• '+new Date(p.time).toLocaleTimeString();
      if(acc)acc.textContent=p.accuracyM!==null?(p.accuracyM*FT_PER_M).toFixed(0):'—';
      let sp=p.speedMps;
      if(!Number.isFinite(sp)&&track.length){const last=track.at(-1),dt=(p.time-last.time)/1000;if(dt>0&&dt<15)sp=haversine(last,p)/dt}
      if(spd)spd.textContent=Number.isFinite(sp)?(sp*2.236936).toFixed(1):'0.0';
      setStatus('live','GPS on • work stopped');updateAll();
      if(Date.now()-lastSaveTime>5000){try{await saveMeta('position checkpoint')}catch(e){}}
    };

    togglePause=async function(){await toggleWork()};

    const originalLoadSession=typeof loadSession==='function'?loadSession:null;
    if(originalLoadSession){
      loadSession=async function(){window.__TRACTOR_WORK_ACTIVE=false;const r=await originalLoadSession.apply(this,arguments);driveRunStartedAt=null;setWorkButtons();if(tracking)setStatus('live','GPS on • work stopped');return r};
    }

    // Rebind the actual GPS controls AFTER wrapping startGPS/stopGPS/onPosition.
    // This makes the operational behavior independent of whatever handlers the
    // legacy core installed earlier or where the Drive console moves the buttons.
    const gpsHandler=()=>{setAppMode('drive');tracking?stopGPS():startGPS()};
    for(const id of ['startBtn','startBottom']){
      const btn=document.getElementById(id);if(btn)btn.onclick=gpsHandler;
    }

    setWorkButtons();return true;
  }
  window.installTractorWorkMode=installTractorWorkMode;
})();
