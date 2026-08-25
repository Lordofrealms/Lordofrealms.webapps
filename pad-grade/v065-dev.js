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
    document.title='Pad Grade Mapper v0.6.5 DEV';
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
