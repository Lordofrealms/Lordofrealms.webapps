$('readingInput').addEventListener('input',updateModalResult);
$('savePoint').onclick=()=>{
  saveCurrent(); $('entryDlg').close();
  if(measureMode==='gps'){
    gpsTargetIndex=(gpsRef&&gpsOpposite)?nextGpsRouteIndex(true,currentIndex):null;
    saveLocal(); updateGpsUI();
  }else nextPoint(true);
};
$('deletePoint').onclick=()=>{
  const {r,c}=pointFromIndex(currentIndex); delete readings[k(r,c)]; delete readingMeta[k(r,c)];
  saveLocal(); renderGrid(); $('readingInput').value=''; updateModalResult();
};
$('closeEntry').onclick=()=>{saveCurrent(); $('entryDlg').close()};
$('prevPoint').onclick=()=>{saveCurrent(); $('entryDlg').close(); prevPoint()};
$('nextBtn').onclick=nextEmpty; $('nextBottom').onclick=nextEmpty;
$('saveBtn').onclick=()=>{saveLocal(); const old=$('saveBtn').textContent; $('saveBtn').textContent='Saved ✓'; setTimeout(()=>$('saveBtn').textContent=old,900)};
$('exportProjectBtn').onclick=exportProject;
$('importProjectBtn').onclick=()=>$('importProjectFile').click();
$('importProjectFile').addEventListener('change',async e=>{
  const file=e.target.files && e.target.files[0];
  if(!file) return;
  try{
    await importProjectFile(file);
    alert('Project imported successfully.');
  }catch(err){
    alert('Could not import project: '+err.message);
  }finally{
    e.target.value='';
  }
});
$('exportBtn').onclick=exportCSV;
$('clearBtn').onclick=()=>{ if(confirm('Clear all rod readings?')){readings={};readingMeta={};gpsTargetIndex=null;saveLocal();renderGrid();updateGpsUI()} };
$('topBtn').onclick=()=>scrollTo({top:0,behavior:'smooth'});

document.querySelectorAll('.cornerBtn').forEach(btn=>{
  btn.onclick=()=>{
    const oldCorner=$('refCorner').value;
    $('refCorner').value=btn.dataset.corner;
    if(oldCorner!==btn.dataset.corner){ gpsRef=null; gpsOpposite=null; gpsTargetIndex=null; }
    updateCornerPicker();
  };
});

$('settingsBtn').onclick=()=>{
  updateCornerPicker();
  $('settingsDlg').showModal();
};
$('cancelSettings').onclick=()=>$('settingsDlg').close();
$('applySettings').onclick=()=>{
  // Drop readings that no longer fit resized grid.
  const s=cfg(), clean={};
  for(const [key,val] of Object.entries(readings)){
    const [r,c]=key.split(',').map(Number);
    if(r<s.rows && c<s.cols) clean[key]=val;
  }
  readings=clean;
  const metaClean={};
  for(const [key,val] of Object.entries(readingMeta)){
    const [r,c]=key.split(',').map(Number);
    if(r<s.rows && c<s.cols) metaClean[key]=val;
  }
  readingMeta=metaClean; gpsTargetIndex=null; ensureGpsTarget();
  saveLocal(); renderGrid(); updateCornerPicker(); updateGpsUI(); $('settingsDlg').close();
};

$('manualModeBtn').onclick=()=>setMeasureMode('manual');
$('gpsModeBtn').onclick=()=>setMeasureMode('gps');
$('gpsRefreshBtn').onclick=()=>{stopGpsWatch();gpsPos=null;gpsEnabled=false;requestGpsAccess();};
$('setGpsRefBtn').onclick=setGpsReferenceHere;
$('setGpsOppBtn').onclick=setGpsOppositeHere;
$('gpsNextBtn').onclick=()=>{
  if(!gpsRef || !gpsOpposite){alert('Set both GPS calibration corners first.');return;}
  const idx=nextGpsRouteIndex(true,gpsTargetIndex);
  if(idx==null) alert('All grid points have readings.'); else {gpsTargetIndex=idx;saveLocal();updateGpsUI();}
};
$('gpsPrevBtn').onclick=()=>{if(!gpsRef || !gpsOpposite){alert('Set both GPS calibration corners first.');return;}const idx=prevGpsRouteIndex(gpsTargetIndex);if(idx!=null){gpsTargetIndex=idx;saveLocal();updateGpsUI();}};
$('gpsRecordBtn').onclick=()=>{
  if(!gpsRef || !gpsOpposite){alert('Set both GPS calibration corners first.');return;}
  if(gpsTargetIndex==null){alert('All grid points have readings.');return;}
  const {r,c}=pointFromIndex(gpsTargetIndex); openPoint(r,c);
};

loadLocal();
updateCornerPicker();
renderGrid();
updateGpsUI();
refreshGpsContext();
