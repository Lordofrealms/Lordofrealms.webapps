/* Pad Grade v0.9.4 DEV — stable project-list File ID row height + immediate local hydration.
 *
 * Project manager layers rebuild row HTML after actions such as Delete. The final
 * File-ID slot is reserved before hydration. Existing IDs are now read directly
 * from the same local project/index data used for project names, so first paint
 * does not wait for durable-folder indexing or the File-ID module's later poll.
 */
(function installPadGrade088ProjectListLayout(){
  'use strict';
  const FILE_MAP_KEY='padGradeFileIdsV1';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const FILE_ID_RE=/^[A-HJ-NP-Z]{4}[2-9]{2}$/;

  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function valid(value){const s=String(value||'').toUpperCase();return FILE_ID_RE.test(s)?s:null;}
  function localFileId(id){
    if(!id)return null;
    const map=parse(localStorage.getItem(FILE_MAP_KEY),{})||{};
    const mapped=valid(map[id]);if(mapped)return mapped;
    const project=parse(localStorage.getItem(`${PROJECT_PREFIX}${id}`),null);
    return valid(project?.fileId);
  }

  function ensurePlaceholder(row){
    if(!row)return;
    const textHost=row.firstElementChild;if(!textHost)return;
    let slot=textHost.querySelector(':scope > .pgFileIdInline');
    if(!slot){slot=document.createElement('div');slot.className='pgFileIdInline pgFileIdPending';textHost.appendChild(slot);}
    const fid=localFileId(row.dataset?.id);
    slot.textContent=fid?`File ID ${fid}`:'\u00a0';
    slot.classList.toggle('pgFileIdPending',!fid);
  }

  function hydrate(root=document){root.querySelectorAll?.('.v040-projectItem,.v041-projectItem').forEach(ensurePlaceholder);}

  const style=document.createElement('style');
  style.id='pgProjectListStableFileIdLayout';
  style.textContent=`
    .v040-projectItem>div:first-child,.v041-projectItem>div:first-child{position:relative;padding-bottom:1.18rem}
    .pgFileIdInline{position:absolute;left:0;right:0;bottom:0;height:1rem;line-height:1rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(!(node instanceof Element))continue;
        if(node.matches?.('.v040-projectItem,.v041-projectItem'))ensurePlaceholder(node);
        hydrate(node);
      }
    }
  });

  const start=()=>{hydrate();observer.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  // Re-hydrate immediately after local File-ID normalization/migration events.
  window.addEventListener('padgrade-projects-reconciled',()=>hydrate());
  window.addEventListener('padgrade-durable-sync-ready',()=>hydrate());

  window.__padGradeProjectListFileIdLayoutV094='head-reserved-slot-local-id-hydrated-on-first-row-paint';
  window.__padGradeProjectListFileIdLayoutV093='head-reserved-absolute-slot-hydration-never-resizes-row';
  window.__padGradeProjectListFileIdLayoutV088='reserved-before-hydration-no-row-shift';
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
