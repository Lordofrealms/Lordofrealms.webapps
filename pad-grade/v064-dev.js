/* Pad Grade v0.6.3 DEV — first-class project notes UI. */
(function installPadGrade064Notes(){
  'use strict';
  const $=id=>document.getElementById(id);
  let saveTimer=null;

  function saveNotesSoon(){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      try{saveLocal();}catch(e){}
      try{pgUpdateNotesSummary();}catch(e){}
    },120);
  }

  function install(){
    const textarea=$('projectNotes');
    const settings=$('settingsBtn');
    if(!textarea||!settings||$('notesBtn'))return;

    const oldField=textarea.closest('.field');
    const dlg=document.createElement('dialog');
    dlg.id='projectNotesDlg';
    dlg.innerHTML='<div class="modal"><h2>Project Notes</h2><div id="projectNotesFieldHost"></div><div class="small">Benchmarks, laser setup, site conditions, assumptions, or anything else you want saved with this project.</div><div class="modalActions"><button id="notesCloseBtn" class="primary" type="button">Done</button></div></div>';
    document.body.appendChild(dlg);
    const host=$('projectNotesFieldHost');
    if(oldField)host.appendChild(oldField);
    else host.appendChild(textarea);

    const btn=document.createElement('button');
    btn.id='notesBtn';btn.type='button';btn.textContent='Notes';
    settings.parentElement.insertBefore(btn,settings);
    btn.onclick=()=>{try{dlg.showModal();textarea.focus();}catch(e){}};
    $('notesCloseBtn').onclick=()=>{try{saveLocal();}catch(e){}try{pgUpdateNotesSummary();}catch(e){}dlg.close();};
    textarea.addEventListener('input',saveNotesSoon);
    dlg.addEventListener('close',()=>{try{saveLocal();}catch(e){}try{pgUpdateNotesSummary();}catch(e){}});

    // Keep Settings about configuration only; notes live behind their own button.
    try{pgUpdateNotesSummary();}catch(e){}
    window.__padGradeNotesUi='top-level-dialog';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

/* Pad Grade v1.1.4 DEV hotfix — exactly one normal heat raster may be visible.
 *
 * v1.1.3 correctly hid the prior canvas when a newer tier was added, but the
 * retained v063 sync path later called setLayerVisible(true), which explicitly
 * made both double-buffer canvas slots visible again. The v1.1.3 inspector's
 * Auto path also iterated all normal heat layers and could do the same thing.
 *
 * Keep double buffering for upload/retirement, but treat the newest added normal
 * heat layer as the sole active visual. Any later attempt to re-show a stale
 * slot is suppressed until a newer heat layer is actually added.
 */
(function installPadGradeSingleHeatGuardV114(){
  'use strict';
  if(window.__padGradeSingleHeatGuardV114)return;
  window.__padGradeSingleHeatGuardV114=true;

  const PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  let attachTimer=null;
  const isHeat=id=>String(id||'').startsWith(PREFIX);
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  function patchMap(map){
    if(!map||map.__padGradeSingleHeatGuardV114)return false;
    map.__padGradeSingleHeatGuardV114=true;

    const addLayer=map.addLayer.bind(map);
    const removeLayer=map.removeLayer.bind(map);
    const setLayoutProperty=map.setLayoutProperty.bind(map);
    let activeLayer='';

    function heatLayers(){
      try{return (map.getStyle?.()?.layers||[]).map(layer=>layer?.id||'').filter(isHeat);}catch(e){return [];}
    }
    function chooseExisting(){
      const ids=heatLayers();
      let visible='';
      for(const id of ids){
        try{if(map.getLayoutProperty?.(id,'visibility')!=='none')visible=id;}catch(e){}
      }
      activeLayer=visible||ids[ids.length-1]||'';
      return activeLayer;
    }
    function hideOthers(keep){
      for(const id of heatLayers()){
        if(id===keep)continue;
        try{if(map.getLayer(id))setLayoutProperty(id,'visibility','none');}catch(e){}
      }
    }

    chooseExisting();
    if(activeLayer)hideOthers(activeLayer);

    map.addLayer=function(layer,before){
      const result=addLayer(layer,before);
      const id=layer?.id||'';
      if(isHeat(id)){
        activeLayer=id;
        hideOthers(id);
        mark('heatmap.single-raster-active',{layer:id,reason:'layer-added'});
      }
      return result;
    };

    map.removeLayer=function(id){
      const wasActive=id===activeLayer;
      const result=removeLayer(id);
      if(wasActive)activeLayer='';
      return result;
    };

    map.setLayoutProperty=function(id,name,value){
      if(isHeat(id)&&name==='visibility'&&value==='visible'){
        if(!activeLayer||!this.getLayer?.(activeLayer))activeLayer=id;
        if(id!==activeLayer){
          try{if(this.getLayer?.(id))setLayoutProperty(id,'visibility','none');}catch(e){}
          mark('heatmap.stale-raster-show-suppressed',{requested:id,active:activeLayer});
          return this;
        }
        const result=setLayoutProperty(id,name,'visible');
        hideOthers(id);
        return result;
      }
      return setLayoutProperty(id,name,value);
    };

    window.__padGradeSingleHeatGuardStateV114=()=>({activeLayer,layers:heatLayers()});
    mark('heatmap.single-raster-guard-installed',{activeLayer});
    return true;
  }

  function attach(){
    const map=window.__padGradeMapInstance||null;
    if(map)patchMap(map);
  }

  window.addEventListener('padgrade-primary-map-captured',event=>patchMap(event?.detail?.map||window.__padGradeMapInstance));
  window.addEventListener('padgrade-map-created',event=>patchMap(event?.detail?.map||window.__padGradeMapInstance));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
  attachTimer=setInterval(()=>{attach();if(window.__padGradeMapInstance?.__padGradeSingleHeatGuardV114){clearInterval(attachTimer);attachTimer=null;}},500);
})();
