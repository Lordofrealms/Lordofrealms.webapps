/* Pad Grade v0.5.4 — single-owner grid renderer.
 *
 * This file is the only production module allowed to own grid drawing or grid
 * resize behavior. Legacy version layers may still provide project migration,
 * archive/backup UI, and switching logic, but their old grid renderers are
 * disabled whenever __padGradeGridOwned is true.
 */
(function installPadGradeGridCore(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const FIT_GAP=2;
  const SCROLL_GAP=4;
  const $=id=>document.getElementById(id);

  window.__padGradeGridOwned=true;

  function prefs(){
    try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2};}
  }

  function px(value){
    const n=parseFloat(value);
    return Number.isFinite(n)?n:0;
  }

  function measureNeed(samples){
    const ruler=document.createElement('span');
    const family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    Object.assign(ruler.style,{
      position:'fixed',left:'-10000px',top:'-10000px',visibility:'hidden',
      whiteSpace:'nowrap',fontSize:'100px',lineHeight:'1',fontFamily:family,
      letterSpacing:'normal',pointerEvents:'none'
    });
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

  function textSamples(s){
    const out=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];
    for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
      const value=readings[k(r,c)];
      const [main,sub]=textFor(value);
      const rc=refCoords(r,c);
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

  function cellChrome(grid){
    const probe=document.createElement('div');
    probe.className='cell';
    Object.assign(probe.style,{position:'absolute',visibility:'hidden',pointerEvents:'none'});
    grid.appendChild(probe);
    const cs=getComputedStyle(probe);
    const out={
      x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),
      y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)
    };
    probe.remove();
    return out;
  }

  function renderGridV054(reason='explicit'){
    const s=cfg();
    const grid=$('grid');
    const shell=grid?.parentElement;
    if(!grid||!shell)return;

    const minFont=Math.max(2,Math.min(20,Number(prefs().minGridFont)||2));
    const dx=s.width/(s.cols-1);
    const dy=s.length/(s.rows-1);
    const ratio=Math.max(.05,dx/dy);
    const shellStyle=getComputedStyle(shell);
    const available=Math.max(1,shell.clientWidth-px(shellStyle.paddingLeft)-px(shellStyle.paddingRight));
    const fitW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitH=fitW/ratio;

    // Measure with the exact styles the real cells will use. The grid is not
    // cleared until all sizing math is complete, so a render never exposes an
    // intermediate tiny-font state.
    const oldClass=grid.className;
    grid.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const chrome=cellChrome(grid);
    const need=measureNeed(textSamples(s));
    grid.className=oldClass;

    const calculated=Math.min(
      20,
      Math.max(0,(fitW-chrome.x)/need),
      Math.max(0,(fitH-chrome.y)/5.15)
    );
    const fit=Number.isFinite(calculated)&&calculated>=minFont;

    let font,cellW,cellH,className,width,columns,rows,gap;
    if(fit){
      font=calculated;
      cellW=fitW;
      cellH=fitH;
      className='v040-fit v041-uniform v042-uniform v043-uniform';
      width='100%';
      columns=`repeat(${s.cols},minmax(0,1fr))`;
      rows=`${cellH.toFixed(2)}px`;
      gap=FIT_GAP;
    }else{
      font=minFont;
      const requiredW=need*minFont+chrome.x;
      const requiredH=5.15*minFont+chrome.y;
      cellH=Math.max(requiredH,requiredW/ratio);
      cellW=cellH*ratio;
      className='v040-scroll v041-uniform v042-uniform v043-uniform';
      width='max-content';
      columns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;
      rows=`${cellH.toFixed(2)}px`;
      gap=SCROLL_GAP;
    }

    const fragment=document.createDocumentFragment();
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const value=readings[k(rr,c)];
      const [main,sub]=textFor(value);
      const rc=refCoords(rr,c);
      const cell=document.createElement('div');
      cell.className='cell '+classFor(value);
      cell.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      cell.onclick=()=>openPoint(rr,c);
      fragment.appendChild(cell);
    }

    // Commit the completed layout in one pass.
    grid.replaceChildren(fragment);
    grid.className=className;
    grid.style.width=width;
    grid.style.gridTemplateColumns=columns;
    grid.style.gridAutoRows=rows;
    grid.style.columnGap=`${gap}px`;
    grid.style.rowGap=`${gap}px`;
    grid.style.setProperty('--grid-font',`${font.toFixed(3)}px`,'important');
    shell.classList.toggle('fit',fit);
    shell.style.visibility='';
    shell.removeAttribute('data-grid-booting');

    $('v040GridMode')?.remove();
    updateStats();

    const stats=window.__padGradeGridStats||(window.__padGradeGridStats={renders:0,lastReason:'',lastFont:0,lastWidth:0});
    stats.renders++;
    stats.lastReason=reason;
    stats.lastFont=font;
    stats.lastWidth=available;
  }

  window.renderGrid=function(){renderGridV054('explicit');};
  window.__padGradeRenderGrid=renderGridV054;

  // Only the shell WIDTH determines cell width/font size. Do not observe height:
  // grid rendering changes its own height and observing that creates feedback
  // loops. A width change is debounced into exactly one redraw.
  const shell=$('grid')?.parentElement;
  if(shell&&typeof ResizeObserver==='function'){
    let lastWidth=Math.round(shell.getBoundingClientRect().width*10)/10;
    let timer=null;
    const observer=new ResizeObserver(entries=>{
      const rect=entries[0]?.contentRect;
      if(!rect)return;
      const width=Math.round(rect.width*10)/10;
      if(Math.abs(width-lastWidth)<0.5)return;
      lastWidth=width;
      clearTimeout(timer);
      timer=setTimeout(()=>renderGridV054('width-change'),80);
    });
    observer.observe(shell);
    window.__padGradeGridResizeObserver=observer;
  }
})();
