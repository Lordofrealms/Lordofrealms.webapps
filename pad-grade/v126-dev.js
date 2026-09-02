/* Pad Grade v1.2.6 DEV — active heat-generation cancellation + outgoing-only switch barrier.
 *
 * This layer does not change interpolation, colors, tier sizes, or the protected v1.2.2
 * completed-canvas presentation path. It owns heat-worker lifecycle only:
 *   - redirected v0.7.8 workers are explicitly re-identified as heat workers so the
 *     v1.1.3 final-891 cache gate/preemption path still runs after worker redirection;
 *   - one regular generation identity may own CPU workers at a time;
 *   - duplicate same-tier workers are terminated rather than allowed to overlap;
 *   - a successful project switch actively cancels/terminates the outgoing generation;
 *   - a valid cached 891 causes the 99/297 requests to end without native raster work;
 *   - the Projects dialog closes after the outgoing overlays have had two paint frames,
 *     without waiting for target heat-map generation or target heat presentation.
 */
(function installPadGrade126Dev(){
  'use strict';
  if(window.__padGradeDevV126)return;
  window.__padGradeDevV126=true;

  const VERSION='1.2.6';
  const ACTIVE_KEY='padGradeActiveProjectIdV5';
  const HEAT_WORKER_RE=/heatmap-raster-worker-v0(?:73|76|77|78)\.js(?:\?|$)/;
  const TERMINAL_TYPES=new Set(['complete','empty','error']);
  const ParentWorker=window.Worker;
  const jobs=new Map();
  let generationSeq=0;
  let currentIdentity='';
  let currentGeneration=0;
  let switchActive=false;
  let switchSerial=0;
  let outgoingHidden=false;
  let dialogCloseArgs=[];
  let dialogCloseScheduled=false;
  let nativeDialogClose=null;

  const now=()=>{try{return performance.now();}catch(e){return Date.now();}};
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  const activeId=()=>{try{return localStorage.getItem(ACTIVE_KEY)||'';}catch(e){return '';}};
  const identity=(projectId,key)=>`${projectId}\u0000${key}`;
  function buildKey(message){
    const s=message?.settings||{};
    return JSON.stringify({settings:{width:+s.width||0,length:+s.length||0,target:+s.target||0,tol:+s.tol||0},points:(message?.points||[]).map(p=>[+p.x,+p.y,+p.v])});
  }
  function splitIdentity(value){const p=String(value||'').indexOf('\u0000');return p<0?{projectId:'',key:String(value||'')}:{projectId:value.slice(0,p),key:value.slice(p+1)};}
  function activeRegularJobs(){return [...jobs.values()].filter(j=>j&&j.active&&j.context==='regular');}
  function snapshot(){
    const list=activeRegularJobs();
    return {version:VERSION,currentIdentity,currentGeneration,activeJobs:list.length,activeIdentities:[...new Set(list.map(j=>j.identity))],tiers:list.map(j=>j.tier).sort((a,b)=>a-b),jobs:list.map(j=>({projectId:j.projectId,tier:j.tier,jobId:j.jobId,generation:j.generation,forwarded:j.forwarded,ageMs:Math.max(0,now()-j.startedAt)}))};
  }
  function syntheticTerminal(worker,job,reason,extra={}){
    if(!worker||!job)return;
    try{worker.dispatchEvent(new MessageEvent('message',{data:{type:'empty',jobId:job.jobId,tier:job.tier,cancelled:true,cancelReason:reason,...extra}}));}catch(e){}
  }
  function terminateJob(worker,job,reason,notifyOwner=true){
    if(!worker||!job||!job.active)return false;
    job.active=false;job.cancelReason=reason;
    if(notifyOwner)syntheticTerminal(worker,job,reason);
    jobs.delete(worker);
    try{worker.terminate();}catch(e){}
    mark('heatmap.v126-worker-terminated',{reason,projectId:job.projectId,tier:job.tier,jobId:job.jobId,generation:job.generation,forwarded:!!job.forwarded,ageMs:+Math.max(0,now()-job.startedAt).toFixed(1)});
    return true;
  }
  function cancelRegularGeneration(reason='explicit-cancel',matchIdentity=null){
    let count=0,forwarded=0;
    for(const [worker,job] of [...jobs.entries()]){
      if(!job?.active||job.context!=='regular')continue;
      if(matchIdentity&&job.identity!==matchIdentity)continue;
      if(job.forwarded)forwarded++;
      if(terminateJob(worker,job,reason,true))count++;
    }
    if(count)mark('heatmap.v126-generation-cancelled',{reason,jobsTerminated:count,forwardedWorkersTerminated:forwarded,identity:matchIdentity||currentIdentity,generation:currentGeneration});
    return count;
  }
  function beginGeneration(nextIdentity){
    if(nextIdentity===currentIdentity&&currentGeneration)return currentGeneration;
    if(currentIdentity)cancelRegularGeneration('generation-replaced',currentIdentity);
    currentIdentity=nextIdentity;currentGeneration=++generationSeq;
    const parts=splitIdentity(nextIdentity);
    mark('heatmap.v126-generation-owned',{projectId:parts.projectId,generation:currentGeneration,identityChanged:true});
    return currentGeneration;
  }
  function cancelDuplicateTier(nextJob){
    for(const [worker,job] of [...jobs.entries()]){
      if(!job?.active||job.context!=='regular'||job===nextJob)continue;
      if(job.identity===nextJob.identity&&job.tier===nextJob.tier){
        terminateJob(worker,job,'duplicate-tier-replaced',true);
        mark('heatmap.v126-duplicate-tier-prevented',{projectId:nextJob.projectId,tier:nextJob.tier,generation:nextJob.generation,oldJobId:job.jobId,newJobId:nextJob.jobId});
      }
    }
  }
  function assertInvariant(reason){
    const list=activeRegularJobs(),identities=new Set(list.map(j=>j.identity)),tierKeys=new Set();let duplicate=false;
    for(const job of list){const k=`${job.identity}\u0000${job.tier}`;if(tierKeys.has(k))duplicate=true;tierKeys.add(k);}
    const ok=identities.size<=1&&!duplicate;
    mark('heatmap.v126-generation-invariant',{reason,ok,activeJobs:list.length,activeIdentities:identities.size,duplicateTier:duplicate,generation:currentGeneration});
    return ok;
  }

  if(typeof ParentWorker==='function'){
    class PadGrade126Worker extends ParentWorker{
      constructor(url,options){
        super(url,options);
        this.__pg126HeatWorker=HEAT_WORKER_RE.test(String(url||''));
        // v0.7.8 redirects the original v073 URL to v078 before it reaches the
        // v1.1.3 subclass. Repair that identification so v1.1.3's cache gate and
        // background-worker preemption remain authoritative for redirected heat work.
        if(this.__pg126HeatWorker&&Object.prototype.hasOwnProperty.call(this,'__pg113HeatWorker'))this.__pg113HeatWorker=true;
        if(this.__pg126HeatWorker)this.addEventListener('message',event=>{
          const msg=event?.data||{},job=jobs.get(this);if(!job||msg.jobId!==job.jobId)return;
          if(msg.type==='empty'&&msg.cacheHit){mark('heatmap.v126-lower-tier-skipped-final-cache',{projectId:job.projectId,tier:job.tier,jobId:job.jobId,generation:job.generation});}
          if(!TERMINAL_TYPES.has(msg.type))return;
          job.active=false;job.terminalType=msg.type;jobs.delete(this);
          assertInvariant(`terminal-${msg.type}`);
        });
      }
      postMessage(message,transfer){
        if(!this.__pg126HeatWorker||message?.type!=='build'||String(message.context||'')!=='regular'){
          return arguments.length>1?ParentWorker.prototype.postMessage.call(this,message,transfer):ParentWorker.prototype.postMessage.call(this,message);
        }
        const projectId=activeId(),key=buildKey(message),nextIdentity=identity(projectId,key),generation=beginGeneration(nextIdentity);
        const job={worker:this,projectId,key,identity:nextIdentity,generation,context:'regular',tier:+message.tier||0,jobId:message.jobId,startedAt:now(),active:true,forwarded:false};
        jobs.set(this,job);cancelDuplicateTier(job);assertInvariant('regular-admit');
        const result=arguments.length>1?ParentWorker.prototype.postMessage.call(this,message,transfer):ParentWorker.prototype.postMessage.call(this,message);
        job.forwarded=true;
        mark('heatmap.v126-worker-admitted',{projectId,tier:job.tier,jobId:job.jobId,generation,activeJobs:activeRegularJobs().length});
        return result;
      }
      terminate(){
        const job=jobs.get(this);if(job){job.active=false;jobs.delete(this);}
        return ParentWorker.prototype.terminate.call(this);
      }
    }
    try{Object.setPrototypeOf(PadGrade126Worker,ParentWorker);}catch(e){}
    PadGrade126Worker.__padGradeV126Lifecycle=true;
    PadGrade126Worker.__padGradeV126Previous=ParentWorker;
    window.Worker=PadGrade126Worker;
  }

  function twoPaints(callback){
    const raf=typeof requestAnimationFrame==='function'?requestAnimationFrame.bind(window):fn=>setTimeout(fn,16);
    raf(()=>raf(callback));
  }
  function patchProjectsDialog(){
    const dlg=document.getElementById('projectsDlg');if(!dlg||dlg.__padGradeV126OutgoingBarrier)return !!dlg;
    let protoClose=null;
    try{protoClose=typeof HTMLDialogElement!=='undefined'&&HTMLDialogElement.prototype?.close?HTMLDialogElement.prototype.close:null;}catch(e){}
    if(!protoClose){try{protoClose=dlg.close;}catch(e){return false;}}
    nativeDialogClose=(...args)=>protoClose.apply(dlg,args);
    dlg.__padGradeV126OutgoingBarrier=true;
    dlg.close=function(...args){
      if(!switchActive)return nativeDialogClose(...args);
      dialogCloseArgs=args;
      if(outgoingHidden)scheduleDialogClose();
      else mark('project.switch-dialog-close-held',{version:VERSION,reason:'await-outgoing-overlay-removal'});
    };
    return true;
  }
  function scheduleDialogClose(){
    if(dialogCloseScheduled||!switchActive)return;
    const serial=switchSerial;
    dialogCloseScheduled=true;
    twoPaints(()=>{
      dialogCloseScheduled=false;
      if(serial!==switchSerial||!outgoingHidden)return;
      const dlg=document.getElementById('projectsDlg');
      if(dlg?.open)try{nativeDialogClose?.(...dialogCloseArgs);}catch(e){try{dlg.removeAttribute('open');}catch(_) {}}
      mark('project.switch-dialog-closed-after-outgoing-paint',{version:VERSION,paintBarrierFrames:2,waitedForTargetHeat:false,waitedForTargetApply:false});
      outgoingHidden=false;switchActive=false;
    });
  }
  function onDiagnostic(name,details){
    if(name==='project.switch-v113-start'){
      switchSerial++;switchActive=true;outgoingHidden=false;dialogCloseArgs=[];dialogCloseScheduled=false;patchProjectsDialog();
      return;
    }
    if(name==='project.switch-outgoing-hidden'){
      // The switch load has succeeded and the old overlays are now explicitly hidden.
      // Cancel CPU ownership here (not at click/start, which could still fail to load).
      cancelRegularGeneration('project-switch-outgoing-removed');
      currentIdentity='';currentGeneration=0;
      outgoingHidden=true;scheduleDialogClose();assertInvariant('project-switch-outgoing-hidden');
      return;
    }
    if(name==='project.switch-v113-complete'){
      // Dialog close is intentionally independent of this event; this is only a fallback
      // cleanup in case an older switch path omitted the outgoing-hidden marker.
      if(switchActive&&!outgoingHidden){cancelRegularGeneration('project-switch-complete-fallback');outgoingHidden=true;scheduleDialogClose();}
      switchActive=false;
      return;
    }
    if(name==='project.switch-v113-load-failed'){
      switchActive=false;outgoingHidden=false;dialogCloseScheduled=false;
    }
  }
  function installDiagnosticHook(){
    const d=window.PadGradeDiag;if(!d||typeof d.mark!=='function'||d.__padGradeV126Wrapped)return false;
    const original=d.mark.bind(d);d.__padGradeV126Wrapped=true;
    d.mark=function(name,details){const result=original(name,details);try{onDiagnostic(name,details);}catch(e){}return result;};
    original('heatmap.v126-lifecycle-installed',{version:VERSION,activeCancellation:true,redirectedHeatRecognition:true,oneRegularGenerationAtATime:true,dialogBoundary:'outgoing-overlays-two-paints-no-target-heat-wait'});
    return true;
  }
  function attach(){patchProjectsDialog();installDiagnosticHook();try{document.title=`Pad Grade Mapper v${VERSION} DEV`;}catch(e){}}

  window.PadGradeHeatGenerationV126={version:VERSION,cancel:cancelRegularGeneration,snapshot,assertInvariant};
  attach();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
  window.addEventListener('load',()=>{attach();setTimeout(attach,750);},{once:true});
  mark('v126.installed',{version:VERSION,activeHeatCancellation:true,cacheGateRedirectRepair:true,projectDialogWaitsForOutgoingOnly:true});
})();
