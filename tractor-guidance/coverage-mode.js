(()=>{
  const KEY='tractorCoverageFitPriority';
  function installTractorCoverageMode(){
    if(window.__TRACTOR_COVERAGE_MODE_INSTALLED)return true;
    if(typeof cfg!=='function'||typeof applyCfg!=='function')return false;
    window.__TRACTOR_COVERAGE_MODE_INSTALLED=true;

    let mode=localStorage.getItem(KEY)==='no-extra-overlap'?'no-extra-overlap':'coverage';
    const planner=document.querySelector('.planner');
    if(!planner)return false;

    const wrap=document.createElement('div');
    wrap.className='coverageFitControl';
    wrap.innerHTML=`<div class="coverageFitLabel">Residual swath fit</div><div class="coverageFitButtons"><button type="button" id="coverageFitFull">Full coverage</button><button type="button" id="coverageFitNoExtra">No extra overlap</button></div><div class="coverageFitHelp" id="coverageFitHelp"></div>`;
    planner.appendChild(wrap);

    const style=document.createElement('style');
    style.textContent=`.coverageFitControl{font-size:.68rem;color:var(--muted);align-self:end}.coverageFitLabel{margin-bottom:4px}.coverageFitButtons{display:grid;grid-template-columns:1fr 1fr;gap:4px}.coverageFitButtons button{padding:8px 5px;font-size:.66rem}.coverageFitButtons button.active{background:#173526;border-color:#75c043;color:#d5ffb8}.coverageFitHelp{font-size:.58rem;line-height:1.25;margin-top:4px;color:var(--muted)}`;
    document.head.appendChild(style);

    const full=document.getElementById('coverageFitFull');
    const noExtra=document.getElementById('coverageFitNoExtra');
    const help=document.getElementById('coverageFitHelp');
    const pathType=document.getElementById('pathType');
    const headingLabel=document.getElementById('headingLabel');

    function invalidatePlan(){
      try{
        if(Array.isArray(plannedSegments)&&plannedSegments.length){
          plannedSegments=[];planMeta=null;
          if(typeof setPlanCache==='function')setPlanCache(0,0,0);
          planProgress={spacingFt:20,covered:{}};planProgressSamples=[];
          if(typeof invalidateSelectedPathing==='function')invalidateSelectedPathing();
          if(typeof updateAll==='function')updateAll();
          if(typeof saveMeta==='function')saveMeta('coverage fit priority changed');
        }
      }catch(e){console.warn('Could not invalidate old plan after fit-priority change',e)}
    }

    function refresh(){
      full.classList.toggle('active',mode==='coverage');
      noExtra.classList.toggle('active',mode==='no-extra-overlap');
      const type=pathType?.value;
      const parallelLike=type==='parallel'||type==='skip-parallel';
      const disabled=type&&!parallelLike;
      full.disabled=disabled;noExtra.disabled=disabled;
      if(headingLabel&&type==='skip-parallel')headingLabel.style.display='';
      help.textContent=disabled
        ?'Parallel-style paths only. Contour paths keep their configured inward spacing.'
        :mode==='coverage'
          ?'Adds extra overlap when needed so the cross-track width is fully covered.'
          :'Keeps the requested spacing fixed; leftover width is split between the two edges and may remain unworked.';
    }

    function setMode(next,{persist=true,invalidate=true}={}){
      const normalized=next==='no-extra-overlap'?'no-extra-overlap':'coverage';
      if(normalized===mode){refresh();return}
      mode=normalized;
      if(persist)localStorage.setItem(KEY,mode);
      refresh();
      if(invalidate)invalidatePlan();
    }

    full.onclick=()=>setMode('coverage');
    noExtra.onclick=()=>setMode('no-extra-overlap');
    if(pathType)pathType.addEventListener('change',()=>requestAnimationFrame(refresh));

    const originalCfg=cfg;
    cfg=function(){return{...originalCfg.apply(this,arguments),coveragePriority:mode}};
    const originalApplyCfg=applyCfg;
    applyCfg=function(settings){
      const r=originalApplyCfg.apply(this,arguments);
      if(settings?.coveragePriority)setMode(settings.coveragePriority,{persist:true,invalidate:false});
      else refresh();
      requestAnimationFrame(refresh);
      return r;
    };

    window.getTractorCoveragePriority=()=>mode;
    refresh();
    return true;
  }
  window.installTractorCoverageMode=installTractorCoverageMode;
})();
