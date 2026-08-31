/* Pad Grade v1.2.7 DEV — point-mutation heat cancellation, sequential regular heat work,
 * immutable raster provenance, and first-run/startup visual gating.
 *
 * IMPORTANT: this layer is deliberately UPSTREAM of the protected v1.2.2 completed-canvas
 * presentation architecture. It does not recreate or replace the permanent MapLibre heat
 * source/layer. It controls which regular heat work is allowed to run and which legacy
 * completed canvases are allowed to feed that already-protected presenter.
 */
(function installPadGrade127Dev(){
  'use strict';
  if(window.__padGradeDevV127)return;
  window.__padGradeDevV127=true;

  const VERSION='1.2.7';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const PROJECT_PREFIX='padGradeProjectV5:';
  const HEAT_WORKER_RE=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const NORMAL_SOURCE_RE=/^pad-grade-interpolated-surface-canvas-source-/;
  const TERMINAL_TYPES=new Set(['complete','empty','error']);
  const ParentWorker=window.Worker;
  const records=new Map();
  const canvasProvenance=new WeakMap();
  const pendingCanvasAuth=[];
  let generationSeq=0;
  let activeIdentity='';
  let activeGeneration=0;
  let mapPatched=null;
  let mapAttachTimer=null;
  let baseMap=null;
  let baseMapRendered=false;
  let baseMapRenderSerial=0;
  let recoveryEndPending=false;
  let recoveryEndBase=null;
  let firstRunKeepalive=null;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  function buildKey(message){
    const s=message?.settings||{};
    return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(message?.points||[]).map(p=>[+p.x,+p.y,+p.v])});
  }
  function currentSurfaceKey(){
    try{
      if(typeof window.pgMeasuredSurfacePoints!=='function'||typeof window.cfg!=='function')return '';
      const s=window.cfg(),points=window.pgMeasuredSurfacePoints();
      return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(points||[]).map(p=>[+p.x,+p.y,+p.v])});
    }catch(e){return '';}
  }
  const identity=(projectId,key)=>`${projectId}\u0000${key}`;
  function currentIdentity(){const id=activeId(),key=currentSurfaceKey();return id&&key?identity(id,key):'';}
  function splitIdentity(value){const p=String(value||'').indexOf('\u0000');return p<0?{projectId:'',surfaceKey:String(value||'')}:{projectId:value.slice(0,p),surfaceKey:value.slice(p+1)};}
  function sameValue(a,b){return a===b||(Number.isFinite(+a)&&Number.isFinite(+b)&&Math.abs(+a-+b)<1e-12);}

  function dispatchSynthetic(worker,record,reason,extra={}){
    if(!worker||!record)return;
    try{worker.dispatchEvent(new MessageEvent('message',{data:{type:'empty',jobId:record.jobId,tier:record.tier,cancelled:true,cancelReason:reason,...extra}}));}catch(e){}
  }
  function logPhysicalTermination(worker,record,reason){
    if(!record||record.physicalLogged)return;
    record.physicalLogged=true;
    mark('heatmap.v127-worker-physically-terminated',{reason,projectId:record.projectId,tier:record.tier,jobId:record.jobId,generation:record.generation,forwarded:!!record.forwarded,queued:!!record.queued,ageMs:+Math.max(0,now()-record.startedAt).toFixed(1)});
  }
  function cancelQueued(reason){
    let count=0;
    for(const [worker,record] of [...records.entries()]){
      if(!record?.active||!record.queued||record.forwarded)continue;
      record.active=false;record.cancelReason=reason;records.delete(worker);
      dispatchSynthetic(worker,record,reason);
      logPhysicalTermination(worker,record,reason);
      try{ParentWorker.prototype.terminate.call(worker);}catch(e){}
      count++;
    }
    return count;
  }
  function cancelGeneration(reason='explicit-cancel',resetIdentity=true){
    const before=[...records.values()].filter(r=>r?.active).length;
    const queued=cancelQueued(reason);
    let delegated=0;
    try{delegated=Number(window.PadGradeHeatGenerationV126?.cancel?.(reason)||0);}catch(e){}
    // Safety net for forwarded workers not known to the older lifecycle wrapper.
    for(const [worker,record] of [...records.entries()]){
      if(!record?.active||!record.forwarded)continue;
      record.active=false;record.cancelReason=reason;records.delete(worker);
      dispatchSynthetic(worker,record,reason);
      logPhysicalTermination(worker,record,reason);
      try{ParentWorker.prototype.terminate.call(worker);}catch(e){}
    }
    pendingCanvasAuth.length=0;
    const oldIdentity=activeIdentity,oldGeneration=activeGeneration;
    if(resetIdentity){activeIdentity='';activeGeneration=0;}
    if(before||queued||delegated)mark('heatmap.v127-generation-cancelled',{reason,oldGeneration,oldProjectId:splitIdentity(oldIdentity).projectId,jobsBefore:before,queuedTerminated:queued,delegatedTerminated:delegated});
    return before;
  }
  function beginIdentity(nextIdentity){
    if(nextIdentity===activeIdentity&&activeGeneration)return activeGeneration;
    // This is intentionally the FIRST regular-heat action for a newly observed surface.
    cancelGeneration('surface-change-before-new-work',true);
    activeIdentity=nextIdentity;activeGeneration=++generationSeq;
    mark('heatmap.v127-generation-owned',{projectId:splitIdentity(nextIdentity).projectId,generation:activeGeneration,sequentialInitialTiers:true});
    return activeGeneration;
  }

  function authorizeCanvas(tier,record,kind='regular'){
    const auth={tier:+tier||0,identity:record?.identity||activeIdentity,generation:record?.generation||activeGeneration,projectId:record?.projectId||activeId(),surfaceKey:record?.key||currentSurfaceKey(),kind,createdAt:now()};
    pendingCanvasAuth.push(auth);
    while(pendingCanvasAuth.length>12)pendingCanvasAuth.shift();
    return auth;
  }
  function inferTier(canvas){
    const longest=Math.max(+canvas?.width||0,+canvas?.height||0);
    return [99,297,891].reduce((best,t)=>Math.abs(t-longest)<Math.abs(best-longest)?t:best,99);
  }
  function provenanceCurrent(prov){
    if(!prov)return false;
    const id=activeId(),key=currentSurfaceKey();
    if(prov.projectId!==id||prov.surfaceKey!==key)return false;
    if(prov.kind==='cache'||prov.kind==='cache-unmarked')return true;
    return !!activeIdentity&&prov.identity===activeIdentity&&prov.generation===activeGeneration;
  }
  function consumeAuthorization(tier){
    const n=now();
    for(let i=pendingCanvasAuth.length-1;i>=0;i--){
      const auth=pendingCanvasAuth[i];
      if(n-auth.createdAt>5000){pendingCanvasAuth.splice(i,1);continue;}
      if(auth.tier!==tier||!provenanceCurrent(auth))continue;
      pendingCanvasAuth.splice(i,1);return auth;
    }
    return null;
  }

  function patchMap(map){
    if(!map||map.__padGradeV127ProvenanceGuard)return !!map;
    map.__padGradeV127ProvenanceGuard=true;mapPatched=map;
    const addSource=map.addSource.bind(map);
    map.addSource=function(id,spec){
      const sid=String(id||'');
      if(NORMAL_SOURCE_RE.test(sid)&&spec?.type==='canvas'&&spec.canvas){
        const canvas=spec.canvas,tier=inferTier(canvas);let prov=canvasProvenance.get(canvas)||null;
        if(prov){
          if(!provenanceCurrent(prov)){
            mark('heatmap.v127-stale-canvas-suppressed',{tier,reason:'immutable-provenance-mismatch',source:sid,canvasGeneration:prov.generation,currentGeneration:activeGeneration,canvasProjectId:prov.projectId,currentProjectId:activeId()});
            return this;
          }
        }else{
          prov=consumeAuthorization(tier);
          // A previously decoded exact 891 cache can be installed directly by v1.1.3
          // without a fresh cache-hit diagnostic when it is already resident in memory.
          // v1.1.3 itself verifies project + exact surface key before that call.
          if(!prov&&tier===891){
            const key=currentSurfaceKey(),projectId=activeId();
            if(projectId&&key)prov={tier,identity:identity(projectId,key),generation:activeGeneration,projectId,surfaceKey:key,kind:'cache-unmarked',createdAt:now()};
          }
          if(!prov){
            mark('heatmap.v127-stale-canvas-suppressed',{tier,reason:'no-current-generation-authorization',source:sid,currentGeneration:activeGeneration,currentProjectId:activeId()});
            return this;
          }
          canvasProvenance.set(canvas,prov);
          mark('heatmap.v127-canvas-provenance-bound',{tier,projectId:prov.projectId,generation:prov.generation,kind:prov.kind});
        }
      }
      return addSource(id,spec);
    };
    mark('heatmap.v127-map-provenance-guard-installed',{currentProjectId:activeId()});
    armBaseMapRender(map);
    return true;
  }
  function attachMap(){
    const map=window.__padGradeMapInstance||null;
    if(map)patchMap(map);
    return !!map;
  }

  function releaseQueued297(generation,reason='99-complete'){
    for(const [worker,record] of [...records.entries()]){
      if(!record?.active||!record.queued||record.forwarded||record.tier!==297||record.generation!==generation)continue;
      if(record.identity!==activeIdentity||record.generation!==activeGeneration){
        record.active=false;records.delete(worker);dispatchSynthetic(worker,record,'queued-generation-stale');logPhysicalTermination(worker,record,'queued-generation-stale');try{ParentWorker.prototype.terminate.call(worker);}catch(e){};continue;
      }
      record.queued=false;record.forwarded=true;record.forwardedAt=now();
      try{
        if(record.transferProvided)ParentWorker.prototype.postMessage.call(worker,record.message,record.transfer);
        else ParentWorker.prototype.postMessage.call(worker,record.message);
        mark('heatmap.v127-sequential-tier-released',{projectId:record.projectId,tier:297,jobId:record.jobId,generation:record.generation,reason,queueWaitMs:+Math.max(0,record.forwardedAt-record.startedAt).toFixed(1)});
      }catch(e){
        record.active=false;records.delete(worker);dispatchSynthetic(worker,record,'queued-forward-failed');logPhysicalTermination(worker,record,'queued-forward-failed');try{ParentWorker.prototype.terminate.call(worker);}catch(_){}
      }
      return true;
    }
    return false;
  }
  function cancelQueued297ForGeneration(generation,reason,cacheHit=false){
    let count=0;
    for(const [worker,record] of [...records.entries()]){
      if(!record?.active||!record.queued||record.forwarded||record.tier!==297||record.generation!==generation)continue;
      record.active=false;records.delete(worker);
      dispatchSynthetic(worker,record,reason,cacheHit?{cacheHit:true}:{});
      logPhysicalTermination(worker,record,reason);
      try{ParentWorker.prototype.terminate.call(worker);}catch(e){}
      mark(cacheHit?'heatmap.v127-lower-tier-skipped-final-cache':'heatmap.v127-sequential-tier-cancelled',{projectId:record.projectId,tier:297,jobId:record.jobId,generation:record.generation,reason});
      count++;
    }
    return count;
  }

  if(typeof ParentWorker==='function'){
    class PadGrade127Worker extends ParentWorker{
      constructor(url,options){
        super(url,options);
        this.__pg127HeatWorker=HEAT_WORKER_RE.test(String(url||''));
        if(this.__pg127HeatWorker)this.addEventListener('message',event=>{
          const msg=event?.data||{},record=records.get(this);if(!record||msg.jobId!==record.jobId)return;
          if(msg.type==='complete')authorizeCanvas(record.tier,record,'regular');
          if(!TERMINAL_TYPES.has(msg.type))return;
          record.terminalType=msg.type;record.terminalAt=now();record.active=false;
          if(record.tier===99&&record.generation===activeGeneration&&record.identity===activeIdentity){
            if(msg.type==='complete')releaseQueued297(record.generation,'99-complete');
            else cancelQueued297ForGeneration(record.generation,msg.cacheHit?'final-cache-hit-after-99-probe':'99-terminal-without-raster',!!msg.cacheHit);
          }
          mark('heatmap.v127-worker-terminal',{projectId:record.projectId,tier:record.tier,jobId:record.jobId,generation:record.generation,type:msg.type,cacheHit:!!msg.cacheHit,forwarded:!!record.forwarded});
        });
      }
      postMessage(message,transfer){
        if(!this.__pg127HeatWorker||message?.type!=='build'||String(message.context||'')!=='regular'){
          return arguments.length>1?ParentWorker.prototype.postMessage.call(this,message,transfer):ParentWorker.prototype.postMessage.call(this,message);
        }
        const projectId=activeId(),key=buildKey(message),nextIdentity=identity(projectId,key),generation=beginIdentity(nextIdentity),tier=+message.tier||0;
        const record={worker:this,projectId,key,identity:nextIdentity,generation,tier,jobId:message.jobId,message,transfer,transferProvided:arguments.length>1,startedAt:now(),active:true,queued:false,forwarded:false,physicalLogged:false};
        records.set(this,record);
        if(tier===297){
          const waiting99=[...records.values()].some(r=>r!==record&&r.active&&r.generation===generation&&r.identity===nextIdentity&&r.tier===99);
          if(waiting99){record.queued=true;mark('heatmap.v127-sequential-tier-queued',{projectId,tier,jobId:record.jobId,generation,waitingForTier:99});return;}
        }
        record.forwarded=true;record.forwardedAt=now();
        const result=arguments.length>1?ParentWorker.prototype.postMessage.call(this,message,transfer):ParentWorker.prototype.postMessage.call(this,message);
        mark('heatmap.v127-worker-forwarded',{projectId,tier,jobId:record.jobId,generation,sequentialInitialTiers:true});
        return result;
      }
      terminate(){
        const record=records.get(this);
        if(record){
          record.active=false;records.delete(this);
          logPhysicalTermination(this,record,record.terminalType?'owner-cleanup-after-terminal':record.cancelReason||'external-terminate');
        }
        return ParentWorker.prototype.terminate.call(this);
      }
    }
    try{Object.setPrototypeOf(PadGrade127Worker,ParentWorker);}catch(e){}
    PadGrade127Worker.__padGradeV127Lifecycle=true;
    PadGrade127Worker.__padGradeV127Previous=ParentWorker;
    window.Worker=PadGrade127Worker;
  }

  function beforeSurfaceMutation(reason='point-change'){
    const oldIdentity=activeIdentity,oldGeneration=activeGeneration;
    // Explicitly cancel BEFORE the caller mutates readings/settings. This prevents
    // obsolete 99/297/891 CPU work from surviving even for one new-surface cycle.
    cancelGeneration(`mutation:${reason}`,true);
    mark('heatmap.v127-mutation-cancel-first',{reason,oldProjectId:splitIdentity(oldIdentity).projectId,oldGeneration});
  }
  function installMutationHooks(){
    const base=window.saveCurrent;
    if(typeof base==='function'&&!base.__padGradeV127MutationFirst){
      const wrapped=function(){
        try{
          const rc=typeof window.pointFromIndex==='function'?window.pointFromIndex(window.currentIndex):null;
          const key=rc&&typeof window.k==='function'?window.k(rc.r,rc.c):null;
          const old=key!=null?window.readings?.[key]:undefined;
          const raw=document.getElementById('readingInput')?.value??'';
          const next=raw===''?undefined:+raw;
          const changed=(old===undefined)!==(next===undefined)||(old!==undefined&&next!==undefined&&!sameValue(old,next));
          if(changed)beforeSurfaceMutation('point-save');
        }catch(e){beforeSurfaceMutation('point-save-unknown');}
        return base.apply(this,arguments);
      };
      wrapped.__padGradeV127MutationFirst=true;window.saveCurrent=wrapped;
    }
    if(!document.__padGradeV127MutationCapture){
      document.__padGradeV127MutationCapture=true;
      document.addEventListener('click',event=>{
        const id=event.target?.closest?.('button')?.id||'';
        if(id==='deletePoint'){
          try{const rc=window.pointFromIndex?.(window.currentIndex),key=rc&&window.k?.(rc.r,rc.c);if(key!=null&&Number.isFinite(window.readings?.[key]))beforeSurfaceMutation('point-delete');}catch(e){beforeSurfaceMutation('point-delete-unknown');}
        }else if(id==='applySettings')beforeSurfaceMutation('settings-apply');
      },true);
    }
  }
  window.__padGradeBeforeSurfaceMutationV127=beforeSurfaceMutation;

  function installDiagnosticHook(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV127Wrapped)return false;
    const original=d.mark.bind(d);d.__padGradeV127Wrapped=true;
    d.mark=function(name,details){
      const result=original(name,details);
      try{
        if(name==='project.switch-outgoing-hidden')cancelGeneration('project-switch-outgoing-hidden',true);
        else if(name==='heatmap.cache-hit'&&String(details?.projectId||'')===activeId()){
          const key=currentSurfaceKey(),projectId=activeId();
          if(projectId&&key)authorizeCanvas(891,{identity:identity(projectId,key),generation:activeGeneration,projectId,key},'cache');
        }
      }catch(e){}
      return result;
    };
    original('heatmap.v127-diagnostics-hook-installed',{version:VERSION,sequentialRegularTiers:true,mutationCancelFirst:true,immutableCanvasProvenance:true});return true;
  }

  function projectNeedsBaseMap(){
    try{
      const id=activeId(),raw=id?localStorage.getItem(`${PROJECT_PREFIX}${id}`):null,p=raw?JSON.parse(raw):null;
      if(p?.measureMode)return p.measureMode==='gps';
      return typeof window.measureMode!=='undefined'&&window.measureMode==='gps';
    }catch(e){try{return window.measureMode==='gps';}catch(_){return false;}}
  }
  function mapCanvasReady(map){
    try{const c=map?.getCanvas?.();if(!c)return false;const r=c.getBoundingClientRect?.();return (+c.width>0&&+c.height>0)&&(!r||(+r.width>0&&+r.height>0));}catch(e){return false;}
  }
  function completeBaseMapRender(map,serial,reason){
    if(serial!==baseMapRenderSerial||map!==baseMap||!mapCanvasReady(map))return false;
    baseMapRendered=true;
    window.__padGradeBaseMapRenderedV127=true;
    mark('map.v127-base-rendered',{reason,styleLoaded:(()=>{try{return !!map.isStyleLoaded?.();}catch(e){return false;}})()});
    try{window.dispatchEvent(new CustomEvent('padgrade-base-map-rendered',{detail:{map,version:VERSION}}));}catch(e){}
    releaseRecoveryIfReady('base-map-rendered');return true;
  }
  function armBaseMapRender(map){
    if(!map||map===baseMap&&baseMapRendered)return;
    baseMap=map;baseMapRendered=false;window.__padGradeBaseMapRenderedV127=false;const serial=++baseMapRenderSerial;
    let armed=false;
    const afterLoad=reason=>{
      if(armed||serial!==baseMapRenderSerial)return;armed=true;
      const finish=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>completeBaseMapRender(map,serial,reason)));
      try{map.once?.('render',finish);map.triggerRepaint?.();}catch(e){finish();}
      setTimeout(finish,120);
    };
    try{map.once?.('load',()=>afterLoad('map-load-render'));}catch(e){}
    try{if(map.loaded?.()||map.isStyleLoaded?.())afterLoad('already-loaded-render');}catch(e){}
    mark('map.v127-base-render-gate-armed',{requiresBaseMap:projectNeedsBaseMap()});
  }

  function hasResolvedFirstRunProject(){
    try{const id=activeId();return !!(id&&localStorage.getItem(`${PROJECT_PREFIX}${id}`));}catch(e){return false;}
  }
  function recoveryCanEnd(){
    if(window.__padGradeFirstRunPending===true&&!hasResolvedFirstRunProject())return {ok:false,reason:'first-run-storage-unresolved'};
    if(projectNeedsBaseMap()&&!baseMapRendered)return {ok:false,reason:'base-map-not-rendered'};
    return {ok:true,reason:'ready'};
  }
  function releaseRecoveryIfReady(trigger){
    if(!recoveryEndPending)return false;
    const gate=recoveryCanEnd();if(!gate.ok)return false;
    recoveryEndPending=false;
    document.documentElement.classList.remove('padGradeFirstRunSetupV127');
    try{recoveryEndBase?.();mark('recovery.v127-cover-released',{trigger,baseMapRequired:projectNeedsBaseMap(),baseMapRendered});return true;}catch(e){return false;}
  }
  function wrapRecoveryEnd(){
    const current=window.__padGradeEndRecoveryVisualHold;
    if(typeof current!=='function'||current.__padGradeV127Gate)return false;
    recoveryEndBase=current;
    const wrapped=function(){
      const gate=recoveryCanEnd();
      if(gate.ok){recoveryEndPending=false;document.documentElement.classList.remove('padGradeFirstRunSetupV127');return recoveryEndBase();}
      recoveryEndPending=true;mark('recovery.v127-cover-release-held',{reason:gate.reason,baseMapRequired:projectNeedsBaseMap(),baseMapRendered});
    };
    wrapped.__padGradeV127Gate=true;window.__padGradeEndRecoveryVisualHold=wrapped;return true;
  }
  function installStartupStyle(){
    let style=document.getElementById('pg127StartupGateStyle');if(style)style.remove();
    style=document.createElement('style');style.id='pg127StartupGateStyle';
    style.textContent=`
      html.padGradeRecoveryHold.pg111RuntimeReady body>*{visibility:hidden!important}
      html.padGradeRecoveryHold.pg111RuntimeReady body::before{display:flex!important;visibility:visible!important}
      html.padGradeRecoveryHold.padGradeFirstRunSetupV127 body::before{content:'Choose project storage to continue';display:flex!important;visibility:visible!important}
      html.padGradeRecoveryHold.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice,
      html.padGradeRecoveryHold.padGradeFirstRunSetupV127 body>#pgFirstRunStorageChoice *{visibility:visible!important}
    `;
    document.head.appendChild(style);
    window.__padGradeRequireFullStartupCoverV127=true;
  }
  function maintainFirstRunCover(){
    if(window.__padGradeFirstRunPending!==true){
      if(firstRunKeepalive){clearInterval(firstRunKeepalive);firstRunKeepalive=null;}
      document.documentElement.classList.remove('padGradeFirstRunSetupV127');return;
    }
    document.documentElement.classList.add('padGradeFirstRunSetupV127');
    try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    if(!firstRunKeepalive)firstRunKeepalive=setInterval(()=>{
      if(window.__padGradeFirstRunPending!==true){clearInterval(firstRunKeepalive);firstRunKeepalive=null;document.documentElement.classList.remove('padGradeFirstRunSetupV127');return;}
      try{window.__padGradeBeginRecoveryVisualHold?.();}catch(e){}
    },2000);
    mark('recovery.v127-first-run-covered',{legalReleased:window.__padGradeLegalReleased===true});
  }

  function snapshot(){
    const active=[...records.values()].filter(r=>r?.active);
    return {version:VERSION,activeIdentity,activeGeneration,activeJobs:active.map(r=>({projectId:r.projectId,tier:r.tier,jobId:r.jobId,generation:r.generation,queued:!!r.queued,forwarded:!!r.forwarded})),baseMapRendered,recoveryEndPending,sequentialRegularTiers:true};
  }
  window.PadGradeHeatGenerationV127={version:VERSION,cancel:cancelGeneration,beforeSurfaceMutation,snapshot};

  function attach(){
    installMutationHooks();installDiagnosticHook();wrapRecoveryEnd();attachMap();
    try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}
  }
  installStartupStyle();attach();maintainFirstRunCover();
  // v1.1.1 installs its partial-reveal CSS later in the parser; append our stricter
  // startup style again after parsing so the full cover remains authoritative.
  setTimeout(()=>{installStartupStyle();attach();maintainFirstRunCover();},0);
  window.addEventListener('padgrade-map-created',event=>{const map=event?.detail?.map||window.__padGradeMapInstance;patchMap(map);});
  window.addEventListener('padgrade-map-runtime-ready',()=>setTimeout(attachMap,0));
  window.addEventListener('padgrade-legal-accepted',()=>setTimeout(maintainFirstRunCover,0));
  window.addEventListener('padgrade-active-project-applied',()=>{baseMapRendered=false;window.__padGradeBaseMapRenderedV127=false;setTimeout(()=>{attachMap();if(baseMap)armBaseMapRender(baseMap);},0);});
  if(!mapAttachTimer)mapAttachTimer=setInterval(()=>{attach();releaseRecoveryIfReady('poll');},500);
  window.addEventListener('beforeunload',()=>{if(mapAttachTimer)clearInterval(mapAttachTimer);if(firstRunKeepalive)clearInterval(firstRunKeepalive);},{once:true});

  mark('v127.installed',{version:VERSION,pointMutationCancelFirst:true,sequentialRegularTiers:'99-then-297-then-891',immutableCanvasProvenance:true,firstRunCoveredBeforeFolderChoice:true,startupCoverRequiresBaseMap:true,protectedV122PresentationUnchanged:true});
})();
