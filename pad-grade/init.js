const PAD_TERMS_VERSION='2026-08-19-v1';
const PAD_TERMS_KEY='padGradeTermsAcceptedVersion';

function installPadTermsUI(){
  const style=document.createElement('style');
  style.textContent=`
    .termsGate{position:fixed;inset:0;z-index:99999;background:rgba(5,8,12,.97);display:flex;align-items:center;justify-content:center;padding:14px}
    .termsGate.hidden{display:none}
    .termsCard{width:min(94vw,650px);max-height:90vh;overflow:auto;background:#121820;border:1px solid #3b4858;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.7)}
    .termsCard h2{margin:0 0 4px;font-size:1.2rem}
    .termsCard h3{font-size:.9rem;margin:14px 0 4px}
    .termsText{font-size:.76rem;line-height:1.42;color:#c9d1da}
    .termsAcceptRow{display:flex;gap:9px;align-items:flex-start;margin:15px 0 10px;font-size:.78rem}
    .termsAcceptRow input{width:20px;height:20px;flex:0 0 auto;margin:0}
    .termsButtons{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .termsDeclined{display:none;text-align:center;color:#ff9a8b;padding:14px 0 2px;font-size:.78rem}
    .termsDeclined.active{display:block}
  `;
  document.head.appendChild(style);

  const gate=document.createElement('div');
  gate.id='termsGate';
  gate.className='termsGate';
  gate.innerHTML=`
    <div class="termsCard">
      <h2>Pad Grade Mapper — Terms of Use</h2>
      <div class="small">Safety notice • version ${PAD_TERMS_VERSION}</div>
      <div class="termsText">
        <h3>Open-source license</h3>
        <p>The source code is licensed under the MIT License. The MIT License governs your rights to copy, modify, distribute, sublicense, and use the software. These Terms do not reduce rights granted by the MIT License.</p>

        <h3>Experimental planning tool</h3>
        <p>Pad Grade Mapper is an experimental layout, grade-recording, GPS-guidance, and earthwork-planning aid. It is not certified surveying, engineering, excavation-control, machine-control, or safety equipment and does not replace a licensed survey or engineered grading plan where one is required.</p>

        <h3>Verify everything that matters</h3>
        <p>You are responsible for verifying measurements, benchmarks, elevations, slopes, drainage requirements, property limits, utilities, excavation limits, cut/fill decisions, and site conditions before relying on the app for construction or earthmoving. Consumer-device GPS is navigation-grade and can be inaccurate or unavailable.</p>

        <h3>Earthwork estimates</h3>
        <p>Cut, fill, net-volume, and similar calculations are planning estimates from the entered grid. Actual quantities may differ because of interpolation, compaction, shrink/swell, stripping, unsuitable material, drainage shaping, over-excavation, and other field conditions.</p>

        <h3>Local data and backups</h3>
        <p>The app is designed to keep GPS coordinates and grade readings on this device and block outbound network access. Browser storage can still be cleared, corrupted, or lost. Export important projects when data loss would matter.</p>

        <h3>No warranty</h3>
        <p>The software and application are provided “AS IS,” without warranty of any kind. To the maximum extent permitted by law, the authors and contributors are not liable for claims, damages, losses, injuries, costs, or other liability arising from use of the software or application.</p>

        <p>By accepting, you acknowledge these limitations and agree to use the application at your own risk and with independent judgment.</p>
      </div>
      <label class="termsAcceptRow"><input id="termsAcceptCheck" type="checkbox"><span>I have read and accept these Terms of Use and Safety Notice.</span></label>
      <div class="termsButtons"><button id="termsDeclineBtn" class="danger">Decline</button><button id="termsAcceptBtn" class="primary" disabled>Accept & Continue</button></div>
      <div class="termsDeclined" id="termsDeclined">Acceptance is required to use Pad Grade Mapper.</div>
    </div>`;
  document.body.appendChild(gate);

  const settings=$('settingsBtn');
  if(settings && !$('termsBtn')){
    const termsBtn=document.createElement('button');
    termsBtn.id='termsBtn';
    termsBtn.textContent='Terms';
    settings.parentElement.appendChild(termsBtn);
    termsBtn.onclick=()=>showPadTerms(true);
  }

  $('termsAcceptCheck').onchange=()=>{$('termsAcceptBtn').disabled=!$('termsAcceptCheck').checked;};
  $('termsAcceptBtn').onclick=()=>{
    if(!$('termsAcceptCheck').checked) return;
    localStorage.setItem(PAD_TERMS_KEY,PAD_TERMS_VERSION);
    gate.classList.add('hidden');
  };
  $('termsDeclineBtn').onclick=()=>{
    localStorage.removeItem(PAD_TERMS_KEY);
    $('termsDeclined').classList.add('active');
    $('termsAcceptBtn').disabled=true;
  };
}

function showPadTerms(force=false){
  const gate=$('termsGate');
  if(!gate) return;
  const accepted=localStorage.getItem(PAD_TERMS_KEY);
  if(force || accepted!==PAD_TERMS_VERSION){
    gate.classList.remove('hidden');
    $('termsAcceptCheck').checked=false;
    $('termsAcceptBtn').disabled=true;
    $('termsDeclined').classList.remove('active');
  }else gate.classList.add('hidden');
}

installPadTermsUI();
showPadTerms(false);

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
