/* Pad Grade v1.2.8 DEV — invalidate displayed heat immediately after a surface mutation.
 *
 * v1.2.8 remains UPSTREAM of the protected v1.2.2 flickerless presenter. It never
 * removes or recreates the canonical MapLibre heat source/layer. On a real point
 * mutation, v1.2.7 still owns the first operation (physical cancellation), the
 * underlying save then mutates the point, and only after that does this layer hide
 * the now-invalid canonical heat and retire legacy virtual-canvas references.
 *
 * It also neutralizes the legacy v1.1.1 900 ms ensureDisplayedRaster repair loop:
 * canvases retired for an obsolete surface are rejected before they can re-enter
 * the v1.2.7 provenance guard. This removes repeated stale-canvas work/logging while
 * keeping the provenance guard as a final correctness safety net.
 */
(function installPadGrade128Dev(){
  'use strict';
  if(window.__padGradeDevV128)return;
  window.__padGradeDevV128=true;

  const VERSION='1.2.8';
  const NORMAL_SOURCE_RE=/^pad-grade-interpolated-surface-canvas-source-/;
  const NORMAL_LAYER_RE=/^pad-grade-interpolated-surface-canvas-layer-/;
  const CANONICAL_LAYER='pad-grade-v120-heat-image-layer';
  const retiredCanvases=new WeakSet();
  let mapPatched=null;
  let installTimer=null;
  let clickBefore=null;

  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  function surfaceKey(){
    try{
      if(typeof window.pgMeasuredSurfacePoints!=='function'||typeof window.cfg!=='function')return '';
      const s=window.cfg(),points=window.pgMeasuredSurfacePoints();
      return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(points||[]).map(p=>[+p.x,+p.y,+p.v])});
    }catch(e){return '';}
  }
  function activeProjectId(){try{return localStorage.getItem('padGradeActiveProjectIdV5')||'';}catch(e){return '';}}

  function patchRetiredCanvasAdmission(map){
    if(!map||map.__padGradeV128RetiredCanvasGuard)return !!map;
    // Install after v1.2.7 so retired legacy canvases are stopped before the more
    // expensive provenance/logging path. New/current canvases flow unchanged.
    const base=map.addSource?.bind(map);if(typeof base!=='function')return false;
    map.addSource=function(id,spec){
      const canvas=spec?.canvas;
      if(canvas&&retiredCanvases.has(canvas)){
        if(!canvas.__padGradeV128RetiredRetryLogged){
          canvas.__padGradeV128RetiredRetryLogged=true;
          mark('heatmap.v128-retired-canvas-retry-suppressed',{source:String(id||''),width:+canvas.width||0,height:+canvas.height||0});
        }
        return this;
      }
      return base(id,spec);
    };
    map.__padGradeV128RetiredCanvasGuard=true;mapPatched=map;
    mark('heatmap.v128-retired-canvas-guard-installed',{projectId:activeProjectId()});
    return true;
  }

  function retireLegacyPresentation(reason){
    const state=window.__padGradeV120PrimaryHeatState;
    let sources=0,layers=0,canvases=0;
    try{
      if(state?.commitTimer){clearTimeout(state.commitTimer);state.commitTimer=null;}
      if(state?.verifyTimer){clearTimeout(state.verifyTimer);state.verifyTimer=null;}
      state.requestSerial=(state.requestSerial||0)+1;
      if(state?.sources instanceof Map){
        for(const [id,record] of [...state.sources.entries()]){
          if(!NORMAL_SOURCE_RE.test(String(id||'')))continue;
          if(record?.canvas){retiredCanvases.add(record.canvas);canvases++;}
          if(record){record.removed=true;record.frame=null;record.canvas=null;}
          state.sources.delete(id);sources++;
        }
      }
      if(state?.layers instanceof Map){
        for(const id of [...state.layers.keys()]){
          if(!NORMAL_LAYER_RE.test(String(id||'')))continue;
          state.layers.delete(id);layers++;
        }
      }
      state.currentFrame=null;state.currentSource=null;state.currentLayer=null;
    }catch(e){mark('heatmap.v128-legacy-retire-error',{reason,error:String(e?.message||e).slice(0,160)});}
    mark('heatmap.v128-legacy-presentation-retired',{reason,sources,layers,canvases});
    return {sources,layers,canvases};
  }

  function hideCanonicalHeat(reason){
    const map=window.__padGradeMapInstance||mapPatched;
    let hidden=false;
    try{
      if(map?.getLayer?.(CANONICAL_LAYER)){
        map.setLayoutProperty(CANONICAL_LAYER,'visibility','none');
        map.triggerRepaint?.();hidden=true;
      }
    }catch(e){}
    mark('heatmap.v128-invalid-display-cleared',{reason,hidden,canonicalSourcePreserved:true,canonicalLayerPreserved:true});
    return hidden;
  }

  function requestHeatRefresh(reason){
    // v1.1.1's regular engine owns syncSurface inside its closure. Its heat-toggle
    // change listener is the narrow public trigger for an immediate sync, avoiding
    // up to one 900 ms maintenance interval of unnecessary blank time.
    const toggle=document.getElementById('heatmapToggle');
    if(toggle?.checked){
      queueMicrotask(()=>{
        try{toggle.dispatchEvent(new Event('change'));mark('heatmap.v128-refresh-requested',{reason,trigger:'heat-toggle-change'});}catch(e){}
      });
    }else mark('heatmap.v128-refresh-requested',{reason,trigger:'none-heat-disabled'});
  }

  function afterSurfaceMutation(reason,beforeKey,afterKey){
    if(!beforeKey||!afterKey||beforeKey===afterKey)return false;
    // Required ordering: v1.2.7 cancellation happened inside/capture-before the
    // mutation; the point/settings mutation is now authoritative; only now hide
    // the obsolete derived heat and retire its legacy presentation references.
    mark('heatmap.v128-authoritative-mutation-observed',{reason,projectId:activeProjectId()});
    retireLegacyPresentation(reason);
    hideCanonicalHeat(reason);
    requestHeatRefresh(reason);
    return true;
  }

  function installSaveWrapper(){
    const base=window.saveCurrent;
    if(typeof base!=='function'||base.__padGradeV128MutationOrder)return false;
    // Do not install outside the v1.2.7 cancellation contract. The outer v1.2.8
    // wrapper calls that base, so its cancel-first behavior necessarily happens
    // before saveCurrent mutates the reading.
    if(!base.__padGradeV127MutationFirst)return false;
    const wrapped=function(){
      const before=surfaceKey();
      const result=base.apply(this,arguments);
      const after=surfaceKey();
      afterSurfaceMutation('point-save',before,after);
      return result;
    };
    wrapped.__padGradeV128MutationOrder=true;
    wrapped.__padGradeV128Base=base;
    window.saveCurrent=wrapped;
    mark('heatmap.v128-save-mutation-order-installed',{order:['cancel','mutate','clear','refresh']});
    return true;
  }

  function installClickMutationObserver(){
    if(document.__padGradeV128MutationObserver)return;
    document.__padGradeV128MutationObserver=true;
    document.addEventListener('click',event=>{
      const id=event.target?.closest?.('button')?.id||'';
      if(id==='deletePoint'||id==='applySettings')clickBefore={id,key:surfaceKey()};
    },true);
    document.addEventListener('click',event=>{
      const id=event.target?.closest?.('button')?.id||'';
      if(!clickBefore||clickBefore.id!==id)return;
      const prior=clickBefore;clickBefore=null;
      queueMicrotask(()=>afterSurfaceMutation(id==='deletePoint'?'point-delete':'settings-apply',prior.key,surfaceKey()));
    },false);
  }

  function attach(){
    installSaveWrapper();installClickMutationObserver();
    const map=window.__padGradeMapInstance||null;
    if(map)patchRetiredCanvasAdmission(map);
    document.title='Pad Grade Mapper v1.2.8 DEV';
  }

  window.addEventListener('padgrade-map-created',event=>setTimeout(()=>patchRetiredCanvasAdmission(event?.detail?.map||window.__padGradeMapInstance),0));
  window.addEventListener('padgrade-active-project-applied',()=>setTimeout(attach,0));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,0),{once:true});else setTimeout(attach,0);
  installTimer=setInterval(()=>{
    attach();
    if(window.saveCurrent?.__padGradeV128MutationOrder&&window.__padGradeMapInstance?.__padGradeV128RetiredCanvasGuard){clearInterval(installTimer);installTimer=null;}
  },100);
  window.addEventListener('beforeunload',()=>{if(installTimer)clearInterval(installTimer);},{once:true});
  mark('heatmap.v128-runtime-installed',{version:VERSION,mutationOrder:'cancel-mutate-clear-refresh',protectedV122PresenterUnchanged:true,legacyRetiredCanvasAdmissionSuppressed:true});
})();
