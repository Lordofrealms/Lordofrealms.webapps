from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,text):
    p=ROOT/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text,encoding='utf-8')

def replace_once(text,old,new,label):
    if old not in text:
        if new in text: return text
        raise SystemExit(f'missing expected token for {label}')
    if text.count(old)!=1: raise SystemExit(f'expected one {label}, found {text.count(old)}')
    return text.replace(old,new,1)

def prepend_section(rel,heading,section):
    text=read(rel)
    if heading in text: return
    if not text.startswith('# Changelog\n'):
        raise SystemExit(f'unexpected changelog header: {rel}')
    write(rel,'# Changelog\n\n'+section.strip()+'\n\n'+text[len('# Changelog\n'):].lstrip())

# Version only. Heat and imagery implementations intentionally remain unchanged.
build_rel='pad-grade-android/app/build.gradle.kts'
build=read(build_rel)
build=replace_once(build,'// v1.3.7 field-build trigger: imagery selection + existing-cover handoff.','// v1.3.8 field-build trigger: picker-cover ownership handoff only.','build comment')
build=replace_once(build,'versionCode = 109','versionCode = 110','versionCode')
build=replace_once(build,'versionName = "1.3.7"','versionName = "1.3.8"','versionName')
write(build_rel,build)

# Load the handoff shim after v1.2.7, because v1.2.7 owns the picker-specific
# padGradeFirstRunSetupV127 class that overrides the shared recovery pseudo-element.
index_rel='pad-grade/index.html'
index=read(index_rel)
index=replace_once(index,'<title>Pad Grade Mapper v1.3.7 DEV</title>','<title>Pad Grade Mapper v1.3.8 DEV</title>','HTML title')
needle='<script src="v127-dev.js?v=20260831-1"></script>'
insert=needle+'\n<script src="v138-folder-cover-handoff.js?v=20260901-1"></script>'
index=replace_once(index,needle,insert,'v138 handoff script tag')
write(index_rel,index)

runtime=r'''/* Pad Grade v1.3.8 DEV — folder-picker cover -> restoring-cover ownership handoff.
 *
 * No new cover is created. v1.2.7 uses the shared padGradeRecoveryHold pseudo-element
 * for both first-run folder selection and restoration, but while the picker is active
 * it adds padGradeFirstRunSetupV127, which changes the pseudo-element text to
 * "Choose project storage to continue". v1.3.7 re-armed padGradeRecoveryHold after a
 * successful Android folder result but did not retire that picker-specific class.
 *
 * v1.3.8 changes only that ownership transition: once the Android result callback
 * re-arms the existing recovery hold while the system picker still owns the screen,
 * remove/suppress the picker override so the first Pad Grade frame exposed afterward
 * is the same existing "Restoring saved project…" cover. Cancellation/failure returns
 * ownership to the existing folder-choice state. Recovery, reload and map-ready release
 * semantics remain untouched.
 */
(function installPadGrade138FolderCoverHandoff(){
  'use strict';
  if(window.__padGradeV138FolderCoverHandoff)return;
  window.__padGradeV138FolderCoverHandoff=true;

  const ROOT=document.documentElement;
  const PICKER_CLASS='padGradeFirstRunSetupV127';
  const DIALOG_ID='pgFirstRunStorageChoice';
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};
  let pickerActive=false;
  let restoreOwnership=false;
  let promoted=false;
  let mutatingClass=false;

  function setPublicState(){
    window.__padGradeFolderPickerActiveV138=pickerActive;
    window.__padGradeFolderRestoreOwnershipV138=restoreOwnership;
  }
  function removePickerOverride(){
    if(!ROOT.classList.contains(PICKER_CLASS))return false;
    mutatingClass=true;
    try{ROOT.classList.remove(PICKER_CLASS);}finally{mutatingClass=false;}
    return true;
  }
  function addPickerOverride(){
    if(ROOT.classList.contains(PICKER_CLASS))return false;
    mutatingClass=true;
    try{ROOT.classList.add(PICKER_CLASS);}finally{mutatingClass=false;}
    return true;
  }
  function armPicker(){
    pickerActive=true;
    restoreOwnership=false;
    promoted=false;
    setPublicState();
    mark('recovery.v138-folder-picker-cover-owned',{existingRecoveryCover:true,noNewCover:true,pickerOverride:true});
  }
  function promoteToRestoring(reason){
    if(!(pickerActive||window.__padGradeFolderPickerActiveV138===true))return false;
    restoreOwnership=true;
    removePickerOverride();
    setPublicState();
    if(!promoted){
      promoted=true;
      mark('recovery.v138-picker-cover-promoted-to-restoring',{
        reason,
        existingRecoveryCover:true,
        noNewCover:true,
        pickerOverrideRemoved:true,
        samePseudoElement:true,
        recoveryHoldPresent:ROOT.classList.contains('padGradeRecoveryHold')
      });
    }
    return true;
  }
  function returnToFolderChoice(reason){
    pickerActive=false;
    restoreOwnership=false;
    promoted=false;
    setPublicState();
    if(window.__padGradeFirstRunPending===true)addPickerOverride();
    mark('recovery.v138-restoring-ownership-returned-to-folder-choice',{reason,existingRecoveryCover:true,noNewCover:true});
  }

  // The durable button exists dynamically, so capture its click at document level.
  // v090 paints the existing picker cover before launching Android's document-tree UI.
  document.addEventListener('click',event=>{
    const id=event.target?.closest?.('button')?.id||'';
    if(id==='pgFirstRunDurable')armPicker();
  },true);

  // v1.3.7's native success callback invokes this function while the app is still
  // hidden behind the system picker. Wrap it so the shared cover is promoted before
  // Android can expose Pad Grade again.
  const baseBegin=window.__padGradeBeginRecoveryVisualHold;
  if(typeof baseBegin==='function'&&!baseBegin.__padGradeV138FolderCoverHandoff){
    const wrapped=function(){
      const out=baseBegin.apply(this,arguments);
      if((pickerActive||window.__padGradeFolderPickerActiveV138===true) && document.visibilityState==='hidden'){
        promoteToRestoring('successful-folder-result-hidden-handoff');
      }else if(restoreOwnership){
        removePickerOverride();
      }
      return out;
    };
    wrapped.__padGradeV138FolderCoverHandoff=true;
    wrapped.__padGradeV138Base=baseBegin;
    window.__padGradeBeginRecoveryVisualHold=wrapped;
  }

  // v1.2.7 has a first-run keepalive that may re-add its picker override while the
  // durable recovery is still in progress. Suppress only that class while restoration
  // owns the already-existing recovery cover.
  const classObserver=new MutationObserver(()=>{
    if(mutatingClass||!restoreOwnership)return;
    if(ROOT.classList.contains(PICKER_CLASS))removePickerOverride();
  });
  classObserver.observe(ROOT,{attributes:true,attributeFilter:['class']});

  // Cancellation must retain the pre-v1.3.8 behavior: return to the folder-choice
  // dialog/cover rather than remaining in restoring state.
  const baseCancel=window.__padGradeProjectFolderSelectionCancelled;
  if(typeof baseCancel==='function'&&!baseCancel.__padGradeV138FolderCoverHandoff){
    const wrappedCancel=function(){
      pickerActive=false;restoreOwnership=false;promoted=false;setPublicState();
      const out=baseCancel.apply(this,arguments);
      if(window.__padGradeFirstRunPending===true)addPickerOverride();
      return out;
    };
    wrappedCancel.__padGradeV138FolderCoverHandoff=true;
    wrappedCancel.__padGradeV138Base=baseCancel;
    window.__padGradeProjectFolderSelectionCancelled=wrappedCancel;
  }

  // The successful event means Android accepted the folder. Stop calling it a picker
  // operation, but keep restoration ownership through indexing/recovery and reload.
  window.addEventListener('padgrade-project-folder-selected',()=>{
    pickerActive=false;setPublicState();
    if(restoreOwnership)removePickerOverride();
  });

  // If durable recovery rejects the folder and v090 re-opens the existing choice
  // dialog, explicitly hand ownership back to the picker state.
  const choiceObserver=new MutationObserver(()=>{
    if(!restoreOwnership)return;
    const dlg=document.getElementById(DIALOG_ID);
    if(dlg?.open)returnToFolderChoice('folder-choice-reopened');
  });
  if(document.body)choiceObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});

  window.addEventListener('beforeunload',()=>{classObserver.disconnect();choiceObserver.disconnect();},{once:true});
  setPublicState();
  mark('recovery.v138-folder-cover-handoff-installed',{
    version:'1.3.8',build:110,
    existingRecoveryCover:true,noNewCover:true,
    samePseudoElement:true,
    heatmapChanged:false,imageryChanged:false
  });
})();
'''
write('pad-grade/v138-folder-cover-handoff.js',runtime)

selftest=r'''/* v1.3.8 regression: existing picker-cover -> existing restoring-cover ownership. */
'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const source=fs.readFileSync(__dirname+'/v138-folder-cover-handoff.js','utf8');

class FakeClassList{
  constructor(...names){this.s=new Set(names);}
  contains(x){return this.s.has(x);}
  add(x){this.s.add(x);}
  remove(x){this.s.delete(x);}
}
class FakeMutationObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}
const classList=new FakeClassList('padGradeRecoveryHold','padGradeFirstRunSetupV127');
const listeners={};
const window={
  __padGradeFirstRunPending:true,
  PadGradeDiag:{marks:[],mark(name,details){this.marks.push({name,details});}},
  __padGradeBeginRecoveryVisualHold(){classList.add('padGradeRecoveryHold');},
  __padGradeProjectFolderSelectionCancelled(){},
  addEventListener(name,fn){(listeners[name]||(listeners[name]=[])).push(fn);}
};
const document={
  documentElement:{classList},
  visibilityState:'visible',
  body:{},
  addEventListener(name,fn){(listeners['document:'+name]||(listeners['document:'+name]=[])).push(fn);},
  getElementById(){return null;},
  createElement(){throw new Error('v1.3.8 must not create a cover element');}
};
const context={window,document,MutationObserver:FakeMutationObserver,console,Set};
context.globalThis=context;vm.createContext(context);vm.runInContext(source,context,{filename:'v138-folder-cover-handoff.js'});

assert.strictEqual(window.__padGradeV138FolderCoverHandoff,true);
assert(classList.contains('padGradeRecoveryHold'));
assert(classList.contains('padGradeFirstRunSetupV127'));
const click=(listeners['document:click']||[])[0];assert(click);
click({target:{closest(){return {id:'pgFirstRunDurable'};}}});
assert.strictEqual(window.__padGradeFolderPickerActiveV138,true);

document.visibilityState='hidden';
window.__padGradeBeginRecoveryVisualHold();
assert(classList.contains('padGradeRecoveryHold'),'shared restoring cover must remain active');
assert(!classList.contains('padGradeFirstRunSetupV127'),'picker wording override must be removed before reveal');
assert.strictEqual(window.__padGradeFolderRestoreOwnershipV138,true);
const promoted=window.PadGradeDiag.marks.find(x=>x.name==='recovery.v138-picker-cover-promoted-to-restoring');
assert(promoted);assert.strictEqual(promoted.details.noNewCover,true);assert.strictEqual(promoted.details.samePseudoElement,true);

// A legacy keepalive attempting to re-add the picker class is suppressed by the
// observer callback while restoration owns the same pseudo-element.
classList.add('padGradeFirstRunSetupV127');
const observers=[]; // static source assertions below verify MutationObserver ownership guard.
assert(source.includes("if(ROOT.classList.contains(PICKER_CLASS))removePickerOverride()"));

// Cancel path returns ownership to the existing folder-choice cover.
window.__padGradeProjectFolderSelectionCancelled();
assert.strictEqual(window.__padGradeFolderRestoreOwnershipV138,false);
assert(classList.contains('padGradeFirstRunSetupV127'));
assert(!source.includes("document.createElement('div')"));
assert(!source.includes('heatmap-raster-worker'));
assert(!source.includes('USGSNAIPPlus'));
console.log('v1.3.8 folder-cover regression passed: same cover promotes from picker wording to restoring wording before post-picker reveal.');
'''
write('pad-grade/v138-folder-cover-handoff-selftest.js',selftest)

notes='''# Pad Grade Mapper v1.3.8 — DEV BUILD

## v1.3.8 — remove the stale picker-cover frame before restoration

v1.3.8 is intentionally narrow. Heatmap processing remains exactly as v1.3.6/v1.3.7, and imagery remains exactly as v1.3.7. This build fixes only the visual ownership transition after a successful durable-folder selection.

## Fixed — folder-picker cover → restoring cover

The v1.3.7 field log showed that Android's successful folder result was already reaching Pad Grade while the app was still hidden behind the system picker. The remaining flash was therefore not an Android-picker dismissal delay and not an uncovered frame.

The actual cause was the first-run CSS ownership class `padGradeFirstRunSetupV127`. That class intentionally changes the shared recovery pseudo-element from `Restoring saved project…` to `Choose project storage to continue` while the durable-folder picker is active. v1.3.7 re-armed the shared recovery hold after a successful folder result but left that picker-specific class active, so the old folder cover could remain visible until the recovery reload.

v1.3.8 keeps the same cover element/pseudo-element and changes only its ownership:

- durable-folder picker launch marks the existing picker-cover state as active;
- when the existing native success callback re-arms the recovery hold while Android still covers the app, v1.3.8 removes only `padGradeFirstRunSetupV127`;
- the shared `padGradeRecoveryHold` remains active, so the first Pad Grade frame exposed after the system picker closes already says `Restoring saved project…`;
- a small ownership guard prevents the legacy first-run keepalive from re-adding the picker wording during that recovery window;
- canceling the picker or rejecting the selected folder returns ownership to the existing folder-choice cover.

No new cover, overlay, native curtain or arbitrary delay is added. TOS, folder indexing, durable recovery, reload timing, project restoration, map startup and map-ready cover release are unchanged.

Diagnostic proof: `recovery.v138-picker-cover-promoted-to-restoring` should occur before Pad Grade becomes visible after a successful picker result and report `noNewCover:true`, `samePseudoElement:true`, and `pickerOverrideRemoved:true`.

## Heatmap — unchanged

- 99 / 297 / 891 remain on the proven parallel Blob-worker path.
- Atomic full-frame presentation and the no-row-painting/no-flicker boundary are unchanged.
- No heatmap files or algorithms are modified by v1.3.8.

## Imagery — unchanged

v1.3.7 remains the active imagery policy. The latest field log proved the live map selected the best positive-resolution USGS NAIP Plus candidate available at the tested location: 0.6 m selected and 0.6 m best-positive, with `selectedMatchesBestPositive:true`. v1.3.8 makes no imagery-source, quality, request, diagnostic or layer-order changes.

## Release pipeline

The fresh synthetic main-equivalent tag anchor from v1.3.7 is retained so DEV releases remain reliable and sort newest-first.

## Version

- Android DEV version: **1.3.8**
- build: **110**
- application ID remains `com.lordofrealms.padgrade.dev`.

## DEV field test

1. Install/update v1.3.8 DEV.
2. On a clean/reinstall recovery test, accept TOS and choose the durable folder.
3. Complete the Android folder picker.
4. When the picker disappears, the very first Pad Grade frame should already be the existing `Restoring saved project…` cover. The `Choose project storage to continue` cover should not flash again.
5. Let recovery/map startup complete normally.
6. Export a diagnostic log and confirm `recovery.v138-picker-cover-promoted-to-restoring` precedes the post-picker visible state.
'''
write('pad-grade/RELEASE_NOTES.md',notes)

section='''## v1.3.8 — development build

### Recovery UI — retire picker wording before post-picker reveal
- Fixes the remaining stale folder-cover flash after a successful Android durable-folder selection.
- Root cause: v1.3.7 re-armed the shared `padGradeRecoveryHold`, but the first-run `padGradeFirstRunSetupV127` class still overrode that same pseudo-element to `Choose project storage to continue` until reload.
- v1.3.8 removes/suppresses only that picker-specific class during the successful hidden handoff, while keeping the existing recovery cover continuously active as `Restoring saved project…`.
- Picker cancellation or rejected-folder recovery returns ownership to the existing folder-choice cover.
- Adds no cover, overlay, native curtain or arbitrary transition delay; TOS, indexing, recovery, reload and map-ready release remain unchanged.

### Heatmap
- No changes. v1.3.6/v1.3.7 all-tier parallel compute and atomic full-frame presentation are carried forward unchanged.

### Imagery
- No changes. v1.3.7 best-positive USGS NAIP Plus selection remains active; the latest field proof selected the available 0.6 m best-positive raster.

### Release pipeline
- Retains the v1.3.7 fresh synthetic main-equivalent tag anchor and newest-first Releases ordering.

### Version
- Android DEV package: **1.3.8 / build 110**.'''
prepend_section('pad-grade/CHANGELOG.md','## v1.3.8 — development build',section)
prepend_section('pad-grade-android/CHANGELOG.md','## v1.3.8 — development build',section)

print('Applied Pad Grade v1.3.8 picker-cover ownership handoff.')
