/* Pad Grade v0.4.2 — nine-character grid width, even five-row spacing, explicit backup restore. */
(function installPadGradeV042(){
  'use strict';

  const $=id=>document.getElementById(id);
  const PREF_KEY='padGradeAppPrefsV1';

  function prefs(){
    try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2};}
  }

  function renderGridV042(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';

    const minFont=Math.max(2,Math.min(20,+prefs().minGridFont||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const available=Math.max(220,shell.clientWidth-16);
    const fitW=available/s.cols,fitH=fitW/ratio;

    // A cell must support five populated rows and at least nine typical characters
    // across at the selected font size. 0.62em/character is deliberately a little
    // conservative for the app's system sans-serif font.
    const widthFont=fitW/(9*.62);
    const heightFont=fitH/5.8;
    const fitFont=Math.min(20,widthFont,heightFont);
    const fit=fitFont>=minFont;

    let cellW,cellH,font;
    if(fit){
      cellW=fitW;cellH=fitH;font=Math.max(minFont,fitFont);
      shell.classList.add('fit');
      g.className='v040-fit v041-uniform v042-uniform';
      g.style.width='100%';
      g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
    }else{
      font=minFont;
      const minTextW=9*.62*font;
      const minTextH=5.8*font;
      cellH=Math.max(minTextH,minTextW/ratio);
      cellW=cellH*ratio;
      if(cellW<minTextW){cellW=minTextW;cellH=cellW/ratio;}
      shell.classList.remove('fit');
      g.className='v040-scroll v041-uniform v042-uniform';
      g.style.width='max-content';
      g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(1)}px)`;
      g.style.gridAutoRows=`${cellH.toFixed(1)}px`;
    }

    g.style.setProperty('--grid-font',`${font.toFixed(1)}px`);
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);
      d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      d.onclick=()=>openPoint(rr,c);g.appendChild(d);
    }

    updateStats();
    let mode=$('v040GridMode');
    if(!mode){
      mode=document.createElement('span');mode.id='v040GridMode';mode.className='v040-gridMode';
      g.closest('.card')?.querySelector('.legend')?.appendChild(mode);
    }
    if(mode)mode.textContent=fit?`Fit view • ${font.toFixed(1)} px • 9-char min`:`Scroll view • ${font.toFixed(0)} px min • 9-char min`;
  }

  function installRestoreButton(){
    const dlg=$('projectsDlg'),toolbar=dlg?.querySelector('.v040-projectToolbar');
    if(!toolbar||$('v042RestoreBackup'))return;
    const btn=document.createElement('button');
    btn.id='v042RestoreBackup';btn.textContent='Restore Backup';
    btn.onclick=()=>{
      const input=$('importProjectFile');
      if(!input)return;
      input.accept='.json,.padgrade,application/json,application/octet-stream';
      input.click();
    };
    toolbar.appendChild(btn);
  }

  function collapseArchivedByDefault(){
    const details=$('v041ArchivedDetails');
    if(details)details.open=false;
  }

  function hookProjectDialog(){
    const btn=$('v040ProjectsBtn');
    if(btn&&!btn.dataset.v042){
      btn.dataset.v042='1';
      btn.addEventListener('click',()=>setTimeout(()=>{
        installRestoreButton();
        collapseArchivedByDefault();
      },0));
    }
    installRestoreButton();
    collapseArchivedByDefault();
  }

  window.renderGrid=renderGridV042;
  renderGridV042();
  hookProjectDialog();
  document.title='Pad Grade Mapper v0.4.2';

  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg042Resize);
    window.__pg042Resize=setTimeout(renderGridV042,120);
  });
})();
