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
      node.nodeValue=node.nodeValue.replace(/([±]?)(-?\d+(?:\.\d+)?)\s*ft\b/g,(m,prefix,num)=>{
        const meters=Number(num)*M_PER_FT;
        if(!Number.isFinite(meters))return m;
        return `${prefix}${meters.toFixed(Math.abs(meters)<10?1:0)} m`;
      });
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
  pgUpdateLaserSummary=function(){baseUpdateLaserSummary();syncLaserInputs();};

  installLaserCoordinateInputs();
  pgRefreshUnitLabels();

  // map.js owns this field on a polling timer, so convert it whenever it changes.
  const mapAccuracy=$('gpsMapAccuracy');
  if(mapAccuracy&&window.MutationObserver){
    new MutationObserver(()=>metricizeText(mapAccuracy)).observe(mapAccuracy,{childList:true,characterData:true,subtree:true});
  }
})();
