/* Pad Grade v0.5.1 — automatic grid font sizing with minimum-size control only. */
(function installPadGradeV051(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const FIT_GAP=2,SCROLL_GAP=4;
  const $=id=>document.getElementById(id);

  function prefs(){
    try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2};}
  }
  function savePrefs(next){localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));}
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}

  function measureNeed(samples){
    const ruler=document.createElement('span');
    const family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    Object.assign(ruler.style,{position:'fixed',left:'-10000px',top:'-10000px',visibility:'hidden',whiteSpace:'nowrap',fontSize:'100px',lineHeight:'1',fontFamily:family,letterSpacing:'normal'});
    document.body.appendChild(ruler);
    let max=0;
    for(const sample of samples){
      ruler.style.fontWeight=String(sample.weight||400);
      ruler.textContent=sample.text||'—';
      max=Math.max(max,ruler.getBoundingClientRect().width/100);
    }
    ruler.remove();
    return Math.max(1,max*1.04);
  }

  function samples(s){
    const out=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];
    for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
      const v=readings[k(r,c)],[main,sub]=textFor(v),rc=refCoords(r,c);
      out.push(
        {text:label(r,c),weight:900},
        {text:`${rc.x.toFixed(1)}′ ${rc.xDir}`},
        {text:`${rc.y.toFixed(1)}′ ${rc.yDir}`},
        {text:main||'—',weight:800},
        {text:sub||'—'}
      );
    }
    return out;
  }

  function cellChrome(g){
    const d=document.createElement('div');
    d.className='cell';
    Object.assign(d.style,{position:'absolute',visibility:'hidden'});
    g.appendChild(d);
    const cs=getComputedStyle(d);
    const out={
      x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),
      y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)
    };
    d.remove();
    return out;
  }

  function renderGridV051(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;
    if(!g||!shell)return;
    g.innerHTML='';
    $('v040GridMode')?.remove();

    const minFont=Math.max(2,Math.min(20,Number(prefs().minGridFont)||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const ss=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));
    const fitW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitH=fitW/ratio;

    g.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const ch=cellChrome(g),need=measureNeed(samples(s));
    const calculated=Math.min(20,Math.max(0,(fitW-ch.x)/need),Math.max(0,(fitH-ch.y)/5.15));
    const fit=Number.isFinite(calculated)&&calculated>=minFont;

    let font,cellW,cellH;
    if(fit){
      font=calculated;cellW=fitW;cellH=fitH;
      shell.classList.add('fit');
      g.className='v040-fit v041-uniform v042-uniform v043-uniform';
      g.style.width='100%';
      g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${FIT_GAP}px`;
    }else{
      font=minFont;
      const requiredW=need*minFont+ch.x,requiredH=5.15*minFont+ch.y;
      cellH=Math.max(requiredH,requiredW/ratio);cellW=cellH*ratio;
      shell.classList.remove('fit');
      g.className='v040-scroll v041-uniform v042-uniform v043-uniform';
      g.style.width='max-content';
      g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${SCROLL_GAP}px`;
    }

    // One final font size: the largest calculated value that fits the grid,
    // or the user-selected minimum when the grid must scroll.
    g.style.setProperty('--grid-font',`${font.toFixed(3)}px`,'important');

    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);
      d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      d.onclick=()=>openPoint(rr,c);
      g.appendChild(d);
    }
    updateStats();
  }

  function removeScaleControl(){
    const scale=$('v045GridFitScale');
    const row=scale?.closest('.v040-rangeRow');
    if(row)row.remove();
    else scale?.remove();
    $('v050GridFontDiag')?.remove();
  }

  function installMinimumControl(){
    const old=$('v040MinGridFont');
    if(!old)return;

    // Replace the node to discard listeners from v0.4.x/v0.5.0 renderers.
    const slider=old.cloneNode(true);
    slider.min='2';slider.max='20';slider.step='1';
    old.replaceWith(slider);

    const current=Math.max(2,Math.min(20,Number(prefs().minGridFont)||2));
    slider.value=String(current);
    const label=$('v040MinGridFontValue');
    if(label)label.textContent=`${current} px`;
    const ends=slider.closest('.v040-rangeRow')?.querySelector('.v040-rangeEnds');
    if(ends)ends.innerHTML='<span>2 px • fit more</span><span>20 px • larger text</span>';

    slider.addEventListener('input',()=>{
      const value=Math.max(2,Math.min(20,Number(slider.value)||2));
      savePrefs({minGridFont:value});
      if(label)label.textContent=`${value} px`;
      renderGridV051();
    });
  }

  removeScaleControl();
  installMinimumControl();
  window.renderGrid=renderGridV051;
  renderGridV051();
  document.title='Pad Grade Mapper v0.5.1';

  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg051Resize);
    window.__pg051Resize=setTimeout(renderGridV051,120);
  });
})();
