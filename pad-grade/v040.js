/* Pad Grade v0.4.0 — multi-project autosave, durable-folder mirror, responsive physical grid. */
(function installPadGradeV040(){
  'use strict';

  const PROJECT_SCHEMA=5;
  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const LEGACY_KEY='padGradeMobile';
  const DEFAULT_MIN_FONT=2;
  let index=[];
  let activeId=null;
  let autosaveTimer=null;
  let safetyTimer=null;
  let saving=false;
  let lastSaveAt=0;

  const $id=id=>document.getElementById(id);
  const nowIso=()=>new Date().toISOString();
  const uid=()=>`pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const safeFileName=name=>String(name||'Pad').replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'Pad';
  const projectKey=id=>`padGradeProjectV5:${id}`;

  function prefs(){
    try{return {...{minGridFont:DEFAULT_MIN_FONT},...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:DEFAULT_MIN_FONT};}
  }
  function savePrefs(next){localStorage.setItem(PREF_KEY,JSON.stringify({...prefs(),...next}));}

  function currentGpsPayload(){
    const gps={reference:gpsRef,opposite:gpsOpposite,targetIndex:gpsTargetIndex};
    try{
      if(typeof gpsCorners!=='undefined'&&gpsCorners&&typeof gpsCorners==='object') gps.corners=gpsCorners;
      if(typeof gpsCaptureIndex==='number') gps.captureIndex=gpsCaptureIndex;
    }catch(e){}
    return gps;
  }

  function snapshotProject(existing={}){
    const s=cfg();
    const createdAt=existing.createdAt||nowIso();
    return {
      app:'Pad Grade Mapper Mobile',schemaVersion:PROJECT_SCHEMA,version:PROJECT_SCHEMA,
      id:existing.id||activeId||uid(),createdAt,modifiedAt:nowIso(),
      settings:s,readings:{...readings},readingMeta:{...readingMeta},gps:currentGpsPayload(),measureMode,
      migration:{sourceVersion:existing.migration?.sourceVersion||PROJECT_SCHEMA}
    };
  }

  function normalizeProject(data){
    if(!data||typeof data!=='object') throw new Error('Invalid project file.');
    const source=Number(data.schemaVersion||data.version||1);
    const s=data.settings||{};
    const p={
      app:'Pad Grade Mapper Mobile',schemaVersion:PROJECT_SCHEMA,version:PROJECT_SCHEMA,
      id:data.id||uid(),createdAt:data.createdAt||data.exportedAt||nowIso(),modifiedAt:data.modifiedAt||data.exportedAt||nowIso(),
      settings:{
        width:Number(s.width)||64,length:Number(s.length)||76,
        cols:Math.max(2,Math.min(200,Number(s.cols)||9)),rows:Math.max(2,Math.min(200,Number(s.rows)||9)),
        target:Number.isFinite(Number(s.target))?Number(s.target):64,
        tol:Math.max(0,Number.isFinite(Number(s.tol))?Number(s.tol):.5),
        refCorner:s.refCorner||'SW',name:s.name||data.name||'Pad'
      },
      readings:{},readingMeta:(data.readingMeta&&typeof data.readingMeta==='object')?data.readingMeta:{},
      gps:(data.gps&&typeof data.gps==='object')?data.gps:{},measureMode:data.measureMode==='gps'?'gps':'manual',
      migration:{sourceVersion:source}
    };
    for(const [key,val] of Object.entries(data.readings||{})){const n=Number(val);if(Number.isFinite(n))p.readings[key]=n;}
    return p;
  }

  function applyProject(p){
    const s=p.settings||{};
    for(const [id,val] of Object.entries({width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name})){
      if($id(id)&&val!==undefined) $id(id).value=val;
    }
    readings={...p.readings}; readingMeta={...(p.readingMeta||{})};
    gpsRef=p.gps?.reference||null; gpsOpposite=p.gps?.opposite||null; gpsTargetIndex=Number.isInteger(p.gps?.targetIndex)?p.gps.targetIndex:null;
    try{
      if(typeof gpsCorners!=='undefined') gpsCorners=(p.gps?.corners&&typeof p.gps.corners==='object')?p.gps.corners:{};
      if(typeof gpsCaptureIndex!=='undefined') gpsCaptureIndex=Number.isInteger(p.gps?.captureIndex)?p.gps.captureIndex:Object.keys(p.gps?.corners||{}).length;
      if(typeof syncLegacyCalibration==='function') syncLegacyCalibration();
    }catch(e){}
    measureMode=p.measureMode==='gps'?'gps':'manual';
    updateCornerPicker(); renderGrid(); updateGpsUI();
    try{refreshMapOverlays(true);}catch(e){}
    updateProjectHeader();
  }

  function loadIndex(){
    try{index=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');if(!Array.isArray(index))index=[];}catch(e){index=[];}
    activeId=localStorage.getItem(ACTIVE_KEY)||null;
  }
  function saveIndex(){localStorage.setItem(INDEX_KEY,JSON.stringify(index));if(activeId)localStorage.setItem(ACTIVE_KEY,activeId);else localStorage.removeItem(ACTIVE_KEY);}
  function getLocalProject(id){try{return normalizeProject(JSON.parse(localStorage.getItem(projectKey(id))||'null'));}catch(e){return null;}}
  function putLocalProject(p){localStorage.setItem(projectKey(p.id),JSON.stringify(p));const item=index.find(x=>x.id===p.id);const meta={id:p.id,name:p.settings.name||'Pad',modifiedAt:p.modifiedAt,createdAt:p.createdAt};if(item)Object.assign(item,meta);else index.push(meta);saveIndex();}

  function nativeAvailable(){return !!(window.PadGradeNative&&typeof PadGradeNative.writeProjectFile==='function');}
  function hasFolder(){try{return nativeAvailable()&&!!PadGradeNative.hasProjectFolder();}catch(e){return false;}}
  function writeDurable(p){
    if(!hasFolder()) return false;
    try{return !!PadGradeNative.writeProjectFile(`${p.id}.padgrade`,JSON.stringify(p));}catch(e){return false;}
  }
  function deleteDurable(id){if(!hasFolder())return;try{PadGradeNative.deleteProjectFile(`${id}.padgrade`);}catch(e){}}

  function updateProjectHeader(){
    const state=$id('v040SaveState'); if(!state)return;
    const p=index.find(x=>x.id===activeId);
    const name=$id('v040ProjectName'); if(name) name.textContent=p?.name||cfg().name||'Pad';
    if(saving){state.textContent='Saving…';state.className='v040-projectState saving';}
    else{state.textContent=hasFolder()?'Saved • durable folder':'Saved locally';state.className=hasFolder()?'v040-projectState saved':'v040-projectState warn';}
  }

  function flushSave(){
    if(!activeId)return;
    clearTimeout(autosaveTimer); autosaveTimer=null; saving=true; updateProjectHeader();
    const old=getLocalProject(activeId)||{id:activeId};
    const p=snapshotProject(old); putLocalProject(p); writeDurable(p); lastSaveAt=Date.now(); saving=false; updateProjectHeader(); renderProjectList();
  }
  function scheduleSave(){
    if(!activeId)return; saving=true; updateProjectHeader(); clearTimeout(autosaveTimer); autosaveTimer=setTimeout(flushSave,900);
  }

  function migrateLegacyIfNeeded(){
    if(index.length)return;
    let legacy=null;
    try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');}catch(e){}
    if(legacy&&legacy.settings){
      const p=normalizeProject({...legacy,version:legacy.version||4,id:uid(),createdAt:nowIso(),modifiedAt:nowIso()});
      activeId=p.id;putLocalProject(p);return;
    }
    const p=snapshotProject({id:uid(),createdAt:nowIso()});activeId=p.id;putLocalProject(p);
  }

  function openProject(id){
    if(id===activeId)return;
    flushSave();const p=getLocalProject(id);if(!p)return;activeId=id;saveIndex();applyProject(p);renderProjectList();
  }
  function newProject(){
    flushSave();const name=prompt('Project name','New Pad');if(name===null)return;
    const p=normalizeProject({id:uid(),createdAt:nowIso(),settings:{width:64,length:76,cols:9,rows:9,target:64,tol:.5,refCorner:'SW',name:name||'New Pad'},readings:{},gps:{},measureMode:'manual'});
    p.modifiedAt=nowIso();putLocalProject(p);activeId=p.id;saveIndex();applyProject(p);scheduleSave();renderProjectList();
  }
  function duplicateProject(id){
    const src=getLocalProject(id);if(!src)return;const copy=normalizeProject(JSON.parse(JSON.stringify(src)));copy.id=uid();copy.settings.name=`${src.settings.name} Copy`;copy.createdAt=copy.modifiedAt=nowIso();putLocalProject(copy);renderProjectList();scheduleSave();
  }
  function renameProject(id){
    const p=getLocalProject(id);if(!p)return;const name=prompt('Project name',p.settings.name);if(name===null||!name.trim())return;p.settings.name=name.trim();p.modifiedAt=nowIso();putLocalProject(p);writeDurable(p);if(id===activeId){$id('projectName').value=p.settings.name;updateStats();}renderProjectList();updateProjectHeader();
  }
  function removeProject(id){
    if(index.length<=1){alert('At least one project must remain.');return;}
    const item=index.find(x=>x.id===id);if(!confirm(`Delete ${item?.name||'this project'}?`))return;
    localStorage.removeItem(projectKey(id));deleteDurable(id);index=index.filter(x=>x.id!==id);
    if(activeId===id){activeId=index[0].id;applyProject(getLocalProject(activeId));}saveIndex();renderProjectList();updateProjectHeader();
  }

  function importProjectData(data){
    const p=normalizeProject(data);p.id=uid();p.modifiedAt=nowIso();putLocalProject(p);writeDurable(p);activeId=p.id;saveIndex();applyProject(p);scheduleSave();return p;
  }

  function renderProjectList(){
    const list=$id('v040ProjectList');if(!list)return;
    list.innerHTML=index.slice().sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt))).map(item=>{
      const current=item.id===activeId;return `<div class="v040-projectItem ${current?'current':''}" data-id="${item.id}"><div><b>${escapeHtml(item.name||'Pad')}</b><div class="v040-projectMeta">${current?'Current • ':''}modified ${new Date(item.modifiedAt||Date.now()).toLocaleString()}</div></div><div class="v040-projectActions"><button data-act="open">Open</button><button data-act="rename">Rename</button><button data-act="copy">Duplicate</button><button class="danger" data-act="delete">Delete</button></div></div>`;
    }).join('');
    list.querySelectorAll('.v040-projectItem').forEach(row=>row.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{const id=row.dataset.id;const act=btn.dataset.act;if(act==='open')openProject(id);else if(act==='rename')renameProject(id);else if(act==='copy')duplicateProject(id);else if(act==='delete')removeProject(id);}));
    const fs=$id('v040FolderState');if(fs)fs.textContent=hasFolder()?'Durable project folder connected. Files survive app uninstall.':'No durable folder connected. Projects are currently stored only inside the app/browser.';
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function installProjectUi(){
    const top=document.querySelector('.topbar');if(top&&!$id('v040ProjectsBtn')){
      const holder=document.createElement('div');holder.innerHTML=`<button id="v040ProjectsBtn" class="v040-projectButton">Projects</button><div id="v040SaveState" class="v040-projectState"></div>`;top.appendChild(holder);
    }
    if(!$id('projectsDlg')){
      const dlg=document.createElement('dialog');dlg.id='projectsDlg';dlg.innerHTML=`<div class="modal"><h2>Projects</h2><div class="small">Current: <b id="v040ProjectName"></b></div><div class="v040-projectToolbar"><button id="v040NewProject" class="primary">New Project</button><button id="v040ImportProject">Import Project</button></div><div class="v040-folderBox"><div class="v040-folderRow"><b>Durable project folder</b><button id="v040ChooseFolder">Choose Folder</button></div><div id="v040FolderState" class="v040-folderState"></div></div><div id="v040ProjectList" class="v040-projectList"></div><div class="v040-projectFooter"><button id="v040CloseProjects">Done</button></div></div>`;document.body.appendChild(dlg);
    }
    $id('v040ProjectsBtn').onclick=()=>{flushSave();renderProjectList();$id('projectsDlg').showModal();};
    $id('v040NewProject').onclick=newProject;
    $id('v040ImportProject').onclick=()=>$id('importProjectFile').click();
    $id('v040CloseProjects').onclick=()=>{$id('projectsDlg').close();};
    $id('v040ChooseFolder').onclick=()=>{if(nativeAvailable()&&typeof PadGradeNative.chooseProjectFolder==='function'){PadGradeNative.chooseProjectFolder();}else alert('Durable folder storage is available in the Android app.');};
    window.__padGradeProjectFolderChanged=function(){renderProjectList();for(const item of index){const p=getLocalProject(item.id);if(p)writeDurable(p);}updateProjectHeader();};
  }

  function installFontSlider(){
    const modal=$id('settingsDlg')?.querySelector('.modal');if(!modal||$id('v040MinGridFont'))return;
    const row=document.createElement('div');row.className='v040-rangeRow';row.innerHTML=`<div class="v040-rangeHeader"><b>Minimum grid text size</b><span id="v040MinGridFontValue">2 px</span></div><input id="v040MinGridFont" type="range" min="2" max="20" step="1" value="2"><div class="v040-rangeEnds"><span>2 px • fit more</span><span>20 px • larger text</span></div>`;
    modal.insertBefore(row,modal.querySelector('.modalActions'));
    const p=prefs();$id('v040MinGridFont').value=Math.max(2,Math.min(20,+p.minGridFont||2));$id('v040MinGridFontValue').textContent=`${$id('v040MinGridFont').value} px`;
    $id('v040MinGridFont').addEventListener('input',()=>{const v=+$id('v040MinGridFont').value;$id('v040MinGridFontValue').textContent=`${v} px`;savePrefs({minGridFont:v});renderGrid();});
  }

  function responsiveRenderGrid(){
    const s=cfg(),g=$id('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';
    const minFont=Math.max(2,Math.min(20,+prefs().minGridFont||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=dx/dy;
    const available=Math.max(220,shell.clientWidth-16);
    const idealW=available/s.cols,idealH=idealW/Math.max(.05,ratio);
    const textNeed=Math.max(2,Math.min(20,Math.min(idealW*.20,idealH*.16)));
    const fit=textNeed>=minFont && idealW>=8 && idealH>=8;
    let cellW,cellH,font;
    if(fit){cellW=idealW;cellH=idealH;font=Math.max(minFont,textNeed);shell.classList.add('fit');g.className='v040-fit';g.style.width='100%';g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;}
    else{font=minFont;cellW=Math.max(34,font*4.8);cellH=Math.max(34,cellW/Math.max(.05,ratio));shell.classList.remove('fit');g.className='v040-scroll';g.style.width='max-content';g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(1)}px)`;g.style.gridAutoRows=`${cellH.toFixed(1)}px`;}
    g.style.setProperty('--grid-font',`${font.toFixed(1)}px`);
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div');d.className='cell '+classFor(val);const rc=refCoords(rr,c);d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy">${rc.x.toFixed(1)}′ ${rc.xDir}<br>${rc.y.toFixed(1)}′ ${rc.yDir}</div><div class="main">${main}</div><div class="sub">${sub}</div>`;d.onclick=()=>openPoint(rr,c);g.appendChild(d);
    }
    updateStats();
    let mode=$id('v040GridMode');if(!mode){mode=document.createElement('span');mode.id='v040GridMode';mode.className='v040-gridMode';document.querySelector('#grid')?.closest('.card')?.querySelector('.legend')?.appendChild(mode);}if(mode)mode.textContent=fit?`Fit view • ${font.toFixed(1)} px`:`Scroll view • ${font.toFixed(0)} px min`;
  }

  // Wrap legacy save/import/render paths rather than rewriting mature field logic.
  const legacySaveLocal=window.saveLocal;
  window.saveLocal=function(){try{legacySaveLocal?.();}catch(e){}scheduleSave();};
  window.renderGrid=responsiveRenderGrid;
  const oldImport=window.importProjectFile;
  window.importProjectFile=async function(file){const raw=await file.text();const data=JSON.parse(raw);const p=importProjectData(data);return p;};

  loadIndex();migrateLegacyIfNeeded();
  if(activeId){const p=getLocalProject(activeId);if(p)applyProject(p);}
  installProjectUi();installFontSlider();responsiveRenderGrid();updateProjectHeader();renderProjectList();
  window.addEventListener('resize',()=>{clearTimeout(window.__pgGridResize);window.__pgGridResize=setTimeout(responsiveRenderGrid,120);});
  window.addEventListener('beforeunload',flushSave);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});
  safetyTimer=setInterval(()=>{if(activeId&&Date.now()-lastSaveAt>30000)flushSave();},30000);
})();
