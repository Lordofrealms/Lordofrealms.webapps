(()=>{
  function installTractorStorageDiagnostics(){
    if(window.__TRACTOR_STORAGE_DIAGNOSTICS_INSTALLED)return true;
    window.__TRACTOR_STORAGE_DIAGNOSTICS_INSTALLED=true;
    const dlg=document.getElementById('storageDlg');
    const urlEl=document.getElementById('diagUrl');
    if(!dlg||!urlEl)return false;

    const grid=dlg.querySelector('.diagGrid');
    let buildEl=document.getElementById('diagBuild');
    if(grid&&!buildEl){
      const label=document.createElement('b');label.textContent='App build';
      buildEl=document.createElement('span');buildEl.id='diagBuild';
      const dbLabel=[...grid.querySelectorAll('b')].find(b=>b.textContent.trim()==='Database');
      if(dbLabel){grid.insertBefore(label,dbLabel);grid.insertBefore(buildEl,dbLabel)}
      else grid.prepend(label,buildEl);
    }

    function refresh(){
      try{
        const u=new URL(location.href);
        u.search='';u.hash='';
        urlEl.textContent=u.href;
      }catch(e){urlEl.textContent=location.href}
      if(buildEl)buildEl.textContent=window.TRACTOR_ASSET_VERSION||'unknown';
    }

    const storageBtn=document.getElementById('storageBtn');
    if(storageBtn)storageBtn.addEventListener('click',()=>setTimeout(refresh,0));
    dlg.addEventListener('toggle',refresh);
    refresh();
    window.refreshTractorStorageDiagnostics=refresh;
    return true;
  }
  window.installTractorStorageDiagnostics=installTractorStorageDiagnostics;
})();
