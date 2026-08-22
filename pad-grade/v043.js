/* Pad Grade v0.4.4 — measured grid text with conservative 70% font safety factor. */
(function installPadGradeV044Grid(){
  'use strict';

  const $=id=>document.getElementById(id);
  const PREF_KEY='padGradeAppPrefsV1';
  const FIT_GAP=2;
  const SCROLL_GAP=4;
  const FONT_SAFETY=0.70;

  function prefs(){
    try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2};}
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

  function renderGridV044(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';
    $('v040GridMode')?.remove();

    const minFont=Math.max(2,Math.min(20,+prefs().minGridFont||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const shellStyle=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(shellStyle.paddingLeft)-px(shellStyle.paddingRight));
    const chrome=measureCellChrome(g);
    const needEm=requiredWidthPerPx(textSamples(s));
    const fitCellW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitCellH=fitCellW/ratio;
    const rawFitFont=Math.min(20,(fitCellW-chrome.x)/needEm,(fitCellH-chrome.y)/5.25);
    const safeFitFont=rawFitFont*FONT_SAFETY;
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
      const requiredW=(needEm*font/FONT_SAFETY)+chrome.x;
      const requiredH=(5.25*font/FONT_SAFETY)+chrome.y;
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

  window.renderGrid=renderGridV044;
  renderGridV044();
  document.title='Pad Grade Mapper v0.4.4';

  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg044Resize);
    window.__pg044Resize=setTimeout(renderGridV044,120);
  });
})();
