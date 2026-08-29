/* Pad Grade v0.9.4 DEV — early lower-grid sizing precompute.
 * Runs immediately after init.js has restored/rendered the active project, before
 * the legacy project-management chain and map loader finish. It does no DOM
 * rebuilding: it only starts the OffscreenCanvas worker and caches the measured
 * width factor for grid-core.js to consume later.
 */
(function startPadGradeGridSizingEarly(){
  'use strict';
  const WORKER_URL='grid-size-worker-v094.js?v=20260829-1';
  function activeId(){try{return localStorage.getItem('padGradeActiveProjectIdV5')||'';}catch(e){return '';}}
  function samples(){
    try{
      const s=cfg(),out=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const value=readings[k(r,c)],[main,sub]=textFor(value),rc=refCoords(r,c);
        out.push({text:label(r,c),weight:900},{text:`${rc.x.toFixed(1)}′ ${rc.xDir}`},{text:`${rc.y.toFixed(1)}′ ${rc.yDir}`},{text:main||'—',weight:800},{text:sub||'—'});
      }
      return out;
    }catch(e){return [];}
  }
  try{
    if(typeof Worker!=='function')return;
    const list=samples();if(!list.length)return;
    const pid=activeId(),sampleKey=JSON.stringify(list),family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    const worker=new Worker(WORKER_URL),jobId=`early-${Date.now()}`;
    worker.onmessage=event=>{
      const msg=event.data||{};if(msg.jobId!==jobId)return;
      if(msg.type==='complete'&&Number.isFinite(+msg.needWidthPerPx)){
        window.__padGradeGridEarlySizingResultV094={projectId:pid,sampleKey,needWidthPerPx:+msg.needWidthPerPx,completedAt:Date.now()};
      }
      try{worker.terminate();}catch(e){}
    };
    worker.onerror=()=>{try{worker.terminate();}catch(e){}};
    worker.postMessage({jobId,family,samples:list});
    window.__padGradeGridEarlySizingV094='worker-started-immediately-after-init-project-load';
  }catch(e){}
})();
