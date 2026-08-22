/* Pad Grade v0.4.8 — in-place project switching + reliable font-only grid scaler. */
(function installPadGradeV048(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const $=id=>document.getElementById(id);
  const nowIso=()=>new Date().toISOString();

  function readJson(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key)||'null');return value==null?fallback:value;}
    catch(e){return fallback;}
  }
  function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function projectKey(id){return PROJECT_PREFIX+id;}

  function currentGpsPayload(){
    const gps={reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex};
    try{if(typeof gpsCorners!=='undefined'&&gpsCorners&&typeof gpsCorners==='object')gps.corners=gpsCorners;}catch(e){}
    try{if(typeof gpsCaptureIndex==='number')gps.captureIndex=gpsCaptureIndex;}catch(e){}
    return gps;
  }

  // Save the project that is actually on screen BEFORE changing ACTIVE_KEY.
  // This avoids the old reload race where v0.4.0's beforeunload autosave wrote
  // its stale in-memory activeId back over the project the user just selected.
  function saveCurrentProjectNow(){
    const id=localStorage.getItem(ACTIVE_KEY);
    if(!id)return null;
    const old=readJson(projectKey(id),{})||{};
    const settings=cfg();
    const project={
      ...old,
      app:'Pad Grade Mapper Mobile',
      schemaVersion:5,
      version:5,
      id,
      createdAt:old.createdAt||nowIso(),
      modifiedAt:nowIso(),
      status:old.status==='archived'?'archived':'open',
      settings,
      readings:{...readings},
      readingMeta:{...readingMeta},
      gps:currentGpsPayload(),
      measureMode:measureMode==='gps'?'gps':'manual',
      migration:old.migration||{sourceVersion:Number(old.schemaVersion||old.version||5)}
    };
    writeJson(projectKey(id),project);

    const index=readJson(INDEX_KEY,[]);
    if(Array.isArray(index)){
      const meta={id,name:settings.name||'Pad',modifiedAt:project.modifiedAt,createdAt:project.createdAt,status:project.status};
      const item=index.find(x=>x.id===id);
      if(item)Object.assign(item,meta);else index.push(meta);
      writeJson(INDEX_KEY,index);
    }

    try{
      if(window.PadGradeNative&&typeof PadGradeNative.hasProjectFolder==='function'&&PadGradeNative.hasProjectFolder()&&typeof PadGradeNative.writeProjectFile==='function'){
        PadGradeNative.writeProjectFile(`${id}.padgrade`,JSON.stringify(project));
      }
    }catch(e){}
    return project;
  }

  function repairedProject(id){
    let project=readJson(projectKey(id),null);
    if(!project)return null;
    try{
      if(typeof window.__padGradeRepairProject==='function'){
        const fixed=window.__padGradeRepairProject(project);
        if(fixed&&fixed.project){
          project=fixed.project;
          if(fixed.changed)writeJson(projectKey(id),project);
        }
      }
    }catch(e){}
    return project;
  }

  function applyProject(project){
    if(!project||typeof project!=='object')return false;
    const s=project.settings||{};
    const fields={width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name};
    for(const [id,value] of Object.entries(fields))if($(id)&&value!==undefined)$(id).value=value;

    readings={...(project.readings||{})};
    readingMeta={...(project.readingMeta||{})};
    gpsRef=project.gps?.reference||null;
    gpsOpposite=project.gps?.opposite||null;
    gpsTargetIndex=Number.isInteger(project.gps?.targetIndex)?project.gps.targetIndex:null;
    try{
      if(typeof gpsCorners!=='undefined')gpsCorners=(project.gps?.corners&&typeof project.gps.corners==='object')?project.gps.corners:{};
      if(typeof gpsCaptureIndex!=='undefined')gpsCaptureIndex=Number.isInteger(project.gps?.captureIndex)?project.gps.captureIndex:Object.keys(project.gps?.corners||{}).length;
      if(typeof syncLegacyCalibration==='function')syncLegacyCalibration();
    }catch(e){}
    measureMode=project.measureMode==='gps'?'gps':'manual';

    try{updateCornerPicker();}catch(e){}
    try{renderGrid();}catch(e){}
    try{updateGpsUI();}catch(e){}
    try{refreshGpsContext();}catch(e){}
    try{refreshMapOverlays(true);}catch(e){}
    return true;
  }

  function switchProject(id){
    id=String(id||'');
    if(!id)return false;
    const index=readJson(INDEX_KEY,[]);
    const item=Array.isArray(index)?index.find(x=>x.id===id):null;
    if(!item||item.status==='archived')return false;

    const current=localStorage.getItem(ACTIVE_KEY);
    if(id===current){
      try{$('projectsDlg')?.close();}catch(e){}
      return true;
    }

    const target=repairedProject(id);
    if(!target){alert('That project could not be opened because its saved data is missing.');return false;}

    saveCurrentProjectNow();
    localStorage.setItem(ACTIVE_KEY,id);

    // Refresh v0.4.0's private activeId from storage so all later autosaves now
    // belong to the newly selected project instead of the project we just left.
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}

    if(!applyProject(target))return false;
    try{window.__padGradeRefreshProjectIndex?.();}catch(e){}
    try{$('projectsDlg')?.close();}catch(e){}
    try{window.dispatchEvent(new CustomEvent('padgrade-project-switched',{detail:{from:current,to:id}}));}catch(e){}
    return true;
  }

  function installProjectOpenInterceptor(){
    const dlg=$('projectsDlg');
    if(!dlg||dlg.dataset.v048ProjectOpen==='1')return;
    dlg.dataset.v048ProjectOpen='1';
    dlg.addEventListener('click',event=>{
      const button=event.target&&event.target.closest?event.target.closest('button[data-act="open"]'):null;
      if(!button||!dlg.contains(button))return;
      const row=button.closest('[data-id]');
      if(!row)return;
      // Capture phase intentionally prevents v0.4.1's old location.reload()
      // handler from running after this in-place switch completes.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      switchProject(row.dataset.id);
    },true);
  }

  function prefs(){
    const p=readJson(PREF_KEY,{});
    return {minGridFont:2,gridFitScale:.40,...(p&&typeof p==='object'?p:{})};
  }
  function savePrefs(next){writeJson(PREF_KEY,{...prefs(),...next});}

  function updateScaleReadout(percent){
    requestAnimationFrame(()=>{
      const label=$('v045GridFitScaleValue');
      const grid=$('grid');
      if(!label||!grid)return;
      const font=parseFloat(getComputedStyle(grid).getPropertyValue('--grid-font'));
      label.textContent=Number.isFinite(font)?`${percent}% • ${font.toFixed(1)} px`:`${percent}%`;
    });
  }

  function installGridScaleControl(){
    const old=$('v045GridFitScale');
    if(!old||old.dataset.v048Scale==='1')return;

    // Clone drops v0.4.5's closed-over input listener. That listener called the
    // obsolete renderGridV045() directly, which is why the slider appeared to
    // ignore the newer font-only v0.4.7 sizing rules.
    const slider=old.cloneNode(true);
    slider.dataset.v048Scale='1';
    old.replaceWith(slider);

    const row=slider.closest('.v040-rangeRow');
    const title=row?.querySelector('.v040-rangeHeader b');
    if(title)title.textContent='Grid text scale (font only)';
    const ends=row?.querySelector('.v040-rangeEnds');
    if(ends)ends.innerHTML='<span>10% • smaller text</span><span>100% • calculated maximum</span>';
    if(row&&!row.querySelector('.v048-scaleHelp')){
      const help=document.createElement('div');
      help.className='small v048-scaleHelp';
      help.textContent='Changes text only. Grid cell geometry and fit/scroll choice stay unchanged.';
      row.appendChild(help);
    }

    const initial=Math.round(Math.max(.10,Math.min(1,Number(prefs().gridFitScale)||.40))*100);
    slider.value=String(initial);
    updateScaleReadout(initial);

    const apply=()=>{
      const percent=Math.max(10,Math.min(100,Number(slider.value)||40));
      savePrefs({gridFitScale:percent/100});
      try{window.renderGrid?.();}catch(e){}
      updateScaleReadout(percent);
    };
    slider.addEventListener('input',apply);
    slider.addEventListener('change',apply);
  }

  function boot(){
    document.title='Pad Grade Mapper v0.4.8';
    installProjectOpenInterceptor();
    installGridScaleControl();
    try{window.renderGrid?.();}catch(e){}
    const percent=Math.round(Math.max(.10,Math.min(1,Number(prefs().gridFitScale)||.40))*100);
    updateScaleReadout(percent);
  }

  window.__padGradeSwitchProject=switchProject;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
})();
