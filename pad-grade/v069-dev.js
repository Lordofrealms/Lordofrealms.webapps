/* Pad Grade v0.6.9 DEV — bottom Notes action and configurable GPS map height. */
(function installPadGrade069Ui(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const MIN_HEIGHT=180;
  const MAX_HEIGHT=800;
  const STEP=10;
  const $=id=>document.getElementById(id);
  let retryTimer=null;

  function readPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');
      return p&&typeof p==='object'?p:{};
    }catch(e){return {};}
  }

  function writePrefs(next){
    try{localStorage.setItem(PREF_KEY,JSON.stringify({...readPrefs(),...next}));}catch(e){}
  }

  function clampHeight(v){
    const n=Number(v);
    if(!Number.isFinite(n))return null;
    return Math.max(MIN_HEIGHT,Math.min(MAX_HEIGHT,Math.round(n/STEP)*STEP));
  }

  function cssDefaultHeight(){
    const wrap=document.querySelector('.gpsMapWrap');
    if(!wrap)return window.innerWidth<=520?205:230;
    const n=parseFloat(getComputedStyle(wrap).height);
    return clampHeight(n)||(window.innerWidth<=520?205:230);
  }

  function resizeMapSoon(){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        try{window.__padGradeMapInstance?.resize();}catch(e){}
      });
    });
  }

  function applyMapHeight(raw,persist=false){
    const h=clampHeight(raw)||cssDefaultHeight();
    const wrap=document.querySelector('.gpsMapWrap');
    if(wrap)wrap.style.height=`${h}px`;
    const slider=$('v069MapHeight');
    const out=$('v069MapHeightValue');
    if(slider&&+slider.value!==h)slider.value=String(h);
    if(out)out.textContent=`${h} px`;
    if(persist)writePrefs({mapHeightPx:h});
    resizeMapSoon();
    return h;
  }

  function moveNotesButton(){
    const btn=$('notesBtn');
    const next=$('nextBtn');
    const actions=$('exportProjectBtn')?.closest('.buttons');
    if(!btn||!actions)return false;
    if(btn.parentElement!==actions){
      if(next&&next.parentElement===actions)next.insertAdjacentElement('afterend',btn);
      else actions.insertBefore(btn,actions.firstChild||null);
    }
    window.__padGradeNotesUi='bottom-actions-dialog';
    return true;
  }

  function installMapHeightSetting(){
    if($('v069MapHeight'))return true;
    const modal=$('settingsDlg')?.querySelector('.modal');
    const actions=modal?.querySelector('.modalActions');
    if(!modal||!actions)return false;

    const currentPrefs=readPrefs();
    const initial=clampHeight(currentPrefs.mapHeightPx)||cssDefaultHeight();
    const row=document.createElement('div');
    row.className='v040-rangeRow';
    row.id='v069MapHeightRow';
    row.innerHTML=`
      <div class="v040-rangeHeader"><b>GPS map height</b><span id="v069MapHeightValue">${initial} px</span></div>
      <input id="v069MapHeight" type="range" min="${MIN_HEIGHT}" max="${MAX_HEIGHT}" step="${STEP}" value="${initial}" aria-label="GPS map height in pixels">
      <div class="v040-rangeEnds"><span>${MIN_HEIGHT} px • compact</span><span>${MAX_HEIGHT} px • large</span></div>`;
    actions.insertAdjacentElement('beforebegin',row);

    const slider=$('v069MapHeight');
    slider.addEventListener('input',()=>applyMapHeight(slider.value,false));
    slider.addEventListener('change',()=>{
      applyMapHeight(slider.value,true);
      try{saveLocal();}catch(e){}
    });
    applyMapHeight(initial,false);
    return true;
  }

  function boot(){
    document.title='Pad Grade Mapper v0.6.9 DEV';
    moveNotesButton();
    installMapHeightSetting();

    let tries=0;
    retryTimer=setInterval(()=>{
      const notesReady=moveNotesButton();
      const heightReady=installMapHeightSetting();
      if((notesReady&&heightReady)||++tries>30){clearInterval(retryTimer);retryTimer=null;}
    },200);

    window.addEventListener('padgrade-map-created',()=>{
      const saved=clampHeight(readPrefs().mapHeightPx);
      if(saved)applyMapHeight(saved,false);
      else resizeMapSoon();
    });
    window.addEventListener('beforeunload',()=>{if(retryTimer)clearInterval(retryTimer);retryTimer=null;},{once:true});
    window.__padGradeMapHeightSettingV069=true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
