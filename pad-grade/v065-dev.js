/* Pad Grade v0.6.5 DEV — map controls live below the GPS map/key. */
(function installPadGrade065Ui(){
  'use strict';
  const $=id=>document.getElementById(id);
  let observer=null;

  function positionMapControls(){
    const card=$('gpsMapCard'),controls=$('gpsMapFieldControls');
    if(!card||!controls)return;
    const key=card.querySelector('.v030-mapLegend');
    const fallback=card.querySelector('.gpsMapFoot')||card.querySelector('.gpsMapWrap');
    const anchor=key||fallback;
    if(anchor&&controls.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',controls);
    Object.assign(controls.style,{
      display:'grid',gap:'6px',margin:'8px 0 0',padding:'8px 0 0',minWidth:'0',
      borderTop:'1px solid rgba(255,255,255,.12)'
    });
    const row=controls.firstElementChild;
    if(row)Object.assign(row.style,{display:'flex',gap:'7px',flexWrap:'wrap'});
  }

  function boot(){
    document.title='Pad Grade Mapper v0.7.2 DEV';
    positionMapControls();
    const card=$('gpsMapCard');
    if(card&&window.MutationObserver){
      observer=new MutationObserver(positionMapControls);
      observer.observe(card,{childList:true,subtree:false});
    }
    let passes=0;
    const timer=setInterval(()=>{
      positionMapControls();
      if(++passes>=30)clearInterval(timer);
    },300);
    window.addEventListener('beforeunload',()=>{if(observer)observer.disconnect();observer=null;},{once:true});
    window.__padGradeMapControlsLocation='below-map-key';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

/* v0.6.6 restores heatmap-as-default now that the mesh renderer is proven.
 * Do this synchronously before init.js loads project state, so the older v0.6.1
 * safety gate cannot force the first v0.6.6 session back off. */
try{
  if(localStorage.getItem('padGradeHeatmapDefaultOnV066')!=='1'){
    localStorage.setItem('padGradeHeatmapOptInV061','1');
    localStorage.setItem('padGradeHeatmapDefaultOnV066','1');
  }
}catch(e){}

/* v0.6.6 usability layer: default-on heatmap, transparency control, quick map
 * toggle, independent CUT/GRADE/FILL color scales, and compact scale legend. */
(function loadPadGrade066(){
  if(document.querySelector('script[data-padgrade-v066]'))return;
  const script=document.createElement('script');
  script.src='v066-dev.js?v=20260825-2';
  script.async=false;
  script.dataset.padgradeV066='1';
  script.onerror=()=>console.error('Pad Grade v0.6.6 heatmap UI module failed to load');
  document.body.appendChild(script);
})();

/* v0.7.2 keeps the v0.6.9 Advanced Settings UI and v0.7.0/v0.7.1 durable
 * recovery stack, then adds a final explicit last-project application pass.
 */
(function queuePadGrade072(){
  const load072=()=>{
    if(document.querySelector('script[data-padgrade-v072-project-restore]'))return;
    const script=document.createElement('script');
    script.src='v072-project-restore.js?v=20260825-1';
    script.async=false;
    script.dataset.padgradeV072ProjectRestore='1';
    script.onerror=()=>console.error('Pad Grade v0.7.2 last-project restore module failed to load');
    document.body.appendChild(script);
  };
  const load071MapUi=()=>{
    if(document.querySelector('script[data-padgrade-v071-map-ui]')){load072();return;}
    const script=document.createElement('script');
    script.src='v071-map-ui.js?v=20260825-1';
    script.async=false;
    script.dataset.padgradeV071MapUi='1';
    script.onload=load072;
    script.onerror=()=>{console.error('Pad Grade v0.7.1 progressive layer UI failed to load');load072();};
    document.body.appendChild(script);
  };
  const load071=()=>{
    if(document.querySelector('script[data-padgrade-v071]')){load071MapUi();return;}
    const script=document.createElement('script');
    script.src='v071-dev.js?v=20260825-1';
    script.async=false;
    script.dataset.padgradeV071='1';
    script.onload=load071MapUi;
    script.onerror=()=>{console.error('Pad Grade v0.7.1 recovery module failed to load');load071MapUi();};
    document.body.appendChild(script);
  };
  const load070=()=>{
    if(document.querySelector('script[data-padgrade-v070]')){load071();return;}
    const script=document.createElement('script');
    script.src='v070-dev.js?v=20260825-1';
    script.async=false;
    script.dataset.padgradeV070='1';
    script.onload=load071;
    script.onerror=()=>{console.error('Pad Grade v0.7.0 recovery compatibility module failed to load');load071();};
    document.body.appendChild(script);
  };
  const load069=()=>{
    if(document.querySelector('script[data-padgrade-v069]')){load070();return;}
    const script=document.createElement('script');
    script.src='v069-dev.js?v=20260825-2';
    script.async=false;
    script.dataset.padgradeV069='1';
    script.onload=load070;
    script.onerror=()=>{console.error('Pad Grade Advanced Settings UI module failed to load');load070();};
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load069,{once:true});
  else setTimeout(load069,0);
})();
