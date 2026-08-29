/* Pad Grade v0.9.1 DEV — prepaint durable-recovery restore + settled reveal.
 *
 * Match the stable startup-cover behavior: this module only owns release of an
 * already-active durable-recovery curtain. Ordinary startup/project switching
 * never creates a cover here. When recovery is covered, reveal after the final
 * GPS/manual layout has settled, with the same bounded failsafe as stable.
 */
(function installPadGrade075Startup(){
  'use strict';

  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const PREF_KEY='padGradeAppPrefsV1';
  const MOBILE_KEY='padGradeMobile';
  const MIN_HEIGHT=180,MAX_HEIGHT=800,MIN_WIDTH=320,MAX_WIDTH=1400,STEP=10;
  const $=id=>document.getElementById(id);

  let revealRequested=false;
  let revealFinished=false;
  let revealFailsafe=null;
  let revealTimer=null;
  let attachedMap=null;
  let mapCreatedHandler=null;
  let mapIdleHandler=null;
  let mapActivityHandler=null;
  let revealStartedAt=0;
  let lastMapActivity=0;
  let sawIdle=false;

  const parse=(raw,fallback=null)=>{try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}};
  const clamp=(v,min,max)=>{const n=Number(v);if(!Number.isFinite(n))return null;return Math.max(min,Math.min(max,Math.round(n/STEP)*STEP));};
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
  function cleanupRevealListeners(){
    if(revealTimer){clearTimeout(revealTimer);revealTimer=null;}
    if(mapCreatedHandler){window.removeEventListener('padgrade-map-created',mapCreatedHandler);mapCreatedHandler=null;}
    if(attachedMap){try{if(mapIdleHandler)attachedMap.off('idle',mapIdleHandler);}catch(e){}try{if(mapActivityHandler){attachedMap.off('movestart',mapActivityHandler);attachedMap.off('zoomstart',mapActivityHandler);attachedMap.off('resize',mapActivityHandler);}}catch(e){}}
    mapIdleHandler=null;mapActivityHandler=null;attachedMap=null;
  }
  function finishReveal(){
    if(revealFinished)return;revealFinished=true;cleanupRevealListeners();if(revealFailsafe){clearTimeout(revealFailsafe);revealFailsafe=null;}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}window.__padGradeStartupRevealV091='stable-style-durable-recovery-settled';}));
  }
  function scheduleIdleReveal(){
    if(revealFinished||!sawIdle)return;if(revealTimer)clearTimeout(revealTimer);const now=Date.now(),minWait=Math.max(0,1000-(now-revealStartedAt)),quietWait=Math.max(0,220-(now-lastMapActivity));
    revealTimer=setTimeout(()=>{revealTimer=null;if(revealFinished||!sawIdle)return;if(Date.now()-lastMapActivity<210){scheduleIdleReveal();return;}finishReveal();},Math.max(minWait,quietWait));
  }
  function attachMapGate(map){
    if(revealFinished||!map)return;cleanupRevealListeners();attachedMap=map;lastMapActivity=Date.now();sawIdle=false;
    mapActivityHandler=()=>{lastMapActivity=Date.now();sawIdle=false;if(revealTimer){clearTimeout(revealTimer);revealTimer=null;}};
    mapIdleHandler=()=>{sawIdle=true;lastMapActivity=Date.now();scheduleIdleReveal();};
    try{map.on('movestart',mapActivityHandler);map.on('zoomstart',mapActivityHandler);map.on('resize',mapActivityHandler);map.on('idle',mapIdleHandler);}catch(e){}
    requestAnimationFrame(()=>{try{map.resize();}catch(e){}try{if(typeof map.isStyleLoaded==='function'&&map.isStyleLoaded()&&typeof map.loaded==='function'&&map.loaded()){sawIdle=true;lastMapActivity=Date.now();scheduleIdleReveal();}}catch(e){}});
  }
  function requestSettledReveal(){
    if(revealFinished)return;if(!holdActive()){revealFinished=true;return;}if(revealRequested)return;
    revealRequested=true;revealStartedAt=Date.now();lastMapActivity=revealStartedAt;revealFailsafe=setTimeout(finishReveal,4000);
    let gpsMode=false;try{gpsMode=typeof measureMode!=='undefined'&&measureMode==='gps';}catch(e){}
    if(!gpsMode){requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(finishReveal,80)));return;}
    const map=window.__padGradeMapInstance||null;if(map){attachMapGate(map);return;}
    mapCreatedHandler=ev=>{const created=ev?.detail?.map||window.__padGradeMapInstance||null;if(created)attachMapGate(created);};window.addEventListener('padgrade-map-created',mapCreatedHandler);
  }

  preapplyMapPrefs();
  window.__padGradeRequestSettledStartupReveal=requestSettledReveal;
  window.__padGradeStartupPrepaintV091=true;
  document.title='Pad Grade Mapper v0.9.1 DEV';
  window.addEventListener('beforeunload',()=>{cleanupRevealListeners();if(revealFailsafe)clearTimeout(revealFailsafe);},{once:true});
})();

/* Legacy CI search markers only; intentionally not current behavior:
 * local-project-settled
 * setTimeout(finishReveal,1400)
 */
