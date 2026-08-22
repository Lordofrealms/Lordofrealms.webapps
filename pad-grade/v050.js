/* Pad Grade v0.5.0 — authoritative grid font sizing + render diagnostics. */
(function installPadGradeV050(){
  'use strict';
  const PREF_KEY='padGradeAppPrefsV1';
  const MIGRATION_KEY='padGradeV050GridMinReset';
  const FIT_GAP=2,SCROLL_GAP=4;
  const $=id=>document.getElementById(id);

  function prefs(){
    try{return {minGridFont:2,gridFitScale:.40,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2,gridFitScale:.40};}
  }
  function savePrefs(next){localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));}
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}

  // v0.4.9 intentionally forced the stored minimum to 1 px for diagnosis.
  // v0.5.0 restores the supported/native floor to 2 px once.
  if(!localStorage.getItem(MIGRATION_KEY)){
    savePrefs({minGridFont:2});
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

  function cellChrome(g){
    const d=document.createElement('div');
    d.className='cell';
    Object.assign(d.style,{position:'absolute',visibility:'hidden'});
    g.appendChild(d);
    const cs=getComputedStyle(d);
    const out={x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)};
    d.remove();
    return out;
  }

  function setDiagnostic(base,requested){
    requestAnimationFrame(()=>{
      const probe=$('grid')?.querySelector('.cell .coord');
      const actual=probe?parseFloat(getComputedStyle(probe).fontSize):NaN;
      const diag=$('v050GridFontDiag');
      if(diag)diag.textContent=`Calculated ${base.toFixed(2)} px → requested ${requested.toFixed(2)} px → rendered ${Number.isFinite(actual)?actual.toFixed(2):'—'} px`;
      const scaleLabel=$('v045GridFitScaleValue');
      if(scaleLabel)scaleLabel.textContent=`${Math.round(Math.max(.10,Math.min(1,Number(prefs().gridFitScale)||.40))*100)}% • ${requested.toFixed(2)} px`;
    });
  }

  function renderGridV050(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;
    if(!g||!shell)return;
    g.innerHTML='';
    $('v040GridMode')?.remove();

    const p=prefs();
    const minFont=Math.max(2,Math.min(20,Number(p.minGridFont)||2));
    const scale=Math.max(.10,Math.min(1,Number(p.gridFitScale)||.40));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const ss=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));
    const fitW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitH=fitW/ratio;

    // Grid geometry is decided first and is not altered by the text multiplier.
    g.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const ch=cellChrome(g),need=measureNeed(samples(s));
    const calculated=Math.min(20,Math.max(0,(fitW-ch.x)/need),Math.max(0,(fitH-ch.y)/5.15));
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

    // This is the single final authority for grid font size.
    const requested=Math.max(2,baseFont*scale);
    g.style.setProperty('--grid-font',`${requested.toFixed(3)}px`,'important');

    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);
      d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      d.onclick=()=>openPoint(rr,c);
      g.appendChild(d);
    }
    updateStats();
    setDiagnostic(baseFont,requested);
  }

  function installControls(){
    const minOld=$('v040MinGridFont');
    if(minOld){
      const min=minOld.cloneNode(true);
      min.min='2';min.max='20';min.step='1';
      minOld.replaceWith(min);
      const row=min.closest('.v040-rangeRow');
      const ends=row?.querySelector('.v040-rangeEnds');
      if(ends)ends.innerHTML='<span>2 px • fit more</span><span>20 px • larger text</span>';
      const current=Math.max(2,Math.min(20,Number(prefs().minGridFont)||2));
      min.value=String(current);
      if($('v040MinGridFontValue'))$('v040MinGridFontValue').textContent=`${current} px`;
      min.addEventListener('input',()=>{
        const v=Math.max(2,Math.min(20,Number(min.value)||2));
        savePrefs({minGridFont:v});
        if($('v040MinGridFontValue'))$('v040MinGridFontValue').textContent=`${v} px`;
        renderGridV050();
      });
    }

    const scaleOld=$('v045GridFitScale');
    if(scaleOld){
      const scale=scaleOld.cloneNode(true);
      scaleOld.replaceWith(scale);
      const current=Math.round(Math.max(.10,Math.min(1,Number(prefs().gridFitScale)||.40))*100);
      scale.value=String(current);
      const apply=()=>{
        const pct=Math.max(10,Math.min(100,Number(scale.value)||40));
        savePrefs({gridFitScale:pct/100});
        renderGridV050();
      };
      scale.addEventListener('input',apply);
      scale.addEventListener('change',apply);
      const row=scale.closest('.v040-rangeRow');
      if(row&&!$('v050GridFontDiag')){
        const diag=document.createElement('div');
        diag.id='v050GridFontDiag';
        diag.className='small';
        diag.style.marginTop='6px';
        diag.textContent='Grid font diagnostic…';
        row.appendChild(diag);
      }
    }
  }

  window.renderGrid=renderGridV050;
  installControls();
  renderGridV050();
  document.title='Pad Grade Mapper v0.5.0';
  window.addEventListener('resize',()=>{
    clearTimeout(window.__pg050Resize);
    window.__pg050Resize=setTimeout(renderGridV050,120);
  });
})();
