(()=>{
  function installTractorPlanLayoutV15(){
    if(window.__TRACTOR_PLAN_LAYOUT_V15_INSTALLED)return true;
    window.__TRACTOR_PLAN_LAYOUT_V15_INSTALLED=true;

    const wrap=document.querySelector('.wrap');
    const mapWrap=document.querySelector('.mapWrap');
    if(!wrap||!mapWrap)return false;
    const mapCard=mapWrap.closest('.card');
    if(!mapCard)return false;

    const style=document.createElement('style');
    style.textContent=`
      .planNamingRow{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(150px,1fr) auto;gap:6px;align-items:end;margin:7px 0}
      .planActionGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:7px 0}
      .planActionGrid button{width:100%;min-width:0}
      .planFooter{margin-top:8px}
      .planFooterActions{display:grid;grid-template-columns:1fr;gap:6px;margin-top:7px}
      .planFooterActions button{width:100%}
      @media(max-width:620px){
        .planNamingRow{grid-template-columns:1fr 1fr}
        .planNamingRow button{width:100%}
        .planActionGrid{grid-template-columns:repeat(3,minmax(0,1fr))}
        .planActionGrid button{padding:9px 4px;font-size:.70rem}
      }
    `;
    document.head.appendChild(style);

    // Keep naming/selection controls together.
    const drawTarget=document.getElementById('drawTarget');
    const drawName=document.getElementById('drawRegionName');
    const editSelect=document.getElementById('editShapeSelect');
    const editName=document.getElementById('editRegionName');
    const renameBtn=document.getElementById('renameRegionBtn');

    const naming1=document.createElement('div');naming1.className='planNamingRow planOnly';
    if(drawTarget)naming1.appendChild(drawTarget);
    if(drawName)naming1.appendChild(drawName);
    mapCard.appendChild(naming1);

    const naming2=document.createElement('div');naming2.className='planNamingRow planOnly';
    if(editSelect)naming2.appendChild(editSelect);
    if(editName)naming2.appendChild(editName);
    if(renameBtn)naming2.appendChild(renameBtn);
    mapCard.appendChild(naming2);

    // Consolidate all non-naming drawing/edit actions into one 3-wide grid.
    const actionGrid=document.createElement('div');actionGrid.className='planActionGrid planOnly';
    const ids=['drawBtn','traceBtn','editShapeBtn','deleteVertexBtn','deleteShapeBtn','locateBtn','undoVertexBtn','finishBoundaryBtn','clearBoundaryBtn','fitFieldBtn'];
    for(const id of ids){const el=document.getElementById(id);if(el)actionGrid.appendChild(el)}
    mapCard.appendChild(actionGrid);

    // Remove now-empty original control shells.
    for(const el of [...mapCard.querySelectorAll('.propertyBar.planOnly,.mapTools.planOnly')]){
      if(!el.children.length)el.remove();
    }

    // Move privacy and Terms to bottom of PLAN content.
    const footer=document.createElement('div');footer.className='planFooter planOnly';
    const privacy=document.querySelector('.privacyCard');
    if(privacy)footer.appendChild(privacy);
    const footerActions=document.createElement('div');footerActions.className='planFooterActions';
    const terms=document.getElementById('termsBtn');
    if(terms){terms.classList.add('planOnly');terms.classList.remove('planTopOnly');footerActions.appendChild(terms)}
    if(footerActions.children.length)footer.appendChild(footerActions);
    wrap.appendChild(footer);

    return true;
  }
  window.installTractorPlanLayoutV15=installTractorPlanLayoutV15;
})();
