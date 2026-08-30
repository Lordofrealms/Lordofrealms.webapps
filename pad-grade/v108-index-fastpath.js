/* Pad Grade v1.0.8 DEV — in-memory durable catalog fast path. */
(function installPadGrade108CatalogFastPath(){
  'use strict';
  const A=window.PadGradeProjectIndexV107;if(!A||typeof A.ensureCatalog!=='function')return;
  const diag=()=>window.PadGradeDiag||null;
  const underlying=A.ensureCatalog.bind(A);let dirty=true,lastVerifiedAt=0;
  function markDirty(reason){dirty=true;diag()?.mark?.('index.catalog-memory-dirty',{reason:String(reason||'folder-change')});}
  function markClean(){dirty=false;lastVerifiedAt=Date.now();}
  window.addEventListener('padgrade-projects-reconciled',markClean);
  for(const ev of ['padgrade-project-folder-selected','padgrade-project-folder-indexed','padgrade-project-folder-refreshed'])window.addEventListener(ev,()=>markDirty(ev));
  A.ensureCatalog=async function(){
    const current=A.catalog?.()||[];
    if(!dirty&&Array.isArray(current)){
      diag()?.mark?.('index.catalog-memory-hit',{projects:current.length,ageMs:Math.max(0,Date.now()-lastVerifiedAt)});
      return {projects:current.length,memoryHit:true,zeroProjectReads:true,changedFiles:0};
    }
    const out=await underlying();markClean();return out;
  };
  A.markCatalogDirtyV108=markDirty;A.markCatalogCleanV108=markClean;
  window.__padGradeCatalogMemoryFastPathV108={isDirty:()=>dirty,lastVerifiedAt:()=>lastVerifiedAt};
})();
