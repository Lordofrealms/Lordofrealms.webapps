/* Pad Grade v0.4.5 — measured grid text with user-configurable fit safety factor. */
(function installPadGradeV045Grid(){
  'use strict';

  const $=id=>document.getElementById(id);
  const PREF_KEY='padGradeAppPrefsV1';
  const FIT_GAP=2;
  const SCROLL_GAP=4;
  const DEFAULT_FIT_SCALE=0.40;

  function prefs(){
    try{return {minGridFont:2,gridFitScale:DEFAULT_FIT_SCALE,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2,gridFitScale:DEFAULT_FIT_SCALE};}
  }
  function savePrefs(next){
    localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));
  }
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}

  function measureCellChrome(g){
    const oldClass=g.className;
    g.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const probe=document.createElement('div');
    probe.className='cell';
    probe.style.position='absolute';probe.style.visibility='hidden';probe.style.pointerEvents='none';
    g.appendChild(probe);
    const cs=getComputedStyle(probe);
    const out={
      x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),
      y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)
    };
    probe.remove();g.className=oldClass;return out;
  }

  function textSamples(s){
    const samples=[{text:'FILL 9.9″',weight:400},{text:'FILL 99.9″',weight:400},{text:'CUT 99.9″',weight:400}];
    for(let rr=0;rr<s.rows;rr++)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),rc=refCoords(rr,c);
      samples.push(
        {text:label(rr,c),weight:900},
        {text:`${rc.x.toFixed(1)}′ ${rc.xDir}`,weight:400},
        {text:`${rc.y.toFixed(1)}′ ${rc.yDir}`,weight:400},
        {text:main||'—',weight:800},
        {text:sub||'—',weight:400}
      );
    }
    return samples;
  }

  function requiredWidthPerPx(samples){
    const ruler=document.createElement('span');
    const family=getComputedStyle(document.body).fontFamily||'system-ui, sans-serif';
    ruler.style.position='fixed';ruler.style.left='-10000px';ruler.style.top='-10000px';
    ruler.style.visibility='hidden';ruler.style.whiteSpace='nowrap';ruler.style.fontSize='100px';
    ruler.style.lineHeight='1';ruler.style.fontFamily=family;ruler.style.letterSpacing='normal';
    document.body.appendChild(ruler);
    let max=0;
    for(const sample of samples){
      ruler.style.fontWeight=String(sample.weight||400);ruler.textContent=sample.text||'—';
      max=Math.max(max,ruler.getBoundingClientRect().width/100);
    }
    ruler.remove();
    return Math.max(1,max*1.06);
  }

  function fitScale(){
    const n=Number(prefs().gridFitScale);
    return Number.isFinite(n)?Math.max(.10,Math.min(1,n)):DEFAULT_FIT_SCALE;
  }

  function renderGridV045(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';
    $('v040GridMode')?.remove();

    const minFont=Math.max(2,Math.min(20,+prefs().minGridFont||2));
    const scale=fitScale();
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const shellStyle=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(shellStyle.paddingLeft)-px(shellStyle.paddingRight));
    const chrome=measureCellChrome(g);
    const needEm=requiredWidthPerPx(textSamples(s));
    const fitCellW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitCellH=fitCellW/ratio;
    const rawFitFont=Math.min(20,(fitCellW-chrome.x)/needEm,(fitCellH-chrome.y)/5.25);
    const safeFitFont=rawFitFont*scale;
    const fit=Number.isFinite(safeFitFont)&&safeFitFont>=minFont;

    let cellW,cellH,font;
    if(fit){
      cellW=fitCellW;cellH=fitCellH;font=Math.max(minFont,safeFitFont);
      shell.classList.add('fit');
      g.className='v040-fit v041-uniform v042-uniform v043-uniform';
      g.style.width='100%';
      g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${FIT_GAP}px`;
    }else{
      font=minFont;
      const requiredW=(needEm*font/scale)+chrome.x;
      const requiredH=(5.25*font/scale)+chrome.y;
      cellH=Math.max(requiredH,requiredW/ratio);
      cellW=cellH*ratio;
      shell.classList.remove('fit');
      g.className='v040-scroll v041-uniform v042-uniform v043-uniform';
      g.style.width='max-content';
      g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${SCROLL_GAP}px`;
    }

    g.style.setProperty('--grid-font',`${font.toFixed(2)}px`);
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);
      d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      d.onclick=()=>openPoint(rr,c);g.appendChild(d);
    }
    updateStats();
  }

  function installFitScaleSlider(){
    const modal=$('settingsDlg')?.querySelector('.modal');
    if(!modal||$('v045GridFitScale'))return;
    const row=document.createElement('div');
    row.className='v040-rangeRow';
    row.innerHTML=`<div class="v040-rangeHeader"><b>Grid text fit scale</b><span id="v045GridFitScaleValue">40%</span></div><input id="v045GridFitScale" type="range" min="10" max="100" step="5" value="40"><div class="v040-rangeEnds"><span>10% • smaller</span><span>100% • calculated max</span></div>`;
    modal.insertBefore(row,modal.querySelector('.modalActions'));
    const pct=Math.round(fitScale()*100);
    $('v045GridFitScale').value=pct;
    $('v045GridFitScaleValue').textContent=`${pct}%`;
    $('v045GridFitScale').addEventListener('input',()=>{
      const v=Math.max(10,Math.min(100,+$('v045GridFitScale').value||40));
      $('v045GridFitScaleValue').textContent=`${v}%`;
      savePrefs({gridFitScale:v/100});
      renderGridV045();
    });
  }

  window.renderGrid=renderGridV045;
  installFitScaleSlider();
  renderGridV045();
  document.title='Pad Grade Mapper v0.4.5';

  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg045Resize);
    window.__pg045Resize=setTimeout(renderGridV045,120);
  });
})();
