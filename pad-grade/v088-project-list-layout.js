/* Pad Grade v0.9.3 DEV — stable project-list File ID row height.
 *
 * Project manager layers rebuild their row HTML after actions such as Delete.
 * File IDs are hydrated later by v080. The head stylesheet now reserves the
 * final File-ID slot in every row before hydration; this module still inserts a
 * placeholder immediately for semantic consistency and late-created rows.
 */
(function installPadGrade088ProjectListLayout(){
  'use strict';

  function ensurePlaceholder(row){
    if(!row||row.querySelector(':scope > div:first-child > .pgFileIdInline'))return;
    const textHost=row.firstElementChild;
    if(!textHost)return;
    const slot=document.createElement('div');
    slot.className='pgFileIdInline pgFileIdPending';
    slot.textContent='\u00a0';
    textHost.appendChild(slot);
  }

  function hydrate(root=document){
    root.querySelectorAll?.('.v040-projectItem,.v041-projectItem').forEach(ensurePlaceholder);
  }

  // Duplicate the head-loaded layout geometry as a runtime safety net. The
  // absolute File-ID line lives inside already-reserved padding, so changing the
  // placeholder text cannot change the project-card height.
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

  const start=()=>{
    hydrate();
    observer.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.__padGradeProjectListFileIdLayoutV093='head-reserved-absolute-slot-hydration-never-resizes-row';
  // Compatibility marker for existing CI.
  window.__padGradeProjectListFileIdLayoutV088='reserved-before-hydration-no-row-shift';
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
