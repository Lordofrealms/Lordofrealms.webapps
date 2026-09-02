/* Pad Grade v0.9.8 DEV diagnostics — v1.2.5 append-style persistence.
 *
 * DEV defaults this logger ON in v096-dev-defaults.js. A minimal timing-only
 * prebuffer starts immediately so a true reinstall can capture folder-picker,
 * index, and recovery timing before durable preferences are read. No GPS
 * coordinates, rod readings, or project payload contents are intentionally logged.
 *
 * v1.2.5 IMPORTANT: diagnostic entries are no longer stored by repeatedly
 * parsing/stringifying/replacing one large localStorage value. That synchronous
 * whole-log rewrite was itself capable of starving the WebView JavaScript thread
 * and contaminating the callback-lag measurements. Entries are now appended in
 * small batches to IndexedDB. Export assembles the text log only when requested.
 * If IndexedDB is unavailable, the logger falls back to a bounded in-memory log;
 * it deliberately does NOT fall back to whole-log localStorage rewrites.
 */
(function installPadGrade096Diagnostics(){
  'use strict';

  const PREF_KEY='padGradeAppPrefsV1';
  const LEGACY_LOG_KEY='padGradeDiagnosticLogV1';
  const DB_NAME='PadGradeDiagnosticsV125';
  const DB_VERSION=1;
  const STORE='entries';
  const MAX_ENTRIES=50000;
  const PRUNE_TO=48000;
  const MEMORY_MAX=5000;
  const PREBUFFER_MAX=500;
  const FLUSH_MS=750;
  const UI_REFRESH_MS=750;
  const bootWall=Date.now();
  const bootPerf=(typeof performance!=='undefined'&&performance.now)?performance.now():0;
  const sessionId=`s${bootWall.toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const prebuffer=[];
  const pendingEntries=[];
  const memoryEntries=[];
  let enabled=false;
  let sequence=0;
  let uiTimer=null;
  let lagTimer=null;
  let surfaceTimer=null;
  let persistTimer=null;
  let statusTimer=null;
  let persistedCount=0;
  let coverStartedAt=null;
  let lastHeatmapSignature='';
  let lastMapGridUpdate=0;
  let longTaskObserver=null;
  let dbPromise=null;
  let storageMode='opening';
  let flushInFlight=null;

  function perfNow(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function parse(raw,fallback){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function prefs(){const p=parse(localStorage.getItem(PREF_KEY),{});return p&&typeof p==='object'?p:{};}
  function writePrefs(next){try{localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));}catch(e){}}
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
  function capArray(arr,max=MEMORY_MAX){if(arr.length>max)arr.splice(0,arr.length-max);return arr;}

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(new Error('indexeddb-unavailable'));return;}
      let req=null;
      try{req=indexedDB.open(DB_NAME,DB_VERSION);}catch(e){reject(e);return;}
      req.onupgradeneeded=()=>{try{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});}catch(e){reject(e);}};
      req.onsuccess=()=>{storageMode='indexeddb';resolve(req.result);};
      req.onerror=()=>reject(req.error||new Error('indexeddb-open-failed'));
      req.onblocked=()=>reject(new Error('indexeddb-open-blocked'));
    }).catch(err=>{storageMode='memory';dbPromise=null;throw err;});
    return dbPromise;
  }
  function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('indexeddb-transaction-aborted'));tx.onerror=()=>reject(tx.error||new Error('indexeddb-transaction-failed'));});}
  async function pruneOldest(db,overflow){
    overflow=Math.max(0,Math.floor(+overflow||0));if(!overflow)return;
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let removed=0;
    store.openCursor().onsuccess=event=>{const cursor=event.target.result;if(!cursor||removed>=overflow)return;cursor.delete();removed++;cursor.continue();};
    await txDone(tx);persistedCount=Math.max(0,persistedCount-removed);
  }
  async function appendBatch(batch){
    if(!batch.length)return;
    try{
      const db=await openDb();
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
      for(const entry of batch)store.add(entry);
      await txDone(tx);persistedCount+=batch.length;
      if(persistedCount>MAX_ENTRIES)await pruneOldest(db,persistedCount-PRUNE_TO);
    }catch(e){
      storageMode='memory';memoryEntries.push(...batch);capArray(memoryEntries);persistedCount=memoryEntries.length;
    }
  }
  async function countStored(){
    try{
      const db=await openDb();
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).count();
      const count=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(Number(req.result)||0);req.onerror=()=>reject(req.error||new Error('indexeddb-count-failed'));});
      persistedCount=count;return count;
    }catch(e){storageMode='memory';persistedCount=memoryEntries.length;return persistedCount;}
  }
  async function readStored(){
    if(storageMode==='memory')return memoryEntries.slice();
    try{
      const db=await openDb();
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
      const rows=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);req.onerror=()=>reject(req.error||new Error('indexeddb-read-failed'));});
      return rows;
    }catch(e){storageMode='memory';return memoryEntries.slice();}
  }
  async function clearStored(){
    memoryEntries.length=0;persistedCount=0;
    try{
      const db=await openDb();const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();await txDone(tx);
    }catch(e){storageMode='memory';}
    // Do not read/migrate the old whole-log value. Removing it is safe only on an
    // explicit user clear, avoiding a one-time startup rewrite/removal cost.
    try{localStorage.removeItem(LEGACY_LOG_KEY);}catch(e){}
  }

  function flushPending(){
    if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}
    if(!pendingEntries.length)return flushInFlight||Promise.resolve();
    const batch=pendingEntries.splice(0);
    const previous=flushInFlight||Promise.resolve();
    flushInFlight=previous.catch(()=>{}).then(()=>appendBatch(batch)).finally(()=>{flushInFlight=null;scheduleUiStatus();});
    return flushInFlight;
  }
  function schedulePersist(){
    if(!enabled||persistTimer)return;
    persistTimer=setTimeout(()=>{persistTimer=null;void flushPending();},FLUSH_MS);
  }
  function scheduleUiStatus(){
    if(statusTimer)return;
    statusTimer=setTimeout(()=>{statusTimer=null;updateUiStatus();},UI_REFRESH_MS);
  }
  function record(name,durationMs,details,kind='mark'){
    const entry={seq:++sequence,session:sessionId,at:new Date().toISOString(),sinceBootMs:relMs(),kind,event:String(name||'event')};
    if(Number.isFinite(+durationMs))entry.durationMs=Math.round(+durationMs*10)/10;
    const d=safeDetails(details);if(d)entry.details=d;
    if(enabled){pendingEntries.push(entry);schedulePersist();}
    else{prebuffer.push(entry);capArray(prebuffer,PREBUFFER_MAX);}
    scheduleUiStatus();return entry;
  }
  function flushPrebuffer(){if(!enabled||!prebuffer.length)return;pendingEntries.push(...prebuffer.splice(0));schedulePersist();}
  function setEnabled(next,source='ui'){
    const wasEnabled=enabled;enabled=!!next;writePrefs({diagnosticLogging:enabled});
    if(enabled){flushPrebuffer();record('diagnostics.enabled',0,{source,storage:storageMode});}
    else{
      if(wasEnabled)void flushPending();
      if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}
      pendingEntries.length=0;prebuffer.length=0;
    }
    updateUiStatus();
  }
  function refreshEnabledFromPrefs(source='prefs'){
    const p=prefs();
    if(typeof p.diagnosticLogging!=='boolean'){scheduleUiStatus();return enabled;}
    const next=p.diagnosticLogging;
    if(next&&!enabled){enabled=true;flushPrebuffer();record('diagnostics.enabled-from-prefs',0,{source,storage:storageMode});}
    else if(!next&&enabled){void flushPending();enabled=false;pendingEntries.length=0;prebuffer.length=0;}
    scheduleUiStatus();return enabled;
  }
  function start(name,details){return {name:String(name||'step'),startedWall:Date.now(),startedPerf:perfNow(),details:safeDetails(details)};}
  function end(token,details){if(!token)return null;return record(token.name,Math.max(0,perfNow()-token.startedPerf),{...(token.details||{}),...(safeDetails(details)||{})},'span');}
  function mark(name,details){return record(name,undefined,details,'mark');}
  async function clear(){
    if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}
    pendingEntries.length=0;prebuffer.length=0;await clearStored();
    record('diagnostics.log-cleared',0,{storage:storageMode},'mark');updateUiStatus();
  }
  function fileName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `Pad-Grade-Diagnostic-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.log`;}
  function formatLine(e){
    const since=String(Number(e.sinceBootMs||0).toFixed(1)).padStart(9,' '),dur=Number.isFinite(+e.durationMs)?` duration=${Number(e.durationMs).toFixed(1)}ms`:'',details=e.details?` ${JSON.stringify(e.details)}`:'';
    return `${e.at} session=${e.session} +${since}ms ${e.event}${dur}${details}`;
  }
  async function exportLog(){
    refreshEnabledFromPrefs('export');flushPrebuffer();await flushPending();
    const entries=(await readStored()).concat(memoryEntries===undefined?[]:[]);persistedCount=entries.length;
    const header=['Pad Grade diagnostic timing log','No GPS coordinates, rod readings, or project payload contents are intentionally logged.',`Exported: ${new Date().toISOString()}`,`Entries: ${entries.length}`,`Storage: ${storageMode==='indexeddb'?'IndexedDB append log':'memory fallback'}`,''];
    const text=header.concat(entries.map(formatLine)).join('\n');
    try{if(window.PadGradePlatform?.saveTextFile?.(fileName(),'text/plain',text))return true;}catch(e){}
    const blob=new Blob([text],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
  function logCount(){return persistedCount+pendingEntries.length+(enabled?prebuffer.length:0);}

  function updateUiStatus(){
    const toggle=document.getElementById('v096DiagnosticLogging');if(toggle&&toggle.checked!==enabled)toggle.checked=enabled;
    const status=document.getElementById('v096DiagnosticStatus');if(status){const storage=storageMode==='indexeddb'?'IndexedDB append':storageMode==='memory'?'memory fallback':'storage starting';status.textContent=enabled?`Logging on • ${logCount()} entries • ${storage} • local only`:'Logging off • timing prebuffer is not saved';}
  }
  function installUi(){
    const body=document.getElementById('v069AdvancedSettingsBody');if(!body||document.getElementById('v096DiagnosticLogging'))return false;
    const row=document.createElement('div');row.id='v096DiagnosticRow';row.style.cssText='display:grid;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)';
    row.innerHTML=`<label style="display:flex;gap:9px;align-items:flex-start"><input id="v096DiagnosticLogging" type="checkbox" style="width:20px;height:20px;flex:0 0 auto"><span><b>Diagnostic timing log</b><span class="small" style="display:block;margin-top:2px">Records local startup, project-load, map/grid, heat-map, file-operation, and main-thread stall timing. Does not log GPS coordinates or rod readings.</span></span></label><div id="v096DiagnosticStatus" class="small"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="v096ExportDiagnostic">Export diagnostic log</button><button type="button" id="v096ClearDiagnostic">Clear log</button></div>`;
    body.appendChild(row);
    const toggle=document.getElementById('v096DiagnosticLogging');toggle.checked=enabled;toggle.addEventListener('change',()=>setEnabled(toggle.checked,'advanced-settings'));
    document.getElementById('v096ExportDiagnostic').addEventListener('click',()=>{void exportLog();});
    document.getElementById('v096ClearDiagnostic').addEventListener('click',()=>{if(confirm('Clear the Pad Grade diagnostic timing log?'))void clear();});updateUiStatus();return true;
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
      const n=perfNow(),lag=n-expected;expected=n+250;
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
      if(grid&&Number(grid.updatedAt)>lastMapGridUpdate){lastMapGridUpdate=Number(grid.updatedAt);mark('map.grid-fastpath-updated',{projectId:grid.projectId||'',styleLoad:!!grid.styleLoad,actualRefresh:grid.actualRefresh!==false});}
    },200);
  }

  window.PadGradeDiag={enabled:()=>enabled,mark,start,end,setEnabled,refreshEnabledFromPrefs,exportLog,clear,count:logCount,bootWall,sessionId,flush:flushPending,storageMode:()=>storageMode};
  enabled=prefs().diagnosticLogging===true;
  void countStored().then(()=>{if(enabled)flushPrebuffer();mark('diagnostics.storage-ready',{storage:storageMode,appendOnly:true,wholeLogRewrite:false});updateUiStatus();});
  mark('app.script-diagnostics-installed',{version:'0.9.8',persistence:'indexeddb-append-v125',wholeLogRewrite:false});

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
  window.addEventListener('beforeunload',()=>{
    mark('app.beforeunload');void flushPending();
    if(uiTimer)clearInterval(uiTimer);if(lagTimer)clearInterval(lagTimer);if(surfaceTimer)clearInterval(surfaceTimer);if(persistTimer)clearTimeout(persistTimer);if(statusTimer)clearTimeout(statusTimer);
    try{longTaskObserver?.disconnect?.();}catch(e){}
    try{dbPromise?.then(db=>db?.close?.()).catch(()=>{});}catch(e){}
  },{once:true});
  window.__padGradeDiagnosticPersistenceV125='indexeddb-append-batches-no-whole-log-localstorage-rewrite';
})();
