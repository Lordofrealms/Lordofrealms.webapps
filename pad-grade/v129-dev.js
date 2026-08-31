/* Pad Grade v1.2.9 DEV — exact 891 cache return after v1.2.8 raster retirement.
 *
 * v1.2.8 intentionally collapses obsolete legacy handoff canvases to 1x1 so the
 * old 900 ms maintenance closure cannot pin large stale bitmaps. v1.1.3's cache
 * memory, however, can hold the very same canvas object. When the user changes a
 * point and later returns to the exact cached surface, v1.1.3 may therefore offer
 * that retired 1x1 object as its otherwise-valid 891 cache hit.
 *
 * This layer stays OUTSIDE v1.2.8's retired-canvas guard. It blocks those retired
 * retries before they can re-tombstone a source slot that a current frame owns.
 * For an exact current 891 disk cache, it restores the cache-memory canvas from
 * the persisted PNG, then hands v1.2.7/v1.2.0/v1.2.2 a fresh clone. Later reuse of
 * that restored cache-memory canvas is cloned synchronously, so no second disk
 * decode is needed. The protected permanent v1.2.2 MapLibre source/layer is never
 * removed or recreated.
 */
(function installPadGrade129Dev(){
  'use strict';
  if(window.__padGradeDevV129)return;
  window.__padGradeDevV129=true;

  const VERSION='1.2.9';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const NORMAL_SOURCE_RE=/^pad-grade-interpolated-surface-canvas-source-/;
  const NORMAL_LAYER_RE=/^pad-grade-interpolated-surface-canvas-layer-/;
  const SOURCE_PREFIX='pad-grade-interpolated-surface-canvas-source-';
  const LAYER_PREFIX='pad-grade-interpolated-surface-canvas-layer-';
  const CANONICAL_LAYER='pad-grade-v120-heat-image-layer';
  const CACHE_FORMAT='PadGradeHeatCache';
  const CACHE_VERSION=1;
  const blockedSourceAt=new Map();
  const rehydrateJobs=new Map();
  let mapPatched=null;
  let installTimer=null;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeProjectId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  function surfaceKey(){
    try{
      if(typeof window.pgMeasuredSurfacePoints!=='function'||typeof window.cfg!=='function')return '';
      const s=window.cfg(),points=window.pgMeasuredSurfacePoints();
      return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(points||[]).map(p=>[+p.x,+p.y,+p.v])});
    }catch(e){return '';}
  }
  const cacheFilename=id=>`Pad-Grade-Heat-${String(id||'unknown').replace(/[^A-Za-z0-9._-]/g,'_')}.pgheatcache`;
  const heatEnabled=()=>{const t=document.getElementById('heatmapToggle');return !t||!!t.checked;};
  const heatOpacity=()=>{try{const n=typeof window.pgHeatmapOpacity==='function'?+window.pgHeatmapOpacity():.58;return Number.isFinite(n)?n:.58;}catch(e){return .58;}};

  function imageCoordinates(){
    try{
      if(typeof window.fitPointLatLon!=='function'||typeof window.cfg!=='function'||!window.gpsFit)return null;
      const s=window.cfg(),tl=window.fitPointLatLon(0,s.length),tr=window.fitPointLatLon(s.width,s.length),br=window.fitPointLatLon(s.width,0),bl=window.fitPointLatLon(0,0);
      if(!tl||!tr||!br||!bl)return null;
      return [[tl.lon,tl.lat],[tr.lon,tr.lat],[br.lon,br.lat],[bl.lon,bl.lat]];
    }catch(e){return null;}
  }
  function layerAnchor(map){
    try{for(const id of ['pad-grade-error-fill','pad-grade-grid-lines-layer','pad-grade-pad-outline-layer','pad-grade-route-layer','pad-grade-grid-points-layer','pad-grade-grid-labels','pad-grade-current-fix-layer'])if(map.getLayer(id))return id;}catch(e){}
    return undefined;
  }
  function retiredMeta(canvas){
    if(!canvas)return null;
    const width=+canvas.__padGradeV128RetiredWidth||0,height=+canvas.__padGradeV128RetiredHeight||0;
    return width>0&&height>0?{width,height,tier:Math.max(width,height)}:null;
  }
  function cloneCanvas(canvas,width,height){
    try{
      const out=document.createElement('canvas');out.width=width;out.height=height;
      const ctx=out.getContext('2d',{alpha:true});if(!ctx)return null;
      ctx.drawImage(canvas,0,0,width,height);return out;
    }catch(e){return null;}
  }
  function decodePng(dataUrl,width,height){
    return new Promise(resolve=>{
      try{
        const image=new Image();
        image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){resolve(null);return;}ctx.drawImage(image,0,0,width,height);resolve(canvas);}catch(e){resolve(null);}};
        image.onerror=()=>resolve(null);image.src=dataUrl;
      }catch(e){resolve(null);}
    });
  }
  function clearVirtualSlot(map,slot){
    const lid=`${LAYER_PREFIX}${slot}`,sid=`${SOURCE_PREFIX}${slot}`;
    // First removal can consume a v1.2.8 tombstone. The second reaches the real
    // v1.2.0 virtual record if one survived underneath that tombstone.
    for(let pass=0;pass<2;pass++){
      try{if(map.getLayer?.(lid))map.removeLayer?.(lid);}catch(e){}
      try{if(map.getSource?.(sid))map.removeSource?.(sid);}catch(e){}
    }
  }
  function presentFreshCache(projectId,key,canvas,nx,ny,reason){
    const map=window.__padGradeMapInstance||mapPatched,coords=imageCoordinates();
    if(!map||!coords||projectId!==activeProjectId()||key!==surfaceKey())return false;
    const fresh=cloneCanvas(canvas,nx,ny);if(!fresh)return false;
    const sid=`${SOURCE_PREFIX}0`,lid=`${LAYER_PREFIX}0`;
    try{
      clearVirtualSlot(map,0);clearVirtualSlot(map,1);
      map.addSource(sid,{type:'canvas',canvas:fresh,coordinates:coords,animate:false});
      const layer={id:lid,type:'raster',source:sid,paint:{'raster-opacity':heatOpacity(),'raster-fade-duration':0}};
      const before=layerAnchor(map);before?map.addLayer(layer,before):map.addLayer(layer);
      map.setLayoutProperty?.(lid,'visibility',heatEnabled()?'visible':'none');
      window.__padGradeHeatmapMesh={tier:891,nx,ny,cells:nx*ny,raster:true,canvasSource:true,atomicSwap:true,cached:true,progressiveTiers:[99,297,891],monotonic:true};
      map.triggerRepaint?.();
      mark('heatmap.v129-cache-rehydrated',{projectId,tier:891,nx,ny,reason,protectedCanonicalPreserved:true});
      setTimeout(()=>{
        let canonicalVisible=false;try{canonicalVisible=map.getLayoutProperty?.(CANONICAL_LAYER,'visibility')!=='none';}catch(e){}
        mark('heatmap.v129-cache-rehydrate-present-check',{projectId,keyStillCurrent:key===surfaceKey(),canonicalVisible});
      },80);
      return true;
    }catch(e){mark('heatmap.v129-cache-rehydrate-install-failed',{projectId,error:String(e?.message||e).slice(0,160)});return false;}
  }
  function scheduleExactCacheRehydrate(retiredCanvas,meta,sourceId){
    if(!retiredCanvas||!meta||meta.tier!==891)return false;
    const projectId=activeProjectId(),key=surfaceKey();if(!projectId||!key)return false;
    const token=`${projectId}|${key}`;
    if(rehydrateJobs.has(token))return true;
    const job=(async()=>{
      try{
        const files=window.PadGradeFiles;if(!files?.read)return false;
        const text=await files.read(cacheFilename(projectId));if(!text)return false;
        let raw=null;try{raw=JSON.parse(text);}catch(e){return false;}
        if(raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.projectId!==projectId||raw.surfaceKey!==key||+raw.tier!==891||+raw.nx!==meta.width||+raw.ny!==meta.height||typeof raw.png!=='string'){
          mark('heatmap.v129-cache-rehydrate-miss',{projectId,source:sourceId,reason:'persisted-cache-not-current-exact-surface'});return false;
        }
        const decoded=await decodePng(raw.png,+raw.nx,+raw.ny);if(!decoded)return false;
        if(projectId!==activeProjectId()||key!==surfaceKey())return false;
        const ctx=retiredCanvas.getContext?.('2d',{alpha:true});
        retiredCanvas.width=+raw.nx;retiredCanvas.height=+raw.ny;
        const restored=retiredCanvas.getContext?.('2d',{alpha:true})||ctx;if(!restored)return false;
        restored.clearRect(0,0,+raw.nx,+raw.ny);restored.drawImage(decoded,0,0,+raw.nx,+raw.ny);
        retiredCanvas.__padGradeV129RehydratedSurfaceKey=key;
        retiredCanvas.__padGradeV129RehydratedProjectId=projectId;
        return presentFreshCache(projectId,key,retiredCanvas,+raw.nx,+raw.ny,'retired-memory-891-exact-disk-cache');
      }catch(e){mark('heatmap.v129-cache-rehydrate-failed',{projectId,error:String(e?.message||e).slice(0,160)});return false;}
      finally{rehydrateJobs.delete(token);}
    })();
    rehydrateJobs.set(token,job);return true;
  }

  function patchMap(map){
    if(!map||map.__padGradeV129CacheReturnGuard)return !!map;
    // Must be outer to v1.2.8. That lets us stop a retired retry BEFORE v1.2.8
    // can re-tombstone an ID that a legitimate current cache clone has reclaimed.
    if(!map.__padGradeV128RetiredCanvasGuard)return false;
    const baseAddSource=map.addSource?.bind(map),baseAddLayer=map.addLayer?.bind(map);
    if(typeof baseAddSource!=='function'||typeof baseAddLayer!=='function')return false;

    map.addSource=function(id,spec){
      const sid=String(id||''),canvas=spec?.canvas,meta=retiredMeta(canvas);
      if(NORMAL_SOURCE_RE.test(sid)&&canvas&&meta){
        const projectId=activeProjectId(),key=surfaceKey();
        const exactRehydrated=meta.tier===891&&canvas.__padGradeV129RehydratedProjectId===projectId&&canvas.__padGradeV129RehydratedSurfaceKey===key&&+canvas.width===meta.width&&+canvas.height===meta.height;
        if(exactRehydrated){
          const fresh=cloneCanvas(canvas,meta.width,meta.height);
          if(fresh){blockedSourceAt.delete(sid);mark('heatmap.v129-cache-memory-reuse-cloned',{projectId,source:sid,tier:891,nx:meta.width,ny:meta.height});return baseAddSource(id,{...spec,canvas:fresh});}
        }
        blockedSourceAt.set(sid,now());
        if(meta.tier===891&&+canvas.width===1&&+canvas.height===1)scheduleExactCacheRehydrate(canvas,meta,sid);
        mark('heatmap.v129-retired-retry-blocked',{source:sid,tier:meta.tier,backingWidth:+canvas.width||0,backingHeight:+canvas.height||0,preventsRetombstone:true});
        return this;
      }
      if(NORMAL_SOURCE_RE.test(sid))blockedSourceAt.delete(sid);
      return baseAddSource(id,spec);
    };
    map.addLayer=function(layer,before){
      const lid=String(layer?.id||''),sid=String(layer?.source||''),blockedAt=blockedSourceAt.get(sid)||0;
      if(NORMAL_LAYER_RE.test(lid)&&blockedAt&&now()-blockedAt<300){
        mark('heatmap.v129-retired-layer-retry-blocked',{layer:lid,source:sid,preventsRetombstone:true});
        return this;
      }
      return before===undefined?baseAddLayer(layer):baseAddLayer(layer,before);
    };
    map.__padGradeV129CacheReturnGuard=true;mapPatched=map;
    mark('heatmap.v129-cache-return-guard-installed',{projectId:activeProjectId(),outerToV128:true,exact891Rehydrate:true});
    return true;
  }

  function attach(){
    const map=window.__padGradeMapInstance||null;if(map)patchMap(map);
    document.title='Pad Grade Mapper v1.2.9 DEV';
  }
  window.addEventListener('padgrade-map-created',event=>setTimeout(()=>patchMap(event?.detail?.map||window.__padGradeMapInstance),0));
  window.addEventListener('padgrade-active-project-applied',()=>setTimeout(attach,0));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,0),{once:true});else setTimeout(attach,0);
  installTimer=setInterval(()=>{attach();if(window.__padGradeMapInstance?.__padGradeV129CacheReturnGuard){clearInterval(installTimer);installTimer=null;}},100);
  window.addEventListener('beforeunload',()=>{if(installTimer)clearInterval(installTimer);},{once:true});
  mark('heatmap.v129-runtime-installed',{version:VERSION,exact891CacheReturnRepair:true,retiredRetryStopsBeforeV128:true,protectedV122PresenterUnchanged:true});
})();
