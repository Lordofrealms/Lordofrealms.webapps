/* Pad Grade v0.4.9 — 1–20 px grid minimum and scaler test baseline. */
(function installPadGradeV049(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';
  const MIGRATION_KEY='padGradeV049GridMinDefaultApplied';
  const FIT_GAP=2,SCROLL_GAP=4;
  const $=id=>document.getElementById(id);

  function readPrefs(){
    try{return {minGridFont:1,gridFitScale:.40,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:1,gridFitScale:.40};}
  }
  function writePrefs(next){
    localStorage.setItem(PREF_KEY,JSON.stringify({...readPrefs(),...next}));
  }
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}

  // For this test release, intentionally reset the existing install once so the
  // user actually starts at the new 1 px default instead of inheriting the old
  // 2 px default that previous releases wrote into preferences.
  if(!localStorage.getItem(MIGRATION_KEY)){
    writePrefs({minGridFont:1});
    localStorage.setItem(MIGRATION_KEY,'1');
  }

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

  function chrome(g){
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

  function renderGridV049(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;
    if(!g||!shell)return;
    g.innerHTML='';
    $('v040GridMode')?.remove();

    const p=readPrefs();
    const minFont=Math.max(1,Math.min(20,Number(p.minGridFont)||1));
    const scale=Math.max(.10,Math.min(1,Number(p.gridFitScale)||.40));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const ss=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));
    const fitW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitH=fitW/ratio;

    g.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const ch=chrome(g),need=measureNeed(samples(s));
    const calculated=Math.min(20,Math.max(0,(fitW-ch.x)/need),Math.max(0,(fitH-ch.y)/5.15));

    // Minimum font controls fit-vs-scroll. Scale changes rendered text only.
    const fit=Number.isFinite(calculated)&&calculated>=minFont;
    let baseFont,cellW,cellH;
    if(fit){
      baseFont=calculated;cellW=fitW;cellH=fitH;
      shell.classList.add('fit');
      g.className='v040-fit v041-uniform v042-uniform v043-uniform';
      g.style.width='100%';
      g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${FIT_GAP}px`;
    }else{
      baseFont=minFont;
      const requiredW=need*minFont+ch.x,requiredH=5.15*minFont+ch.y;
      cellH=Math.max(requiredH,requiredW/ratio);cellW=cellH*ratio;
      shell.classList.remove('fit');
      g.className='v040-scroll v041-uniform v042-uniform v043-uniform';
      g.style.width='max-content';
      g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;
      g.style.gridAutoRows=`${cellH.toFixed(2)}px`;
      g.style.columnGap=`${SCROLL_GAP}px`;
    }

    const finalFont=Math.max(.25,baseFont*scale);
    g.style.setProperty('--grid-font',`${finalFont.toFixed(2)}px`);

    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);
      d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      d.onclick=()=>openPoint(rr,c);
      g.appendChild(d);
    }
    updateStats();

    const scaleLabel=$('v045GridFitScaleValue');
    if(scaleLabel)scaleLabel.textContent=`${Math.round(scale*100)}% • ${finalFont.toFixed(1)} px`;
  }

  function installMinimumSlider(){
    const old=$('v040MinGridFont');
    if(!old)return;
    const slider=old.cloneNode(true);
    slider.min='1';slider.max='20';slider.step='1';
    old.replaceWith(slider);
    const row=slider.closest('.v040-rangeRow');
    const ends=row?.querySelector('.v040-rangeEnds');
    if(ends)ends.innerHTML='<span>1 px • fit more</span><span>20 px • larger text</span>';
    const current=Math.max(1,Math.min(20,Number(readPrefs().minGridFont)||1));
    slider.value=String(current);
    const label=$('v040MinGridFontValue');
    if(label)label.textContent=`${current} px`;
    slider.addEventListener('input',()=>{
      const v=Math.max(1,Math.min(20,Number(slider.value)||1));
      writePrefs({minGridFont:v});
      if(label)label.textContent=`${v} px`;
      renderGridV049();
    });
  }

  function installScaleSlider(){
    const slider=$('v045GridFitScale');
    if(!slider)return;
    // v0.4.8 already removed the obsolete v0.4.5 listener. Point the surviving
    // control at this renderer so the readout and 1 px floor are tested together.
    slider.oninput=()=>{
      const percent=Math.max(10,Math.min(100,Number(slider.value)||40));
      writePrefs({gridFitScale:percent/100});
      renderGridV049();
    };
    slider.onchange=slider.oninput;
  }

  window.renderGrid=renderGridV049;
  installMinimumSlider();
  installScaleSlider();
  renderGridV049();
  document.title='Pad Grade Mapper v0.4.9';
  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg049Resize);
    window.__pg049Resize=setTimeout(renderGridV049,120);
  });
})();
