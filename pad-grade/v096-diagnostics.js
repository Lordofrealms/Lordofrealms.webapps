/* Pad Grade v0.9.6 DEV — local diagnostic timing log.
 *
 * DEV defaults this logger ON in v096-dev-defaults.js. A minimal timing-only
 * prebuffer starts immediately so a true reinstall can capture folder-picker,
 * index, and recovery timing before durable preferences are read. No GPS
 * coordinates, rod readings, or project payload contents are intentionally logged.
 */
(function installPadGrade096Diagnostics(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const LOG_KEY='padGradeDiagnosticLogV1';
  const MAX_ENTRIES=2400;
  const MAX_BYTES=850000;
  const bootWall=Date.now();
  const bootPerf=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
  const sessionId=`s${bootWall.toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const prebuffer=[];
  let enabled=false;
  let sequence=0;
  let uiTimer=null;
  let lagTimer=null;
  let surfaceTimer=null;
  let coverStartedAt=null;
  let lastHeatmapSignature='';
  let lastMapGridUpdate=0;
  let longTaskObserver=null;

  function perfNow(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function parse(raw,fallback){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function prefs(){const p=parse(localStorage.getItem(PREF_KEY),{});return p&&typeof p==='object'?p:{};}
  function writePrefs(next){try{localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));}catch(e){}}
  function persisted(){const x=parse(localStorage.getItem(LOG_KEY),[]);return Array.isArray(x)?x:[];}
  function relMs(){return Math.max(0,Math.round((perfNow()-bootPerf)*10)/10);}
  function safeDetails(details){
    if(!details||typeof details!=='object')return undefined;
    const out={};
    for(const [k,v] of Object.entries(details)){
      if(/gps|lat|lon|reading|rod|payload|text|content/i.test(k))continue;
      if(v===undefined||typeof v==='function')continue;
      if(v===null||typeof v==='boolean'||typeof v==='number')out[k]=v;
      else if(typeof v==='string')out[k]=v.slice(0,180);
      else if(Array.isArray(v))out[k]=v.slice(0,12).map(x=>typeof x==='string'?x.slice(0,80):x);
    }
    return Object.keys(out).length?out:undefined;
  }
  function trim(entries){
    if(entries.length>MAX_ENTRIES)entries=entries.slice(entries.length-MAX_ENTRIES);
    let raw='';try{raw=JSON.stringify(entries);}catch(e){return entries.slice(-500);}
    while(raw.length>MAX_BYTES&&entries.length>100){entries=entries.slice(Math.max(1,Math.floor(entries.length*.1)));try{raw=JSON.stringify(entries);}catch(e){break;}}
    return entries;
  }
  function persistEntries(entries){try{localStorage.setItem(LOG_KEY,JSON.stringify(trim(entries)));}catch(e){}}
  function record(name,durationMs,details,kind='mark'){
    const entry={seq:++sequence,session:sessionId,at:new Date().toISOString(),sinceBootMs:relMs(),kind,event:String(name||'event')};
    if(Number.isFinite(+durationMs))entry.durationMs=Math.round(+durationMs*10)/10;
    const d=safeDetails(details);if(d)entry.details=d;
    if(enabled){const entries=persisted();entries.push(entry);persistEntries(entries);}else prebuffer.push(entry);
    updateUiStatus();
    return entry;
  }
  function flushPrebuffer(){if(!enabled||!prebuffer.length)return;const entries=persisted();entries.push(...prebuffer.splice(0));persistEntries(entries);}
  function setEnabled(next,source='ui'){
    enabled=!!next;writePrefs({diagnosticLogging:enabled});
    if(enabled){flushPrebuffer();record('diagnostics.enabled',0,{source});}
    else{prebuffer.length=0;}
    updateUiStatus();
  }
  function refreshEnabledFromPrefs(source='prefs'){
    const p=prefs();
    // Missing preference means "use the build default". DEV sets that default
    // ON before durable recovery. Do not let an older durable settings file that
    // predates this option silently turn logging back off.
    if(typeof p.diagnosticLogging!=='boolean'){updateUiStatus();return enabled;}
    const next=p.diagnosticLogging;
    if(next&&!enabled){enabled=true;flushPrebuffer();record('diagnostics.enabled-from-prefs',0,{source});}
    else if(!next&&enabled){enabled=false;prebuffer.length=0;}
    updateUiStatus();
    return enabled;
  }
  function start(name,details){return {name:String(name||'step'),startedWall:Date.now(),startedPerf:perfNow(),details:safeDetails(details)};}
  function end(token,details){if(!token)return null;return record(token.name,Math.max(0,perfNow()-token.startedPerf),{...(token.details||{}),...(safeDetails(details)||{})},'span');}
  function mark(name,details){return record(name,undefined,details,'mark');}
  function clear(){try{localStorage.removeItem(LOG_KEY);}catch(e){}prebuffer.length=0;record('diagnostics.log-cleared',0,{},'mark');updateUiStatus();}
  function fileName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `Pad-Grade-Diagnostic-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.log`;}
  function formatLine(e){
    const since=String(Number(e.sinceBootMs||0).toFixed(1)).padStart(9,' '),dur=Number.isFinite(+e.durationMs)?` duration=${Number(e.durationMs).toFixed(1)}ms`:'',details=e.details?` ${JSON.stringify(e.details)}`:'';
    return `${e.at} session=${e.session} +${since}ms ${e.event}${dur}${details}`;
  }
  function exportLog(){
    refreshEnabledFromPrefs('export');flushPrebuffer();const entries=persisted();
    const header=['Pad Grade diagnostic timing log','No GPS coordinates, rod readings, or project payload contents are intentionally logged.',`Exported: ${new Date().toISOString()}`,`Entries: ${entries.length}`,''];
    const text=header.concat(entries.map(formatLine)).join('\n');
    try{if(window.PadGradePlatform?.saveTextFile?.(fileName(),'text/plain',text))return true;}catch(e){}
    const blob=new Blob([text],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
  function logCount(){return persisted().length+(enabled?prebuffer.length:0);}

  function updateUiStatus(){
    const toggle=document.getElementById('v096DiagnosticLogging');if(toggle&&toggle.checked!==enabled)toggle.checked=enabled;
    const status=document.getElementById('v096DiagnosticStatus');if(status)status.textContent=enabled?`Logging on • ${logCount()} entries • local only`:'Logging off • timing prebuffer is not saved';
  }
  function installUi(){
    const body=document.getElementById('v069AdvancedSettingsBody');if(!body||document.getElementById('v096DiagnosticLogging'))return false;
    const row=document.createElement('div');row.id='v096DiagnosticRow';row.style.cssText='display:grid;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)';
    row.innerHTML=`<label style="display:flex;gap:9px;align-items:flex-start"><input id="v096DiagnosticLogging" type="checkbox" style="width:20px;height:20px;flex:0 0 auto"><span><b>Diagnostic timing log</b><span class="small" style="display:block;margin-top:2px">Records local startup, project-load, map/grid, heat-map, file-operation, and main-thread stall timing. Does not log GPS coordinates or rod readings.</span></span></label><div id="v096DiagnosticStatus" class="small"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="v096ExportDiagnostic">Export diagnostic log</button><button type="button" id="v096ClearDiagnostic">Clear log</button></div>`;
    body.appendChild(row);
    const toggle=document.getElementById('v096DiagnosticLogging');toggle.checked=enabled;toggle.addEventListener('change',()=>setEnabled(toggle.checked,'advanced-settings'));
    document.getElementById('v096ExportDiagnostic').addEventListener('click',exportLog);
    document.getElementById('v096ClearDiagnostic').addEventListener('click',()=>{if(confirm('Clear the Pad Grade diagnostic timing log?'))clear();});updateUiStatus();return true;
  }

  function installRecoveryCoverObserver(){
    const root=document.documentElement;if(!root||!window.MutationObserver)return;
    const sample=()=>{
      const active=root.classList.contains('padGradeRecoveryHold');
      if(active&&coverStartedAt==null){coverStartedAt=perfNow();mark('recovery.cover-visible');}
      else if(!active&&coverStartedAt!=null){record('recovery.cover-visible-total',Math.max(0,perfNow()-coverStartedAt),{},'span');coverStartedAt=null;}
    };
    new MutationObserver(sample).observe(root,{attributes:true,attributeFilter:['class']});sample();
  }
  function installMainThreadStallDiagnostics(){
    try{
      if(typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes?.('longtask')){
        longTaskObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>=50)record('main-thread.long-task',e.duration,{startMs:+e.startTime.toFixed(1)},'span');});
        longTaskObserver.observe({entryTypes:['longtask']});
      }
    }catch(e){}
    let expected=perfNow()+250;
    lagTimer=setInterval(()=>{
      const now=perfNow(),lag=now-expected;expected=now+250;
      if(lag>=100)record('main-thread.timer-lag',lag,{thresholdMs:100},'span');
    },250);
  }
  function installSurfaceObservers(){
    surfaceTimer=setInterval(()=>{
      const mesh=window.__padGradeHeatmapMesh;
      if(mesh){
        let sig='';try{sig=JSON.stringify({tier:mesh.tier,nx:mesh.nx,ny:mesh.ny,raster:mesh.raster,canvasSource:mesh.canvasSource});}catch(e){}
        if(sig&&sig!==lastHeatmapSignature){lastHeatmapSignature=sig;mark('heatmap.surface-visible',{tier:mesh.tier,nx:mesh.nx,ny:mesh.ny,cells:mesh.cells||0});}
      }
      const grid=window.__padGradeMapGridFastPathV095;
      if(grid&&Number(grid.updatedAt)>lastMapGridUpdate){lastMapGridUpdate=Number(grid.updatedAt);mark('map.grid-fastpath-updated',{projectId:grid.projectId||'',styleLoad:!!grid.styleLoad});}
    },80);
  }

  window.PadGradeDiag={enabled:()=>enabled,mark,start,end,setEnabled,refreshEnabledFromPrefs,exportLog,clear,count:logCount,bootWall,sessionId};
  enabled=prefs().diagnosticLogging===true;if(enabled)flushPrebuffer();mark('app.script-diagnostics-installed',{version:'0.9.6'});

  window.addEventListener('padgrade-project-folder-selected',()=>mark('recovery.folder-selected'));
  window.addEventListener('padgrade-project-folder-indexed',ev=>mark('recovery.folder-index-ready',ev?.detail||{}));
  window.addEventListener('padgrade-minimum-durable-recovery-ready',ev=>mark('recovery.minimum-ready',ev?.detail||{}));
  window.addEventListener('padgrade-projects-reconciled',ev=>mark('recovery.projects-reconciled',ev?.detail||{}));
  window.addEventListener('padgrade-map-created',()=>mark('map.created'));
  window.addEventListener('load',()=>mark('app.window-load'));
  document.addEventListener('DOMContentLoaded',()=>mark('app.dom-content-loaded'),{once:true});
  document.addEventListener('visibilitychange',()=>mark('app.visibility',{state:document.visibilityState}));
  window.addEventListener('padgrade-active-project-applied',ev=>mark('project.active-applied',{id:ev?.detail?.id||'',inPlace:!!ev?.detail?.inPlace}));
  document.addEventListener('click',ev=>{const b=ev.target?.closest?.('button[data-act="open"]'),row=b?.closest?.('[data-id]');if(row)window.__padGradeDiagProjectSwitchToken=start('project.switch',{to:row.dataset.id||''});},true);
  window.addEventListener('padgrade-after-project-switch',ev=>{if(window.__padGradeDiagProjectSwitchToken){end(window.__padGradeDiagProjectSwitchToken,{to:ev?.detail?.to||''});window.__padGradeDiagProjectSwitchToken=null;}});

  installRecoveryCoverObserver();installMainThreadStallDiagnostics();installSurfaceObservers();
  const boot=()=>{refreshEnabledFromPrefs('dom-ready');installUi();let tries=0;uiTimer=setInterval(()=>{refreshEnabledFromPrefs('poll');if(installUi()||document.getElementById('v096DiagnosticLogging')){if(++tries>8){clearInterval(uiTimer);uiTimer=null;}}else if(++tries>50){clearInterval(uiTimer);uiTimer=null;}},200);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('beforeunload',()=>{mark('app.beforeunload');if(uiTimer)clearInterval(uiTimer);if(lagTimer)clearInterval(lagTimer);if(surfaceTimer)clearInterval(surfaceTimer);try{longTaskObserver?.disconnect?.();}catch(e){}},{once:true});
})();
