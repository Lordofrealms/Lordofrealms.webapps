/* Pad Grade v1.2.2 DEV — direct completed-canvas presentation.
 *
 * MAINTENANCE / CHANGE-CONTROL NOTE — FLICKERLESS HEAT PRESENTATION
 * -----------------------------------------------------------------
 * This presentation path is intentionally structured to keep the previous complete
 * heat-map frame visible until the next complete frame is ready, then refresh the
 * existing MapLibre texture in place. It was reached only after substantial field
 * debugging across multiple DEV revisions involving partial-canvas painting,
 * source/layer recreation flicker, MapLibre ImageSource abort/reload behavior, and
 * Android WebView data-URL decode failures.
 *
 * DO NOT casually replace, simplify, or re-architect the canonical heat source,
 * layer, complete-canvas copy, or in-place texture refresh behavior below. Any
 * change to this heat-map presentation architecture requires explicit developer
 * agreement specifically approving a presentation change, plus the dedicated
 * no-flicker regression coverage. Calculation/interpolation work should remain
 * separate from this presentation block whenever possible.
 * -----------------------------------------------------------------
 *
 * v1.2.1 proved that the worker/cache canvases are complete and non-transparent,
 * but Android WebView never completed MapLibre's URL ImageSource decode for the
 * large local PNG data URL. v1.2.2 keeps the v1.2.0 single-authority source/layer
 * model while replacing only that URL/decode transport: the canonical source is
 * a static CanvasSource backed by a private display canvas. A completed worker
 * canvas is copied into that private canvas in one synchronous JS turn, then the
 * existing MapLibre texture is refreshed in place. The previous GPU texture stays
 * visible until the new complete canvas is ready; tier changes do not remove or
 * recreate the canonical source/layer.
 */
(function installPadGrade122Dev(){
  'use strict';
  if(window.__padGradeDevV122)return;
  window.__padGradeDevV122=true;
  // v1.2.2 supersedes the v1.2.1 URL request-dedupe shim. Keep the historical
  // file in the repository, but make its executable guard return immediately.
  window.__padGradeDevV121=true;

  const VERSION='1.2.2';
  const patchedStates=new WeakSet();
  const sourceMeta=new WeakMap();
  const rawMark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const mark=(name,details)=>rawMark(name,details);

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
      if(!src||src.removed||src.frame?.url!==url||!src.canvas)continue;
      list.push({id,layer,source:src});
    }
    if(!list.length)return null;
    if(state.role==='primary'){
      const inspect=list.filter(x=>state.cfg?.inspectMatch?.(x.id));
      if(inspect.length){inspect.sort((a,b)=>(a.source.serial||0)-(b.source.serial||0));return inspect[inspect.length-1];}
      list.sort((a,b)=>(a.source.tier||0)-(b.source.tier||0)||(a.source.serial||0)-(b.source.serial||0));
      return list[list.length-1];
    }
    list.sort((a,b)=>(a.source.serial||0)-(b.source.serial||0));return list[list.length-1];
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
  function copyCompleteCanvas(target,source){
    if(!target||!source||!(+source.width>0)||!(+source.height>0))return false;
    if(target.width!==source.width)target.width=source.width;
    if(target.height!==source.height)target.height=source.height;
    const ctx=target.getContext?.('2d',{alpha:true});if(!ctx)return false;
    try{
      ctx.save?.();
      ctx.globalCompositeOperation='copy';
      ctx.drawImage(source,0,0,target.width,target.height);
      ctx.restore?.();
      return true;
    }catch(e){try{ctx.restore?.();}catch(_){}return false;}
  }
  function forceTextureRefresh(source){
    try{
      const hasTiles=Object.keys(source?.tiles||{}).length>0;
      if(hasTiles&&typeof source.prepare==='function'){
        const was=!!source._playing;
        source._playing=true;
        source.prepare();
        source._playing=was;
      }else if(source?.texture){
        // Not currently paintable. Preserve correctness for the next visible
        // prepare() by forcing MapLibre to build from the current canvas then.
        try{source.texture.destroy?.();}catch(e){}
        source.texture=null;
      }
      source?.map?.triggerRepaint?.();
      return true;
    }catch(e){return false;}
  }
  function promote(state,source,meta,candidate,reason){
    if(!state||!source||!meta||!candidate?.source?.frame)return false;
    const frame=candidate.source.frame;
    state.currentFrame=frame;
    state.currentSource=candidate.source.id;
    state.currentLayer=candidate.id;
    state.committedStyleEpoch=state.styleEpoch;
    // Cancel/obsolete the v1.2.0 URL verifier. The real canonical source is now
    // a CanvasSource and has already received the complete frame directly.
    state.requestSerial=(state.requestSerial||0)+1;
    if(state.verifyTimer){clearTimeout(state.verifyTimer);state.verifyTimer=null;}
    setCanonicalVisibility(state,heatAllowed(state));
    if(meta.lastCommittedFrame!==frame){
      mark('heatmap.v122-canvas-committed',{map:state.role,styleEpoch:state.styleEpoch,layer:candidate.id,source:candidate.source.id,tier:candidate.source.tier||0,width:+candidate.source.canvas?.width||0,height:+candidate.source.canvas?.height||0,transport:'direct-complete-canvas',sourceReused:meta.commitCount>0,commitCount:meta.commitCount+1,reason});
      meta.lastCommittedFrame=frame;meta.commitCount++;
    }
    return true;
  }
  function installCanvasSourceShim(state,source,displayCanvas,initialCandidate,initialUrl){
    if(!source||sourceMeta.has(source))return sourceMeta.get(source)||null;
    const meta={displayCanvas,lastUrl:String(initialUrl||''),lastCommittedFrame:null,commitCount:0};
    sourceMeta.set(source,meta);
    // v1.2.0 only reads source.image for verification. CanvasSource rendering
    // itself uses source.canvas; this marker makes the superseded verifier see
    // the correct dimensions without participating in rendering.
    source.image={width:+displayCanvas.width||0,height:+displayCanvas.height||0,__padGradeV122:true,serial:0};
    source._loaded=true;
    const apply=(candidate,url,coords,reason)=>{
      if(!candidate?.source?.canvas)return false;
      const frame=candidate.source.frame;
      if(meta.lastCommittedFrame===frame&&state.committedStyleEpoch===state.styleEpoch){
        if(coords&&!sameCoords(source.coordinates,coords))try{source.setCoordinates?.(coords);}catch(e){}
        setCanonicalVisibility(state,heatAllowed(state));
        return true;
      }
      if(!copyCompleteCanvas(displayCanvas,candidate.source.canvas)){
        mark('heatmap.v122-canvas-copy-failed',{map:state.role,styleEpoch:state.styleEpoch,tier:candidate.source.tier||0,reason});
        return false;
      }
      if(coords&&!sameCoords(source.coordinates,coords))try{source.setCoordinates?.(coords);}catch(e){}
      meta.lastUrl=String(url||frame?.url||'');
      source.image={width:+displayCanvas.width||0,height:+displayCanvas.height||0,__padGradeV122:true,serial:(source.image?.serial||0)+1};
      source._loaded=true;
      forceTextureRefresh(source);
      promote(state,source,meta,candidate,reason);
      return true;
    };
    source.updateImage=function(options){
      const url=String(options?.url||'');
      const candidate=candidateForUrl(state,url);
      if(!candidate){mark('heatmap.v122-candidate-missing',{map:state.role,styleEpoch:state.styleEpoch,urlChars:url.length});return source;}
      apply(candidate,url,cloneCoords(options?.coordinates),'update-image-redirect');
      return source;
    };
    meta.apply=apply;
    // The layer is added immediately after the source in v1.2.0. Defer only the
    // visibility/promotion step; the complete canvas pixels are already copied.
    setTimeout(()=>{
      if(initialCandidate)apply(initialCandidate,initialUrl,cloneCoords(initialCandidate.source.coordinates),'initial-source');
    },0);
    return meta;
  }
  function patchState(state){
    if(!state?.cfg?.canonicalSource||patchedStates.has(state))return !!state;
    patchedStates.add(state);
    const originalAddSource=state.baseAddSource;
    state.baseAddSource=function(id,spec){
      if(String(id)===String(state.cfg.canonicalSource)&&spec?.type==='image'){
        const candidate=candidateForUrl(state,String(spec.url||''));
        if(!candidate?.source?.canvas){
          mark('heatmap.v122-canonical-candidate-missing',{map:state.role,styleEpoch:state.styleEpoch,urlChars:String(spec.url||'').length});
          return originalAddSource(id,spec);
        }
        const displayCanvas=document.createElement('canvas');
        if(!copyCompleteCanvas(displayCanvas,candidate.source.canvas)){
          mark('heatmap.v122-initial-copy-failed',{map:state.role,styleEpoch:state.styleEpoch,tier:candidate.source.tier||0});
          return originalAddSource(id,spec);
        }
        const result=originalAddSource(id,{type:'canvas',canvas:displayCanvas,coordinates:cloneCoords(spec.coordinates),animate:false});
        let source=null;try{source=state.baseGetSource(id);}catch(e){}
        if(source){
          installCanvasSourceShim(state,source,displayCanvas,candidate,String(spec.url||''));
          mark('heatmap.v122-canvas-source-created',{map:state.role,styleEpoch:state.styleEpoch,source:String(id),tier:candidate.source.tier||0,width:displayCanvas.width,height:displayCanvas.height,transport:'direct-complete-canvas'});
        }
        return result;
      }
      return originalAddSource(id,spec);
    };
    mark('heatmap.v122-state-patched',{map:state.role,canonicalSource:state.cfg.canonicalSource,policy:'single-source-direct-complete-canvas'});
    return true;
  }
  function scan(){
    try{patchState(window.__padGradeV120PrimaryHeatState);}catch(e){}
    try{patchState(window.__padGradeCompareMapInstance?.__padGradeV120HeatState);}catch(e){}
  }
  function installDiagnosticHook(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV122Wrapped)return false;
    const original=d.mark.bind(d);d.__padGradeV122Wrapped=true;
    d.mark=function(name,details){
      const result=original(name,details);
      if(name==='heatmap.v120-map-controller-installed')scan();
      return result;
    };
    original('heatmap.v122-diagnostics-hook-installed',{version:VERSION});return true;
  }

  window.pgV122HeatRepairScan=scan;
  installDiagnosticHook();scan();
  setInterval(()=>{installDiagnosticHook();scan();},750);
  window.addEventListener('padgrade-project-grid-ready',scan);
  window.addEventListener('padgrade-active-project-applied',scan);
  mark('heatmap.v122-runtime-installed',{version:VERSION,presentation:'single-permanent-static-canvas-source',handoff:'complete-canvas-copy-then-texture-refresh',tierSwapSourceRecreate:false,tierSwapLayerRecreate:false});
})();