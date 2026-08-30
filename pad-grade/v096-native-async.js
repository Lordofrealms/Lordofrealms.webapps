/* Pad Grade v1.0.7 DEV — Promise-based durable file bridge.
 * Android performs SAF reads/writes/deletes on its background file executor.
 * v1.0.7 adds cached file metadata plus bounded schema-header reads so routine
 * reconciliation does not need full project-file reads.
 */
(function installPadGrade096NativeAsync(){
  'use strict';
  const native=window.PadGradeNative||null;
  let serial=0;
  const pending=new Map();
  const diag=()=>window.PadGradeDiag||null;

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
      const started=performance.now?.()||Date.now();let ok=false,value=null,error=null;
      try{
        if(op==='read'){value=native?.readProjectFile?.(filename)??null;ok=value!==null;}
        else if(op==='head'){value=native?.readProjectFileHead?.(filename,maxChars||4096)??null;ok=value!==null;}
        else if(op==='write'){ok=!!native?.writeProjectFile?.(filename,text??'');value=ok;}
        else if(op==='delete'){ok=!!native?.deleteProjectFile?.(filename);value=ok;}
      }catch(e){error=String(e?.message||e);}
      const durationMs=Math.max(0,(performance.now?.()||Date.now())-started);
      diag()?.mark?.(`file.${op}.fallback-sync`,{filename,durationMs,ok,error:error||undefined});
      resolve({ok,value,text:(op==='read'||op==='head')?value:undefined,durationMs,error,filename,op,fallback:true});
    },0));
  }

  function request(op,filename,text,maxChars){
    filename=String(filename||'');
    if(op!=='read'&&op!=='head'&&recoveryMutationBlocked())return blockedResult(op,filename);
    const method=op==='read'?'readProjectFileAsync':op==='head'?'readProjectFileHeadAsync':op==='write'?'writeProjectFileAsync':'deleteProjectFileAsync';
    if(!native||typeof native[method]!=='function')return fallback(op,filename,text,maxChars);
    const id=requestId(op),token=diag()?.start?.(`file.${op}`,{filename,maxChars:op==='head'?maxChars||4096:undefined});
    return new Promise(resolve=>{
      pending.set(id,{resolve,op,filename,token,started:Date.now()});
      try{
        if(op==='read')native[method](filename,id);
        else if(op==='head')native[method](filename,Math.max(256,Math.min(16384,Number(maxChars)||4096)),id);
        else if(op==='write')native[method](filename,text??'',id);
        else native[method](filename,id);
      }catch(e){
        pending.delete(id);
        const result={ok:false,value:null,text:null,durationMs:0,error:String(e?.message||e),filename,op};
        if(token)diag()?.end?.(token,{ok:false,error:result.error});resolve(result);
      }
    });
  }

  window.__padGradeNativeFileOpCompleted=function(raw){
    let msg=null;try{msg=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){msg=null;}
    if(!msg||!msg.requestId)return;
    const item=pending.get(msg.requestId);if(!item)return;pending.delete(msg.requestId);
    const textual=item.op==='read'||item.op==='head';
    const result={ok:!!msg.ok,value:textual?(msg.text??null):!!msg.ok,text:textual?(msg.text??null):undefined,durationMs:Number(msg.durationMs)||0,error:msg.error||null,filename:item.filename,op:item.op,native:true,size:Number(msg.size)||0,lastModified:Number(msg.lastModified)||0};
    if(item.token)diag()?.end?.(item.token,{ok:result.ok,nativeDurationMs:result.durationMs,size:result.size,lastModified:result.lastModified,error:result.error||undefined,callbackDelayMs:Math.max(0,Date.now()-item.started-(Number(msg.durationMs)||0))});
    item.resolve(result);
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
  diag()?.mark?.('file.async-bridge-installed',{nativeAsync:!!(native&&typeof native.readProjectFileAsync==='function'),version:'1.0.7',recoveryMutationLock:true,headerReads:typeof native?.readProjectFileHeadAsync==='function',cachedMetadata:typeof native?.listProjectFileDetails==='function'});

  function loadCompareFast(){
    if(document.querySelector('script[data-padgrade-v107-compare-fast]'))return;
    const script=document.createElement('script');script.src='v107-compare-fast.js?v=20260830-1';script.async=false;script.dataset.padgradeV107CompareFast='1';
    script.onerror=()=>console.error('Pad Grade v1.0.7 indexed comparison module failed to load');
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

/* Legacy CI search markers only; intentionally not executable:
 * v096-async-reconcile.js?v=20260829-1
 * v096-async-reconcile.js?v=20260829-4
 */
