(()=>{
  function installTractorPlanUI(){
    if(window.__TRACTOR_PLAN_UI_INSTALLED)return true;
    window.__TRACTOR_PLAN_UI_INSTALLED=true;

    const wrap=document.querySelector('.wrap');
    const oldTop=document.querySelector('.top');
    if(wrap&&oldTop){
      const header=document.createElement('div');
      header.className='planFullHeader planOnly';
      const titleBlock=oldTop.firstElementChild;
      const actions=oldTop.lastElementChild;
      if(titleBlock)header.appendChild(titleBlock);
      if(actions)header.appendChild(actions);
      wrap.parentNode.insertBefore(header,wrap);
      oldTop.remove();
    }

    const style=document.createElement('style');
    style.textContent=`
      .planFullHeader{width:100%;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:25}
      .planFullHeader h1{font-size:1.22rem;margin:0}
      .planFullHeader>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      @media(max-width:620px){.planFullHeader{align-items:flex-start;flex-direction:column}.planFullHeader>div:last-child{width:100%;display:grid;grid-template-columns:repeat(3,1fr)}}
    `;
    document.head.appendChild(style);

    const dlg=document.getElementById('settingsDlg');
    if(dlg){
      const notes=[...dlg.querySelectorAll('.info,.small')];
      const devPattern=/(indexeddb|database namespace|migration|cache|local file|filename\/path|schema|developer|implementation|browser storage bucket|standalone engine|version change|old app copy)/i;
      for(const el of notes){
        if(devPattern.test(el.textContent||''))el.remove();
      }
    }

    return true;
  }
  window.installTractorPlanUI=installTractorPlanUI;
})();
