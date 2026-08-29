/* Pad Grade v0.9.6 DEV — Promise-based durable file bridge.
 * Android performs SAF reads/writes/deletes on its background file executor and
 * returns results through one callback. Existing synchronous methods remain only
 * as a compatibility fallback for browser/older native builds.
 */
(function installPadGrade096NativeAsync(){
  'use strict';
  const native=window.PadGradeNative||null;
  let serial=0;
  const pending=new Map();
  const diag=()=>window.PadGradeDiag||null;

  function requestId(op){return `pgf-${Date.now().toString(36)}-${(++serial).toString(36)}-${op}`;}
  function fallback(op,filename,text){
    return new Promise(resolve=>setTimeout(()=>{
      const started=performance.now?.()||Date.now();let ok=false,value=null,error=null;
      try{
        if(op==='read'){value=native?.readProjectFile?.(filename)??null;ok=value!==null;}
        else if(op==='write'){ok=!!native?.writeProjectFile?.(filename,text??'');value=ok;}
        else if(op==='delete'){ok=!!native?.deleteProjectFile?.(filename);value=ok;}
      }catch(e){error=String(e?.message||e);}
      const durationMs=Math.max(0,(performance.now?.()||Date.now())-started);
      diag()?.mark?.(`file.${op}.fallback-sync`,{filename,durationMs,ok,error:error||undefined});
      resolve({ok,value,text:op==='read'?value:undefined,durationMs,error,filename,op,fallback:true});
    },0));
  }

  function request(op,filename,text){
    filename=String(filename||'');
    const method=op==='read'?'readProjectFileAsync':op==='write'?'writeProjectFileAsync':'deleteProjectFileAsync';
    if(!native||typeof native[method]!=='function')return fallback(op,filename,text);
    const id=requestId(op),token=diag()?.start?.(`file.${op}`,{filename});
    return new Promise(resolve=>{
      pending.set(id,{resolve,op,filename,token,started:Date.now()});
      try{
        if(op==='read')native[method](filename,id);
        else if(op==='write')native[method](filename,text??'',id);
        else native[method](filename,id);
      }catch(e){
        pending.delete(id);
        const result={ok:false,value:null,text:null,durationMs:0,error:String(e?.message||e),filename,op};
        if(token)diag()?.end?.(token,{ok:false,error:result.error});
        resolve(result);
      }
    });
  }

  window.__padGradeNativeFileOpCompleted=function(raw){
    let msg=null;try{msg=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){msg=null;}
    if(!msg||!msg.requestId)return;
    const item=pending.get(msg.requestId);if(!item)return;pending.delete(msg.requestId);
    const result={ok:!!msg.ok,value:item.op==='read'?(msg.text??null):!!msg.ok,text:item.op==='read'?(msg.text??null):undefined,durationMs:Number(msg.durationMs)||0,error:msg.error||null,filename:item.filename,op:item.op,native:true,size:Number(msg.size)||0};
    if(item.token)diag()?.end?.(item.token,{ok:result.ok,nativeDurationMs:result.durationMs,size:result.size,error:result.error||undefined});
    item.resolve(result);
  };

  window.PadGradeFiles={
    read:async filename=>(await request('read',filename)).text??null,
    readResult:filename=>request('read',filename),
    write:async (filename,text)=>(await request('write',filename,text)).ok,
    writeResult:(filename,text)=>request('write',filename,text),
    delete:async filename=>(await request('delete',filename)).ok,
    deleteResult:filename=>request('delete',filename),
    list:()=>{try{const x=JSON.parse(native?.listProjectFiles?.()||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
  };
  diag()?.mark?.('file.async-bridge-installed',{nativeAsync:!!(native&&typeof native.readProjectFileAsync==='function')});

  if(!document.querySelector('script[data-padgrade-v096-async-reconcile]')){
    const script=document.createElement('script');script.src='v096-async-reconcile.js?v=20260829-1';script.async=false;script.dataset.padgradeV096AsyncReconcile='1';
    script.onerror=()=>console.error('Pad Grade v0.9.6 async reconcile controller failed to load');
    (document.head||document.documentElement).appendChild(script);
  }
})();
