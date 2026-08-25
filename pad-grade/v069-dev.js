/* Pad Grade v0.6.9 DEV — bottom Notes action, Advanced Settings, configurable GPS map size. */
(function installPadGrade069Ui(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const MIN_HEIGHT=180;
  const MAX_HEIGHT=800;
  const MIN_WIDTH=320;
  const MAX_WIDTH=1400;
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

  function clamp(v,min,max){
    const n=Number(v);
    if(!Number.isFinite(n))return null;
    return Math.max(min,Math.min(max,Math.round(n/STEP)*STEP));
  }
  const clampHeight=v=>clamp(v,MIN_HEIGHT,MAX_HEIGHT);
  const clampWidth=v=>clamp(v,MIN_WIDTH,MAX_WIDTH);

  function cssDefaultHeight(){
    const wrap=document.querySelector('.gpsMapWrap');
    if(!wrap)return window.innerWidth<=520?205:230;
    const n=parseFloat(getComputedStyle(wrap).height);
    return clampHeight(n)||(window.innerWidth<=520?205:230);
  }

  function cssDefaultWidth(){
    const card=$('gpsMapCard');
    if(!card)return Math.min(760,Math.max(MIN_WIDTH,window.innerWidth-24));
    const n=parseFloat(getComputedStyle(card).width);
    return clampWidth(n)||Math.min(760,Math.max(MIN_WIDTH,window.innerWidth-24));
  }

  function resizeMapSoon(){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.__padGradeMapInstance?.resize();}catch(e){}
    }));
  }

  function applyMapHeight(raw,persist=false){
    const h=clampHeight(raw)||cssDefaultHeight();
    const wrap=document.querySelector('.gpsMapWrap');
    if(wrap)wrap.style.height=`${h}px`;
    const slider=$('v069MapHeight'),out=$('v069MapHeightValue');
    if(slider&&+slider.value!==h)slider.value=String(h);
    if(out)out.textContent=`${h} px`;
    if(persist)writePrefs({mapHeightPx:h});
    resizeMapSoon();
    return h;
  }

  function applyMapWidth(raw,persist=false){
    const w=clampWidth(raw)||cssDefaultWidth();
    const card=$('gpsMapCard');
    if(card){
      // Allow a tablet/desktop map to exceed the normal 760 px app column while
      // still capping to the actual viewport so phones never scroll sideways.
      card.style.width=`min(${w}px, calc(100vw - 24px))`;
      card.style.maxWidth='none';
      card.style.position='relative';
      card.style.left='50%';
      card.style.transform='translateX(-50%)';
    }
    const slider=$('v069MapWidth'),out=$('v069MapWidthValue');
    if(slider&&+slider.value!==w)slider.value=String(w);
    if(out)out.textContent=`${w} px`;
    if(persist)writePrefs({mapWidthPx:w});
    resizeMapSoon();
    return w;
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

  function ensureAdvancedSettings(){
    let details=$('v069AdvancedSettings');
    if(details)return details;
    const modal=$('settingsDlg')?.querySelector('.modal');
    const actions=modal?.querySelector('.modalActions');
    if(!modal||!actions)return null;
    details=document.createElement('details');
    details.id='v069AdvancedSettings';
    details.style.marginTop='14px';
    details.innerHTML='<summary style="cursor:pointer;font-weight:800;padding:9px 0">Advanced Settings</summary><div id="v069AdvancedSettingsBody" style="display:grid;gap:12px;padding:4px 0 6px"></div>';
    actions.insertAdjacentElement('beforebegin',details);
    return details;
  }

  function makeRangeRow(id,title,min,max,value,left,right){
    const row=document.createElement('div');
    row.className='v040-rangeRow';
    row.id=`${id}Row`;
    row.innerHTML=`
      <div class="v040-rangeHeader"><b>${title}</b><span id="${id}Value">${value} px</span></div>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${STEP}" value="${value}" aria-label="${title}">
      <div class="v040-rangeEnds"><span>${left}</span><span>${right}</span></div>`;
    return row;
  }

  function installMapSizeSettings(){
    const details=ensureAdvancedSettings(),body=$('v069AdvancedSettingsBody');
    if(!details||!body)return false;
    const p=readPrefs();

    if(!$('v069MapWidth')){
      const initial=clampWidth(p.mapWidthPx)||cssDefaultWidth();
      body.appendChild(makeRangeRow('v069MapWidth','GPS map width',MIN_WIDTH,MAX_WIDTH,initial,`${MIN_WIDTH} px • phone`,` ${MAX_WIDTH} px • tablet`));
      const slider=$('v069MapWidth');
      slider.addEventListener('input',()=>applyMapWidth(slider.value,false));
      slider.addEventListener('change',()=>{applyMapWidth(slider.value,true);try{saveLocal();}catch(e){}});
      applyMapWidth(initial,false);
    }

    if(!$('v069MapHeight')){
      const initial=clampHeight(p.mapHeightPx)||cssDefaultHeight();
      body.appendChild(makeRangeRow('v069MapHeight','GPS map height',MIN_HEIGHT,MAX_HEIGHT,initial,`${MIN_HEIGHT} px • compact`,`${MAX_HEIGHT} px • large`));
      const slider=$('v069MapHeight');
      slider.addEventListener('input',()=>applyMapHeight(slider.value,false));
      slider.addEventListener('change',()=>{applyMapHeight(slider.value,true);try{saveLocal();}catch(e){}});
      applyMapHeight(initial,false);
    }
    return true;
  }

  function moveTuningControlsIntoAdvanced(){
    const body=$('v069AdvancedSettingsBody');
    if(!body)return false;
    // These are visual/tuning controls; keep core pad and workflow settings visible.
    const minFont=$('v040MinGridFont')?.closest('.v040-rangeRow');
    const heat=$('heatmapTransparency')?.closest('.heatmapTransparencySetting');
    if(minFont&&minFont.parentElement!==body)body.insertBefore(minFont,body.firstChild||null);
    if(heat&&heat.parentElement!==body){
      const widthRow=$('v069MapWidthRow');
      if(widthRow)body.insertBefore(heat,widthRow);
      else body.appendChild(heat);
    }
    return !!(minFont||heat);
  }

  function restoreSavedMapSize(){
    const p=readPrefs();
    const width=clampWidth(p.mapWidthPx),height=clampHeight(p.mapHeightPx);
    if(width)applyMapWidth(width,false);
    if(height)applyMapHeight(height,false);
    if(!width&&!height)resizeMapSoon();
  }

  function boot(){
    document.title='Pad Grade Mapper v0.6.9 DEV';
    moveNotesButton();
    ensureAdvancedSettings();
    installMapSizeSettings();
    moveTuningControlsIntoAdvanced();

    let tries=0;
    retryTimer=setInterval(()=>{
      const notesReady=moveNotesButton();
      const sizeReady=installMapSizeSettings();
      moveTuningControlsIntoAdvanced();
      if((notesReady&&sizeReady&&$('v040MinGridFont')&&$('heatmapTransparency'))||++tries>40){clearInterval(retryTimer);retryTimer=null;}
    },200);

    window.addEventListener('padgrade-map-created',restoreSavedMapSize);
    window.addEventListener('resize',()=>{
      // CSS min() handles viewport caps; MapLibre still needs to recalculate its canvas.
      resizeMapSoon();
    });
    window.addEventListener('beforeunload',()=>{if(retryTimer)clearInterval(retryTimer);retryTimer=null;},{once:true});
    window.__padGradeAdvancedSettingsV069=true;
    window.__padGradeMapSizeSettingV069=true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
