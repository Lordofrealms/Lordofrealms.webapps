(()=>{
  function installTractorSessionSwitcher(){
    if(window.__TRACTOR_SESSION_SWITCHER_INSTALLED)return true;
    if(typeof getSessions!=='function'||typeof loadSession!=='function')return false;
    window.__TRACTOR_SESSION_SWITCHER_INSTALLED=true;

    const dlg=document.createElement('dialog');
    dlg.id='driveSwitcherDlg';
    dlg.innerHTML=`<div class="modal"><div class="statusRow"><div><h2 style="margin:0">Drive Sessions</h2><div class="small">Switch between unfinished field jobs without losing progress.</div></div><button id="closeDriveSwitcher">Close</button></div><div id="driveSwitcherList" style="margin-top:10px"><div class="small">Loading…</div></div></div>`;
    document.body.appendChild(dlg);

    const style=document.createElement('style');
    style.textContent=`
      .driveSwitchItem{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
      .driveSwitchItem:first-child{border-top:0}.driveSwitchTitle{font-weight:800}.driveSwitchMeta{font-size:.68rem;color:var(--muted);line-height:1.35;margin-top:2px}.driveSwitchActions{display:flex;gap:5px;align-items:center}
      .driveSwitchCurrent{font-size:.62rem;padding:3px 6px;border:1px solid #69c8ff;border-radius:999px;color:#bfefff;background:#102b3a}
      #resumeDriveBtn.resumeAvailable{display:inline-flex!important;border-color:#69c8ff;background:#102b3a;color:#c9efff}
      @media(max-width:520px){.driveSwitchItem{grid-template-columns:1fr}.driveSwitchActions button{width:100%}}
    `;
    document.head.appendChild(style);

    const list=dlg.querySelector('#driveSwitcherList');
    dlg.querySelector('#closeDriveSwitcher').onclick=()=>dlg.close();

    function fmtDate(t){try{return new Date(t||Date.now()).toLocaleString()}catch(e){return''}}
    function sessionTitle(s){return s?.settings?.sessionName||s?.selectedPathingName||s?.settings?.operation||'Drive session'}
    function pct(s){
      try{
        const covered=Object.keys(s?.planProgress?.covered||{}).length;
        const total=Number(s?.planProgress?.sampleCount||0);
        if(total>0)return Math.min(100,Math.round(covered/total*100))+'%';
      }catch(e){}
      return null;
    }

    async function safeCheckpointBeforeSwitch(targetId){
      if(typeof sessionId!=='undefined'&&sessionId&&sessionId!==targetId){
        try{if(typeof saveMeta==='function')await saveMeta('switch session checkpoint')}catch(e){console.warn('Could not checkpoint current session before switch',e)}
      }
      try{
        if(typeof tracking!=='undefined'&&tracking&&typeof stopGPS==='function')await stopGPS();
      }catch(e){console.warn('Could not stop GPS before session switch',e)}
      try{if(window.__TRACTOR_WORK_ACTIVE)window.__TRACTOR_WORK_ACTIVE=false}catch(e){}
    }

    async function resume(id){
      const btn=list.querySelector(`button[data-resume="${CSS.escape(id)}"]`);if(btn){btn.disabled=true;btn.textContent='Loading…'}
      try{
        await safeCheckpointBeforeSwitch(id);
        await loadSession(id);
        // A resumed job is always implement-up until the operator deliberately starts work.
        try{window.__TRACTOR_WORK_ACTIVE=false}catch(e){}
        const workBtn=document.getElementById('workBtn')||document.getElementById('workBottom');
        if(workBtn){workBtn.textContent='Start Work';workBtn.classList.remove('warn');workBtn.classList.add('primary')}
        const driveBtn=document.getElementById('driveModeBtn');
        if(driveBtn&&!driveBtn.disabled&&typeof appMode!=='undefined'&&appMode!=='drive')driveBtn.click();
        dlg.close();
        try{if(typeof updateAll==='function')updateAll()}catch(e){}
      }catch(e){
        console.error('Resume drive failed',e);alert('Could not resume that drive session: '+(e?.message||e));
        if(btn){btn.disabled=false;btn.textContent='Resume'}
      }
    }

    async function render(){
      list.innerHTML='<div class="small">Loading sessions…</div>';
      try{
        const sessions=(await getSessions()).slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
        const unfinished=sessions.filter(s=>s?.status==='in-progress');
        if(!unfinished.length){list.innerHTML='<div class="small" style="padding:12px 0">No in-progress drive sessions.</div>';refreshHeaderButton(0);return}
        list.replaceChildren();
        for(const s of unfinished){
          const row=document.createElement('div');row.className='driveSwitchItem';
          const info=document.createElement('div');
          const title=document.createElement('div');title.className='driveSwitchTitle';title.textContent=sessionTitle(s);info.appendChild(title);
          const meta=document.createElement('div');meta.className='driveSwitchMeta';
          const bits=[s?.settings?.operation,s?.selectedPathingName,s?.propertyProfileName,fmtDate(s?.updatedAt)];const p=pct(s);if(p)bits.splice(2,0,p+' complete');
          meta.textContent=bits.filter(Boolean).join(' • ');info.appendChild(meta);row.appendChild(info);
          const actions=document.createElement('div');actions.className='driveSwitchActions';
          if(typeof sessionId!=='undefined'&&sessionId===s.id){const tag=document.createElement('span');tag.className='driveSwitchCurrent';tag.textContent='CURRENT';actions.appendChild(tag)}
          const b=document.createElement('button');b.className='primary';b.dataset.resume=s.id;b.textContent=(typeof sessionId!=='undefined'&&sessionId===s.id)?'Return to Drive':'Resume';b.onclick=()=>resume(s.id);actions.appendChild(b);row.appendChild(actions);list.appendChild(row);
        }
        refreshHeaderButton(unfinished.length);
      }catch(e){list.innerHTML=`<div class="small">Could not load drive sessions: ${String(e?.message||e)}</div>`}
    }

    function open(){render();dlg.showModal()}

    let headerBtn=document.getElementById('resumeDriveBtn');
    if(!headerBtn){
      const host=document.querySelector('.planShellHeader .planShellActions')||document.querySelector('.planShellHeader')||document.querySelector('.top');
      if(host){headerBtn=document.createElement('button');headerBtn.id='resumeDriveBtn';headerBtn.className='planOnly';headerBtn.textContent='Drive Sessions';host.appendChild(headerBtn)}
    }
    function refreshHeaderButton(count){if(!headerBtn)return;headerBtn.textContent=count?`Drive Sessions (${count})`:'Drive Sessions';headerBtn.classList.toggle('resumeAvailable',count>0);headerBtn.style.display=''}
    if(headerBtn)headerBtn.onclick=open;

    // Reuse the Drive console's existing Sessions button as the same switcher.
    for(const id of ['sessionsBottom','sessionsBtn']){const b=document.getElementById(id);if(b)b.onclick=open}

    window.openTractorDriveSwitcher=open;
    render();
    return true;
  }
  window.installTractorSessionSwitcher=installTractorSessionSwitcher;
})();
