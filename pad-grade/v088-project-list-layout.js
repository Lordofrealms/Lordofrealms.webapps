/* Pad Grade v0.8.8 DEV — stable project-list File ID row height.
 *
 * Project manager layers rebuild their row HTML after actions such as Delete.
 * File IDs are hydrated later by v080. Reserve that line immediately, before
 * the browser paints the rebuilt list, so late ID text cannot shift buttons.
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

  const style=document.createElement('style');
  style.id='pgProjectListStableFileIdLayout';
  style.textContent='.pgFileIdInline{min-height:.86rem;line-height:.86rem}.pgFileIdPending{visibility:hidden}';
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

  window.__padGradeProjectListFileIdLayoutV088='reserved-before-hydration-no-row-shift';
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
