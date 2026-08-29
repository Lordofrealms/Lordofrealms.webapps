/* Pad Grade v0.6.5 DEV — map controls live below the GPS map/key. */
(function installPadGrade065Ui(){
  'use strict';
  const $=id=>document.getElementById(id);
  let observer=null;
  function positionMapControls(){const card=$('gpsMapCard'),controls=$('gpsMapFieldControls');if(!card||!controls)return;const key=card.querySelector('.v030-mapLegend'),fallback=card.querySelector('.gpsMapFoot')||card.querySelector('.gpsMapWrap'),anchor=key||fallback;if(anchor&&controls.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',controls);Object.assign(controls.style,{display:'grid',gap:'6px',margin:'8px 0 0',padding:'8px 0 0',minWidth:'0',borderTop:'1px solid rgba(255,255,255,.12)'});const row=controls.firstElementChild;if(row)Object.assign(row.style,{display:'flex',gap:'7px',flexWrap:'wrap'});}
  function boot(){document.title='Pad Grade Mapper v0.9.0 DEV';positionMapControls();const card=$('gpsMapCard');if(card&&window.MutationObserver){observer=new MutationObserver(positionMapControls);observer.observe(card,{childList:true,subtree:false});}let passes=0;const timer=setInterval(()=>{positionMapControls();if(++passes>=30)clearInterval(timer);},300);window.addEventListener('beforeunload',()=>{if(observer)observer.disconnect();observer=null;},{once:true});window.__padGradeMapControlsLocation='below-map-key';}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
try{if(localStorage.getItem('padGradeHeatmapDefaultOnV066')!=='1'){localStorage.setItem('padGradeHeatmapOptInV061','1');localStorage.setItem('padGradeHeatmapDefaultOnV066','1');}}catch(e){}
(function loadPadGrade066(){if(document.querySelector('script[data-padgrade-v066]'))return;const script=document.createElement('script');script.src='v066-dev.js?v=20260825-4';script.async=false;script.dataset.padgradeV066='1';script.onerror=()=>console.error('Pad Grade v0.6.6 heatmap UI module failed to load');document.body.appendChild(script);})();

/* v0.9.0: cached local project first; durable reconciliation stays background,
 * while the head curtain is released by the settled-render owner. */
(function loadPadGrade087Recovery(){
  const load072=()=>{if(document.querySelector('script[data-padgrade-v072-project-restore]'))return;const script=document.createElement('script');script.src='v072-project-restore.js?v=20260829-3';script.async=false;script.dataset.padgradeV072ProjectRestore='1';script.onerror=()=>{console.error('Pad Grade v0.9.0 last-project restore module failed to load');try{window.__padGradeEndRecoveryVisualHold?.();}catch(e){}};document.body.appendChild(script);};
  const load069=()=>{if(document.querySelector('script[data-padgrade-v069]')){load072();return;}const script=document.createElement('script');script.src='v069-dev.js?v=20260825-2';script.async=false;script.dataset.padgradeV069='1';script.onload=load072;script.onerror=()=>{console.error('Pad Grade Advanced Settings UI module failed to load');load072();};document.body.appendChild(script);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load069,{once:true});else setTimeout(load069,0);
})();

(function loadPadGrade078(){
  const loadActivation=()=>{if(document.querySelector('script[data-padgrade-v078]'))return;const script=document.createElement('script');script.src='v078-dev.js?v=20260829-3';script.async=false;script.dataset.padgradeV078='1';script.onerror=()=>console.error('Pad Grade current activation module failed to load');document.body.appendChild(script);};
  const loadProbe=()=>{if(document.querySelector('script[data-padgrade-v076]')){loadActivation();return;}const script=document.createElement('script');script.src='v076-dev.js?v=20260826-1';script.async=false;script.dataset.padgradeV076='1';script.onload=loadActivation;script.onerror=()=>{console.error('Pad Grade v0.7.6 probe module failed to load');loadActivation();};document.body.appendChild(script);};
  if(window.PadGradeLocalSurface&&window.__padGradeSurfaceLocalVersion==='0.7.8'){loadProbe();return;}
  const old=document.querySelector('script[data-padgrade-surface-v078]');if(old)return;
  const shared=document.createElement('script');shared.src='surface-local-v078.js?v=20260826-1';shared.async=false;shared.dataset.padgradeSurfaceV078='1';shared.onload=()=>{window.__padGradeSurfaceLocalVersion='0.7.8';loadProbe();};shared.onerror=()=>console.error('Pad Grade v0.7.8 shared surface module failed to load');document.body.appendChild(shared);
})();

/* v0.8.8: reserve the File-ID text row immediately whenever project-list rows
 * are rebuilt so later File-ID hydration cannot move action buttons. */
(function loadPadGrade088ProjectListLayout(){if(document.querySelector('script[data-padgrade-v088-project-list-layout]'))return;const script=document.createElement('script');script.src='v088-project-list-layout.js?v=20260829-1';script.async=false;script.dataset.padgradeV088ProjectListLayout='1';script.onerror=()=>console.error('Pad Grade v0.8.8 project-list layout module failed to load');document.body.appendChild(script);})();

/* Legacy CI search markers only: v072-project-restore.js?v=20260829-1 v078-dev.js?v=20260829-2 */
