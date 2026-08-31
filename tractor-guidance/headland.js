(()=>{
  function installTractorHeadland(){
    if(window.__TRACTOR_HEADLAND_INSTALLED)return true;
    const planner=document.querySelector('.planner'),pathType=document.getElementById('pathType');
    if(!planner||!pathType||typeof cfg!=='function')return false;
    window.__TRACTOR_HEADLAND_INSTALLED=true;

    const box=document.createElement('div');box.id='headlandControls';box.style.display='contents';
    function field(label,id,value,min,max,step){const l=document.createElement('label');l.className='headlandControl';l.textContent=label;const i=document.createElement('input');i.id=id;i.type='number';i.value=value;i.min=min;i.max=max;i.step=step;l.appendChild(i);box.appendChild(l);return i}
    const toggleLabel=document.createElement('label');toggleLabel.className='headlandControl';toggleLabel.textContent='Headland turns';const toggle=document.createElement('input');toggle.id='headlandEnabled';toggle.type='checkbox';toggle.style.marginLeft='8px';toggleLabel.appendChild(toggle);box.appendChild(toggleLabel);
    const passes=field('Headland passes','headlandPasses','2','0','10','1');
    const skip=field('Rows to skip on turn','turnSkipRows','1','0','20','1');
    const radius=field('Turning radius ft','turningRadiusFt','18','1','250','.5');
    const note=document.createElement('div');note.id='headlandNote';note.className='small';note.style.gridColumn='1/-1';note.style.marginTop='-2px';box.appendChild(note);
    planner.appendChild(box);

    function parallelLike(){return pathType.value==='parallel'||pathType.value==='skip-parallel'}
    function refresh(){
      const show=parallelLike();for(const el of box.children)el.style.display=show?'':'none';if(!show)return;
      if(pathType.value==='skip-parallel'&&Number(skip.value)<1)skip.value='1';
      const on=toggle.checked,step=Math.max(1,(Number(skip.value)||0)+1),r=Math.max(1,Number(radius.value)||18),p=Math.max(0,Math.floor(Number(passes.value)||0));passes.disabled=!on;radius.disabled=!on;
      note.textContent=on?`Headland first: ${p} perimeter pass${p===1?'':'es'}. Straight passes jump ${step} row${step===1?'':'s'} per turn. Bulb-turn guidance uses a ${r.toFixed(1)} ft minimum turning radius; turns may swing opposite the final turn direction before lining up.`:`Headland turns off. Row skipping still controls straight-pass order.`;
    }
    function invalidate(){try{if(Array.isArray(plannedSegments)&&plannedSegments.length){plannedSegments=[];planMeta=null;if(typeof setPlanCache==='function')setPlanCache(0,0,0);planProgress={spacingFt:20,covered:{}};planProgressSamples=[];if(typeof invalidateSelectedPathing==='function')invalidateSelectedPathing();if(typeof updateAll==='function')updateAll();if(typeof saveMeta==='function')saveMeta('headland or turn settings changed')}}catch(e){console.warn('Could not invalidate path after headland setting change',e)}}
    for(const el of [toggle,passes,skip,radius])el.addEventListener('change',()=>{refresh();invalidate()});
    pathType.addEventListener('change',refresh);

    const baseCfg=cfg;cfg=function(){const s=baseCfg();s.headlandEnabled=Boolean(toggle.checked&&parallelLike());s.headlandPasses=Math.max(0,Math.floor(Number(passes.value)||0));s.turnSkipRows=pathType.value==='skip-parallel'?Math.max(1,Math.floor(Number(skip.value)||1)):Math.max(0,Math.floor(Number(skip.value)||0));s.turningRadiusFt=Math.max(1,Number(radius.value)||18);return s};
    if(typeof applyCfg==='function'){const baseApply=applyCfg;applyCfg=function(s={}){baseApply(s);if(s.headlandEnabled!==undefined)toggle.checked=Boolean(s.headlandEnabled);if(s.headlandPasses!==undefined)passes.value=s.headlandPasses;if(s.turnSkipRows!==undefined)skip.value=s.turnSkipRows;if(s.turningRadiusFt!==undefined)radius.value=s.turningRadiusFt;refresh()}}
    refresh();window.TractorHeadland={refresh};return true;
  }
  window.installTractorHeadland=installTractorHeadland;
})();