(()=>{
  function installTractorDataIntegrity(){
    if(window.__TRACTOR_DATA_INTEGRITY_INSTALLED)return true;if(typeof requireDB!=='function')return false;window.__TRACTOR_DATA_INTEGRITY_INSTALLED=true;const broken=new Map();
    const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});async function all(store){const d=requireDB(),tx=d.transaction(store,'readonly');return await reqP(tx.objectStore(store).getAll())}async function sessions(){return await all('sessions')}async function paths(){return await all('pathings')}const pathId=s=>s?.drivePathingId||s?.selectedPathingId||null;async function refs(id){return (await sessions()).filter(s=>pathId(s)===id)}async function getPath(id){const d=requireDB(),tx=d.transaction('pathings','readonly');return await reqP(tx.objectStore('pathings').get(id))}async function putPath(p){const d=requireDB(),tx=d.transaction('pathings','readwrite');tx.objectStore('pathings').put(p);await txDone(tx);return p}

    // Storage-boundary protection: legacy/core UI is not allowed to delete path data directly.
    // Only guardedDeletePath() below may temporarily unlock these stores after checking references.
    if(!window.__TRACTOR_PATH_DELETE_GUARD_INSTALLED&&window.IDBObjectStore){
      window.__TRACTOR_PATH_DELETE_GUARD_INSTALLED=true;
      window.__TRACTOR_PATH_DELETE_PERMIT=0;
      const nativeDelete=IDBObjectStore.prototype.delete;
      const nativeClear=IDBObjectStore.prototype.clear;
      window.__TRACTOR_NATIVE_IDB_DELETE=nativeDelete;
      window.__TRACTOR_NATIVE_IDB_CLEAR=nativeClear;
      IDBObjectStore.prototype.delete=function(key){
        if((this.name==='pathings'||this.name==='pathSegments')&&!window.__TRACTOR_PATH_DELETE_PERMIT){
          const msg='Saved path deletion is protected. Use the current Saved Paths library; paths referenced by drive sessions cannot be deleted.';
          console.warn(msg,{store:this.name,key});
          try{alert(msg)}catch(e){}
          throw new DOMException(msg,'InvalidStateError');
        }
        return nativeDelete.call(this,key);
      };
      IDBObjectStore.prototype.clear=function(){
        if((this.name==='pathings'||this.name==='pathSegments')&&!window.__TRACTOR_PATH_DELETE_PERMIT){
          const msg='Saved path storage is protected from direct clearing.';
          console.warn(msg,{store:this.name});
          try{alert(msg)}catch(e){}
          throw new DOMException(msg,'InvalidStateError');
        }
        return nativeClear.call(this);
      };
    }

    async function archivePath(id){const p=await getPath(id);if(!p)throw Error('Path no longer exists.');p.archived=true;p.archivedAt=Date.now();return await putPath(p)}async function recoverPath(id){const p=await getPath(id);if(!p)throw Error('Path no longer exists.');delete p.archived;delete p.archivedAt;return await putPath(p)}
    async function guardedDeletePath(id){
      const used=await refs(id);if(used.length){const names=used.map(s=>s?.driveName||s?.settings?.sessionName||s?.drivePathingName||s?.selectedPathingName||s.id).slice(0,6);throw Error(`This path is protected by ${used.length} drive session${used.length===1?'':'s'}: ${names.join(', ')}. Delete those drives first, or archive the path.`)}
      try{if(typeof selectedPathingId!=='undefined'&&selectedPathingId===id)throw Error('This path is currently selected. Select another path before permanently deleting it.')}catch(e){if(e?.message?.startsWith('This path'))throw e}
      const d=requireDB(),tx=d.transaction(['pathings','pathSegments'],'readwrite');
      window.__TRACTOR_PATH_DELETE_PERMIT++;
      try{
        tx.objectStore('pathings').delete(id);
        const idx=tx.objectStore('pathSegments').index('byPathing'),keys=await reqP(idx.getAllKeys(IDBKeyRange.only(id)));for(const k of keys)tx.objectStore('pathSegments').delete(k);
        await txDone(tx);
      }finally{window.__TRACTOR_PATH_DELETE_PERMIT=Math.max(0,(window.__TRACTOR_PATH_DELETE_PERMIT||1)-1)}
    }
    async function deleteDrive(id){const d=requireDB(),tx=d.transaction(['sessions','points'],'readwrite');tx.objectStore('sessions').delete(id);const idx=tx.objectStore('points').index('bySession'),keys=await reqP(idx.getAllKeys(IDBKeyRange.only(id)));for(const k of keys)tx.objectStore('points').delete(k);await txDone(tx);broken.delete(id)}
    async function scan(){broken.clear();const [ss,pp]=await Promise.all([sessions(),paths()]),ids=new Set(pp.map(p=>p.id));for(const s of ss){const id=pathId(s);if(id&&!ids.has(id))broken.set(s.id,{session:s,missingPathId:id})}refreshBrokenDialog();return broken}
    const dlg=document.createElement('dialog');dlg.innerHTML='<div class="modal"><h2>Drive Data Integrity</h2><div class="small">These drive records reference paths that no longer exist and cannot be loaded safely.</div><div id="integrityList"></div><div class="modalActions"><button id="integrityClose">Close</button></div></div>';document.body.appendChild(dlg);dlg.querySelector('#integrityClose').onclick=()=>dlg.close();function refreshBrokenDialog(){const h=dlg.querySelector('#integrityList');h.replaceChildren();for(const {session:s,missingPathId:id} of broken.values()){const r=document.createElement('div');r.className='integrityBad';r.innerHTML=`<b>${escapeHTML(s?.driveName||s?.settings?.sessionName||s?.drivePathingName||s?.selectedPathingName||'Drive')}</b><div class="small">Missing path ${escapeHTML(id)}</div>`;const b=document.createElement('button');b.className='danger';b.textContent='Delete broken drive';b.onclick=async()=>{if(confirm('Permanently delete this broken drive and its GPS points?')){await deleteDrive(s.id);await scan();await refreshPathLibrary()}};r.appendChild(b);h.appendChild(r)}}
    const pdlg=document.createElement('dialog');pdlg.innerHTML='<div class="modal"><div class="statusRow"><div><h2>Saved Paths</h2><div class="small">Paths referenced by drives are protected at the database level. Archive preserves history without exposing the path in normal planning.</div></div><button id="safePathClose">Close</button></div><div id="safePathList"></div></div>';document.body.appendChild(pdlg);pdlg.querySelector('#safePathClose').onclick=()=>pdlg.close();const ph=pdlg.querySelector('#safePathList');async function refreshPathLibrary(){const [pp,ss]=await Promise.all([paths(),sessions()]),by=new Map();for(const s of ss){const id=pathId(s);if(!id)continue;if(!by.has(id))by.set(id,[]);by.get(id).push(s)}pp.sort((a,b)=>Boolean(a.archived)-Boolean(b.archived)||(b.updatedAt||0)-(a.updatedAt||0));ph.replaceChildren();for(const p of pp){const used=by.get(p.id)||[],r=document.createElement('div');r.className='pathSafeItem'+(p.archived?' pathArchived':'');r.innerHTML=`<div class="pathSafeTop"><div><b>${escapeHTML(p.name||p.pathingName||'Saved path')}</b><div class="small">${p.archived?'ARCHIVED':''}</div></div><span class="badge">${used.length} drive${used.length===1?'':'s'}</span></div>`;if(used.length){const dep=document.createElement('div');dep.className='small';dep.style.marginTop='5px';dep.textContent='Protected by: '+used.map(s=>s?.driveName||s?.settings?.sessionName||s?.settings?.operation||s.id).join(', ');r.appendChild(dep)}const a=document.createElement('button');a.textContent=p.archived?'Recover':'Archive';a.onclick=async()=>{p.archived?await recoverPath(p.id):await archivePath(p.id);refreshPathLibrary()};const d=document.createElement('button');d.className='danger';d.textContent=used.length?'Protected':'Delete';d.disabled=!!used.length;d.onclick=async()=>{if(confirm('Permanently delete this unreferenced path?')){try{await guardedDeletePath(p.id);refreshPathLibrary()}catch(e){alert(e.message)}}};r.append(a,d);ph.appendChild(r)}}function openPathLibrary(){refreshPathLibrary();pdlg.showModal()}for(const id of ['pathingsBtn','openPathingsBtn']){const b=document.getElementById(id);if(b)b.onclick=openPathLibrary}
    const st=document.createElement('style');st.textContent='.integrityBad,.pathSafeItem{border:1px solid var(--line);border-radius:10px;padding:9px;margin:7px 0}.pathSafeTop{display:flex;justify-content:space-between}.pathArchived{opacity:.7}.pathSafeItem>button{margin:7px 5px 0 0}';document.head.appendChild(st);window.TractorIntegrity={scan,isBroken:id=>broken.has(id),broken,paths,sessions,refs,archivePath,recoverPath,deletePath:guardedDeletePath,deleteDrive,openPathLibrary,refreshPathLibrary};setTimeout(async()=>{await scan();if(broken.size)dlg.showModal()},500);return true
  }window.installTractorDataIntegrity=installTractorDataIntegrity;
})();