/* Pad Grade v0.4.1 — archive lifecycle, browser backup, uniform five-line grid sizing. */
(function installPadGradeV041(){
  'use strict';

  const INDEX_KEY='padGradeProjectsV5';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREF_KEY='padGradeAppPrefsV1';
  const projectKey=id=>`padGradeProjectV5:${id}`;
  const $=id=>document.getElementById(id);
  const nowIso=()=>new Date().toISOString();
  const uid=()=>`pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const safeName=name=>String(name||'Pad').replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'Pad';

  function getIndex(){
    try{const v=JSON.parse(localStorage.getItem(INDEX_KEY)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}
  }
  function setIndex(v){localStorage.setItem(INDEX_KEY,JSON.stringify(v));}
  function getRaw(id){try{return JSON.parse(localStorage.getItem(projectKey(id))||'null');}catch(e){return null;}}
  function statusFor(item,p){return (p?.status||item?.status)==='archived'?'archived':'open';}
  function durableAvailable(){
    try{return !!(window.PadGradeNative&&typeof PadGradeNative.hasProjectFolder==='function'&&PadGradeNative.hasProjectFolder()&&typeof PadGradeNative.writeProjectFile==='function');}catch(e){return false;}
  }
  function writeDurable(p){if(!durableAvailable()||!p)return;try{PadGradeNative.writeProjectFile(`${p.id}.padgrade`,JSON.stringify(p));}catch(e){}}
  function deleteDurable(id){if(!durableAvailable())return;try{if(typeof PadGradeNative.deleteProjectFile==='function')PadGradeNative.deleteProjectFile(`${id}.padgrade`);}catch(e){}}

  function normalizeLifecycle(){
    const idx=getIndex();let changed=false;
    for(const item of idx){
      const p=getRaw(item.id);const status=statusFor(item,p);
      if(item.status!==status){item.status=status;changed=true;}
      if(p&&p.status!==status){p.status=status;localStorage.setItem(projectKey(item.id),JSON.stringify(p));writeDurable(p);}
    }
    if(changed)setIndex(idx);
  }

  function setProjectStatus(id,status){
    status=status==='archived'?'archived':'open';
    const idx=getIndex(),item=idx.find(x=>x.id===id),p=getRaw(id);
    if(!item||!p)return false;
    item.status=status;item.modifiedAt=nowIso();p.status=status;p.modifiedAt=item.modifiedAt;
    localStorage.setItem(projectKey(id),JSON.stringify(p));setIndex(idx);writeDurable(p);return true;
  }

  function openProject(id){
    const idx=getIndex(),item=idx.find(x=>x.id===id);if(!item||statusFor(item,getRaw(id))==='archived')return;
    localStorage.setItem(ACTIVE_KEY,id);location.reload();
  }
  function renameProject(id){
    const idx=getIndex(),item=idx.find(x=>x.id===id),p=getRaw(id);if(!item||!p)return;
    const name=prompt('Project name',p.settings?.name||item.name||'Pad');if(name===null||!name.trim())return;
    p.settings=p.settings||{};p.settings.name=name.trim();p.modifiedAt=nowIso();item.name=p.settings.name;item.modifiedAt=p.modifiedAt;item.status=statusFor(item,p);p.status=item.status;
    localStorage.setItem(projectKey(id),JSON.stringify(p));setIndex(idx);writeDurable(p);renderManager();
  }
  function duplicateProject(id){
    const src=getRaw(id);if(!src)return;
    const copy=JSON.parse(JSON.stringify(src));copy.id=uid();copy.status='open';copy.settings=copy.settings||{};copy.settings.name=`${copy.settings.name||'Pad'} Copy`;copy.createdAt=copy.modifiedAt=nowIso();
    localStorage.setItem(projectKey(copy.id),JSON.stringify(copy));const idx=getIndex();idx.push({id:copy.id,name:copy.settings.name,createdAt:copy.createdAt,modifiedAt:copy.modifiedAt,status:'open'});setIndex(idx);writeDurable(copy);renderManager();
  }
  function deleteProject(id){
    const idx=getIndex(),item=idx.find(x=>x.id===id);if(!item)return;
    const active=localStorage.getItem(ACTIVE_KEY);const open=idx.filter(x=>x.id!==id&&statusFor(x,getRaw(x.id))==='open');
    if(id===active&&!open.length){alert('At least one open project must remain.');return;}
    if(!confirm(`Delete ${item.name||'this project'} permanently?`))return;
    localStorage.removeItem(projectKey(id));deleteDurable(id);const next=idx.filter(x=>x.id!==id);setIndex(next);
    if(id===active){localStorage.setItem(ACTIVE_KEY,open[0].id);location.reload();return;}renderManager();
  }
  function archiveProject(id){
    const idx=getIndex(),active=localStorage.getItem(ACTIVE_KEY);const otherOpen=idx.filter(x=>x.id!==id&&statusFor(x,getRaw(x.id))==='open');
    if(id===active&&!otherOpen.length){alert('At least one open project must remain. Create or restore another project before archiving this one.');return;}
    if(!setProjectStatus(id,'archived'))return;
    if(id===active){localStorage.setItem(ACTIVE_KEY,otherOpen[0].id);location.reload();return;}renderManager();
  }
  function restoreProject(id){if(setProjectStatus(id,'open'))renderManager();}

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function rowHtml(item,archived){
    const current=item.id===localStorage.getItem(ACTIVE_KEY),stamp=new Date(item.modifiedAt||Date.now()).toLocaleString();
    return `<div class="v041-projectItem ${current?'current':''}" data-id="${item.id}"><div><b>${escapeHtml(item.name||'Pad')}</b><div class="v040-projectMeta">${current?'Current • ':''}${archived?'Archived • ':''}modified ${escapeHtml(stamp)}</div></div><div class="v040-projectActions">${archived?'<button data-act="restore">Restore</button>':'<button data-act="open">Open</button><button data-act="archive">Archive</button>'}<button data-act="rename">Rename</button><button data-act="copy">Duplicate</button><button data-act="export">Export</button><button class="danger" data-act="delete">Delete</button></div></div>`;
  }

  function bindRows(root){
    root?.querySelectorAll('.v041-projectItem').forEach(row=>row.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
      const id=row.dataset.id,act=btn.dataset.act;
      if(act==='open')openProject(id);else if(act==='archive')archiveProject(id);else if(act==='restore')restoreProject(id);else if(act==='rename')renameProject(id);else if(act==='copy')duplicateProject(id);else if(act==='export')exportOne(id);else if(act==='delete')deleteProject(id);
    }));
  }

  function renderManager(){
    const list=$('v040ProjectList'),dlg=$('projectsDlg');if(!list||!dlg)return;
    const idx=getIndex().map(x=>({...x,status:statusFor(x,getRaw(x.id))}));
    const open=idx.filter(x=>x.status==='open').sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
    const archived=idx.filter(x=>x.status==='archived').sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
    list.innerHTML=open.map(x=>rowHtml(x,false)).join('')||'<div class="small">No open projects.</div>';
    let details=$('v041ArchivedDetails');
    if(!details){details=document.createElement('details');details.id='v041ArchivedDetails';details.className='v041-archived';list.insertAdjacentElement('afterend',details);}
    details.innerHTML=`<summary>Archived Projects <span>${archived.length}</span></summary><div id="v041ArchivedList" class="v040-projectList">${archived.map(x=>rowHtml(x,true)).join('')||'<div class="small v041-empty">No archived projects.</div>'}</div>`;
    bindRows(list);bindRows($('v041ArchivedList'));
  }

  function fileText(filename,mime,text){
    try{if(window.PadGradePlatform?.saveTextFile?.(filename,mime,text))return;}catch(e){}
    const blob=new Blob([text],{type:mime||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportPayload(id){
    const idx=getIndex(),item=idx.find(x=>x.id===id),p=getRaw(id);if(!p)return null;
    return {...p,status:statusFor(item,p),schemaVersion:Number(p.schemaVersion||p.version||5),version:Number(p.version||p.schemaVersion||5),exportedAt:nowIso()};
  }
  function exportOne(id){
    const p=exportPayload(id);if(!p)return;const name=safeName(p.settings?.name||'Pad');fileText(`${name}.padgrade`,'application/octet-stream',JSON.stringify(p,null,2));
  }
  function backupAll(){
    const idx=getIndex();const projects=idx.map(x=>exportPayload(x.id)).filter(Boolean);const payload={app:'Pad Grade Mapper',backupType:'all-projects',backupVersion:1,exportedAt:nowIso(),activeProjectId:localStorage.getItem(ACTIVE_KEY)||null,projects};
    fileText(`Pad-Grade-Backup-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(payload,null,2));
  }

  function modifiedMs(p){const n=Date.parse(p?.modifiedAt||p?.exportedAt||'');return Number.isFinite(n)?n:0;}
  function importSingle(data){
    const idx=getIndex();let p=JSON.parse(JSON.stringify(data));if(!p.settings)throw new Error('Invalid Pad Grade project.');
    const collision=idx.some(x=>x.id===p.id);if(!p.id||collision)p.id=uid();p.status=p.status==='archived'?'archived':'open';p.createdAt=p.createdAt||nowIso();p.modifiedAt=nowIso();
    localStorage.setItem(projectKey(p.id),JSON.stringify(p));idx.push({id:p.id,name:p.settings.name||'Pad',createdAt:p.createdAt,modifiedAt:p.modifiedAt,status:p.status});setIndex(idx);writeDurable(p);
    if(p.status==='open')localStorage.setItem(ACTIVE_KEY,p.id);return p;
  }
  function restoreBackup(data){
    if(!Array.isArray(data.projects))throw new Error('Invalid Pad Grade backup.');
    const idx=getIndex(),byId=new Map(idx.map(x=>[x.id,x]));
    for(const incomingRaw of data.projects){
      if(!incomingRaw?.id||!incomingRaw.settings)continue;
      const incoming=JSON.parse(JSON.stringify(incomingRaw));incoming.status=incoming.status==='archived'?'archived':'open';const local=getRaw(incoming.id);
      if(!local||modifiedMs(incoming)>=modifiedMs(local)){localStorage.setItem(projectKey(incoming.id),JSON.stringify(incoming));writeDurable(incoming);}
      const best=(!local||modifiedMs(incoming)>=modifiedMs(local))?incoming:local;byId.set(best.id,{id:best.id,name:best.settings?.name||'Pad',createdAt:best.createdAt||nowIso(),modifiedAt:best.modifiedAt||nowIso(),status:best.status==='archived'?'archived':'open'});
    }
    const next=[...byId.values()];setIndex(next);
    const desired=next.find(x=>x.id===data.activeProjectId&&x.status!=='archived')||next.find(x=>x.status!=='archived');if(desired)localStorage.setItem(ACTIVE_KEY,desired.id);
    return {backup:true,count:data.projects.length};
  }

  function installImportExport(){
    window.importProjectFile=async function(file){
      const raw=await file.text(),data=JSON.parse(raw);const result=(data?.backupType==='all-projects'||Array.isArray(data?.projects))?restoreBackup(data):importSingle(data);setTimeout(()=>location.reload(),50);return result;
    };
    const old=$('exportProjectBtn');if(old&&!old.dataset.v041){const fresh=old.cloneNode(true);fresh.dataset.v041='1';fresh.textContent='Export Project';old.replaceWith(fresh);fresh.onclick=()=>{const id=localStorage.getItem(ACTIVE_KEY);if(id)exportOne(id);};}
  }

  function installToolbar(){
    const dlg=$('projectsDlg'),toolbar=dlg?.querySelector('.v040-projectToolbar');if(!toolbar||$('v041BackupAll'))return;
    const exp=document.createElement('button');exp.id='v041ExportCurrent';exp.textContent='Export Current';exp.onclick=()=>{const id=localStorage.getItem(ACTIVE_KEY);if(id)exportOne(id);};
    const all=document.createElement('button');all.id='v041BackupAll';all.textContent='Backup All';all.onclick=backupAll;
    toolbar.append(exp,all);
  }

  function prefs(){try{return {minGridFont:2,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}catch(e){return {minGridFont:2};}}
  function renderUniformGrid(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';
    const minFont=Math.max(2,Math.min(20,+prefs().minGridFont||2));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const available=Math.max(220,shell.clientWidth-16),fitW=available/s.cols,fitH=fitW/ratio;
    // Every cell reserves the same five populated lines: point, X offset, Y offset, reading, cut/fill.
    const fitFont=Math.min(20,fitW/7.5,fitH/6.0);
    const fit=fitFont>=minFont;
    let cellW,cellH,font;
    if(fit){cellW=fitW;cellH=fitH;font=Math.max(minFont,fitFont);shell.classList.add('fit');g.className='v040-fit v041-uniform';g.style.width='100%';g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;}
    else{font=minFont;cellH=Math.max(font*6.0,(font*7.5)/ratio);cellW=cellH*ratio;shell.classList.remove('fit');g.className='v040-scroll v041-uniform';g.style.width='max-content';g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(1)}px)`;g.style.gridAutoRows=`${cellH.toFixed(1)}px`;}
    g.style.setProperty('--grid-font',`${font.toFixed(1)}px`);
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;d.onclick=()=>openPoint(rr,c);g.appendChild(d);
    }
    updateStats();let mode=$('v040GridMode');if(!mode){mode=document.createElement('span');mode.id='v040GridMode';mode.className='v040-gridMode';g.closest('.card')?.querySelector('.legend')?.appendChild(mode);}if(mode)mode.textContent=fit?`Fit view • ${font.toFixed(1)} px • uniform`:`Scroll view • ${font.toFixed(0)} px min • uniform`;
  }

  function installGrid(){window.renderGrid=renderUniformGrid;renderUniformGrid();window.addEventListener('resize',()=>{clearTimeout(window.__pg041Resize);window.__pg041Resize=setTimeout(renderUniformGrid,120);});}

  function boot(){
    normalizeLifecycle();installImportExport();installToolbar();renderManager();installGrid();
    const projectsBtn=$('v040ProjectsBtn');if(projectsBtn)projectsBtn.addEventListener('click',()=>setTimeout(()=>{installToolbar();renderManager();},0));
    setInterval(()=>{if($('projectsDlg')?.open&&!$('v040ProjectList')?.querySelector('.v041-projectItem'))renderManager();},350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();
