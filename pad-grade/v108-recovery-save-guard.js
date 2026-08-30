/* Pad Grade v1.0.8 DEV — recovered-project reload save guard.
 *
 * Durable recovery deliberately reloads after restoring the selected project. The
 * legacy v040 beforeunload autosave must not snapshot the not-yet-applied default
 * runtime over that recovered project. This guard is active ONLY for an explicitly
 * planned recovery reload; normal autosave/unload behavior is unchanged.
 */
(function installPadGrade108RecoverySaveGuard(){
  'use strict';
  const PROJECT_PREFIX='padGradeProjectV5:',INDEX_KEY='padGradeProjectsV5';
  const INDEX_FILE='Pad-Grade-Project-Index.pgindex';
  const diag=()=>window.PadGradeDiag||null;
  let blocked=false,lastIndexProjectSignature=null;
  const originalSetItem=Storage.prototype.setItem;
  function planned(){return window.__padGradeRecoveryReloadPlannedV108===true;}
  function engage(reason){
    if(blocked)return;
    blocked=true;window.__padGradeRecoverySaveBlockV108=true;
    diag()?.mark?.('recovery.autosave-block-engaged',{reason:String(reason||'recovery-reload')});
  }
  function projectWrite(name){const n=String(name||'').toLowerCase();return n.endsWith('.padgrade')||n.endsWith('.padgrade.json');}
  function indexSignature(text){
    try{const x=JSON.parse(String(text||''));if(!x||!Array.isArray(x.projects))return null;return JSON.stringify({format:x.format||'',indexVersion:+x.indexVersion||0,projects:x.projects});}catch(e){return null;}
  }
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&blocked&&(String(key).startsWith(PROJECT_PREFIX)||String(key)===INDEX_KEY)){
      diag()?.mark?.('recovery.autosave-local-write-blocked',{keyClass:String(key)===INDEX_KEY?'project-index':'project-body'});return;
    }
    return originalSetItem.call(this,key,value);
  };
  const files=window.PadGradeFiles;
  if(files){
    const baseRead=files.read?.bind(files),baseWrite=files.write?.bind(files),baseWriteResult=files.writeResult?.bind(files);
    if(baseRead)files.read=async function(filename){
      const text=await baseRead(filename);
      if(String(filename)===INDEX_FILE){const sig=indexSignature(text);if(sig)lastIndexProjectSignature=sig;}
      return text;
    };
    if(baseWrite)files.write=async function(filename,text){
      filename=String(filename||'');
      if(blocked&&projectWrite(filename)){
        diag()?.mark?.('recovery.autosave-durable-write-blocked',{filename});return false;
      }
      if(filename===INDEX_FILE){
        const sig=indexSignature(text);
        if(sig&&sig===lastIndexProjectSignature){diag()?.mark?.('index.write-skipped-unchanged',{source:'v108-io-guard'});return true;}
        const ok=await baseWrite(filename,text);if(ok&&sig)lastIndexProjectSignature=sig;return ok;
      }
      return baseWrite(filename,text);
    };
    if(baseWriteResult)files.writeResult=function(filename,text){
      filename=String(filename||'');
      if(blocked&&projectWrite(filename)){
        diag()?.mark?.('recovery.autosave-durable-write-blocked',{filename});
        return Promise.resolve({ok:false,value:false,text:null,durationMs:0,error:'recovery-reload-save-blocked',filename,op:'write',blocked:true});
      }
      return baseWriteResult(filename,text);
    };
  }
  window.addEventListener('beforeunload',()=>{if(planned())engage('planned-recovery-reload');},{capture:true});
  window.__padGradeRecoverySaveGuardV108={engage,isBlocked:()=>blocked,planned,indexSignature};
})();
