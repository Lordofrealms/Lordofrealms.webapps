/* Pad Grade Mapper v0.6.1-dev refinements — metric display, external laser coordinates, optimizer semantics */
(function installPadGrade061(){
  'use strict';

  const baseRefreshUnitLabels=pgRefreshUnitLabels;
  pgRefreshUnitLabels=function(){
    baseRefreshUnitLabels();
    const s=cfg(),center=document.querySelector('.cornerCenter');
    if(center&&center.firstChild) center.firstChild.nodeValue=`${pgFmtPlan(s.width,1)} × ${pgFmtPlan(s.length,1)} pad`;
    const xLabel=$('laserXInput')&&$('laserXInput').parentElement;
    const yLabel=$('laserYInput')&&$('laserYInput').parentElement;
    const unit=pgUnitMode()==='metric'?'m':'ft';
    if(xLabel&&xLabel.firstChild)xLabel.firstChild.nodeValue=`Laser X east of SW (${unit})`;
    if(yLabel&&yLabel.firstChild)yLabel.firstChild.nodeValue=`Laser Y north of SW (${unit})`;
    syncLaserInputs();
  };

  const baseCalculateTargets=pgCalculateTargets;
  pgCalculateTargets=function(){
    const result=baseCalculateTargets();
    if(result&&!result.error){
      // Net-zero means actual signed earthwork balances to zero. Tolerance is
      // deliberately not used for this option; tolerance belongs only to the
      // minimum-disturbed-area optimizer.
      result.neutralWork=pgEarthworkAt(result.neutral,result.surface,0);
    }
    return result;
  };

  function metricizeText(root){
    if(!root||pgUnitMode()!=='metric')return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
    for(const node of nodes){
      const before=node.nodeValue;
      const after=before.replace(/([±]?)(-?\d+(?:\.\d+)?)\s*ft\b/g,(m,prefix,num)=>{
        const meters=Number(num)*M_PER_FT;
        if(!Number.isFinite(meters))return m;
        return `${prefix}${meters.toFixed(Math.abs(meters)<10?1:0)} m`;
      });
      if(after!==before)node.nodeValue=after;
    }
  }

  const baseFormatGpsFix=formatGpsFix;
  formatGpsFix=function(pos){
    if(pgUnitMode()!=='metric')return baseFormatGpsFix(pos);
    if(!pos)return 'No fix';
    const meters=(+pos.accuracy||0);
    return `±${meters.toFixed(meters<10?1:0)} m`;
  };

  const baseUpdateGpsUI=updateGpsUI;
  updateGpsUI=function(){
    baseUpdateGpsUI();
    if(measureMode==='gps'&&pgRouteMode()==='away'&&padGradeLaser&&gpsTargetIndex!=null){
      const route=gpsRoute(),pos=route.indexOf(gpsTargetIndex);
      if(pos>0){
        const prev=pointFromIndex(route[pos-1]),next=pointFromIndex(route[pos]);
        if(pgDistToLaser(next.r,next.c)+0.01<pgDistToLaser(prev.r,prev.c)&&$('gpsInstruction')){
          $('gpsInstruction').textContent=`Return to ${label(next.r,next.c)} without taking measurements; then continue walking away from the laser.`;
        }
      }
    }
    if(pgUnitMode()==='metric'){
      metricizeText($('gpsCard'));
      metricizeText($('gpsMapCard'));
    }
  };

  function syncLaserInputs(){
    const x=$('laserXInput'),y=$('laserYInput');if(!x||!y)return;
    const digits=pgUnitMode()==='metric'?2:1;
    if(!padGradeLaser){x.value='';y.value='';return;}
    x.value=pgRoundInput(pgPlanFtToInput(padGradeLaser.xFt),digits);
    y.value=pgRoundInput(pgPlanFtToInput(padGradeLaser.yFt),digits);
  }

  function setLaserFromInputs(){
    const x=$('laserXInput'),y=$('laserYInput');if(!x||!y)return;
    if(x.value===''||y.value==='')return;
    const xf=pgPlanInputToFt(+x.value),yf=pgPlanInputToFt(+y.value);
    if(!Number.isFinite(xf)||!Number.isFinite(yf))return;
    padGradeLaser={xFt:xf,yFt:yf};
    saveLocal();pgUpdateLaserSummary();renderGrid();
  }

  function installLaserCoordinateInputs(){
    if($('laserXInput'))return;
    const row=document.querySelector('.laserRow');if(!row)return;
    row.insertAdjacentHTML('afterend',`<div class="laserCoords"><label>Laser X east of SW (ft)<input id="laserXInput" type="number" step="0.1" inputmode="decimal" placeholder="may be negative"></label><label>Laser Y north of SW (ft)<input id="laserYInput" type="number" step="0.1" inputmode="decimal" placeholder="may be negative"></label></div><div class="small laserCoordHelp">Coordinates may be outside the pad; tapping “Place on pad” is just the quick option for locations inside the pad.</div>`);
    $('laserXInput').addEventListener('change',setLaserFromInputs);
    $('laserYInput').addEventListener('change',setLaserFromInputs);
  }

  const baseUpdateLaserSummary=pgUpdateLaserSummary;
  pgUpdateLaserSummary=function(){
    baseUpdateLaserSummary();
    const el=$('laserSummary'),s=cfg();
    if(el&&!padGradeLaser&&pgRouteMode()==='away')el.textContent='Not placed — away route uses serpentine until set';
    if(el&&padGradeLaser&&(padGradeLaser.xFt<0||padGradeLaser.xFt>s.width||padGradeLaser.yFt<0||padGradeLaser.yFt>s.length))el.textContent+=' • outside pad';
    syncLaserInputs();
  };

  function manualSerpentineRoute(){
    const s=cfg(),start=s.refCorner||'SW',rs=[...Array(s.rows).keys()],cs=[...Array(s.cols).keys()];
    if(start.includes('N'))rs.reverse();
    const firstCols=start.includes('E')?[...cs].reverse():cs;
    const route=[];
    rs.forEach((r,i)=>{
      const rowCols=i%2===0?firstCols:[...firstCols].reverse();
      rowCols.forEach(c=>route.push(indexFromPoint(r,c)));
    });
    return route;
  }

  function awaySurveyRoute(){
    if(!padGradeLaser)return manualSerpentineRoute();
    const s=cfg(),rows=[];
    for(let r=0;r<s.rows;r++){
      let nearestC=0,nearestD=Infinity;
      for(let c=0;c<s.cols;c++){
        const d=pgDistToLaser(r,c);
        if(d<nearestD){nearestD=d;nearestC=c;}
      }
      rows.push({r,nearestC,nearestD});
    }
    rows.sort((a,b)=>a.nearestD-b.nearestD||a.r-b.r);
    const route=[];
    for(const row of rows){
      const r=row.r,c0=row.nearestC;
      if(c0===0){for(let c=0;c<s.cols;c++)route.push(indexFromPoint(r,c));continue;}
      if(c0===s.cols-1){for(let c=s.cols-1;c>=0;c--)route.push(indexFromPoint(r,c));continue;}

      const leftFar=pgDistToLaser(r,0),rightFar=pgDistToLaser(r,s.cols-1);
      if(leftFar<=rightFar){
        for(let c=c0;c>=0;c--)route.push(indexFromPoint(r,c));
        for(let c=c0+1;c<s.cols;c++)route.push(indexFromPoint(r,c));
      }else{
        for(let c=c0;c<s.cols;c++)route.push(indexFromPoint(r,c));
        for(let c=c0-1;c>=0;c--)route.push(indexFromPoint(r,c));
      }
    }
    return route;
  }

  const baseGpsRoute061=gpsRoute;
  gpsRoute=function(){
    if(pgRouteMode()==='away'&&padGradeLaser)return awaySurveyRoute();
    return baseGpsRoute061();
  };

  function manualSurveyRoute(){
    return pgRouteMode()==='away'&&padGradeLaser?awaySurveyRoute():manualSerpentineRoute();
  }

  function activeEntryRoute(){
    if(measureMode==='gps'){
      const route=gpsRoute();
      if(route&&route.length)return route;
    }
    return manualSurveyRoute();
  }

  function routeStep(fromIndex,direction,emptyOnly){
    const route=activeEntryRoute();if(!route.length)return null;
    let pos=route.indexOf(fromIndex);
    if(pos<0)pos=direction>0?-1:0;
    for(let step=1;step<=route.length;step++){
      const idx=route[(pos+direction*step+route.length*2)%route.length],p=pointFromIndex(idx);
      if(!emptyOnly||!Number.isFinite(readings[k(p.r,p.c)]))return idx;
    }
    return null;
  }

  // Manual Save & Next previously ignored the survey-route selector and simply
  // walked row-major. Make all entry-dialog navigation honor the chosen route.
  nextPoint=function(emptyOnly=false){
    const idx=routeStep(currentIndex,1,emptyOnly);
    if(idx==null){if(emptyOnly)alert('All grid points have readings.');return;}
    const p=pointFromIndex(idx);openPoint(p.r,p.c);
  };
  prevPoint=function(){
    const idx=routeStep(currentIndex,-1,false);if(idx==null)return;
    const p=pointFromIndex(idx);openPoint(p.r,p.c);
  };
  nextEmpty=function(){
    const route=activeEntryRoute();
    for(const idx of route){const p=pointFromIndex(idx);if(!Number.isFinite(readings[k(p.r,p.c)])){openPoint(p.r,p.c);return;}}
    alert('All grid points have readings.');
  };

  installLaserCoordinateInputs();
  if($('routeMode'))$('routeMode').addEventListener('change',pgUpdateLaserSummary);
  pgRefreshUnitLabels();

  // map.js owns this field on a polling timer, so convert it whenever it changes.
  const mapAccuracy=$('gpsMapAccuracy');
  if(mapAccuracy&&window.MutationObserver){
    new MutationObserver(()=>metricizeText(mapAccuracy)).observe(mapAccuracy,{childList:true,characterData:true,subtree:true});
  }
})();
