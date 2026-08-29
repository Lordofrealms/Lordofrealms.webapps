/* Pad Grade v0.8.2 DEV — reviewed comparison geometry/UI corrections. */
(function installPadGrade082ProjectComparisonFix(){
  'use strict';

  const VERSION='v0.8.2 DEV';
  const core=window.PadGradeProjectCompareCore;
  const $=id=>document.getElementById(id);
  let timer=null;
  let observer=null;

  if(!core){console.error('Pad Grade v0.8.2 comparison fix could not find comparison core');return;}

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

  function setStatus(){
    const status=$('projectComparePickerStatus');
    if(!status)return;
    const {first,second}=selectedProjects();
    const result=core.comparisonEligibility(first,second,20);
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
    const gpsChip=chips.find(el=>/GPS corners averaged|averaged pad dimensions/i.test(el.textContent||''));
    if(gpsChip)gpsChip.textContent='Logical GPS points averaged';
    const message=$('pgCompareMapMessage');
    if(message&&!message.classList.contains('hidden')&&/shared GPS comparison grid/i.test(message.textContent||''))message.textContent='Building averaged GPS comparison grid…';
  }

  function installGuards(){
    document.addEventListener('change',event=>{
      if(event.target?.id==='projectCompareFirst'||event.target?.id==='projectCompareSecond')setTimeout(setStatus,0);
    });

    document.addEventListener('click',event=>{
      const target=event.target;
      if(target?.id==='compareProjectsBottomBtn')setTimeout(()=>{moveCompareButton();setStatus();},0);
    });

    // Run before the v0.8.1 target click handler. The core also validates again
    // during comparison construction; this capture guard keeps the picker from
    // closing or claiming success when dimensions/location fail review rules.
    document.addEventListener('click',event=>{
      if(event.target?.id!=='projectCompareStart')return;
      const {first,second}=selectedProjects(),result=core.comparisonEligibility(first,second,20);
      if(result.ok)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const status=$('projectComparePickerStatus');
      if(status){status.textContent=result.reason;status.className='pgComparePickerStatus bad';}
    },true);
  }

  function boot(){
    moveCompareButton();
    installGuards();
    timer=setInterval(()=>{
      moveCompareButton();
      if($('projectCompareDlg')?.open)setStatus();
      updateComparisonOverlay();
    },350);
    observer=new MutationObserver(()=>{moveCompareButton();updateComparisonOverlay();});
    observer.observe(document.body,{childList:true,subtree:true});
    document.title=`Pad Grade Mapper ${VERSION}`;
    window.__padGradeDevVersion082=VERSION;
    window.__padGradeComparisonGeometry082='pointwise-average-of-two-fitted-rectangular-grids';
    window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);if(observer)observer.disconnect();},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
