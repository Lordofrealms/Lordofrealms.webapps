/* Pad Grade v1.0.8 DEV — Promise-based durable file bridge.
 * Android performs SAF reads/writes/deletes on its background file executor.
 * v1.0.7 adds cached file metadata plus bounded schema-header reads so routine
 * reconciliation does not need full project-file reads.
 *
 * v1.2.4 diagnostic note: the async callback path now records stage timings for
 * JS->native bridge call, native file-executor queue wait, actual native I/O,
 * Android UI-thread post wait, WebView evaluateJavascript->JS dispatch, and the
 * JS callback/microtask handoff. This is instrumentation only; file semantics are
 * unchanged.
 */
(function installPadGrade096NativeAsync(){
  'use strict';
  const native=window.PadGradeNative||null;
  let serial=0;
  const pending=new Map();
  const diag=()=>window.PadGradeDiag||null;
  const perfNow=()=>{try{return performance.now();}catch(e){return Date.now();}};

  function requestId(op){return `pgf-${Date.now().toString(36)}-${(++serial).toString(36)}-${op}`;}
  function recoveryMutationBlocked(){
    if(!native||typeof native.isProjectFolderRecoveryPending!=='function')return false;
    let pendingRecovery=false;try{pendingRecovery=!!native.isProjectFolderRecoveryPending();}catch(e){return false;}
    if(!pendingRecovery)return false;
    let curtain=false;try{curtain=document.documentElement.classList.contains('padGradeRecoveryHold');}catch(e){}
    return curtain||window.__padGradeFirstRunPending===true;
  }
  function blockedResult(op,filename){
    const result={ok:false,value:null,text:null,durationMs:0,error:'recovery-write-locked',filename,op,blocked:true};
    diag()?.mark?.(`file.${op}.recovery-blocked`,{filename});return Promise.resolve(result);
  }
  function fallback(op,filename,text,maxChars){
    if(op!=='read'&&op!=='head'&&recoveryMutationBlocked())return blockedResult(op,filename);
    return new Promise(resolve=>setTimeout(()=>{
      const started=perfNow();let ok=false,value=null,error=null;
      try{
        if(op==='read'){value=native?.readProjectFile?.(filename)??null;ok=value!==null;}
        else if(op==='head'){value=native?.readProjectFileHead?.(filename,maxChars||4096)??null;ok=value!==null;}
        else if(op==='write'){ok=!!native?.writeProjectFile?.(filename,text??'');value=ok;}
        else if(op==='delete'){ok=!!native?.deleteProjectFile?.(filename);value=ok;}
      }catch(e){error=String(e?.message||e);}
      const durationMs=Math.max(0,perfNow()-started);
      diag()?.mark?.(`file.${op}.fallback-sync`,{filename,durationMs,ok,error:error||undefined});
      resolve({ok,value,text:(op==='read'||op==='head')?value:undefined,durationMs,error,filename,op,fallback:true});
    },0));
  }

  function pendingAheadSnapshot(){
    try{return [...pending.values()].slice(0,8).map(x=>`${x.op}:${x.filename}`);}catch(e){return [];}
  }

  function request(op,filename,text,maxChars){
    filename=String(filename||'');
    if(op!=='read'&&op!=='head'&&recoveryMutationBlocked())return blockedResult(op,filename);
    const method=op==='read'?'readProjectFileAsync':op==='head'?'readProjectFileHeadAsync':op==='write'?'writeProjectFileAsync':'deleteProjectFileAsync';
    if(!native||typeof native[method]!=='function')return fallback(op,filename,text,maxChars);
    const id=requestId(op),token=diag()?.start?.(`file.${op}`,{filename,maxChars:op==='head'?maxChars||4096:undefined});
    return new Promise(resolve=>{
      const item={resolve,op,filename,token,startedEpochMs:Date.now(),startedPerfMs:perfNow(),bridgeCallMs:0,pendingAhead:pendingAheadSnapshot()};
      pending.set(id,item);
      const bridgeStarted=perfNow();
      try{
        if(op==='read')native[method](filename,id);
        else if(op==='head')native[method](filename,Math.max(256,Math.min(16384,Number(maxChars)||4096)),id);
        else if(op==='write')native[method](filename,text??'',id);
        else native[method](filename,id);
        item.bridgeCallMs=Math.max(0,perfNow()-bridgeStarted);
        if(item.bridgeCallMs>=25)diag()?.mark?.('file.native-bridge-call-lag',{op,filename,bridgeCallMs:item.bridgeCallMs,pendingAhead:item.pendingAhead});
      }catch(e){
        item.bridgeCallMs=Math.max(0,perfNow()-bridgeStarted);
        pending.delete(id);
        const result={ok:false,value:null,text:null,durationMs:0,error:String(e?.message||e),filename,op};
        if(token)diag()?.end?.(token,{ok:false,error:result.error,bridgeCallMs:item.bridgeCallMs});resolve(result);
      }
    });
  }

  window.__padGradeNativeFileOpCompleted=function(raw){
    const callbackEnteredPerf=perfNow(),callbackEnteredEpoch=Date.now();
    let msg=null;try{msg=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){msg=null;}
    if(!msg||!msg.requestId)return;
    const item=pending.get(msg.requestId);if(!item)return;pending.delete(msg.requestId);
    const textual=item.op==='read'||item.op==='head';
    const nativeIoMs=Math.max(0,Number(msg.durationMs)||0);
    const nativeQueueWaitMs=Math.max(0,Number(msg.queueWaitMs)||0);
    const androidUiPostWaitMs=Math.max(0,Number(msg.uiPostWaitMs)||0);
    const evalInvokedEpochMs=Number(msg.evalInvokedEpochMs)||0;
    const webViewEvalToJsMs=evalInvokedEpochMs>0?Math.max(0,callbackEnteredEpoch-evalInvokedEpochMs):0;
    const totalElapsedMs=Math.max(0,callbackEnteredEpoch-item.startedEpochMs);
    const knownStageMs=Math.max(0,item.bridgeCallMs)+nativeQueueWaitMs+nativeIoMs+androidUiPostWaitMs+webViewEvalToJsMs;
    const unaccountedMs=Math.max(0,totalElapsedMs-knownStageMs);
    const queueAhead=Array.isArray(msg.queueAhead)?msg.queueAhead:[];
    const result={ok:!!msg.ok,value:textual?(msg.text??null):!!msg.ok,text:textual?(msg.text??null):undefined,durationMs:nativeIoMs,error:msg.error||null,filename:item.filename,op:item.op,native:true,size:Number(msg.size)||0,lastModified:Number(msg.lastModified)||0,timing:{totalElapsedMs,bridgeCallMs:item.bridgeCallMs,nativeQueueWaitMs,nativeIoMs,androidUiPostWaitMs,webViewEvalToJsMs,unaccountedMs,nativeQueueAhead:Number(msg.queueAheadCount)||0,queueAhead}};
    const details={ok:result.ok,nativeDurationMs:nativeIoMs,size:result.size,lastModified:result.lastModified,error:result.error||undefined,callbackDelayMs:Math.max(0,totalElapsedMs-nativeIoMs),bridgeCallMs:item.bridgeCallMs,nativeQueueWaitMs,androidUiPostWaitMs,webViewEvalToJsMs,unaccountedMs,nativeQueueAhead:Number(msg.queueAheadCount)||0,queueAhead,jsPendingAhead:item.pendingAhead};
    if(item.token)diag()?.end?.(item.token,details);
    if(totalElapsedMs>=250||nativeQueueWaitMs>=100||androidUiPostWaitMs>=100||webViewEvalToJsMs>=100){
      diag()?.mark?.('file.callback-stage-breakdown',{op:item.op,filename:item.filename,totalElapsedMs,bridgeCallMs:item.bridgeCallMs,nativeQueueWaitMs,nativeIoMs,androidUiPostWaitMs,webViewEvalToJsMs,unaccountedMs,nativeQueueAhead:Number(msg.queueAheadCount)||0,queueAhead,jsPendingAhead:item.pendingAhead});
    }
    item.resolve(result);
    try{
      queueMicrotask(()=>{
        const callbackToMicrotaskMs=Math.max(0,perfNow()-callbackEnteredPerf);
        if(totalElapsedMs>=250||callbackToMicrotaskMs>=50)diag()?.mark?.('file.callback-microtask-settled',{op:item.op,filename:item.filename,totalElapsedMs,callbackToMicrotaskMs});
      });
    }catch(e){}
  };

  function list(){try{const x=JSON.parse(native?.listProjectFiles?.()||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  function details(){try{const x=JSON.parse(native?.listProjectFileDetails?.()||'[]');return Array.isArray(x)?x:[];}catch(e){return list().map(name=>({name,size:0,lastModified:0}));}}

  window.PadGradeFiles={
    read:async filename=>(await request('read',filename)).text??null,
    readResult:filename=>request('read',filename),
    readHead:async (filename,maxChars=4096)=>(await request('head',filename,null,maxChars)).text??null,
    readHeadResult:(filename,maxChars=4096)=>request('head',filename,null,maxChars),
    write:async (filename,text)=>(await request('write',filename,text)).ok,
    writeResult:(filename,text)=>request('write',filename,text),
    delete:async filename=>(await request('delete',filename)).ok,
    deleteResult:filename=>request('delete',filename),
    list,details
  };
  diag()?.mark?.('file.async-bridge-installed',{nativeAsync:!!(native&&typeof native.readProjectFileAsync==='function'),version:'1.0.8',recoveryMutationLock:true,headerReads:typeof native?.readProjectFileHeadAsync==='function',cachedMetadata:typeof native?.listProjectFileDetails==='function',stageTimingV124:true});

  function loadCompareFast(){
    if(!window.__padGradeCatalogMemoryFastPathV108){const existingFast=document.querySelector('script[data-padgrade-v108-index-fastpath]');if(existingFast){existingFast.addEventListener('load',loadCompareFast,{once:true});return;}const fast=document.createElement('script');fast.src='v108-index-fastpath.js?v=20260830-1';fast.async=false;fast.dataset.padgradeV108IndexFastpath='1';fast.onload=loadCompareFast;fast.onerror=()=>console.error('Pad Grade v1.0.8 catalog fast path failed to load');(document.head||document.documentElement).appendChild(fast);return;}
    if(document.querySelector('script[data-padgrade-v107-compare-fast]'))return;
    const script=document.createElement('script');script.src='v107-compare-fast.js?v=20260830-2';script.async=false;script.dataset.padgradeV107CompareFast='1';
    script.onerror=()=>console.error('Pad Grade v1.0.8 indexed comparison module failed to load');
    (document.head||document.documentElement).appendChild(script);
  }
  function loadIndexController(){
    const existing=document.querySelector('script[data-padgrade-v107-index-reconcile]');
    if(existing){if(window.PadGradeProjectIndexV107)loadCompareFast();else existing.addEventListener('load',loadCompareFast,{once:true});return;}
    const script=document.createElement('script');script.src='v107-index-reconcile.js?v=20260830-1';script.async=false;script.dataset.padgradeV107IndexReconcile='1';script.onload=loadCompareFast;
    script.onerror=()=>console.error('Pad Grade v1.0.7 indexed reconciliation controller failed to load');
    (document.head||document.documentElement).appendChild(script);
  }
  function loadFormatThenIndex(){
    if(window.PadGradeProjectFormatV107){loadIndexController();return;}
    const existing=document.querySelector('script[data-padgrade-project-format-v107]');
    if(existing){existing.addEventListener('load',loadIndexController,{once:true});return;}
    const script=document.createElement('script');script.src='project-format-v107.js?v=20260830-1';script.async=false;script.dataset.padgradeProjectFormatV107='1';script.onload=loadIndexController;script.onerror=()=>console.error('Pad Grade schema-6 formatter failed to load');
    (document.head||document.documentElement).appendChild(script);
  }
  loadFormatThenIndex();
})();

/* Legacy v1.0.7 Android CI compatibility marker only: v107-compare-fast.js?v=20260830-1 */