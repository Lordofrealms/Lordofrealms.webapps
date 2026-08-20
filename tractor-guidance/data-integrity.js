(()=>{
  function installTractorDataIntegrity(){
    if(window.__TRACTOR_DATA_INTEGRITY_INSTALLED)return true;
    if(typeof requireDB!=='function')return false;
    window.__TRACTOR_DATA_INTEGRITY_INSTALLED=true;
    const broken=new Map();

    const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});
    async function all(store){const d=requireDB(),tx=d.transaction(store,'readonly');return await reqP(tx.objectStore(store).getAll())}
    async function sessions(){return await all('sessions')}
    async function paths(){return await all('pathings')}
    async function refs(pathId){return (await sessions()).filter(s=>s?.selectedPathingId===pathId)}
    async function getPath(id){const d=requireDB(),tx=d.transaction('pathings','readonly');return await reqP(tx.objectStore('pathings').get(id))}
    async function putPath(rec){const d=requireDB(),tx=d.transaction('pathings','readwrite');tx.objectStore('pathings').put(rec);await txDone(tx);return rec}

    async function archivePath(id){const p=await getPath(id);if(!p)throw new Error('Path no longer exists.');p.archived=true;p.archivedAt=Date.now();await putPath(p);return p}
    async function recoverPath(id){const p=await getPath(id);if(!p)throw new Error('Path no longer exists.');delete p.archived;delete p.archivedAt;await putPath(p);return p}
    async function deletePath(id){
      const used=await refs(id);if(used.length){const names=used.map(s=>s?.settings?.sessionName||s?.selectedPathingName||s.id).slice(0,5);throw new Error(`This path is protected by ${used.length} drive session${used.length===1?'':'s'}: ${names.join(', ')}. Delete those drives first, or archive the path.`)}
      try{if(typeof selectedPathingId!=='undefined'&&selectedPathingId===id)throw new Error('This path is currently selected. Select another path before permanently deleting it.')}catch(e){if(e?.message?.startsWith('This path'))throw e}
      const d=requireDB(),tx=d.transaction(['pathings','pathSegments'],'readwrite');tx.objectStore('pathings').delete(id);const idx=tx.objectStore('pathSegments').index('byPathing');const keys=await reqP(idx.getAllKeys(IDBKeyRange.only(id)));for(const k of keys)tx.objectStore('pathSegments').delete(k);await txDone(tx);
    }
    async function deleteDrive(id){
      const d=requireDB(),tx=d.transaction(['sessions','points'],'readwrite');tx.objectStore('sessions').delete(id);const idx=tx.objectStore('points').index('bySession');const keys=await reqP(idx.getAllKeys(IDBKeyRange.only(id)));for(const k of keys)tx.objectStore('points').delete(k);await txDone(tx);if(localStorage.getItem('tractorActiveSessionId')===id)localStorage.removeItem('tractorActiveSessionId');broken.delete(id);
    }

    async function scan(){
      broken.clear();const [ss,pp]=await Promise.all([sessions(),paths()]);const ids=new Set(pp.map(p=>p.id));
      for(const s of ss){if(s?.selectedPathingId&&!ids.has(s.selectedPathingId))broken.set(s.id,{session:s,missingPathId:s.selectedPathingId})}
      refreshBrokenDialog();return broken;
    }

    const dlg=document.createElement('dialog');dlg.id='integrityDlg';dlg.innerHTML=`<div class="modal"><h2>Drive Data Integrity</h2><div class="small">These legacy drive records reference saved paths that no longer exist. They cannot be resumed or viewed safely. This should not occur for drives created under current path-protection rules.</div><div id="integrityList" style="margin-top:10px"></div><div class="modalActions"><button id="integrityClose">Close</button></div></div>`;document.body.appendChild(dlg);dlg.querySelector('#integrityClose').onclick=()=>dlg.close();
    const style=document.createElement('style');style.textContent=`.integrityBad{border:1px solid #7d4038;background:#251512;border-radius:10px;padding:9px;margin:7px 0}.integrityBad b{display:block}.integrityBad .small{margin:3px 0 7px}.pathSafeItem{border:1px solid var(--line);background:#0d151b;border-radius:11px;padding:9px;margin:7px 0}.pathSafeTop{display:flex;justify-content:space-between;gap:8px}.pathSafeBtns{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.pathArchived{opacity:.72}.pathRefs{font-size:.63rem;color:#a9cde3;margin-top:4px}`;document.head.appendChild(style);
    function refreshBrokenDialog(){const host=dlg.querySelector('#integrityList');host.replaceChildren();for(const {session:s,missingPathId} of broken.values()){const r=document.createElement('div');r.className='integrityBad';r.innerHTML=`<b>${escapeHTML(s?.settings?.sessionName||s?.selectedPathingName||'Legacy drive')}</b><div class="small">${escapeHTML(s?.settings?.operation||'Drive')} • missing path ${escapeHTML(missingPathId)}</div>`;const b=document.createElement('button');b.className='danger';b.textContent='Delete broken drive';b.onclick=async()=>{if(!confirm('Permanently delete this broken drive and its recorded GPS points?'))return;await deleteDrive(s.id);await scan();await refreshPathLibrary()};r.appendChild(b);host.appendChild(r)}}

    const pdlg=document.createElement('dialog');pdlg.id='safePathDlg';pdlg.innerHTML=`<div class="modal"><div class="statusRow"><div><h2 style="margin:0">Saved Paths</h2><div class="small">Paths used by any drive are protected from permanent deletion. Archive hides a path from normal planning while preserving historical drives.</div></div><button id="safePathClose">Close</button></div><div id="safePathList" style="margin-top:10px"></div></div>`;document.body.appendChild(pdlg);pdlg.querySelector('#safePathClose').onclick=()=>pdlg.close();
    const phost=pdlg.querySelector('#safePathList');
    async function refreshPathLibrary(){
      const [pp,ss]=await Promise.all([paths(),sessions()]);const by=new Map();for(const s of ss){if(!s?.selectedPathingId)continue;if(!by.has(s.selectedPathingId))by.set(s.selectedPathingId,[]);by.get(s.selectedPathingId).push(s)}
      pp.sort((a,b)=>Boolean(a.archived)-Boolean(b.archived)||(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));phost.replaceChildren();if(!pp.length){phost.innerHTML='<div class="small">No saved paths.</div>';return}
      for(const p of pp){const used=by.get(p.id)||[],row=document.createElement('div');row.className='pathSafeItem'+(p.archived?' pathArchived':'');const top=document.createElement('div');top.className='pathSafeTop';top.innerHTML=`<div><b>${escapeHTML(p.name||p.pathingName||'Saved path')}</b><div class="small">${p.archived?'ARCHIVED • ':''}${escapeHTML(p.settings?.pathType||p.planMeta?.type||'path')}</div></div><span class="badge">${used.length} drive${used.length===1?'':'s'}</span>`;row.appendChild(top);if(used.length){const u=document.createElement('div');u.className='pathRefs';u.textContent='Protected by: '+used.map(s=>s?.settings?.sessionName||s?.settings?.operation||s.id).join(', ');row.appendChild(u)}const btns=document.createElement('div');btns.className='pathSafeBtns';const load=document.createElement('button');load.textContent='Load';load.disabled=p.archived;load.onclick=async()=>{try{if(typeof loadPathing==='function'){await loadPathing(p.id);pdlg.close()}else alert('Path loading is unavailable in this build.')}catch(e){alert('Could not load path: '+(e?.message||e))}};btns.appendChild(load);const arc=document.createElement('button');arc.textContent=p.archived?'Recover':'Archive';arc.onclick=async()=>{try{p.archived?await recoverPath(p.id):await archivePath(p.id);await refreshPathLibrary()}catch(e){alert(e?.message||e)}};btns.appendChild(arc);const del=document.createElement('button');del.className='danger';del.textContent='Delete';del.disabled=used.length>0;del.title=used.length?'Delete the associated drives first.':'Permanently delete this unreferenced path.';del.onclick=async()=>{if(!confirm('Permanently delete this saved path?'))return;try{await deletePath(p.id);await refreshPathLibrary()}catch(e){alert(e?.message||e)}};btns.appendChild(del);row.appendChild(btns);phost.appendChild(row)}
    }
    function openPathLibrary(){refreshPathLibrary();pdlg.showModal()}
    for(const id of ['pathingsBtn','openPathingsBtn']){const b=document.getElementById(id);if(b)b.onclick=openPathLibrary}

    window.TractorIntegrity={scan,isBroken:id=>broken.has(id),broken,paths,sessions,refs,archivePath,recoverPath,deletePath,deleteDrive,openPathLibrary,refreshPathLibrary};
    setTimeout(async()=>{try{await scan();if(broken.size){const key='tractorIntegrityPrompt_'+(window.TRACTOR_ASSET_VERSION||'unknown');if(sessionStorage.getItem(key)!=='1'){sessionStorage.setItem(key,'1');dlg.showModal()}}}catch(e){console.warn('Drive integrity scan failed',e)}},400);
    return true;
  }
  window.installTractorDataIntegrity=installTractorDataIntegrity;
})();
