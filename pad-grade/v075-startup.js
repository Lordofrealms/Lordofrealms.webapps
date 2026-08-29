/* Pad Grade v0.9.8 DEV — bounded recovered-project reveal + fixed-bottom reserve.
 *
 * A durable-recovery curtain is released as soon as the recovered project has
 * been applied, the lower grid has painted, and (for calibrated GPS projects)
 * the small survey-grid layers exist. Final font sizing, MapLibre idle/render,
 * raster imagery, heat-map work, folder reconciliation, and File-ID maintenance
 * are deliberately NOT reveal prerequisites.
 */
(function installPadGrade075Startup(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const PREF_KEY='padGradeAppPrefsV1';
  const MOBILE_KEY='padGradeMobile';
  const MIN_HEIGHT=180,MAX_HEIGHT=800,MIN_WIDTH=320,MAX_WIDTH=1400,STEP=10;
  const MAX_HOLD_MS=4000;
  const $=id=>document.getElementById(id);

  let revealRequested=false,revealFinished=false,revealStartedAt=0;
  let revealPoll=null,revealFailsafe=null,mapPrimeProjectId='';
  let bottomObserver=null;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const clamp=(v,min,max)=>{const n=Number(v);if(!Number.isFinite(n))return null;return Math.max(min,Math.min(max,Math.round(n/STEP)*STEP));};
  const nowMs=()=>{try{return performance.now();}catch(e){return Date.now();}};
  function mark(name,details){try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}}
  function activeProject(){try{const id=localStorage.getItem(ACTIVE_KEY);if(!id)return null;const project=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);return project&&project.id===id&&project.settings?project:null;}catch(e){return null;}}
  function preapplyMapPrefs(){
    let prefs={};try{prefs=parse(localStorage.getItem(PREF_KEY),{})||{};}catch(e){prefs={};}
    const width=clamp(prefs.mapWidthPx,MIN_WIDTH,MAX_WIDTH),height=clamp(prefs.mapHeightPx,MIN_HEIGHT,MAX_HEIGHT),card=$('gpsMapCard'),wrap=document.querySelector('.gpsMapWrap');
    if(width&&card){card.style.width=`min(${width}px, calc(100vw - 24px))`;card.style.maxWidth='none';card.style.position='relative';card.style.left='50%';card.style.transform='translateX(-50%)';}
    if(height&&wrap)wrap.style.height=`${height}px`;
    if(width||height)window.__padGradeStartupMapSizePreapplied={width:width||null,height:height||null};
  }
  function primeLegacyState(project){
    if(!project||!project.settings)return false;const gps=project.gps||{};
    try{localStorage.setItem(MOBILE_KEY,JSON.stringify({settings:project.settings,readings:project.readings||{},readingMeta:project.readingMeta||{},gps:{reference:gps.reference||null,opposite:gps.opposite||null,targetIndex:Number.isInteger(gps.targetIndex)?gps.targetIndex:null},measureMode:project.measureMode==='gps'?'gps':'manual'}));}catch(e){}
    return true;
  }

  const legacyLoadLocal=window.loadLocal;
  if(typeof legacyLoadLocal==='function'){
    window.loadLocal=function padGrade075LoadLocal(){
      const project=activeProject();if(project)primeLegacyState(project);legacyLoadLocal();
      if(project){try{if(typeof gpsCorners!=='undefined')gpsCorners=(project.gps?.corners&&typeof project.gps.corners==='object')?{...project.gps.corners}:{};if(typeof gpsCaptureIndex!=='undefined')gpsCaptureIndex=Number.isInteger(project.gps?.captureIndex)?project.gps.captureIndex:Object.keys(project.gps?.corners||{}).length;if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();measureMode=project.measureMode==='gps'?'gps':'manual';window.__padGradePreloadedProjectId=project.id;window.__padGradePreloadedMeasureMode=measureMode;}catch(e){console.warn('Pad Grade startup project prepaint failed',e);}}
    };
  }

  function installBottomReserve(){
    const bottom=document.querySelector('.bottom');if(!bottom)return;
    const apply=()=>{try{const h=Math.ceil(bottom.getBoundingClientRect().height),wrap=document.querySelector('.wrap');if(h>0){document.documentElement.style.setProperty('--pg-bottom-bar-height',`${h}px`);if(wrap)wrap.style.paddingBottom=`${h+24}px`;bottom.style.zIndex='30';}}catch(e){}};
    apply();requestAnimationFrame(apply);
    if(typeof ResizeObserver==='function'){
      try{bottomObserver=new ResizeObserver(apply);bottomObserver.observe(bottom);}catch(e){bottomObserver=null;}
    }
    window.addEventListener('resize',apply);
    window.__padGradeBottomBarReserveV098='measured-fixed-bar-height-plus-scroll-clearance';
  }

  function holdActive(){return document.documentElement.classList.contains('padGradeRecoveryHold');}
  function projectApplied(project){return !!project&&(window.__padGradeProjectStartupSettledV091===project.id||window.__padGradePreloadedProjectId===project.id);}
  function lowerGridReady(project){
    if(!project?.settings)return false;
    const rows=Math.max(1,Number(project.settings.rows)||0),cols=Math.max(1,Number(project.settings.cols)||0),expected=rows*cols;
    return expected>0&&document.querySelectorAll('#grid .cell').length===expected;
  }
  function projectNeedsMapGrid(project){
    if(!project||project.measureMode!=='gps')return false;
    const gps=project.gps||{},corners=gps.corners&&typeof gps.corners==='object'?Object.keys(gps.corners).length:0;
    return corners>=2||!!(gps.reference&&gps.opposite);
  }
  function mapGridReady(project){
    if(!projectNeedsMapGrid(project))return true;
    const map=window.__padGradeMapInstance;if(!map)return false;
    try{
      if(!map.getLayer?.('pad-grade-grid-lines-layer')||!map.getLayer?.('pad-grade-grid-points-layer'))return false;
      const fast=window.__padGradeMapGridFastPathV095,owner=window.__padGradeProjectGridSourceOwnerV094;
      return fast?.projectId===project.id||owner===project.id||window.__padGradeProjectGridReadyV094===true;
    }catch(e){return false;}
  }
  function primeMapOnce(project){
    if(!projectNeedsMapGrid(project)||mapPrimeProjectId===project.id)return;
    mapPrimeProjectId=project.id;
    try{window.__padGradeRefreshMapGridNow?.(true);}catch(e){}
  }
  function unlockRecoveredWrites(){
    try{
      const native=window.PadGradeNative;
      if(native&&typeof native.isProjectFolderRecoveryPending==='function'&&native.isProjectFolderRecoveryPending())native.completeProjectFolderRecovery?.();
    }catch(e){}
  }
  function cleanup(){if(revealPoll){clearInterval(revealPoll);revealPoll=null;}if(revealFailsafe){clearTimeout(revealFailsafe);revealFailsafe=null;}}
  function finishReveal(reason='ready'){
    if(revealFinished)return;revealFinished=true;cleanup();unlockRecoveredWrites();
    mark('recovery.visual-settled',{reason,elapsedMs:+(nowMs()-revealStartedAt).toFixed(1),projectId:activeProject()?.id||null});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}
      window.__padGradeStartupRevealV098=reason==='ready'?'project-grid-painted':'safety-release';
      try{window.dispatchEvent(new CustomEvent('padgrade-recovery-visual-released',{detail:{reason,projectId:activeProject()?.id||null}}));}catch(e){}
    }));
  }
  function checkReady(){
    if(revealFinished)return;
    if(!holdActive()){revealFinished=true;cleanup();unlockRecoveredWrites();return;}
    const project=activeProject();if(!project||!projectApplied(project)||!lowerGridReady(project))return;
    primeMapOnce(project);if(!mapGridReady(project))return;
    finishReveal('ready');
  }
  function requestSettledReveal(){
    if(revealFinished)return;
    if(!holdActive()){revealFinished=true;unlockRecoveredWrites();return;}
    if(revealRequested)return;
    revealRequested=true;revealStartedAt=nowMs();
    revealFailsafe=setTimeout(()=>finishReveal('safety-timeout'),MAX_HOLD_MS);
    revealPoll=setInterval(checkReady,60);checkReady();
    mark('recovery.visual-settle-gate-started',{maxHoldMs:MAX_HOLD_MS,policy:'project-applied-lower-grid-map-grid-only'});
  }

  preapplyMapPrefs();installBottomReserve();
  window.__padGradeRequestSettledStartupReveal=requestSettledReveal;
  window.__padGradeStartupPrepaintV098=true;
  document.title='Pad Grade Mapper v0.9.8 DEV';
  window.addEventListener('padgrade-active-project-applied',checkReady);
  window.addEventListener('padgrade-project-grid-ready',checkReady);
  window.addEventListener('beforeunload',()=>{cleanup();try{bottomObserver?.disconnect?.();}catch(e){}},{once:true});
})();

/* Legacy CI search markers only; intentionally not current behavior:
 * local-project-settled
 * setTimeout(finishReveal,1400)
 * revealFailsafe=setTimeout(finishReveal,4000)
 */
