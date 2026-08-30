/* Pad Grade v1.0.4 DEV — GPS/MapLibre point-tap alignment diagnostics.
 *
 * Diagnostic only: this module does NOT enlarge hit targets, change point
 * selection, suppress existing handlers, or choose a different grid point.
 * It records enough screen-space geometry to determine whether the physical
 * touch, MapLibre's event point, rendered grid feature, and edit-dialog point
 * have drifted out of alignment. No GPS coordinates or rod readings are logged.
 */
(function installPadGrade104MapTapDiagnostics(){
  'use strict';

  const VERSION='v1.0.4 DEV';
  const POINT_LAYER='pad-grade-grid-points-layer';
  const CROSSHAIR_ID='pgMapTapDiagCrosshair';
  const MAX_POINTER_AGE_MS=1400;
  const DIALOG_SETTLE_MS=35;

  let map=null;
  let attachedMap=null;
  let canvasTarget=null;
  let lastPointer=null;
  let tapSerial=0;
  let hideTimer=null;
  let originalOpenPoint=null;
  let recentTap=null;
  let pendingOpen={at:0,count:0,lastLabel:''};

  const now=()=>Date.now();
  const round=(v,d=2)=>v===null||v===undefined||!Number.isFinite(+v)?null:Number((+v).toFixed(d));
  const diag=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  function pointerClient(event){
    if(!event)return null;
    if(Number.isFinite(+event.clientX)&&Number.isFinite(+event.clientY))return {x:+event.clientX,y:+event.clientY,source:'event-client'};
    const touch=event.changedTouches?.[0]||event.touches?.[0];
    if(touch&&Number.isFinite(+touch.clientX)&&Number.isFinite(+touch.clientY))return {x:+touch.clientX,y:+touch.clientY,source:'event-touch'};
    return null;
  }

  function capturePointer(event){
    const p=pointerClient(event);if(!p)return;
    lastPointer={...p,at:now(),pointerType:String(event.pointerType||event.type||'unknown')};
    pendingOpen={at:lastPointer.at,count:0,lastLabel:''};
  }

  function geometry(m){
    const canvas=m?.getCanvas?.(),container=m?.getContainer?.();
    if(!canvas||!container)return null;
    const cr=canvas.getBoundingClientRect(),mr=container.getBoundingClientRect();
    const transform=m.transform||m._transform||null;
    const internalWidth=Number(transform?.width)||Number(canvas.clientWidth)||Number(mr.width)||Number(cr.width)||1;
    const internalHeight=Number(transform?.height)||Number(canvas.clientHeight)||Number(mr.height)||Number(cr.height)||1;
    const scaleX=cr.width/internalWidth,scaleY=cr.height/internalHeight;
    return {canvas,container,cr,mr,internalWidth,internalHeight,scaleX,scaleY};
  }

  function chooseRawClient(ev,g){
    const direct=pointerClient(ev?.originalEvent);
    if(direct)return direct;
    if(lastPointer&&now()-lastPointer.at<=MAX_POINTER_AGE_MS)return {x:lastPointer.x,y:lastPointer.y,source:`recent-${lastPointer.pointerType}`};
    if(g&&ev?.point&&Number.isFinite(+ev.point.x)&&Number.isFinite(+ev.point.y)){
      return {x:g.cr.left+(+ev.point.x)*g.scaleX,y:g.cr.top+(+ev.point.y)*g.scaleY,source:'derived-event-point'};
    }
    return null;
  }

  function expectedMapPoint(raw,g){
    if(!raw||!g||!Number.isFinite(g.scaleX)||!Number.isFinite(g.scaleY)||!g.scaleX||!g.scaleY)return null;
    return {x:(raw.x-g.cr.left)/g.scaleX,y:(raw.y-g.cr.top)/g.scaleY};
  }

  function gridCenters(m,g){
    const out=[];
    try{
      if(typeof cfg!=='function'||typeof targetLatLon!=='function'||typeof indexFromPoint!=='function'||typeof label!=='function')return out;
      const s=cfg();
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const ll=targetLatLon(indexFromPoint(r,c));if(!ll)continue;
        const p=m.project([+ll.lon,+ll.lat]);
        if(!p||!Number.isFinite(+p.x)||!Number.isFinite(+p.y))continue;
        out.push({r,c,label:label(r,c),mapX:+p.x,mapY:+p.y,clientX:g.cr.left+(+p.x)*g.scaleX,clientY:g.cr.top+(+p.y)*g.scaleY});
      }
    }catch(e){}
    return out;
  }

  function nearestByClient(points,raw){
    if(!raw||!points.length)return null;let best=null;
    for(const p of points){const dx=raw.x-p.clientX,dy=raw.y-p.clientY,d=Math.hypot(dx,dy);if(!best||d<best.distance)best={...p,distance:d,dx,dy};}
    return best;
  }

  function nearestByMapPoint(points,eventPoint){
    if(!eventPoint||!points.length)return null;let best=null;
    for(const p of points){const dx=(+eventPoint.x)-p.mapX,dy=(+eventPoint.y)-p.mapY,d=Math.hypot(dx,dy);if(!best||d<best.distance)best={...p,distance:d,dx,dy};}
    return best;
  }

  function queriedFeature(m,eventPoint){
    try{
      if(!m?.getLayer?.(POINT_LAYER))return {count:0,feature:null};
      const features=m.queryRenderedFeatures(eventPoint,{layers:[POINT_LAYER]})||[];
      return {count:features.length,feature:features[0]||null};
    }catch(e){return {count:-1,feature:null};}
  }

  function featureSummary(feature,m,g,raw){
    if(!feature)return null;
    const props=feature.properties||{};
    const coords=feature.geometry?.coordinates;
    let p=null;
    try{if(Array.isArray(coords)&&coords.length>=2)p=m.project(coords);}catch(e){}
    const clientX=p?g.cr.left+(+p.x)*g.scaleX:null,clientY=p?g.cr.top+(+p.y)*g.scaleY:null;
    return {
      label:String(props.label||''),r:Number.isFinite(+props.r)?+props.r:null,c:Number.isFinite(+props.c)?+props.c:null,
      mapX:p?+p.x:null,mapY:p?+p.y:null,clientX,clientY,
      distance:raw&&Number.isFinite(clientX)&&Number.isFinite(clientY)?Math.hypot(raw.x-clientX,raw.y-clientY):null
    };
  }

  function ensureCrosshair(g){
    if(!g?.container)return null;
    let el=document.getElementById(CROSSHAIR_ID);
    if(!el){
      el=document.createElement('div');el.id=CROSSHAIR_ID;el.setAttribute('aria-hidden','true');
      el.innerHTML='<i class="h"></i><i class="v"></i><b>ML</b>';
      Object.assign(el.style,{position:'absolute',width:'22px',height:'22px',margin:'0',padding:'0',pointerEvents:'none',zIndex:'9999',display:'none',transform:'translate(-50%,-50%)'});
      const h=el.querySelector('.h'),v=el.querySelector('.v'),b=el.querySelector('b');
      Object.assign(h.style,{position:'absolute',left:'0',right:'0',top:'10px',height:'2px',background:'#ff39d4',boxShadow:'0 0 2px #000'});
      Object.assign(v.style,{position:'absolute',top:'0',bottom:'0',left:'10px',width:'2px',background:'#ff39d4',boxShadow:'0 0 2px #000'});
      Object.assign(b.style,{position:'absolute',left:'14px',top:'12px',font:'700 9px system-ui,sans-serif',color:'#ff8de8',textShadow:'0 1px 2px #000'});
      g.container.appendChild(el);
    }
    return el;
  }

  function showCrosshair(eventPoint,g){
    if(!eventPoint||!g)return;
    const el=ensureCrosshair(g);if(!el)return;
    el.style.left=`${(+eventPoint.x*g.scaleX).toFixed(2)}px`;
    el.style.top=`${(+eventPoint.y*g.scaleY).toFixed(2)}px`;
    el.style.display='block';
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(el)el.style.display='none';},2600);
  }

  function pointLabel(r,c){
    try{return typeof label==='function'?label(+r,+c):`${r},${c}`;}catch(e){return `${r},${c}`;}
  }

  function openPointDiagnostic(r,c){
    const opened=pointLabel(r,c),t=now();
    if(lastPointer&&t-lastPointer.at<=MAX_POINTER_AGE_MS){
      if(!pendingOpen.at||Math.abs(pendingOpen.at-lastPointer.at)>5)pendingOpen={at:lastPointer.at,count:0,lastLabel:''};
      pendingOpen.count++;pendingOpen.lastLabel=opened;
    }
    if(!recentTap||t-recentTap.at>MAX_POINTER_AGE_MS)return;
    recentTap.openCalls=(recentTap.openCalls||0)+1;recentTap.lastOpenedLabel=opened;
    diag('map.tap-open-point',{tapId:recentTap.id,call:recentTap.openCalls,openedLabel:opened,openedR:+r,openedC:+c});
  }

  function wrapOpenPoint(){
    const current=window.openPoint;
    if(typeof current!=='function'||current.__padGrade104TapDiag)return false;
    originalOpenPoint=current;
    function wrappedOpenPoint(r,c){openPointDiagnostic(r,c);return originalOpenPoint.apply(this,arguments);}
    wrappedOpenPoint.__padGrade104TapDiag=true;wrappedOpenPoint.__padGrade104Base=current;
    window.openPoint=wrappedOpenPoint;
    return true;
  }

  function analyzeTap(ev){
    const m=map||window.__padGradeMapInstance;if(!m||!ev?.point)return;
    const g=geometry(m);if(!g)return;
    const raw=chooseRawClient(ev,g),expected=expectedMapPoint(raw,g),points=gridCenters(m,g);
    const nearestClient=nearestByClient(points,raw),nearestEvent=nearestByMapPoint(points,ev.point),query=queriedFeature(m,ev.point),selected=featureSummary(query.feature,m,g,raw);
    const id=++tapSerial,preCount=(lastPointer&&now()-lastPointer.at<=MAX_POINTER_AGE_MS)?pendingOpen.count:0,preLabel=preCount?pendingOpen.lastLabel:'';
    recentTap={id,at:now(),openCalls:preCount,lastOpenedLabel:preLabel};
    showCrosshair(ev.point,g);

    const details={
      tapId:id,rawSource:raw?.source||'none',
      clientX:round(raw?.x),clientY:round(raw?.y),
      eventPointX:round(ev.point.x),eventPointY:round(ev.point.y),
      expectedPointX:round(expected?.x),expectedPointY:round(expected?.y),
      eventDeltaX:round(expected?ev.point.x-expected.x:null),eventDeltaY:round(expected?ev.point.y-expected.y:null),
      canvasLeft:round(g.cr.left),canvasTop:round(g.cr.top),canvasWidth:round(g.cr.width),canvasHeight:round(g.cr.height),
      containerLeft:round(g.mr.left),containerTop:round(g.mr.top),containerWidth:round(g.mr.width),containerHeight:round(g.mr.height),
      internalWidth:round(g.internalWidth),internalHeight:round(g.internalHeight),scaleX:round(g.scaleX,4),scaleY:round(g.scaleY,4),
      canvasClientWidth:g.canvas.clientWidth,canvasClientHeight:g.canvas.clientHeight,canvasBitmapWidth:g.canvas.width,canvasBitmapHeight:g.canvas.height,dpr:round(window.devicePixelRatio,3),
      queryCount:query.count,selectedLabel:selected?.label||'',selectedDistancePx:round(selected?.distance),
      nearestClientLabel:nearestClient?.label||'',nearestClientDistancePx:round(nearestClient?.distance),nearestClientDx:round(nearestClient?.dx),nearestClientDy:round(nearestClient?.dy),
      nearestEventLabel:nearestEvent?.label||'',nearestEventDistancePx:round(nearestEvent?.distance),nearestEventDx:round(nearestEvent?.dx),nearestEventDy:round(nearestEvent?.dy),
      openCallsBeforeMapEvent:preCount,lastOpenedBeforeMapEvent:preLabel
    };
    diag('map.tap-alignment',details);
    window.__padGradeLastMapTapDiagnosticV104=details;

    setTimeout(()=>{
      const dlg=document.getElementById('entryDlg'),dialogLabel=dlg?.open?String(document.getElementById('locText')?.textContent||''):'';
      diag('map.tap-dialog-result',{tapId:id,dialogOpen:!!dlg?.open,dialogLabel,openCalls:recentTap?.id===id?recentTap.openCalls:preCount,lastOpenedLabel:recentTap?.id===id?(recentTap.lastOpenedLabel||preLabel):preLabel,selectedLabel:selected?.label||'',nearestClientLabel:nearestClient?.label||'',nearestEventLabel:nearestEvent?.label||''});
    },DIALOG_SETTLE_MS);
  }

  function detach(){
    if(attachedMap){try{attachedMap.off('click',analyzeTap);}catch(e){}}
    if(canvasTarget){try{canvasTarget.removeEventListener('pointerdown',capturePointer,true);}catch(e){}try{canvasTarget.removeEventListener('touchstart',capturePointer,true);}catch(e){}}
    attachedMap=null;canvasTarget=null;
  }

  function attach(next){
    if(!next||next===attachedMap)return false;
    detach();map=attachedMap=next;
    try{next.on('click',analyzeTap);}catch(e){}
    canvasTarget=next.getCanvasContainer?.()||next.getCanvas?.()||null;
    if(canvasTarget){
      try{canvasTarget.addEventListener('pointerdown',capturePointer,true);}catch(e){}
      try{canvasTarget.addEventListener('touchstart',capturePointer,{capture:true,passive:true});}catch(e){}
    }
    wrapOpenPoint();
    diag('map.tap-diagnostics-attached',{version:VERSION});
    return true;
  }

  window.addEventListener('padgrade-primary-map-captured',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
  window.addEventListener('padgrade-map-created',ev=>attach(ev?.detail?.map||window.__padGradeMapInstance));
  window.addEventListener('padgrade-map-runtime-ready',()=>setTimeout(()=>attach(window.__padGradeMapInstance),0));

  function boot(){
    wrapOpenPoint();attach(window.__padGradeMapInstance);
    let tries=0;const timer=setInterval(()=>{wrapOpenPoint();if(!attachedMap)attach(window.__padGradeMapInstance);if(++tries>=60)clearInterval(timer);},100);
    window.addEventListener('beforeunload',()=>{clearInterval(timer);clearTimeout(hideTimer);detach();},{once:true});
    document.title=`Pad Grade Mapper ${VERSION}`;
    window.__padGradeMapTapDiagnosticsV104='diagnostic-only-raw-client-vs-map-event-vs-projected-grid-vs-dialog';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
