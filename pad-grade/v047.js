/* Pad Grade v0.4.7 — restore legacy two-corner projects and make fit scale font-only. */
(function installPadGradeV047(){
  'use strict';
  const $=id=>document.getElementById(id);
  const PREF_KEY='padGradeAppPrefsV1';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PREFIX='padGradeProjectV5:';
  const FT_PER_M_LOCAL=3.280839895;
  const EARTH_M_LOCAL=6378137;
  const FIT_GAP=2,SCROLL_GAP=4;

  function prefs(){try{return {minGridFont:2,gridFitScale:.40,...(JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{})};}catch(e){return {minGridFont:2,gridFitScale:.40};}}
  function px(v){const n=parseFloat(v);return Number.isFinite(n)?n:0;}
  function localDelta(a,b){
    const lat0=((a.lat+b.lat)/2)*Math.PI/180;
    return {east:(b.lon-a.lon)*Math.PI/180*EARTH_M_LOCAL*Math.cos(lat0)*FT_PER_M_LOCAL,north:(b.lat-a.lat)*Math.PI/180*EARTH_M_LOCAL*FT_PER_M_LOCAL};
  }
  function llFromFeet(origin,eastFt,northFt){
    const latRad=origin.lat*Math.PI/180;
    return {lat:origin.lat+((northFt/FT_PER_M_LOCAL)/EARTH_M_LOCAL)*180/Math.PI,lon:origin.lon+((eastFt/FT_PER_M_LOCAL)/(EARTH_M_LOCAL*Math.cos(latRad)))*180/Math.PI};
  }
  function cornerXY(name,w,l){return {SW:{x:0,y:0},SE:{x:w,y:0},NE:{x:w,y:l},NW:{x:0,y:l}}[name];}

  function synthesizeLegacyCorners(p){
    if(!p||typeof p!=='object')return false;
    const gps=p.gps&&typeof p.gps==='object'?p.gps:(p.gps={});
    if(gps.corners&&Object.keys(gps.corners).length>=4)return false;
    const ref=gps.reference,opp=gps.opposite,s=p.settings||{};
    if(!ref||!opp||!Number.isFinite(+ref.lat)||!Number.isFinite(+ref.lon)||!Number.isFinite(+opp.lat)||!Number.isFinite(+opp.lon))return false;
    const w=+s.width,l=+s.length;if(!(w>0&&l>0))return false;
    const refName=String(s.refCorner||'SW').toUpperCase();
    const oppositeName={SW:'NE',NE:'SW',SE:'NW',NW:'SE'}[refName]||'NE';
    const qRef=cornerXY(refName,w,l),qOpp=cornerXY(oppositeName,w,l);if(!qRef||!qOpp)return false;
    const measured=localDelta(ref,opp),measuredAngle=Math.atan2(measured.north,measured.east),localAngle=Math.atan2(qOpp.y-qRef.y,qOpp.x-qRef.x),theta=measuredAngle-localAngle,ct=Math.cos(theta),st=Math.sin(theta);
    const acc=Math.max(0,+ref.accuracy||0,+opp.accuracy||0);
    const corners={};
    for(const name of ['SW','SE','NE','NW']){
      const q=cornerXY(name,w,l),dx=q.x-qRef.x,dy=q.y-qRef.y,east=ct*dx-st*dy,north=st*dx+ct*dy,ll=llFromFeet(ref,east,north);
      corners[name]={...ll,accuracy:acc,legacySynthesized:true,timestamp:ref.timestamp||opp.timestamp||Date.now(),sampleCount:1,spreadFt:0};
    }
    corners[refName]={...corners[refName],...ref,lat:+ref.lat,lon:+ref.lon,legacySynthesized:false};
    corners[oppositeName]={...corners[oppositeName],...opp,lat:+opp.lat,lon:+opp.lon,legacySynthesized:false};
    gps.corners=corners;gps.captureIndex=4;p.gps=gps;p.migration={...(p.migration||{}),legacyTwoCornerExpanded:true};return true;
  }

  function repairAll(){
    let activeFixed=null;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key||!key.startsWith(PREFIX))continue;
      let p=null;try{p=JSON.parse(localStorage.getItem(key)||'null');}catch(e){continue;}
      if(window.__padGradeRepairProject){try{const r=window.__padGradeRepairProject(p);if(r?.project)p=r.project;}catch(e){}}
      const changed=synthesizeLegacyCorners(p);if(changed)localStorage.setItem(key,JSON.stringify(p));
      if(key===PREFIX+localStorage.getItem(ACTIVE_KEY))activeFixed=p;
    }
    if(activeFixed)applyActive(activeFixed);
  }

  function applyActive(p){
    const s=p.settings||{};
    for(const [id,val] of Object.entries({width:s.width,length:s.length,cols:s.cols,rows:s.rows,target:s.target,tol:s.tol,refCorner:s.refCorner,projectName:s.name}))if($(id)&&val!==undefined)$(id).value=val;
    readings={...(p.readings||{})};readingMeta={...(p.readingMeta||{})};
    gpsRef=p.gps?.reference||null;gpsOpposite=p.gps?.opposite||null;gpsTargetIndex=Number.isInteger(p.gps?.targetIndex)?p.gps.targetIndex:null;
    try{gpsCorners=(p.gps?.corners&&typeof p.gps.corners==='object')?p.gps.corners:{};gpsCaptureIndex=Number.isInteger(p.gps?.captureIndex)?p.gps.captureIndex:Object.keys(gpsCorners).length;syncLegacyCalibration();}catch(e){}
    measureMode=p.measureMode==='gps'?'gps':'manual';
    try{updateCornerPicker();}catch(e){}try{renderGrid();}catch(e){}try{updateGpsUI();}catch(e){}try{refreshMapOverlays(true);}catch(e){}
  }

  function measureNeed(samples){
    const ruler=document.createElement('span'),family=getComputedStyle(document.body).fontFamily||'system-ui,sans-serif';
    Object.assign(ruler.style,{position:'fixed',left:'-10000px',top:'-10000px',visibility:'hidden',whiteSpace:'nowrap',fontSize:'100px',lineHeight:'1',fontFamily:family});document.body.appendChild(ruler);
    let max=0;for(const s of samples){ruler.style.fontWeight=String(s.weight||400);ruler.textContent=s.text||'—';max=Math.max(max,ruler.getBoundingClientRect().width/100);}ruler.remove();return Math.max(1,max*1.04);
  }
  function samples(s){const out=[{text:'FILL 99.9″'},{text:'CUT 99.9″'}];for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){const v=readings[k(r,c)],[main,sub]=textFor(v),rc=refCoords(r,c);out.push({text:label(r,c),weight:900},{text:`${rc.x.toFixed(1)}′ ${rc.xDir}`},{text:`${rc.y.toFixed(1)}′ ${rc.yDir}`},{text:main||'—',weight:800},{text:sub||'—'});}return out;}
  function chrome(g){const d=document.createElement('div');d.className='cell';Object.assign(d.style,{position:'absolute',visibility:'hidden'});g.appendChild(d);const cs=getComputedStyle(d),o={x:px(cs.paddingLeft)+px(cs.paddingRight)+px(cs.borderLeftWidth)+px(cs.borderRightWidth),y:px(cs.paddingTop)+px(cs.paddingBottom)+px(cs.borderTopWidth)+px(cs.borderBottomWidth)};d.remove();return o;}

  function renderGridV047(){
    const s=cfg(),g=$('grid'),shell=g?.parentElement;if(!g||!shell)return;g.innerHTML='';$('v040GridMode')?.remove();
    const p=prefs(),minFont=Math.max(2,Math.min(20,+p.minGridFont||2)),scale=Math.max(.10,Math.min(1,+p.gridFitScale||.40)),dx=s.width/(s.cols-1),dy=s.length/(s.rows-1),ratio=Math.max(.05,dx/dy),ss=getComputedStyle(shell),available=Math.max(1,shell.clientWidth-px(ss.paddingLeft)-px(ss.paddingRight));
    const fitW=Math.max(1,(available-FIT_GAP*Math.max(0,s.cols-1))/s.cols),fitH=fitW/ratio;
    g.className='v040-fit v041-uniform v042-uniform v043-uniform';const ch=chrome(g),need=measureNeed(samples(s)),calculated=Math.min(20,Math.max(0,(fitW-ch.x)/need),Math.max(0,(fitH-ch.y)/5.15));

    // Fit/scroll is controlled ONLY by the user's minimum-font preference.
    // Fit scale never changes cell dimensions or the fit/scroll decision.
    const fit=Number.isFinite(calculated)&&calculated>=minFont;
    let baseFont,cellW,cellH;
    if(fit){baseFont=calculated;cellW=fitW;cellH=fitH;shell.classList.add('fit');g.className='v040-fit v041-uniform v042-uniform v043-uniform';g.style.width='100%';g.style.gridTemplateColumns=`repeat(${s.cols},minmax(0,1fr))`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;g.style.columnGap=`${FIT_GAP}px`;}
    else{baseFont=minFont;const requiredW=need*minFont+ch.x,requiredH=5.15*minFont+ch.y;cellH=Math.max(requiredH,requiredW/ratio);cellW=cellH*ratio;shell.classList.remove('fit');g.className='v040-scroll v041-uniform v042-uniform v043-uniform';g.style.width='max-content';g.style.gridTemplateColumns=`repeat(${s.cols},${cellW.toFixed(2)}px)`;g.style.gridAutoRows=`${cellH.toFixed(2)}px`;g.style.columnGap=`${SCROLL_GAP}px`;}
    const finalFont=Math.max(.5,baseFont*scale);g.style.setProperty('--grid-font',`${finalFont.toFixed(2)}px`);
    for(let rr=s.rows-1;rr>=0;rr--)for(let c=0;c<s.cols;c++){const val=readings[k(rr,c)],[main,sub]=textFor(val),d=document.createElement('div'),rc=refCoords(rr,c);d.className='cell '+classFor(val);d.innerHTML=`<div class="coord">${label(rr,c)}</div><div class="xy"><span>${rc.x.toFixed(1)}′ ${rc.xDir}</span><span>${rc.y.toFixed(1)}′ ${rc.yDir}</span></div><div class="main">${main||'—'}</div><div class="sub">${sub||'—'}</div>`;d.onclick=()=>openPoint(rr,c);g.appendChild(d);}updateStats();
  }

  repairAll();window.renderGrid=renderGridV047;renderGridV047();document.title='Pad Grade Mapper v0.4.7';
  window.addEventListener('padgrade-projects-reconciled',()=>setTimeout(()=>{repairAll();renderGridV047();},0));
  window.addEventListener('resize',()=>{clearTimeout(window.__pg047Resize);window.__pg047Resize=setTimeout(renderGridV047,120);});
})();
