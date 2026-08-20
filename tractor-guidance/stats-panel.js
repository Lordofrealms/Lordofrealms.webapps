(()=>{
  function installTractorStatsPanel(){
    if(window.__TRACTOR_STATS_PANEL_INSTALLED)return true;
    window.__TRACTOR_STATS_PANEL_INSTALLED=true;

    const headerActions=document.querySelector('.planShellActions')||document.querySelector('.top>div:last-child');
    let btn=document.getElementById('planStatsBtn');
    if(!btn&&headerActions){btn=document.createElement('button');btn.id='planStatsBtn';btn.className='planTopOnly';btn.textContent='Stats';headerActions.appendChild(btn)}
    if(!btn)return false;

    let dlg=document.getElementById('planStatsDlg');
    if(!dlg){
      dlg=document.createElement('dialog');dlg.id='planStatsDlg';
      dlg.innerHTML=`<div class="modal"><h2>Plan Statistics</h2><div class="planStatsGrid" id="planStatsGrid"></div><div class="modalActions"><button id="refreshPlanStatsBtn">Refresh</button><button id="closePlanStatsBtn" class="primary">Close</button></div></div>`;
      document.body.appendChild(dlg);
    }

    if(!document.getElementById('planStatsStyle')){
      const style=document.createElement('style');style.id='planStatsStyle';
      style.textContent=`.planStatsGrid{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(110px,1fr);gap:7px 12px;font-size:.76rem;margin-top:8px}.planStatsGrid .k{color:var(--muted)}.planStatsGrid .v{font-weight:700;overflow-wrap:anywhere}@media(max-width:480px){.planStatsGrid{grid-template-columns:1fr 1fr;font-size:.72rem}}`;
      document.head.appendChild(style);
    }

    const text=id=>document.getElementById(id)?.textContent?.trim()||'—';
    const val=id=>document.getElementById(id)?.value??'—';
    const yesno=v=>v?'Yes':'No';
    function propertyAcres(){try{if(typeof boundary!=='undefined'&&boundary&&typeof turf!=='undefined')return (turf.area(boundary)*10.7639104167/43560).toFixed(2)}catch(e){}return text('fieldAcres')}
    function activeRegionCount(){try{if(typeof regionPlanState!=='undefined'&&regionPlanState)return Object.values(regionPlanState).filter(Boolean).length}catch(e){}return'—'}
    function fitMode(){try{return typeof getTractorCoveragePriority==='function'?(getTractorCoveragePriority()==='coverage'?'Full coverage':'No extra overlap'):'—'}catch(e){return'—'}}
    function actualSpacing(){try{const n=Number(planMeta?.actualSpacingFt);return Number.isFinite(n)?`${n.toFixed(2)} ft`:'—'}catch(e){return'—'}}
    function render(){
      const rows=[
        ['Build',window.TRACTOR_ASSET_VERSION||'—'],
        ['Property',typeof currentPropertyName!=='undefined'&&currentPropertyName?currentPropertyName:'—'],
        ['Property area',`${propertyAcres()} ac`],['Active plan regions',String(activeRegionCount())],
        ['Path type',document.getElementById('pathType')?.selectedOptions?.[0]?.textContent||'—'],
        ['Implement width',`${val('implWidth')} ft`],['Configured overlap',`${val('overlap')} ft`],['Residual fit',fitMode()],['Actual pass spacing',actualSpacing()],
        ['Boundary margin',`${val('boundaryMargin')} ft`],['Parallel heading',`${val('parallelHeading')}°`],['Planned distance',`${text('estimateMiles')} mi`],
        ['Passes / loops',text('estimatePasses')],['Active work area',`${text('estimateAcres')} ac`],['Expected speed',`${val('expectedSpeed')} mph`],['Estimated line-work time',text('estimateTime')],
        ['Saved path selected',yesno(typeof selectedPathingId!=='undefined'&&Boolean(selectedPathingId))],['Selected path',typeof selectedPathingName!=='undefined'&&selectedPathingName?selectedPathingName:'—'],
        ['GPS fix available',yesno(typeof currentFix!=='undefined'&&Boolean(currentFix))],['GPS accuracy',text('accuracy')==='—'?'—':`${text('accuracy')} ft`]
      ];
      const grid=document.getElementById('planStatsGrid');if(grid)grid.innerHTML=rows.map(([k,v])=>`<div class="k">${k}</div><div class="v">${String(v)}</div>`).join('');
    }
    btn.onclick=()=>{render();dlg.showModal()};
    document.getElementById('refreshPlanStatsBtn').onclick=render;
    document.getElementById('closePlanStatsBtn').onclick=()=>dlg.close();
    return true;
  }
  window.installTractorStatsPanel=installTractorStatsPanel;
})();
