/* Pad Grade v1.2.1 DEV — stop same-frame ImageSource reload starvation.
 *
 * v1.2.0 correctly switched heat transport to the URL-only ImageSource API in
 * pinned MapLibre 5.16.0, but legacy visibility/opacity churn could call the
 * permanent source's updateImage() repeatedly while the same data URL was still
 * decoding. MapLibre 5.16 aborts an in-flight ImageSource request whenever
 * updateImage() is called, so the repeated same-frame calls could prevent the
 * image from ever finishing. v1.2.1 deduplicates identical in-flight URLs and
 * promotes a decoded frame into the v1.2.0 controller state as soon as the real
 * ImageSource reports loaded with the expected dimensions.
 */
(function installPadGrade121Dev(){
  'use strict';
  if(window.__padGradeDevV121)return;
  window.__padGradeDevV121=true;
  const VERSION='1.2.1';
  const patchedSources=new WeakSet();
  const sourceMeta=new WeakMap();
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const now=()=>performance.now?.()||Date.now();

  function cloneCoords(coords){
    if(!Array.isArray(coords)||coords.length!==4)return null;
    const out=coords.map(p=>Array.isArray(p)&&p.length>=2?[+p[0],+p[1]]:null);
    return out.every(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?out:null;
  }
  function sameCoords(a,b){
    const x=cloneCoords(a),y=cloneCoords(b);if(!x||!y)return false;
    for(let i=0;i<4;i++)for(let j=0;j<2;j++)if(Math.abs(x[i][j]-y[i][j])>1e-12)return false;
    return true;
  }
  function heatAllowed(state){
    if(state?.projectBlank)return false;
    if(state?.role!=='primary')return true;
    const toggle=document.getElementById('heatmapToggle');
    return !toggle||!!toggle.checked;
  }
  function candidateForUrl(state,url){
    if(!state?.sources||!state?.layers||!url)return null;
    const list=[];
    for(const [id,layer] of state.layers){
      if(layer?.layout?.visibility==='none')continue;
      const src=state.sources.get(layer.source);
      if(!src||src.removed||src.frame?.url!==url)continue;
      list.push({id,layer,source:src});
    }
    if(!list.length)return null;
    if(state.role==='primary'){
      const inspect=list.filter(x=>state.cfg?.inspectMatch?.(x.id));
      if(inspect.length){inspect.sort((a,b)=>(a.source.serial||0)-(b.source.serial||0));return inspect[inspect.length-1];}
      list.sort((a,b)=>(a.source.tier||0)-(b.source.tier||0)||(a.source.serial||0)-(b.source.serial||0));
      return list[list.length-1];
    }
    list.sort((a,b)=>(a.source.serial||0)-(b.source.serial||0));
    return list[list.length-1];
  }
  function imageDims(source){
    try{return {width:+source?.image?.width||0,height:+source?.image?.height||0};}catch(e){return {width:0,height:0};}
  }
  function setCanonicalVisibility(state,visible){
    try{
      if(!state.baseGetLayer(state.cfg.canonicalLayer))return false;
      if(visible){
        state.baseSetPaintProperty(state.cfg.canonicalLayer,'raster-opacity',state.cfg.opacity());
        state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','visible');
      }else state.baseSetLayoutProperty(state.cfg.canonicalLayer,'visibility','none');
      state.visible=!!visible;state.map.triggerRepaint?.();return true;
    }catch(e){return false;}
  }
  function finalizeLoaded(state,source,meta,reason){
    if(!state||!source||!meta?.activeUrl)return false;
    let loaded=false;try{loaded=source.loaded?.()===true;}catch(e){}
    if(!loaded)return false;
    const candidate=candidateForUrl(state,meta.activeUrl);if(!candidate)return false;
    const frame=candidate.source.frame,dims=imageDims(source);
    if(!frame||dims.width!==frame.width||dims.height!==frame.height)return false;
    const previous=state.currentFrame;
    state.currentFrame=frame;
    state.currentSource=candidate.source.id;
    state.currentLayer=candidate.id;
    state.committedStyleEpoch=state.styleEpoch;
    // Invalidate any v1.2.0 verifier that was started before this independent
    // completion check. It must not later turn a successful load into a false failure.
    state.requestSerial=(state.requestSerial||0)+1;
    if(state.verifyTimer){clearTimeout(state.verifyTimer);state.verifyTimer=null;}
    setCanonicalVisibility(state,heatAllowed(state));
    if(meta.lastCommittedUrl!==meta.activeUrl){
      mark('heatmap.v121-image-committed',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:frame.width,height:frame.height,sourceLoaded:true,verifyMs:Math.max(0,now()-meta.started),dedupedRequests:meta.deduped||0,reason});
      meta.lastCommittedUrl=meta.activeUrl;
      if(previous&&previous!==frame)previous.url='';
    }
    return true;
  }
  function monitor(state,source,meta,reason){
    if(meta.monitoring)return;
    meta.monitoring=true;
    const token=++meta.monitorToken;
    const poll=()=>{
      if(token!==meta.monitorToken){meta.monitoring=false;return;}
      if(finalizeLoaded(state,source,meta,reason)){meta.monitoring=false;return;}
      if(now()-meta.started>10000){
        meta.monitoring=false;
        mark('heatmap.v121-image-load-timeout',{map:state.role,styleEpoch:state.styleEpoch,expectedUrlChars:meta.activeUrl?.length||0,dedupedRequests:meta.deduped||0,reason});
        return;
      }
      setTimeout(poll,20);
    };
    setTimeout(poll,0);
  }
  function beginMonitoring(state,source,meta,url,reason){
    if(!url)return;
    if(meta.activeUrl!==url){meta.activeUrl=url;meta.deduped=0;meta.started=now();meta.monitorToken++;meta.monitoring=false;}
    if(!meta.started)meta.started=now();
    monitor(state,source,meta,reason);
  }
  function patchSource(state,source){
    if(!source||patchedSources.has(source))return !!source;
    if(typeof source.updateImage!=='function')return false;
    patchedSources.add(source);
    const original=source.updateImage.bind(source);
    const initialUrl=String(source.options?.url||source.url||'');
    const meta={activeUrl:initialUrl,deduped:0,started:now(),monitoring:false,monitorToken:0,lastCommittedUrl:''};
    sourceMeta.set(source,meta);
    source.updateImage=function(options){
      const url=String(options?.url||'');
      if(!url)return original(options);
      const currentUrl=String(source.options?.url||source.url||meta.activeUrl||'');
      if(url===meta.activeUrl||url===currentUrl){
        meta.activeUrl=url;meta.deduped++;
        if(options?.coordinates&&!sameCoords(source.coordinates,options.coordinates)){
          try{source.setCoordinates?.(options.coordinates);}catch(e){}
        }
        if(!finalizeLoaded(state,source,meta,'same-url-dedupe'))monitor(state,source,meta,'same-url-dedupe');
        return source;
      }
      meta.activeUrl=url;meta.deduped=0;meta.started=now();meta.monitorToken++;meta.monitoring=false;
      const result=original(options);
      mark('heatmap.v121-image-requested',{map:state.role,styleEpoch:state.styleEpoch,urlChars:url.length,reason:'new-frame'});
      monitor(state,source,meta,'new-frame');
      return result;
    };
    mark('heatmap.v121-source-dedupe-installed',{map:state.role,styleEpoch:state.styleEpoch,initialUrlChars:initialUrl.length});
    beginMonitoring(state,source,meta,initialUrl,'initial-source');
    return true;
  }
  function patchState(state){
    if(!state?.cfg?.canonicalSource||typeof state.baseGetSource!=='function')return false;
    let source=null;try{source=state.baseGetSource(state.cfg.canonicalSource);}catch(e){}
    if(!source)return false;
    patchSource(state,source);
    const meta=sourceMeta.get(source);
    if(meta)finalizeLoaded(state,source,meta,'scan');
    return true;
  }
  function scan(){
    try{patchState(window.__padGradeV120PrimaryHeatState);}catch(e){}
    try{patchState(window.__padGradeCompareMapInstance?.__padGradeV120HeatState);}catch(e){}
  }
  window.pgV121HeatRepairScan=scan;
  setInterval(scan,8);
  document.addEventListener('visibilitychange',scan,true);
  window.addEventListener('padgrade-project-grid-ready',scan);
  window.addEventListener('padgrade-active-project-applied',scan);
  mark('heatmap.v121-runtime-installed',{version:VERSION,policy:'one-inflight-load-per-unique-url'});
})();
