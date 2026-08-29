/* Pad Grade v0.6.7 DEV — categorical on-grade band, separate cut/fill spectra. */
(function installPadGrade067CategoricalGrade(){
  'use strict';
  const $=id=>document.getElementById(id);
  const GRADE=[79,143,58],CUT_NEAR=[247,196,92],CUT_MID=[230,126,45],CUT_MAX=[180,45,35],FILL_NEAR=[103,205,220],FILL_MID=[54,137,205],FILL_MAX=[40,80,200];
  function lerp(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  function spectrum(near,mid,end,t){t=Math.max(0,Math.min(1,t));return t<=.5?lerp(near,mid,t*2):lerp(mid,end,(t-.5)*2);}
  function scale(){const s=window.__padGradeHeatmapScale||{};return {maxCut:Number.isFinite(+s.maxCut)?Math.max(0,+s.maxCut):0,maxFill:Number.isFinite(+s.maxFill)?Math.max(0,+s.maxFill):0};}
  function installColorMapping(){
    window.pgSurfaceColor=function(diff,_legacyMaxAbs,tol){
      diff=Number(diff)||0;tol=Math.max(0,Number(tol)||0);if(Math.abs(diff)<=tol)return [GRADE[0],GRADE[1],GRADE[2],92];
      const s=scale();
      if(diff<0){const span=Math.max(s.maxCut-tol,1e-9),t=(Math.abs(diff)-tol)/span,c=spectrum(CUT_NEAR,CUT_MID,CUT_MAX,t);return [c[0],c[1],c[2],92];}
      const span=Math.max(s.maxFill-tol,1e-9),t=(diff-tol)/span,c=spectrum(FILL_NEAR,FILL_MID,FILL_MAX,t);return [c[0],c[1],c[2],92];
    };
  }
  installColorMapping();
  function fmtTol(){try{return pgFmtGrade(cfg().tol,1);}catch(e){return 'tolerance';}}
  function updateLegend(){
    const legend=$('heatmapScaleLegend');if(!legend)return false;
    if(legend.dataset.categoricalGrade!=='1'){
      legend.dataset.categoricalGrade='1';
      legend.innerHTML=`<div style="height:9px;border-radius:5px;background:linear-gradient(90deg,#b42d23 0%,#e67e2d 24%,#f7c45c 46%,#4f8f3a 46%,#4f8f3a 54%,#67cddc 54%,#3689cd 76%,#2850c8 100%)"></div><div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:8px;font-size:10px;margin-top:3px"><span id="heatmapLegendCut">CUT —</span><span id="heatmapGradeBand" style="font-weight:700;white-space:nowrap">GRADE</span><span id="heatmapLegendFill" style="text-align:right">FILL —</span></div>`;
    }
    const band=$('heatmapGradeBand');if(band)band.textContent=`GRADE ±${fmtTol()}`;
    const s=scale(),cut=$('heatmapLegendCut'),fill=$('heatmapLegendFill');
    if(cut){try{cut.textContent=s.maxCut>0?`CUT ${pgFmtGrade(s.maxCut,1)}`:'CUT —';}catch(e){}}
    if(fill){try{fill.textContent=s.maxFill>0?`FILL ${pgFmtGrade(s.maxFill,1)}`:'FILL —';}catch(e){}}
    return true;
  }
  function forceRedraw(){try{if(typeof window.pgDrawSurface==='function')window.pgDrawSurface();}catch(e){}}
  function boot(){
    let tries=0;const timer=setInterval(()=>{updateLegend();if(window.__padGradeHeatmapUiV066){installColorMapping();clearInterval(timer);updateLegend();forceRedraw();}else if(++tries>40)clearInterval(timer);},100);
    setInterval(updateLegend,700);window.__padGradeCategoricalGradeV067=true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* Pad Grade v0.9.6 DEV — durable app settings/last-project recovery plus layer ordering.
 * v0.9.6 delegates recovery reads to the asynchronous durable controller and
 * mirrors settings with asynchronous SAF writes so the WebView is never held by
 * document-provider I/O.
 */
(function installPadGrade068DurabilityAndLayerOrder(){
  'use strict';
  const SETTINGS_FILE='Pad-Grade-Settings.pgsettings',SETTINGS_SCHEMA=1,INDEX_KEY='padGradeProjectsV5',ACTIVE_KEY='padGradeActiveProjectIdV5',PREF_KEY='padGradeAppPrefsV1',PROJECT_PREFIX='padGradeProjectV5:',SURFACE_LAYER='pad-grade-interpolated-surface-layer';
  const GRID_ANCHORS=['pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels'];
  let saveTimer=null,lastWrittenSignature='',restoreBusy=false,layerGuardTimer=null;

  function nativeFolderAvailable(){try{return !!(window.PadGradeNative&&typeof PadGradeNative.hasProjectFolder==='function'&&PadGradeNative.hasProjectFolder());}catch(e){return false;}}
  function parseJson(raw,fallback){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function activeId(){return localStorage.getItem(ACTIVE_KEY)||null;}
  function projectKey(id){return `${PROJECT_PREFIX}${id}`;}
  function appPrefs(){const raw=parseJson(localStorage.getItem(PREF_KEY),{});return raw&&typeof raw==='object'?raw:{};}
  function currentSettings(){try{return typeof cfg==='function'?cfg():null;}catch(e){return null;}}
  function currentPortablePrefs(){
    let unitMode='inches';try{if(typeof pgUnitMode==='function')unitMode=pgUnitMode();}catch(e){}
    const heatmap=document.getElementById('heatmapToggle'),route=document.getElementById('routeMode'),opacity=document.getElementById('heatmapTransparency');
    return {unitMode,heatmap:heatmap?!!heatmap.checked:true,routeMode:route?String(route.value||'serpentine'):'serpentine',heatmapTransparency:opacity?Math.max(0,Math.min(90,Number(opacity.value)||0)):42};
  }
  function durablePayload(){
    const id=activeId();let projectName=null;
    try{const p=parseJson(id&&localStorage.getItem(projectKey(id)),null);projectName=p?.settings?.name||currentSettings()?.name||null;}catch(e){}
    return {app:'Pad Grade Mapper',type:'settings',schemaVersion:SETTINGS_SCHEMA,savedAt:new Date().toISOString(),lastProjectId:id,lastProjectName:projectName,appPrefs:appPrefs(),lastSettings:currentSettings(),portablePrefs:currentPortablePrefs()};
  }
  function payloadSignature(p){if(!p)return '';return JSON.stringify({lastProjectId:p.lastProjectId||null,appPrefs:p.appPrefs||{},lastSettings:p.lastSettings||null,portablePrefs:p.portablePrefs||{}});}

  function flushDurableSettings(force=false){
    if(!nativeFolderAvailable())return false;
    const p=durablePayload(),sig=payloadSignature(p);if(!force&&sig===lastWrittenSignature)return true;
    const text=JSON.stringify(p,null,2);
    try{
      if(window.PadGradeFiles?.write){
        lastWrittenSignature=sig;
        window.PadGradeFiles.write(SETTINGS_FILE,text).then(ok=>{if(!ok&&lastWrittenSignature===sig)lastWrittenSignature='';});
        return true;
      }
      if(typeof PadGradeNative.writeProjectFile!=='function')return false;
      const ok=!!PadGradeNative.writeProjectFile(SETTINGS_FILE,text);if(ok)lastWrittenSignature=sig;return ok;
    }catch(e){return false;}
  }
  function scheduleDurableSettings(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushDurableSettings(false),500);}
  function normalizeIndexItem(p){return {id:p.id,name:p.settings?.name||'Pad',createdAt:p.createdAt||new Date().toISOString(),modifiedAt:p.modifiedAt||p.exportedAt||new Date().toISOString(),status:p.status==='archived'?'archived':'open',fileId:p.fileId};}
  function putRecoveredProject(p){
    if(!p||typeof p!=='object'||!p.id||!p.settings)return false;let idx=parseJson(localStorage.getItem(INDEX_KEY),[]);if(!Array.isArray(idx))idx=[];
    const meta=normalizeIndexItem(p),found=idx.find(x=>x&&x.id===p.id);if(found)Object.assign(found,meta);else idx.push(meta);localStorage.setItem(projectKey(p.id),JSON.stringify(p));localStorage.setItem(INDEX_KEY,JSON.stringify(idx));return true;
  }
  function restoreProjectFromDurable(id){
    if(window.__padGradeAsyncDurableV096)return null;
    if(!id||!nativeFolderAvailable()||typeof PadGradeNative.readProjectFile!=='function')return null;
    try{const raw=PadGradeNative.readProjectFile(`${id}.padgrade`);if(!raw)return null;const incoming=parseJson(raw,null);if(!incoming||incoming.id!==id||!incoming.settings)return null;const local=parseJson(localStorage.getItem(projectKey(id)),null),incomingMs=Date.parse(incoming.modifiedAt||incoming.exportedAt||'')||0,localMs=Date.parse(local?.modifiedAt||local?.exportedAt||'')||0;if(!local||incomingMs>=localMs)putRecoveredProject(incoming);return incoming;}catch(e){return null;}
  }
  function applyPortableFallback(settings){
    if(!settings||typeof settings!=='object')return;const portable=settings.portablePrefs&&typeof settings.portablePrefs==='object'?settings.portablePrefs:{};
    try{if(settings.appPrefs&&typeof settings.appPrefs==='object')localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
    try{
      if(portable.unitMode&&typeof pgSetUnitMode==='function')pgSetUnitMode(portable.unitMode);
      if(settings.lastSettings&&typeof pgWriteCanonicalSettings==='function')pgWriteCanonicalSettings(settings.lastSettings,portable.unitMode||undefined);
      const heatmap=document.getElementById('heatmapToggle');if(heatmap&&typeof portable.heatmap==='boolean')heatmap.checked=portable.heatmap;
      const route=document.getElementById('routeMode');if(route&&portable.routeMode)route.value=portable.routeMode;
      const opacity=document.getElementById('heatmapTransparency');if(opacity&&Number.isFinite(+portable.heatmapTransparency)){opacity.value=Math.max(0,Math.min(90,+portable.heatmapTransparency));opacity.dispatchEvent(new Event('input',{bubbles:true}));}
      if(typeof renderGrid==='function')renderGrid();if(typeof updateGpsUI==='function')updateGpsUI();
    }catch(e){}
  }

  function loadDurableSettingsAndLastProject(){
    if(window.__padGradeAsyncDurableV096){try{window.__padGradePrepareMinimumDurableRecovery?.();return true;}catch(e){return false;}}
    if(restoreBusy||!nativeFolderAvailable()||typeof PadGradeNative.readProjectFile!=='function')return false;restoreBusy=true;
    try{
      const raw=PadGradeNative.readProjectFile(SETTINGS_FILE);if(!raw){flushDurableSettings(true);return false;}
      const settings=parseJson(raw,null);if(!settings||settings.type!=='settings')return false;lastWrittenSignature=payloadSignature(settings);
      if(settings.appPrefs&&typeof settings.appPrefs==='object')try{localStorage.setItem(PREF_KEY,JSON.stringify(settings.appPrefs));}catch(e){}
      const desired=settings.lastProjectId||null;
      if(desired){const recovered=restoreProjectFromDurable(desired);if(recovered){const current=activeId();if(current!==desired){localStorage.setItem(ACTIVE_KEY,desired);sessionStorage.setItem('padGradeV068RestoredProject',desired);setTimeout(()=>location.reload(),30);return true;}}}
      if(!desired||!localStorage.getItem(projectKey(desired)))applyPortableFallback(settings);return true;
    }catch(e){return false;}finally{restoreBusy=false;}
  }

  function enforceHeatmapBelowSurveyGrid(){
    const map=window.__padGradeMapInstance;if(!map)return false;
    try{
      if(!map.getLayer(SURFACE_LAYER))return false;const style=map.getStyle&&map.getStyle();if(!style||!Array.isArray(style.layers))return false;
      const ids=style.layers.map(x=>x.id),surfaceIndex=ids.indexOf(SURFACE_LAYER);if(surfaceIndex<0)return false;let anchor=null,anchorIndex=Infinity;
      for(const id of GRID_ANCHORS){const i=ids.indexOf(id);if(i>=0&&i<anchorIndex){anchor=id;anchorIndex=i;}}
      if(anchor&&surfaceIndex>anchorIndex){map.moveLayer(SURFACE_LAYER,anchor);map.triggerRepaint();}return true;
    }catch(e){return false;}
  }
  function installLayerGuard(){
    const wrap=name=>{const base=window[name];if(typeof base!=='function'||base.__v068LayerGuard)return;const guarded=function(){const out=base.apply(this,arguments);requestAnimationFrame(enforceHeatmapBelowSurveyGrid);return out;};guarded.__v068LayerGuard=true;window[name]=guarded;};
    wrap('pgDrawSurface');wrap('pgScheduleSurfaceDraw');if(!layerGuardTimer)layerGuardTimer=setInterval(enforceHeatmapBelowSurveyGrid,500);
  }
  function installPersistenceHooks(){
    const baseSave=window.saveLocal;
    if(typeof baseSave==='function'&&!baseSave.__v068DurableSettings){const wrapped=function(){const out=baseSave.apply(this,arguments);scheduleDurableSettings();return out;};wrapped.__v068DurableSettings=true;window.saveLocal=wrapped;}
    const apply=document.getElementById('applySettings');if(apply&&!apply.dataset.v068DurableSettings){apply.dataset.v068DurableSettings='1';apply.addEventListener('click',scheduleDurableSettings);}
    const previousFolderChanged=window.__padGradeProjectFolderChanged;
    if(!window.__padGradeFolderChangedV068){window.__padGradeFolderChangedV068=true;window.__padGradeProjectFolderChanged=function(){try{previousFolderChanged?.();}catch(e){}setTimeout(()=>loadDurableSettingsAndLastProject(),0);};}
    window.addEventListener('pagehide',()=>flushDurableSettings(true));window.addEventListener('beforeunload',()=>flushDurableSettings(true));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDurableSettings(true);});setInterval(scheduleDurableSettings,3000);
  }
  function boot(){
    document.title='Pad Grade Mapper v0.9.6 DEV';installLayerGuard();installPersistenceHooks();
    setTimeout(()=>{installLayerGuard();loadDurableSettingsAndLastProject();enforceHeatmapBelowSurveyGrid();scheduleDurableSettings();},250);
    window.addEventListener('padgrade-map-created',()=>setTimeout(()=>{installLayerGuard();enforceHeatmapBelowSurveyGrid();},0));
    window.__padGradeDurableSettingsFile=SETTINGS_FILE;window.__padGradeLayerOrder='imagery<heatmap<survey-grid<current-fix';window.__padGradeDurableSettingsPolicyV096='async-write-and-async-recovery-controller';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
