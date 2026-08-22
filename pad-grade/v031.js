/* Pad Grade v0.3.1 — compact contextual help, IME Save & Next, scaled target radar. */
(function installPadGradeV031(){
  'use strict';

  const FT_PER_M=3.280839895;
  let nativeHeadingDeg=null;
  let nativeHeadingAccuracyDeg=null;
  let nativeHeadingAt=0;

  const byId=id=>document.getElementById(id);

  function moveHelpButton(button,anchor){
    if(!button||!anchor||button.dataset.v031Moved) return;
    const wrap=button.parentElement;
    const body=wrap&&wrap.querySelector('.v030-helpText');
    button.dataset.v031Moved='1';
    anchor.classList.add('v031-infoAnchor');
    anchor.appendChild(button);
    if(body){
      const section=anchor.closest('.card,.v030-calibration,.v030-jobSummary')||anchor.parentElement;
      if(section) section.appendChild(body);
    }
    if(wrap&&wrap!==anchor&&wrap.childElementCount===0) wrap.remove();
  }

  function compactHelpPlacement(){
    // Four-corner info belongs in the title row; expanded text remains below the section.
    const calTitle=document.querySelector('.v030-calibration .v030-sectionTitle');
    moveHelpButton(document.querySelector('.v030-help[aria-label="Calibration information"]'),calTitle);

    // Map help sits at the end of the legend row instead of occupying another row.
    const mapLegend=document.querySelector('.v030-mapLegend');
    moveHelpButton(document.querySelector('.v030-help[aria-label="Map information"]'),mapLegend);

    // Grade-grid help lives at the end of the existing legend row.
    const gridCard=byId('grid')?.closest('.card');
    const gridLegend=gridCard?.querySelector('.legend')||gridCard?.querySelector('.gridHeader');
    moveHelpButton(document.querySelector('.v030-help[aria-label="Grade grid information"]'),gridLegend);

    // Volume explanation belongs on the Job Summary heading line.
    const summaryTitle=document.querySelector('.v030-jobSummary .v030-sectionTitle');
    moveHelpButton(document.querySelector('.v030-help[aria-label="Volume estimate information"]'),summaryTitle);

    // Privacy info sits beside "Privacy lock active" rather than below it.
    const privacy=document.querySelector('.v030-privacy');
    if(privacy){
      let row=privacy.querySelector('.v031-infoRow');
      if(!row){
        const title=[...privacy.children].find(x=>x.tagName==='B');
        if(title){
          row=document.createElement('div'); row.className='v031-infoRow';
          title.replaceWith(row); row.appendChild(title);
        }
      }
      moveHelpButton(privacy.querySelector('.v030-help[aria-label="Privacy information"]'),row);
    }
  }

  function saveAndNextFromKeyboard(e){
    if(e.key!=='Enter') return;
    const dlg=byId('entryDlg');
    if(!dlg||!dlg.open) return;
    e.preventDefault();
    e.stopPropagation();
    byId('savePoint')?.click();
  }

  function installImeSaveNext(){
    const input=byId('readingInput');
    if(!input||input.dataset.v031Ime) return;
    input.dataset.v031Ime='1';
    // Android numeric keyboards commonly label Enter as Go/Done. In HTML that
    // still arrives as Enter, so route it to the same Save & Next button.
    input.setAttribute('enterkeyhint','go');
    input.addEventListener('keydown',saveAndNextFromKeyboard,true);
  }

  function ensureRadar(){
    const ring=document.querySelector('#navVisual .navRing');
    if(!ring||ring.dataset.v031Radar) return ring;
    ring.dataset.v031Radar='1';
    const error=document.createElement('div'); error.id='v031ErrorCircle'; error.className='v031-errorCircle';
    const line=document.createElement('div'); line.id='v031TargetLine'; line.className='v031-targetLine';
    const target=document.createElement('div'); target.id='v031TargetDot'; target.className='v031-targetDot';
    const current=document.createElement('div'); current.className='v031-currentDot';
    const scale=document.createElement('div'); scale.id='v031ScaleLabel'; scale.className='v031-scaleLabel';
    ring.append(error,line,target,current,scale);

    const visual=byId('navVisual');
    const legend=document.createElement('div'); legend.className='v031-targetLegend';
    legend.innerHTML='<span><i class="v031-miniDot current"></i>you</span><span><i class="v031-miniDot target"></i>target</span><span><i class="v031-miniRing"></i>GPS uncertainty</span>';
    visual?.appendChild(legend);
    return ring;
  }

  function currentHeading(){
    if(Number.isFinite(nativeHeadingDeg) && Date.now()-nativeHeadingAt<5000){
      return {heading:nativeHeadingDeg,source:'phone compass',accuracy:nativeHeadingAccuracyDeg};
    }
    // GPS course is meaningful only while moving; use it as a fallback, not as
    // the primary reference for a phone-forward display.
    if(gpsPos&&Number.isFinite(gpsPos.heading)&&Number.isFinite(gpsPos.speed)&&gpsPos.speed>=0.8){
      return {heading:gpsPos.heading,source:'GPS course',accuracy:null};
    }
    if(Number.isFinite(deviceHeadingDeg)){
      return {heading:deviceHeadingDeg,source:deviceHeadingSource||'device compass',accuracy:deviceHeadingAccuracyDeg};
    }
    return {heading:0,source:'north-up',accuracy:null};
  }

  window.__padGradeNativeHeading=function(payload){
    try{
      const p=typeof payload==='string'?JSON.parse(payload):payload;
      if(!p||!Number.isFinite(+p.heading)) return;
      nativeHeadingDeg=((+p.heading%360)+360)%360;
      nativeHeadingAccuracyDeg=Number.isFinite(+p.accuracy)?+p.accuracy:null;
      nativeHeadingAt=Date.now();
      if(measureMode==='gps') updateGpsUI();
    }catch(e){}
  };

  function startNativeHeading(){
    const native=window.PadGradeNative;
    if(native&&typeof native.startHeadingUpdates==='function'){
      try{native.startHeadingUpdates();}catch(e){}
    }else{
      // Browser fallback keeps the existing DeviceOrientationEvent path alive.
      try{enableDeviceHeading();}catch(e){}
    }
  }

  // Override v10/v0.3.0 navigation with a distance-scaled radar. The center green
  // dot is the reported phone position. The yellow target dot preserves both
  // direction and remaining offset even after it falls inside GPS uncertainty.
  window.renderNavigation=function(tgt,d){
    const visual=byId('navVisual'),ring=ensureRadar();
    if(!visual||!ring||!gpsFit||!gpsPos||!tgt||!d){ if(visual) visual.classList.remove('show'); return; }
    visual.classList.add('show');

    const h=currentHeading();
    const bearing=targetBearingDeg(gpsPos,tgt);
    const relative=circularDifference(bearing,h.heading);
    const accFt=Math.max(0,(gpsPos.accuracy||0)*FT_PER_M);
    const distanceFt=Math.max(0,d.distance||0);
    const usableRadius=Math.max(54,ring.clientWidth/2-24);

    // Dynamic scale keeps the target visible while giving meaningful geometry.
    // Never let the uncertainty circle consume the whole radar unless uncertainty
    // actually dominates the navigation problem.
    const gridScale=Math.max(6,gridMinSpacing());
    const scaleFt=Math.max(gridScale,distanceFt*1.18,accFt*1.18,8);
    const pxPerFt=usableRadius/scaleFt;
    const targetPx=Math.min(usableRadius,distanceFt*pxPerFt);
    const errorPx=Math.min(usableRadius,accFt*pxPerFt);
    const rad=relative*Math.PI/180;
    const x=Math.sin(rad)*targetPx;
    const y=-Math.cos(rad)*targetPx;

    const dot=byId('v031TargetDot'),line=byId('v031TargetLine'),error=byId('v031ErrorCircle');
    if(dot){
      dot.style.left=`calc(50% + ${x.toFixed(1)}px)`;
      dot.style.top=`calc(50% + ${y.toFixed(1)}px)`;
      dot.classList.toggle('edge',distanceFt>=scaleFt*.96);
    }
    if(line){
      line.style.width=`${targetPx.toFixed(1)}px`;
      // line starts pointing right; rotate clockwise to the target vector.
      line.style.transform=`rotate(${(relative-90).toFixed(1)}deg)`;
    }
    if(error){
      const dia=Math.max(4,errorPx*2);
      error.style.width=`${dia.toFixed(1)}px`;
      error.style.height=`${dia.toFixed(1)}px`;
    }

    const north=byId('v030NorthMarker');
    if(north){
      north.style.transform=`rotate(${(-h.heading).toFixed(1)}deg)`;
      const nLabel=north.querySelector('span');
      if(nLabel) nLabel.style.transform=`rotate(${h.heading.toFixed(1)}deg)`;
    }

    byId('v031ScaleLabel').textContent=`edge = ${scaleFt.toFixed(scaleFt<20?1:0)} ft`;
    const inside=distanceFt<=Math.max(2,accFt);
    byId('navDistance').textContent=inside
      ? `${distanceFt.toFixed(1)} ft offset • inside ±${accFt.toFixed(1)} ft uncertainty`
      : `${distanceFt.toFixed(1)} ft to center • ±${accFt.toFixed(1)} ft`;
    const source=byId('navHeadingSource');
    if(source){
      if(h.source==='north-up') source.textContent=`Heading unavailable — north-up fallback • target bearing ${bearing.toFixed(0)}°`;
      else source.textContent=`Phone-forward • ${h.source}${Number.isFinite(h.accuracy)?` ±${h.accuracy.toFixed(0)}°`:''}`;
    }
  };

  compactHelpPlacement();
  installImeSaveNext();
  ensureRadar();
  startNativeHeading();

  // DOM sections are assembled asynchronously by v0.3.0; repeat a few times so
  // every contextual help control lands on its intended information row.
  let passes=0;
  const timer=setInterval(()=>{
    compactHelpPlacement(); installImeSaveNext(); ensureRadar();
    if(++passes>=12) clearInterval(timer);
  },300);

  window.addEventListener('beforeunload',()=>{
    const native=window.PadGradeNative;
    if(native&&typeof native.stopHeadingUpdates==='function'){
      try{native.stopHeadingUpdates();}catch(e){}
    }
  },{once:true});
})();
