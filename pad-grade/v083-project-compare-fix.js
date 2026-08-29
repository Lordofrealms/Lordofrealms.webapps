/* Pad Grade v0.8.3 DEV — reviewed comparison geometry/UI corrections.
 *
 * IMPORTANT: This feature layer is loaded only after the v0.8.1 comparison core
 * and UI have loaded. It never participates in the app recovery/folder bootstrap.
 */
(function installPadGrade083ProjectComparisonFix(){
  'use strict';

  const VERSION='v0.8.3 DEV';
  const $=id=>document.getElementById(id);
  let placementTimer=null;

  function compareCore(){return window.PadGradeProjectCompareCore||null;}
  function parse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}

  function loadProject(id){
    if(!id)return null;
    const stored=parse(localStorage.getItem(`padGradeProjectV5:${id}`),null);
    if(!stored||typeof stored!=='object')return null;
    const p=JSON.parse(JSON.stringify(stored));
    if(!p.id)p.id=id;
    const active=localStorage.getItem('padGradeActiveProjectIdV5');
    if(active===id){
      try{
        if(typeof cfg==='function')p.settings={...cfg()};
        if(typeof readings==='object')p.readings={...readings};
        p.gps=p.gps&&typeof p.gps==='object'?{...p.gps}:{};
        if(typeof gpsCorners!=='undefined'&&gpsCorners&&typeof gpsCorners==='object')p.gps.corners=JSON.parse(JSON.stringify(gpsCorners));
      }catch(e){}
    }
    return p;
  }

  function selectedProjects(){
    return {
      first:loadProject($('projectCompareFirst')?.value),
      second:loadProject($('projectCompareSecond')?.value)
    };
  }

  function eligibility(){
    const core=compareCore();
    if(!core||typeof core.comparisonEligibility!=='function')return {ok:false,reason:'Comparison module is still loading.'};
    const {first,second}=selectedProjects();
    return core.comparisonEligibility(first,second,20);
  }

  function setStatus(){
    const status=$('projectComparePickerStatus');
    if(!status)return;
    const result=eligibility();
    if(!result.ok){
      status.textContent=result.reason;
      status.className='pgComparePickerStatus bad';
      return;
    }
    status.textContent=`Ready. Same-size grids; corresponding corners are within 20 ft (worst ${result.maxCornerSeparationFt.toFixed(1)} ft). Each logical GPS grid point will be placed halfway between its two calculated project positions.`;
    status.className='pgComparePickerStatus good';
  }

  function moveCompareButton(){
    const btn=$('compareProjectsBottomBtn'),clear=$('clearBtn');
    if(!btn||!clear||!clear.parentElement)return false;
    const holder=clear.parentElement;
    if(btn.parentElement!==holder||btn.previousElementSibling!==clear)clear.insertAdjacentElement('afterend',btn);
    btn.textContent='Compare';
    btn.title='Compare two completed projects';
    return true;
  }

  function updateComparisonOverlay(){
    const overlay=$('pgCompareOverlay');if(!overlay)return;
    const chips=[...overlay.querySelectorAll('.pgCompareChip')];
    const gpsChip=chips.find(el=>/GPS corners averaged|averaged pad dimensions|Logical GPS points averaged/i.test(el.textContent||''));
    if(gpsChip)gpsChip.textContent='Logical GPS points averaged';
    const message=$('pgCompareMapMessage');
    if(message&&!message.classList.contains('hidden')&&/shared GPS comparison grid/i.test(message.textContent||''))message.textContent='Building averaged GPS comparison grid…';
  }

  function installEventGuards(){
    document.addEventListener('change',event=>{
      if(event.target?.id==='projectCompareFirst'||event.target?.id==='projectCompareSecond')setTimeout(setStatus,0);
    });

    document.addEventListener('click',event=>{
      if(event.target?.id==='compareProjectsBottomBtn')setTimeout(()=>{moveCompareButton();setStatus();},0);
    });

    // Validate before the v0.8.1 target click handler closes the picker.
    document.addEventListener('click',event=>{
      if(event.target?.id!=='projectCompareStart')return;
      const result=eligibility();
      if(result.ok)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const status=$('projectComparePickerStatus');
      if(status){status.textContent=result.reason;status.className='pgComparePickerStatus bad';}
    },true);

    // If validation succeeded, v0.8.1 creates the temporary overlay at the target
    // handler. Update only comparison copy after that handler has run.
    document.addEventListener('click',event=>{
      if(event.target?.id==='projectCompareStart')setTimeout(updateComparisonOverlay,0);
    });
  }

  function boot(){
    installEventGuards();
    let tries=0;
    const place=()=>{
      if(moveCompareButton()||++tries>=25){
        if(placementTimer)clearInterval(placementTimer);
        placementTimer=null;
      }
    };
    place();
    if(!moveCompareButton())placementTimer=setInterval(place,200);
    document.title=`Pad Grade Mapper ${VERSION}`;
    window.__padGradeDevVersion083=VERSION;
    window.__padGradeComparisonGeometry083='pointwise-average-of-two-fitted-rectangular-grids';
    window.addEventListener('beforeunload',()=>{if(placementTimer)clearInterval(placementTimer);},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
