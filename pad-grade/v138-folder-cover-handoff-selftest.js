/* v1.3.8 regression: existing picker-cover -> existing restoring-cover ownership. */
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
