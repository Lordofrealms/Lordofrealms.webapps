/* Pad Grade v0.3.0 — unified GPS workflow, map grid overlays, compact help. */
(function installPadGradeV030(){
  'use strict';

  const FT_PER_M_LOCAL=3.280839895;
  let overlayInstalled=false;
  let overlayTimer=null;
  let lastOverlaySignature='';

  const byId=id=>document.getElementById(id);

  function makeHelp(text,label='More information'){
    const wrap=document.createElement('div');
    const btn=document.createElement('button');
    btn.type='button'; btn.className='v030-help'; btn.textContent='i'; btn.setAttribute('aria-label',label);
    const body=document.createElement('div'); body.className='v030-helpText'; body.textContent=text;
    btn.addEventListener('click',()=>body.classList.toggle('open'));
    wrap.append(btn,body);
    return wrap;
  }

  function collapseExistingNote(note,label){
    if(!note || note.dataset.v030Collapsed) return;
    note.dataset.v030Collapsed='1';
    const text=note.textContent.trim();
    const help=makeHelp(text,label);
    note.replaceWith(help);
  }

  function findCardContaining(text){
    return [...document.querySelectorAll('.card')].find(card=>card.textContent.includes(text));
  }

  function redesignDom(){
    const mapCard=byId('gpsMapCard');
    const gpsCard=byId('gpsCard');
    if(!mapCard||!gpsCard||gpsCard.dataset.v030Ready) return;
    gpsCard.dataset.v030Ready='1';
    gpsCard.classList.add('v030-gpsCard');

    // Keep the map header exactly as the authoritative GPS status surface.
    const mapFoot=mapCard.querySelector('.gpsMapFoot');
    if(mapFoot){
      const text=mapFoot.textContent.trim();
      mapFoot.classList.add('v030-collapsedFoot');
      const legend=document.createElement('div');
      legend.className='v030-mapLegend';
      legend.innerHTML='<span><i class="v030-dot empty"></i>Unmeasured</span><span><i class="v030-dot measured"></i>Measured</span><span><i class="v030-dot target"></i>Current target</span>';
      const help=makeHelp(text+' After calibration the fitted pad outline and full grading grid are shown on the map.','Map information');
      mapCard.append(legend,help);
    }

    // Rebuild GPS card into Calibration -> Result -> Target Guidance.
    const cornerPanel=byId('cornerSurveyPanel');
    const gpsTarget=byId('gpsTargetLabel')?.closest('.gpsTarget');
    const navVisual=byId('navVisual');
    const captureBtn=byId('setGpsRefBtn');
    const resetBtn=byId('setGpsOppBtn');
    const recordBtn=byId('gpsRecordBtn');
    const prevBtn=byId('gpsPrevBtn');
    const nextBtn=byId('gpsNextBtn');

    const calibration=document.createElement('div');
    calibration.className='v030-calibration';
    const calTitle=document.createElement('div');
    calTitle.className='v030-sectionTitle';
    calTitle.innerHTML='<b>Four-Corner Calibration</b>';
    const calHelp=makeHelp('Capture all four physical pad corners while standing still. Pad Grade averages several fixes, checks the known side and diagonal geometry, then fits the exact configured rectangle to those observations.','Calibration information');
    calTitle.appendChild(calHelp.firstElementChild);
    calibration.appendChild(calTitle);
    if(cornerPanel) calibration.appendChild(cornerPanel);
    const calButtons=document.createElement('div'); calButtons.className='v030-calButtons';
    if(captureBtn) calButtons.appendChild(captureBtn);
    if(resetBtn) calButtons.appendChild(resetBtn);
    calibration.appendChild(calButtons);
    calibration.appendChild(calHelp.lastElementChild);

    const result=document.createElement('div');
    result.id='v030CalibrationResult'; result.className='v030-calibrationResult';
    result.innerHTML='<div class="headline" id="v030CalHeadline">Calibration pending</div><div class="v030-calGrid"><div class="v030-calMetric"><b id="v030LongHeading">—</b><span>building long-axis heading</span></div><div class="v030-calMetric"><b id="v030CrossHeading">—</b><span>cross-axis heading</span></div><div class="v030-calMetric"><b id="v030Rms">—</b><span>fit RMS</span></div><div class="v030-calMetric"><b id="v030Worst">—</b><span>worst corner residual</span></div></div>';

    const targetSection=document.createElement('div');
    targetSection.className='v030-targetSection';
    const targetHeader=document.createElement('div'); targetHeader.className='v030-targetHeader';
    targetHeader.innerHTML='<div class="v030-sectionTitle" style="margin:0"><b>Target Guidance</b></div><div class="v030-targetAccuracy" id="v030TargetAccuracy">—</div>';
    targetSection.appendChild(targetHeader);
    if(gpsTarget) targetSection.appendChild(gpsTarget);
    if(navVisual){
      const ring=navVisual.querySelector('.navRing');
      if(ring && !ring.querySelector('.v030-forwardLabel')){
        const forward=document.createElement('div'); forward.className='v030-forwardLabel'; forward.textContent='phone forward'; ring.appendChild(forward);
        const north=document.createElement('div'); north.className='v030-northMarker'; north.id='v030NorthMarker'; north.innerHTML='<span>N</span>'; ring.appendChild(north);
        const oldNorth=ring.querySelector('.navNorth'); if(oldNorth) oldNorth.style.display='none';
      }
      targetSection.appendChild(navVisual);
    }
    const targetButtons=document.createElement('div'); targetButtons.className='v030-targetButtons';
    if(recordBtn) targetButtons.appendChild(recordBtn);
    if(prevBtn) targetButtons.appendChild(prevBtn);
    if(nextBtn) targetButtons.appendChild(nextBtn);
    targetSection.appendChild(targetButtons);

    gpsCard.prepend(calibration,result,targetSection);

    // Move privacy disclosure to the bottom and collapse the detailed wording.
    const privacy=findCardContaining('Privacy lock active');
    if(privacy){
      privacy.classList.add('v030-privacy');
      const detail=privacy.querySelector('.small');
      if(detail) collapseExistingNote(detail,'Privacy information');
      document.querySelector('.wrap')?.appendChild(privacy);
    }

    // Collapse static prose in the lower grade grid and volume sections.
    const gridCard=byId('grid')?.closest('.card');
    if(gridCard){
      const note=gridCard.querySelector('.note');
      if(note) collapseExistingNote(note,'Grade grid information');
    }
    const volumeCard=byId('cutYd')?.closest('.card');
    if(volumeCard){
      const note=volumeCard.querySelector('.note');
      if(note) collapseExistingNote(note,'Volume estimate information');
    }

    // Move top metrics down next to the volume summary.
    const metricsCard=document.querySelector('.metrics')?.closest('.card');
    if(metricsCard && volumeCard && metricsCard!==volumeCard){
      const summary=document.createElement('div'); summary.className='card v030-jobSummary';
      const title=document.createElement('div'); title.className='v030-sectionTitle'; title.innerHTML='<b>Job Summary</b>';
      summary.appendChild(title);
      const metrics=metricsCard.querySelector('.metrics'); if(metrics) summary.appendChild(metrics);
      const volume=volumeCard.querySelector('.volume'); if(volume) summary.appendChild(volume);
      volumeCard.after(summary);
      metricsCard.remove();
      if(!volumeCard.textContent.trim()) volumeCard.remove();
    }

    // Hide the obsolete GPS enable/status controls but leave IDs alive for legacy code.
    byId('gpsRefreshBtn')?.classList.add('v030-hidden');
    byId('gpsContextDisp')?.classList.add('v030-hidden');
  }

  function installUnifiedGps(){
    const oldStop=window.stopGpsWatch;
    window.stopGpsWatch=function(){
      if(gpsWatchId!=null && navigator.geolocation){
        try{ navigator.geolocation.clearWatch(gpsWatchId); }catch(e){}
      }
      gpsWatchId=null;
      if(typeof oldStop==='function' && oldStop!==window.stopGpsWatch){ /* no-op: native clear already done */ }
    };

    window.startGpsWatch=function(){
      if(!navigator.geolocation){
        gpsEnabled=false;
        gpsErrorText='GPS/geolocation is not available.';
        updateGpsUI();
        return;
      }
      if(gpsWatchId!=null) return;
      gpsErrorText='';
      try{
        gpsWatchId=navigator.geolocation.watchPosition(
          pos=>{
            ingestGpsPosition(pos);
            gpsEnabled=true;
            gpsErrorText='';
          },
          err=>{
            // Preserve a recent good shared fix instead of declaring location off
            // just because one watch callback timed out.
            const age=gpsPos&&gpsPos.timestamp?Date.now()-gpsPos.timestamp:Infinity;
            gpsEnabled=!!gpsPos && age<30000;
            gpsErrorText=gpsEnabled?'':explainGpsError(err);
            updateGpsUI();
          },
          {enableHighAccuracy:true,maximumAge:500,timeout:20000}
        );
      }catch(e){
        gpsWatchId=null; gpsEnabled=!!gpsPos; gpsErrorText=e?.message||'Could not start GPS.';
      }
    };

    window.requestGpsAccess=function(onSuccess){
      startGpsWatch();
      if(gpsPos && typeof onSuccess==='function') setTimeout(()=>onSuccess(gpsPos),0);
    };

    window.setMeasureMode=function(mode){
      measureMode=mode==='gps'?'gps':'manual';
      if(measureMode==='gps'){
        startGpsWatch();
        ensureGpsTarget();
      }else{
        stopGpsWatch();
      }
      saveLocal();
      updateGpsUI();
    };

    if(measureMode==='gps') startGpsWatch();
  }

  function bearingBetween(a,b){
    if(!a||!b) return null;
    const d=localDeltaFeet(a.lat,a.lon,b.lat,b.lon);
    return (Math.atan2(d.east,d.north)*180/Math.PI+360)%360;
  }

  function longAxisHeading(){
    if(typeof gpsFit==='undefined'||!gpsFit) return null;
    const s=cfg();
    const a=fitPointLatLon(0,0);
    const b=s.length>=s.width?fitPointLatLon(0,s.length):fitPointLatLon(s.width,0);
    return bearingBetween(a,b);
  }

  function formatAxisPair(h){
    if(!Number.isFinite(h)) return '—';
    const a=(h+360)%360,b=(a+180)%360;
    return `${a.toFixed(1)}° / ${b.toFixed(1)}°`;
  }

  function updateCalibrationResult(){
    const box=byId('v030CalibrationResult'); if(!box) return;
    if(typeof gpsFit==='undefined'||!gpsFit){ box.classList.remove('show'); return; }
    box.classList.add('show');
    byId('v030CalHeadline').textContent=`Calibration ${gpsFit.quality}`;
    const long=longAxisHeading();
    byId('v030LongHeading').textContent=formatAxisPair(long);
    byId('v030CrossHeading').textContent=formatAxisPair(Number.isFinite(long)?long+90:null);
    byId('v030Rms').textContent=`${gpsFit.rmsFt.toFixed(1)} ft`;
    byId('v030Worst').textContent=`${gpsFit.worstFt.toFixed(1)} ft`;
  }

  function updateTargetStatus(){
    const acc=byId('v030TargetAccuracy');
    if(!acc) return;
    if(gpsPos&&Number.isFinite(gpsPos.accuracy)) acc.textContent=`Position uncertainty ±${(gpsPos.accuracy*FT_PER_M_LOCAL).toFixed(gpsPos.accuracy*FT_PER_M_LOCAL<10?1:0)} ft`;
    else acc.textContent='Position unavailable';
  }

  // Correct device-relative compass semantics. Screen-up is phone forward;
  // target arrow is target bearing minus device heading; N floats around ring.
  const legacyRenderNavigation=window.renderNavigation;
  window.renderNavigation=function(tgt,d){
    if(typeof legacyRenderNavigation==='function') legacyRenderNavigation(tgt,d);
    const visual=byId('navVisual'),arrow=byId('navArrow'),north=byId('v030NorthMarker');
    if(!visual||!arrow||!north||!gpsFit||!gpsPos||!tgt) return;
    const h=preferredHeading();
    const bearing=targetBearingDeg(gpsPos,tgt);
    const relative=circularDifference(bearing,h.heading);
    arrow.style.transform=`rotate(${relative.toFixed(1)}deg)`;
    // North relative to phone-forward is -heading.
    north.style.transform=`rotate(${(-h.heading).toFixed(1)}deg)`;
    const nLabel=north.querySelector('span'); if(nLabel) nLabel.style.transform=`rotate(${h.heading.toFixed(1)}deg)`;
    const source=byId('navHeadingSource');
    if(source) source.textContent=h.source==='north-up'?'Heading unavailable — north-up fallback':`Phone-forward guidance • ${h.source}`;
  };

  function emptyFc(){ return {type:'FeatureCollection',features:[]}; }
  function sourceData(id,data){
    const map=window.__padGradeMapInstance; if(!map) return;
    const src=map.getSource(id); if(src&&src.setData) src.setData(data);
  }

  function gridPointFeatures(){
    if(typeof gpsFit==='undefined'||!gpsFit) return [];
    const s=cfg(),features=[];
    for(let r=0;r<s.rows;r++) for(let c=0;c<s.cols;c++){
      const idx=indexFromPoint(r,c),ll=targetLatLon(idx); if(!ll) continue;
      const val=readings[k(r,c)];
      let status='empty';
      if(Number.isFinite(val)){
        const diff=diffFor(val);
        status=Math.abs(diff)<=s.tol?'grade':diff<0?'cut':'fill';
      }
      if(idx===gpsTargetIndex) status='target';
      features.push({type:'Feature',properties:{r,c,idx,label:label(r,c),status},geometry:{type:'Point',coordinates:[ll.lon,ll.lat]}});
    }
    return features;
  }

  function gridLineFeatures(){
    if(typeof gpsFit==='undefined'||!gpsFit) return [];
    const s=cfg(),features=[];
    for(let r=0;r<s.rows;r++){
      const coords=[]; for(let c=0;c<s.cols;c++){const ll=targetLatLon(indexFromPoint(r,c)); if(ll) coords.push([ll.lon,ll.lat]);}
      if(coords.length>1) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
    }
    for(let c=0;c<s.cols;c++){
      const coords=[]; for(let r=0;r<s.rows;r++){const ll=targetLatLon(indexFromPoint(r,c)); if(ll) coords.push([ll.lon,ll.lat]);}
      if(coords.length>1) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}});
    }
    return features;
  }

  function outlineFeature(){
    if(typeof gpsFit==='undefined'||!gpsFit) return [];
    const s=cfg(),pts=[[0,0],[s.width,0],[s.width,s.length],[0,s.length],[0,0]].map(([x,y])=>fitPointLatLon(x,y)).filter(Boolean).map(p=>[p.lon,p.lat]);
    return pts.length===5?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:pts}}]:[];
  }

  function routeFeature(){
    if(typeof gpsFit==='undefined'||!gpsFit||gpsTargetIndex==null) return [];
    const route=gpsRoute(),start=Math.max(0,route.indexOf(gpsTargetIndex)),coords=[];
    for(let i=start;i<route.length&&coords.length<6;i++){
      const idx=route[i],p=pointFromIndex(idx); if(Number.isFinite(readings[k(p.r,p.c)])) continue;
      const ll=targetLatLon(idx); if(ll) coords.push([ll.lon,ll.lat]);
    }
    return coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[];
  }

  function installMapOverlays(){
    const map=window.__padGradeMapInstance; if(!map||overlayInstalled) return;
    const doInstall=()=>{
      if(overlayInstalled||!map.isStyleLoaded()) return;
      try{
        map.addSource('pad-grade-grid-lines',{type:'geojson',data:emptyFc()});
        map.addLayer({id:'pad-grade-grid-lines-layer',type:'line',source:'pad-grade-grid-lines',paint:{'line-color':'#d8f2ff','line-width':1,'line-opacity':0.55}});
        map.addSource('pad-grade-pad-outline',{type:'geojson',data:emptyFc()});
        map.addLayer({id:'pad-grade-pad-outline-layer',type:'line',source:'pad-grade-pad-outline',paint:{'line-color':'#ffffff','line-width':3,'line-opacity':0.95}});
        map.addSource('pad-grade-route',{type:'geojson',data:emptyFc()});
        map.addLayer({id:'pad-grade-route-layer',type:'line',source:'pad-grade-route',paint:{'line-color':'#ffd166','line-width':3,'line-opacity':0.8,'line-dasharray':[2,2]}});
        map.addSource('pad-grade-grid-points',{type:'geojson',data:emptyFc()});
        map.addLayer({id:'pad-grade-grid-points-layer',type:'circle',source:'pad-grade-grid-points',paint:{
          'circle-radius':['case',['==',['get','status'],'target'],9,6],
          'circle-color':['match',['get','status'],'target','#ffd166','cut','#a83a2b','fill','#315fa8','grade','#4f8f3a','#66717d'],
          'circle-stroke-color':'#ffffff','circle-stroke-width':['case',['==',['get','status'],'target'],3,1]
        }});
        map.addLayer({id:'pad-grade-grid-labels',type:'symbol',source:'pad-grade-grid-points',minzoom:18,layout:{'text-field':['get','label'],'text-size':10,'text-offset':[0,1.2],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#111820','text-halo-width':1.5}});
        map.on('click','pad-grade-grid-points-layer',e=>{
          const f=e.features&&e.features[0]; if(!f) return;
          const r=+f.properties.r,c=+f.properties.c; if(Number.isInteger(r)&&Number.isInteger(c)) openPoint(r,c);
        });
        map.on('mouseenter','pad-grade-grid-points-layer',()=>map.getCanvas().style.cursor='pointer');
        map.on('mouseleave','pad-grade-grid-points-layer',()=>map.getCanvas().style.cursor='');
        overlayInstalled=true;
        refreshMapOverlays(true);
      }catch(e){}
    };
    if(map.isStyleLoaded()) doInstall(); else map.once('load',doInstall);
  }

  function refreshMapOverlays(force=false){
    const map=window.__padGradeMapInstance; if(!map||!overlayInstalled) return;
    const sig=JSON.stringify({fit:!!gpsFit,target:gpsTargetIndex,readings,settings:cfg()});
    if(!force&&sig===lastOverlaySignature) return;
    lastOverlaySignature=sig;
    const points=gridPointFeatures();
    sourceData('pad-grade-grid-points',{type:'FeatureCollection',features:points});
    sourceData('pad-grade-grid-lines',{type:'FeatureCollection',features:gridLineFeatures()});
    sourceData('pad-grade-pad-outline',{type:'FeatureCollection',features:outlineFeature()});
    sourceData('pad-grade-route',{type:'FeatureCollection',features:routeFeature()});
  }

  function tick(){
    redesignDom();
    updateCalibrationResult();
    updateTargetStatus();
    installMapOverlays();
    refreshMapOverlays();
  }

  function boot(){
    redesignDom();
    installUnifiedGps();
    tick();
    overlayTimer=setInterval(tick,400);
    window.addEventListener('beforeunload',()=>{if(overlayTimer) clearInterval(overlayTimer);},{once:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
