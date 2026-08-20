(()=>{
  function installTractorDriveConsole(){
    if(window.__TRACTOR_DRIVE_CONSOLE_INSTALLED)return true;
    window.__TRACTOR_DRIVE_CONSOLE_INSTALLED=true;

    const bottom=document.querySelector('.bottom.driveOnly');
    if(!bottom)return false;

    const style=document.createElement('style');
    style.textContent=`
      body.driveMode .top{display:none!important}
      body.driveMode .privacyCard{display:none!important}
      body.driveMode .mapTools.driveOnly{display:none!important}
      body.driveMode .driveConsoleSource{display:none!important}
      body.driveMode .wrap{padding-bottom:220px!important}
      .driveConsole{display:block!important;padding:7px 8px calc(7px + env(safe-area-inset-bottom));max-height:46vh;overflow:auto}
      .driveConsoleTop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .driveConsolePath{min-width:0}
      .driveConsolePath .drivePathName{font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .driveConsoleState{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      .driveConsoleStats{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:6px}
      .driveConsoleStats .metric{padding:5px 3px;min-width:0}
      .driveConsoleStats .metric b{font-size:.86rem}
      .driveConsoleStats .metric span{font-size:.53rem;white-space:nowrap}
      .driveConsoleControls{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
      .driveConsoleControls button{min-width:0!important;padding:9px 5px;font-size:.72rem}
      .driveConsoleMeta{font-size:.60rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:760px){
        body.driveMode .wrap{padding-bottom:270px!important}
        .driveConsoleStats{grid-template-columns:repeat(4,1fr)}
        .driveConsoleControls{grid-template-columns:repeat(3,1fr)}
      }
      @media(max-width:420px){
        .driveConsoleTop{align-items:flex-start}
        .driveConsoleStats{grid-template-columns:repeat(4,1fr)}
        .driveConsoleStats .metric:nth-child(n+5){display:none}
        .driveConsoleControls{grid-template-columns:repeat(3,1fr)}
      }
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
    top.appendChild(state);
    bottom.appendChild(top);

    const stats=document.createElement('div');stats.className='driveConsoleStats';
    for(const id of ['progressPct','speed','distance','avgSpeed','driveElapsed','remainingMiles','accuracy','acres']){
      const el=document.getElementById(id);
      const metric=el?.closest('.metric');
      if(metric)stats.appendChild(metric);
    }
    bottom.appendChild(stats);

    const controls=document.createElement('div');controls.className='driveConsoleControls';
    const buttons=[
      document.getElementById('startBottom')||document.getElementById('startBtn'),
      document.getElementById('workBottom')||document.getElementById('workBtn'),
      document.getElementById('driveLocateBtn'),
      document.getElementById('fitBottom')||document.getElementById('fitPathBtn'),
      document.getElementById('sessionsBottom')||document.getElementById('sessionsBtn'),
      document.getElementById('finishSessionBtn')
    ].filter(Boolean);
    for(const btn of buttons)controls.appendChild(btn);
    bottom.appendChild(controls);

    const statusCard=document.getElementById('gpsStatus')?.closest('.card.driveOnly');
    if(statusCard)statusCard.classList.add('driveConsoleSource');
    const dashCard=document.getElementById('progressPct')?.closest('.card.driveOnly');
    if(dashCard)dashCard.classList.add('driveConsoleSource');
    const mapTools=document.querySelector('.mapTools.driveOnly');
    if(mapTools)mapTools.classList.add('driveConsoleSource');

    // Hide duplicate top DRIVE actions. Their bottom equivalents are now the console controls.
    for(const id of ['sessionsBtn','driveSettingsBtn']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }

    // Export GPX remains available through Drive Sessions / completed-session workflow,
    // rather than occupying the live-driving control strip.
    const exportBtn=document.getElementById('exportGpxBtn');if(exportBtn)exportBtn.style.display='none';

    return true;
  }

  window.installTractorDriveConsole=installTractorDriveConsole;
})();
