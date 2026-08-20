(()=>{
  function installTractorResumeDrive(){
    if(window.__TRACTOR_RESUME_DRIVE_INSTALLED)return true;
    if(typeof getSessions!=='function'||typeof openSessions!=='function')return false;
    window.__TRACTOR_RESUME_DRIVE_INSTALLED=true;

    const host=document.querySelector('.planShellHeader .planShellActions')||document.querySelector('.planShellHeader')||document.querySelector('.top');
    if(!host)return false;
    const btn=document.createElement('button');
    btn.id='resumeDriveBtn';btn.type='button';btn.className='planOnly';btn.textContent='Resume Drive';btn.style.display='none';
    host.appendChild(btn);

    const style=document.createElement('style');style.textContent=`#resumeDriveBtn.resumeAvailable{display:inline-flex!important;border-color:#69c8ff;background:#102b3a;color:#c9efff}`;document.head.appendChild(style);

    async function refresh(){
      try{
        const ss=await getSessions();
        const active=ss.filter(s=>s?.status==='in-progress').sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
        if(active.length){
          btn.classList.add('resumeAvailable');
          btn.textContent=active.length===1?'Resume Drive':`Resume Drives (${active.length})`;
          btn.title='Open saved in-progress drive sessions';
        }else{
          btn.classList.remove('resumeAvailable');btn.style.display='none';btn.textContent='Resume Drive';
        }
      }catch(e){console.warn('Resume Drive availability check failed',e)}
    }
    btn.onclick=async()=>{await openSessions()};
    refresh();
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    window.refreshTractorResumeDrive=refresh;
    return true;
  }
  window.installTractorResumeDrive=installTractorResumeDrive;
})();
