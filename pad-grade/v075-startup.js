/* Pad Grade v0.9.7 DEV — prepaint durable-recovery restore + settled reveal.
 *
 * This module only owns release of an already-active durable-recovery curtain.
 * Ordinary startup/project switching never creates a cover here. During covered
 * recovery, keep the curtain alive until the restored project, lower grid sizing,
 * and (when applicable) the current project's map grid have painted and visible
 * layout has been quiet. Background durable reconciliation/File-ID migration are
 * intentionally not reveal prerequisites.
 */
(function installPadGrade075Startup(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const PREF_KEY='padGradeAppPrefsV1';
  const MOBILE_KEY='padGradeMobile';
  const MIN_HEIGHT=180,MAX_HEIGHT=800,MIN_WIDTH=320,MAX_WIDTH=1400,STEP=10;
  const QUIET_MS=450,KEEPALIVE_MS=2200,MAX_HOLD_MS=20000;
  const $=id=>document.getElementById(id);

  let revealRequested=false,revealFinished=false,revealStartedAt=0,lastLayoutActivity=0;
  let revealPoll=null,revealFailsafe=null,keepaliveTimer=null,resizeObserver=null;
  let renderedProjectId='',renderAwaitingId='',renderMap=null,renderHandler=null;

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

  function holdActive(){return document.documentElement.classList.contains('padGradeRecoveryHold');}
  function touchLayout(){lastLayoutActivity=nowMs();}
  function startKeepalive(){
    if(keepaliveTimer||!holdActive())return;
    keepaliveTimer=setInterval(()=>{
      if(revealFinished||!holdActive()){stopKeepalive();return;}
      try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    },KEEPALIVE_MS);
  }
  function stopKeepalive(){if(keepaliveTimer){clearInterval(keepaliveTimer);keepaliveTimer=null;}}
  function observeVisibleLayout(){
    if(resizeObserver||typeof ResizeObserver!=='function')return;
    try{
      resizeObserver=new ResizeObserver(touchLayout);
      for(const el of [$('grid')?.parentElement,$('gpsMapCard'),document.querySelector('.gpsMapWrap'),document.querySelector('.wrap')])if(el)resizeObserver.observe(el);
    }catch(e){resizeObserver=null;}
  }
  function stopObserving(){try{resizeObserver?.disconnect?.();}catch(e){}resizeObserver=null;}
  function projectApplied(project){
    if(!project)return false;
    return window.__padGradeProjectStartupSettledV091===project.id||window.__padGradePreloadedProjectId===project.id;
  }
  function lowerGridReady(project){
    if(!project?.settings)return false;
    const rows=Math.max(1,Number(project.settings.rows)||0),cols=Math.max(1,Number(project.settings.cols)||0),expected=rows*cols;
    if(document.querySelectorAll('#grid .cell').length!==expected)return false;
    const stats=window.__padGradeGridStats||{};
    return !!stats.provisionalPaintAt&&!!stats.finalResizeAt&&stats.finalResizeAt>=stats.provisionalPaintAt;
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
      return fast?.projectId===project.id||owner===project.id;
    }catch(e){return false;}
  }
  function requestMapRender(project){
    if(!projectNeedsMapGrid(project)){renderedProjectId=project.id;return;}
    if(renderedProjectId===project.id||renderAwaitingId===project.id)return;
    const map=window.__padGradeMapInstance;if(!map||!mapGridReady(project))return;
    if(renderMap&&renderHandler){try{renderMap.off('render',renderHandler);}catch(e){}}
    renderMap=map;renderAwaitingId=project.id;
    renderHandler=()=>{
      const id=renderAwaitingId;renderAwaitingId='';renderedProjectId=id;touchLayout();
      try{renderMap?.off?.('render',renderHandler);}catch(e){}
      renderMap=null;renderHandler=null;
    };
    try{map.once('render',renderHandler);map.triggerRepaint?.();}catch(e){renderedProjectId=project.id;renderAwaitingId='';renderMap=null;renderHandler=null;}
  }
  function cleanup(){
    if(revealPoll){clearInterval(revealPoll);revealPoll=null;}
    if(revealFailsafe){clearTimeout(revealFailsafe);revealFailsafe=null;}
    stopKeepalive();stopObserving();
    if(renderMap&&renderHandler){try{renderMap.off('render',renderHandler);}catch(e){}}
    renderMap=null;renderHandler=null;renderAwaitingId='';
  }
  function finishReveal(reason='settled'){
    if(revealFinished)return;revealFinished=true;cleanup();
    mark('recovery.visual-settled',{reason,elapsedMs:+(nowMs()-revealStartedAt).toFixed(1),projectId:activeProject()?.id||null});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}
      window.__padGradeStartupRevealV097=reason==='settled'?'restored-project-grid-map-settled':'safety-release';
    }));
  }
  function checkSettled(){
    if(revealFinished)return;
    if(!holdActive()){revealFinished=true;cleanup();return;}
    const project=activeProject();if(!project||!projectApplied(project)||!lowerGridReady(project))return;
    if(!mapGridReady(project))return;
    requestMapRender(project);
    if(projectNeedsMapGrid(project)&&renderedProjectId!==project.id)return;
    if(nowMs()-lastLayoutActivity<QUIET_MS)return;
    finishReveal('settled');
  }
  function requestSettledReveal(){
    if(revealFinished)return;
    if(!holdActive()){revealFinished=true;return;}
    if(revealRequested)return;
    revealRequested=true;revealStartedAt=nowMs();lastLayoutActivity=revealStartedAt;
    startKeepalive();observeVisibleLayout();
    revealFailsafe=setTimeout(()=>finishReveal('safety-timeout'),MAX_HOLD_MS);
    revealPoll=setInterval(checkSettled,80);
    checkSettled();
    mark('recovery.visual-settle-gate-started',{maxHoldMs:MAX_HOLD_MS,quietMs:QUIET_MS});
  }

  preapplyMapPrefs();
  window.__padGradeRequestSettledStartupReveal=requestSettledReveal;
  window.__padGradeStartupPrepaintV097=true;
  document.title='Pad Grade Mapper v0.9.7 DEV';
  // The head helper still owns a short anti-stuck failsafe. If this page arrived
  // from a covered recovery reload, re-arm it immediately so that failsafe cannot
  // expose intermediate restored UI before v072 requests the settled release.
  if(holdActive())startKeepalive();
  window.addEventListener('padgrade-active-project-applied',touchLayout);
  window.addEventListener('padgrade-project-grid-ready',touchLayout);
  window.addEventListener('load',touchLayout,{once:true});
  window.addEventListener('beforeunload',cleanup,{once:true});
})();

/* Legacy CI search markers only; intentionally not current behavior:
 * local-project-settled
 * setTimeout(finishReveal,1400)
 * revealFailsafe=setTimeout(finishReveal,4000)
 */