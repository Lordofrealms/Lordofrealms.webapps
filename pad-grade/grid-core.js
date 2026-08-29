/* Pad Grade v0.9.4 DEV — immediate lower-grid paint + background sizing.
 *
 * The grid is visible immediately with a sane physical provisional layout. Text
 * measurement runs in grid-size-worker-v094.js while map/heatmap/GPS work can
 * proceed in parallel. When sizing completes, this owner changes layout/font CSS
 * once; it never rebuilds the cell contents a second time just to resize them.
 */
(function installPadGradeGridCore(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const WORKER_URL='grid-size-worker-v094.js?v=20260829-1';
  const FIT_GAP=2,SCROLL_GAP=4;
  const $=id=>document.getElementById(id);
  let worker=null;
  let generation=0;
  let activeJob=null;

  window.__padGradeGridOwned=true;

  function prefs(){try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}catch(e){return {minGridFont:2};}}
  function px(value){const n=parseFloat(value);return Number.isFinite(n)?n:0;}
  function projectId(){try{return localStorage.getItem('padGradeActiveProjectIdV5')||'';}catch(e){return '';}}

  function textSamples(s){
    const out=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];
    for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
      const value=readings[k(r,c)],[main,sub]=textFor(value),rc=refCoords(r,c);
      out.push({text:label(r,c),weight:900},{text:`${rc.x.toFixed(1)}′ ${rc.xDir}`},{text:`${rc.y.toFixed(1)}′ ${rc.yDir}`},{text:main||'—',weight:800},{text:sub||'—'});
    }
    return out;
  }

  function buildCells(s){
    const fragment=document.createDocumentFragment();
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const value=readings[k(rr,c)],[main,sub]=textFor(value),rc=refCoords(rr,c),cell=document.createElement('div');
      cell.className='cell '+classFor(value);
      cell.dataset.r=rr;cell.dataset.c=c;
      cell.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;
      cell.onclick=()=>openPoint(rr,c);
      fragment.appendChild(cell);
    }
    return fragment;
  }

  function geometryInputs(s,grid,shell){
    const minFont=Math.max(2,Math.min(20,Number(prefs().minGridFont)||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),physicalRatio=Math.max(.05,dx/dy);
    const ss=getComputedStyle(shell);
    const availableWidth=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));
    const fitCellW=Math.max(1,(availableWidth-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitCellH=fitCellW/physicalRatio;
    const first=grid.querySelector('.cell');
    let chrome={x:0,y:0};
    if(first){
      const cs=getComputedStyle(first);
      chrome={x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)};
    }
    const family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    return {minFont,physicalRatio,availableWidth,fitCellW,fitCellH,chrome,family};
  }

  function applyProvisional(s,grid,shell,geom){
    const font=Math.max(geom.minFont,Math.min(12,geom.fitCellW/7.5,geom.fitCellH/5.15));
    grid.className='v040-fit v041-uniform v042-uniform v043-uniform';
    grid.style.width='100%';
    grid.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;
    grid.style.gridAutoRows=`${geom.fitCellH.toFixed(2)}px`;
    grid.style.columnGap=`${FIT_GAP}px`;grid.style.rowGap=`${FIT_GAP}px`;
    grid.style.setProperty('--grid-font',`${Math.max(2,font).toFixed(3)}px`,'important');
    shell.classList.add('fit');
    shell.style.visibility='';shell.removeAttribute('data-grid-booting');
  }

  function solveFromNeed(job,needWidthPerPx){
    const {s,geom}=job;
    const widthFontLimit=Math.max(0,(geom.fitCellW-geom.chrome.x)/needWidthPerPx);
    const heightFontLimit=Math.max(0,(geom.fitCellH-geom.chrome.y)/5.15);
    const calculatedFont=Math.min(20,widthFontLimit,heightFontLimit);
    const fit=Number.isFinite(calculatedFont)&&calculatedFont>=geom.minFont;
    if(fit){
      return {font:calculatedFont,className:'v040-fit v041-uniform v042-uniform v043-uniform',width:'100%',columns:`repeat(${s.cols},minmax(0,1fr))`,rows:`${geom.fitCellH.toFixed(2)}px`,gap:FIT_GAP,fit,widthFontLimit,heightFontLimit};
    }
    const font=geom.minFont;
    const requiredW=needWidthPerPx*font+geom.chrome.x,requiredH=5.15*font+geom.chrome.y;
    const cellH=Math.max(requiredH,requiredW/geom.physicalRatio),cellW=cellH*geom.physicalRatio;
    return {font,className:'v040-scroll v041-uniform v042-uniform v043-uniform',width:'max-content',columns:`repeat(${s.cols},${cellW.toFixed(2)}px)`,rows:`${cellH.toFixed(2)}px`,gap:SCROLL_GAP,fit:false,widthFontLimit,heightFontLimit};
  }

  function applyFinal(job,needWidthPerPx,source){
    if(!activeJob||job.id!==activeJob.id||job.generation!==generation||job.projectId!==projectId())return;
    const grid=$('grid'),shell=grid?.parentElement;if(!grid||!shell)return;
    const solved=solveFromNeed(job,Math.max(1,Number(needWidthPerPx)||1));
    grid.className=solved.className;
    grid.style.width=solved.width;
    grid.style.gridTemplateColumns=solved.columns;
    grid.style.gridAutoRows=solved.rows;
    grid.style.columnGap=`${solved.gap}px`;grid.style.rowGap=`${solved.gap}px`;
    grid.style.setProperty('--grid-font',`${solved.font.toFixed(3)}px`,'important');
    shell.classList.toggle('fit',solved.fit);
    const stats=window.__padGradeGridStats||(window.__padGradeGridStats={renders:0,lastReason:'',lastFont:0,lastWidth:0,widthLimit:0,heightLimit:0,lastDurationMs:0});
    stats.lastFont=solved.font;stats.lastWidth=job.geom.availableWidth;stats.widthLimit=solved.widthFontLimit;stats.heightLimit=solved.heightFontLimit;stats.measureSource=source;stats.finalResizeAt=Date.now();
    activeJob=null;
  }

  function measureOnMain(samples,family){
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return 1;
    let max=0,lastWeight='';
    for(const sample of samples){const weight=String(sample.weight||400);if(weight!==lastWeight){ctx.font=`${weight} 100px ${family}`;lastWeight=weight;}max=Math.max(max,ctx.measureText(sample.text||'—').width/100);}
    return Math.max(1,max*1.04);
  }

  function ensureWorker(){
    if(worker||typeof Worker!=='function')return worker;
    try{
      worker=new Worker(WORKER_URL);
      worker.onmessage=event=>{
        const msg=event.data||{},job=activeJob;if(!job||msg.jobId!==job.id)return;
        if(msg.type==='complete'){applyFinal(job,msg.needWidthPerPx,'worker-offscreen-canvas');return;}
        if(msg.type==='unsupported')setTimeout(()=>{if(activeJob===job)applyFinal(job,measureOnMain(job.samples,job.geom.family),'main-thread-canvas-fallback');},0);
      };
      worker.onerror=()=>{try{worker?.terminate();}catch(e){}worker=null;const job=activeJob;if(job)setTimeout(()=>{if(activeJob===job)applyFinal(job,measureOnMain(job.samples,job.geom.family),'main-thread-canvas-fallback');},0);};
    }catch(e){worker=null;}
    return worker;
  }

  function startSizing(reason='explicit',rebuild=true){
    const grid=$('grid'),shell=grid?.parentElement;if(!grid||!shell)return;
    const s=cfg();generation++;
    const started=performance.now?.()||Date.now();
    if(rebuild){
      grid.replaceChildren(buildCells(s));
      $('v040GridMode')?.remove();
      try{updateStats();}catch(e){}
    }
    const geom=geometryInputs(s,grid,shell);
    if(rebuild)applyProvisional(s,grid,shell,geom);
    const samples=textSamples(s),sampleKey=JSON.stringify(samples);
    const job={id:`g${generation}-${Date.now()}`,generation,projectId:projectId(),reason,s:{width:s.width,length:s.length,cols:s.cols,rows:s.rows},geom,samples,sampleKey};
    activeJob=job;
    const stats=window.__padGradeGridStats||(window.__padGradeGridStats={renders:0,lastReason:'',lastFont:0,lastWidth:0,widthLimit:0,heightLimit:0,lastDurationMs:0});
    if(rebuild)stats.renders++;stats.lastReason=reason;stats.provisionalPaintAt=Date.now();stats.lastDurationMs=Math.max(0,(performance.now?.()||Date.now())-started);

    // Initial startup may already have completed this exact measurement in the
    // post-init bootstrap worker while the project-manager chain was loading.
    const early=window.__padGradeGridEarlySizingResultV094;
    if(early&&early.projectId===job.projectId&&early.sampleKey===sampleKey&&Number.isFinite(+early.needWidthPerPx)){
      applyFinal(job,+early.needWidthPerPx,'early-worker-offscreen-canvas');
      return;
    }

    const w=ensureWorker();
    if(w){try{w.postMessage({jobId:job.id,family:geom.family,samples});return;}catch(e){}}
    setTimeout(()=>{if(activeJob===job)applyFinal(job,measureOnMain(samples,geom.family),'main-thread-canvas-fallback');},0);
  }

  function renderGridV094(reason='explicit'){startSizing(reason,true);}
  window.renderGrid=function(){renderGridV094('explicit');};
  window.__padGradeRenderGrid=renderGridV094;
  window.__padGradeStartGridSizing=(reason='external')=>startSizing(reason,false);

  ensureWorker();
  renderGridV094('core-install');

  const shell=$('grid')?.parentElement;
  if(shell&&typeof ResizeObserver==='function'){
    let lastWidth=Math.round(shell.getBoundingClientRect().width*10)/10,timer=null;
    const observer=new ResizeObserver(entries=>{
      const rect=entries[0]?.contentRect;if(!rect)return;
      const width=Math.round(rect.width*10)/10;if(Math.abs(width-lastWidth)<0.5)return;
      lastWidth=width;clearTimeout(timer);timer=setTimeout(()=>startSizing('container-width-change',false),60);
    });
    observer.observe(shell);window.__padGradeGridResizeObserver=observer;
  }

  window.__padGradeGridMeasurePolicyV094='paint-cells-first-worker-offscreen-measure-then-one-css-resize';
})();
