(()=>{
  function installTractorDriveConsole(){
    if(window.__TRACTOR_DRIVE_CONSOLE_INSTALLED)return true;
    window.__TRACTOR_DRIVE_CONSOLE_INSTALLED=true;

    const bottom=document.querySelector('.bottom.driveOnly');
    if(!bottom)return false;

    // Capture every functional node BEFORE rebuilding the bottom console.
    // Core GPS code still references startBottom/fitBottom/sessionsBottom directly,
    // so those original DOM nodes must remain alive.
    const startBottom=document.getElementById('startBottom');
    const sessionsBottom=document.getElementById('sessionsBottom');
    const fitBottom=document.getElementById('fitBottom');
    const workBottom=document.getElementById('workBottom');
    const startBtn=document.getElementById('startBtn');
    const workBtn=document.getElementById('workBtn');
    const driveLocateBtn=document.getElementById('driveLocateBtn');
    const fitPathBtn=document.getElementById('fitPathBtn');
    const finishSessionBtn=document.getElementById('finishSessionBtn');

    const statusCard=document.getElementById('gpsStatus')?.closest('.card.driveOnly');
    const dashCard=document.getElementById('progressPct')?.closest('.card.driveOnly');
    const mapTools=document.querySelector('.mapTools.driveOnly');
    if(statusCard)statusCard.classList.add('driveConsoleSource');
    if(dashCard)dashCard.classList.add('driveConsoleSource');
    if(mapTools)mapTools.classList.add('driveConsoleSource');

    const style=document.createElement('style');
    style.textContent=`
      body.driveMode .top{display:none!important}
      body.driveMode .privacyCard{display:none!important}
      body.driveMode .mapTools.driveOnly{display:none!important}
      body.driveMode .driveConsoleSource{display:none!important}
      body.driveMode .wrap{padding-bottom:220px!important}
      .driveConsole{display:block!important;padding:7px 8px calc(7px + env(safe-area-inset-bottom));max-height:46vh;overflow:auto}
      .driveConsoleTop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .driveConsolePath{min-width:0;flex:1}
      .driveConsolePath .drivePathName{font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .driveConsoleState{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      .driveConsoleStats{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:6px}
      .driveConsoleStats .metric{padding:5px 3px;min-width:0}
      .driveConsoleStats .metric b{font-size:.86rem}
      .driveConsoleStats .metric span{font-size:.53rem;white-space:nowrap}
      .driveConsoleControls{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
      .driveConsoleControls button{min-width:0!important;padding:9px 5px;font-size:.72rem}
      .driveConsoleMeta{font-size:.60rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:760px){body.driveMode .wrap{padding-bottom:270px!important}.driveConsoleStats{grid-template-columns:repeat(4,1fr)}.driveConsoleControls{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:420px){body.driveMode .wrap{padding-bottom:235px!important}.driveConsoleTop{align-items:flex-start}.driveConsoleState .savePulse,.driveConsoleState #lastFix{display:none}.driveConsoleStats{grid-template-columns:repeat(4,1fr)}.driveConsoleStats .metric:nth-child(n+5){display:none}.driveConsoleControls{grid-template-columns:repeat(3,1fr)}}
    `;
    document.head.appendChild(style);

    bottom.classList.add('driveConsole');
    bottom.replaceChildren();

    const top=document.createElement('div');top.className='driveConsoleTop';
    const pathBox=document.createElement('div');pathBox.className='driveConsolePath';
    const pathName=document.getElementById('drivePathName');
    const pathMeta=document.getElementById('drivePathMeta');
    if(pathName)pathBox.appendChild(pathName);
    if(pathMeta){pathMeta.classList.add('driveConsoleMeta');pathBox.appendChild(pathMeta)}
    top.appendChild(pathBox);

    const state=document.createElement('div');state.className='driveConsoleState';
    const gpsStatus=document.getElementById('gpsStatus');
    const saveState=document.getElementById('saveState');
    const lastFix=document.getElementById('lastFix');
    if(gpsStatus)state.appendChild(gpsStatus);
    if(saveState)state.appendChild(saveState);
    if(lastFix)state.appendChild(lastFix);
    top.appendChild(state);bottom.appendChild(top);

    const stats=document.createElement('div');stats.className='driveConsoleStats';
    for(const id of ['progressPct','speed','distance','avgSpeed','driveElapsed','remainingMiles','accuracy','acres']){
      const el=document.getElementById(id),metric=el?.closest('.metric');if(metric)stats.appendChild(metric);
    }
    bottom.appendChild(stats);

    const controls=document.createElement('div');controls.className='driveConsoleControls';
    const buttons=[startBottom||startBtn,workBottom||workBtn,driveLocateBtn,fitBottom||fitPathBtn,sessionsBottom||document.getElementById('sessionsBtn'),finishSessionBtn].filter(Boolean);
    for(const btn of buttons)controls.appendChild(btn);
    bottom.appendChild(controls);

    for(const id of ['sessionsBtn','driveSettingsBtn']){const el=document.getElementById(id);if(el)el.style.display='none'}
    const exportBtn=document.getElementById('exportGpxBtn');if(exportBtn)exportBtn.style.display='none';
    return true;
  }
  window.installTractorDriveConsole=installTractorDriveConsole;
})();
