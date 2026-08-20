(()=>{
  function ensureSkipPassOption(){
    const sel=document.getElementById('pathType');
    if(!sel)return false;
    if(!sel.querySelector('option[value="skip-parallel"]')){
      const opt=document.createElement('option');
      opt.value='skip-parallel';
      opt.textContent='Skip-pass / alternating rows';
      const contour=sel.querySelector('option[value="contour"]');
      if(contour)sel.insertBefore(opt,contour);else sel.appendChild(opt);
    }
    return true;
  }
  if(!ensureSkipPassOption()){
    const obs=new MutationObserver(()=>{if(ensureSkipPassOption()){obs.disconnect()}});
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }
  // Keep a short-lived guard during core startup in case legacy initialization rewrites the select.
  let checks=0;
  const timer=setInterval(()=>{ensureSkipPassOption();if(++checks>=40)clearInterval(timer)},250);
  window.ensureTractorSkipPassOption=ensureSkipPassOption;
})();
