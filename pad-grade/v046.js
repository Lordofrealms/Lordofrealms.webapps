/* Pad Grade v0.4.6 — canonical project GPS repair + explicit two-stage grid/font sizing. */
(function installPadGradeV046(){
  'use strict';
  const $=id=>document.getElementById(id);
  const PREF_KEY='padGradeAppPrefsV1';
  const INDEX_KEY='padGradeProjectsV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const FIT_GAP=2;
  const SCROLL_GAP=4;

  function appPrefs(){
    try{return {minGridFont:2,gridFitScale:.40,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}
    catch(e){return {minGridFont:2,gridFitScale:.40};}
  }
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}
  function number(v){const n=Number(v);return Number.isFinite(n)?n:null;}

  function normalizePoint(p){
    if(!p||typeof p!=='object')return null;
    const lat=number(p.lat??p.latitude??p.Latitude??p.y);
    const lon=number(p.lon??p.lng??p.longitude??p.Longitude??p.x);
    if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    const accuracy=number(p.accuracy??p.accuracy_m??p.horizontalAccuracy??p.hAcc);
    const out={...p,lat,lon};
    if(accuracy!==null)out.accuracy=accuracy;
    delete out.latitude;delete out.longitude;delete out.lng;
    return out;
  }
  function normalizeCorners(raw){
    if(!raw)return {};
    const out={};
    if(Array.isArray(raw)){
      for(const p of raw){const name=String(p?.corner??p?.name??p?.id??'').toUpperCase();const q=normalizePoint(p);if(q&&['SW','SE','NE','NW'].includes(name))out[name]=q;}
      return out;
    }
    if(typeof raw==='object'){
      for(const [name,p] of Object.entries(raw)){const key=String(name).toUpperCase();const q=normalizePoint(p);if(q&&['SW','SE','NE','NW'].includes(key))out[key]=q;}
    }
    return out;
  }
  function repairProject(raw){
    if(!raw||typeof raw!=='object')return {project:raw,changed:false};
    const p=JSON.parse(JSON.stringify(raw));
    const oldGps=(p.gps&&typeof p.gps==='object')?p.gps:{};
    const gps={...oldGps};
    let changed=false;

    const reference=normalizePoint(gps.reference??p.gpsRef??p.referenceGps??p.reference);
    const opposite=normalizePoint(gps.opposite??p.gpsOpposite??p.oppositeGps??p.opposite);
    const corners=normalizeCorners(gps.corners??p.gpsCorners??p.corners);
    if(reference){gps.reference=reference;changed=true;}
    if(opposite){gps.opposite=opposite;changed=true;}
    if(Object.keys(corners).length){gps.corners=corners;changed=true;}

    // Older two-corner projects did not have the four-corner map. Preserve those
    // coordinates as reference/opposite; newer UI can still show/recover them.
    const ti=Number.isInteger(gps.targetIndex)?gps.targetIndex:(Number.isInteger(p.gpsTargetIndex)?p.gpsTargetIndex:null);
    if(ti!==null&&gps.targetIndex!==ti){gps.targetIndex=ti;changed=true;}
    const ci=Number.isInteger(gps.captureIndex)?gps.captureIndex:(Number.isInteger(p.gpsCaptureIndex)?p.gpsCaptureIndex:null);
    if(ci!==null&&gps.captureIndex!==ci){gps.captureIndex=ci;changed=true;}

    if(JSON.stringify(gps)!==JSON.stringify(oldGps)){p.gps=gps;changed=true;}
    return {project:p,changed};
  }
  function repairStoredProjects(){
    let repaired=0;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key||!key.startsWith(PROJECT_PREFIX))continue;
      let raw=null;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch(e){continue;}
      const fixed=repairProject(raw);if(fixed.changed){localStorage.setItem(key,JSON.stringify(fixed.project));repaired++;}
    }
    if(repaired){try{window.__padGradeRefreshProjectIndex?.();}catch(e){}}
    return repaired;
  }
  window.__padGradeRepairProject=repairProject;
  window.__padGradeRepairStoredProjects=repairStoredProjects;

  function measureTextNeed(samples){
    const ruler=document.createElement('span');
    const family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    Object.assign(ruler.style,{position:'fixed',left:'-10000px',top:'-10000px',visibility:'hidden',whiteSpace:'nowrap',fontSize:'100px',lineHeight:'1',fontFamily:family,letterSpacing:'normal'});
    document.body.appendChild(ruler);
    let max=0;
    for(const s of samples){ruler.style.fontWeight=String(s.weight||400);ruler.textContent=s.text||'—';max=Math.max(max,ruler.getBoundingClientRect().width/100);}
    ruler.remove();return Math.max(1,max*1.04);
  }
  function gridSamples(s){
    const samples=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];
    for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
      const v=readings[k(r,c)],[main,sub]=textFor(v),rc=refCoords(r,c);
      samples.push({text:label(r,c),weight:900},{text:`${rc.x.toFixed(1)}′ ${rc.xDir}`},{text:`${rc.y.toFixed(1)}′ ${rc.yDir}`},{text:main||'—',weight:800},{text:sub||'—'});
    }
    return samples;
  }
  function cellChrome(g){
    const probe=document.createElement('div');probe.className='cell';Object.assign(probe.style,{position:'absolute',visibility:'hidden',pointerEvents:'none'});g.appendChild(probe);
    const cs=getComputedStyle(probe),out={x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)};probe.remove();return out;
  }

  function renderGridV046(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;
    g.innerHTML='';$('v040GridMode')?.remove();
    const p=appPrefs(),minFont=Math.max(2,Math.min(20,+p.minGridFont||2)),scale=Math.max(.10,Math.min(1,+p.gridFitScale||.40));
    const dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy);
    const ss=getComputedStyle(shell),available=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));

    // Stage 1: size the PHYSICAL grid/cells to the screen. Text has no say here.
    const fitCellW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols);
    const fitCellH=fitCellW/ratio;

    // Stage 2: with those cell dimensions frozen, determine what text size can
    // actually fit, then apply the user safety factor to that font only.
    g.className='v040-fit v041-uniform v042-uniform v043-uniform';
    const chrome=cellChrome(g),needEm=measureTextNeed(gridSamples(s));
    const widthLimit=Math.max(0,(fitCellW-chrome.x)/needEm);
    const heightLimit=Math.max(0,(fitCellH-chrome.y)/5.15);
    const calculatedFont=Math.min(20,widthLimit,heightLimit);
    const finalFitFont=calculatedFont*scale;
    const canFit=Number.isFinite(finalFitFont)&&finalFitFont>=minFont;

    let font,cellW,cellH;
    if(canFit){
      font=finalFitFont;cellW=fitCellW;cellH=fitCellH;shell.classList.add('fit');
      g.className='v040-fit v041-uniform v042-uniform v043-uniform';g.style.width='100%';g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;g.style.columnGap=`${FIT_GAP}px`;
    }else{
      // Minimum-font preference wins. Expand cells proportionally and scroll.
      font=minFont;const unscaledNeededFont=minFont/scale;
      const requiredW=needEm*unscaledNeededFont+chrome.x,requiredH=5.15*unscaledNeededFont+chrome.y;
      cellH=Math.max(requiredH,requiredW/ratio);cellW=cellH*ratio;shell.classList.remove('fit');
      g.className='v040-scroll v041-uniform v042-uniform v043-uniform';g.style.width='max-content';g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;g.style.columnGap=`${SCROLL_GAP}px`;
    }
    g.style.setProperty('--grid-font',`${font.toFixed(2)}px`);

    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){
      const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);d.className='cell '+classFor(val);
      d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;d.onclick=()=>openPoint(rr,c);g.appendChild(d);
    }
    updateStats();
  }

  repairStoredProjects();
  window.renderGrid=renderGridV046;
  renderGridV046();
  document.title='Pad Grade Mapper v0.4.6';
  window.addEventListener('padgrade-projects-reconciled',()=>{repairStoredProjects();setTimeout(()=>{try{renderGridV046();}catch(e){}},0);});
  window.addEventListener('resize',()=>{clearTimeout(window.__pg046Resize);window.__pg046Resize=setTimeout(renderGridV046,120);});
})();
