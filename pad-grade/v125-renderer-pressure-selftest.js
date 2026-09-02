'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const diag=read('v096-diagnostics.js');
const heat=read('v120-dev.js');
const v122=read('v122-dev.js');
const v125=read('v125-dev.js');
const index=read('index.html');
const notes=read('RELEASE_NOTES.md');

assert(diag.includes("indexedDB.open(DB_NAME,DB_VERSION)"),'diagnostics must use IndexedDB');
assert(diag.includes("window.__padGradeDiagnosticPersistenceV125='indexeddb-append-batches-no-whole-log-localstorage-rewrite'"),'diagnostic persistence policy missing');
assert(!diag.includes("localStorage.setItem(LOG_KEY"),'whole-log localStorage rewrite must remain removed');
assert(!diag.includes('function persisted(){'),'legacy whole-log parse path must remain removed');
assert(diag.includes("storageMode==='indexeddb'?'IndexedDB append'"),'UI/export must expose append storage mode');

const tokenCheck=heat.indexOf("window.__padGradeDirectCanvasTokenTransportV125===true&&window.__padGradeDevV122===true");
const pngEncode=heat.indexOf("canvas.toDataURL('image/png')");
assert(tokenCheck>=0,'v1.2.5 heat token branch missing');
assert(pngEncode>tokenCheck,'full PNG encode must be fallback after direct-canvas token branch');
assert(heat.includes("kind:'CanvasFrameToken'"),'lightweight heat frame token missing');
assert(heat.includes("encodedChars:0"),'token path must report zero encoded PNG characters');

assert(v122.includes('MAINTENANCE / CHANGE-CONTROL NOTE — FLICKERLESS HEAT PRESENTATION'),'protected v1.2.2 warning missing');
assert(v122.includes('tierSwapSourceRecreate:false'),'v1.2.2 no-source-recreation policy missing');
assert(v122.includes('tierSwapLayerRecreate:false'),'v1.2.2 no-layer-recreation policy missing');
assert(index.includes('src="v125-dev.js?v=20260831-1"'),'v1.2.5 runtime not wired');
assert(index.includes('src="v096-diagnostics.js?v=20260831-4"'),'diagnostic cache bust missing');
assert(index.includes('src="v120-dev.js?v=20260831-2"'),'heat transport cache bust missing');
assert(notes.includes('# Pad Grade Mapper v1.2.5 — DEV BUILD'),'v1.2.5 historical release notes heading missing');
assert(notes.includes('IndexedDB'),'IndexedDB changelog detail missing');
assert(notes.includes('two-animation-frame paint barrier'),'project-switch paint barrier changelog detail missing');
assert(notes.includes('protected v1.2.2 flickerless heat-map presentation architecture is unchanged'),'protected heat-path changelog statement missing');

// Exercise the v1.2.5 dialog hold itself in isolation. Later versions may supersede
// the live close boundary, but this historical behavior must remain internally valid.
const raf=[];
let closeCount=0;
const dialog={open:true,__padGradeV125PaintBarrier:false,close(){closeCount++;this.open=false;},removeAttribute(){this.open=false;}};
const marks=[];
const document={
  title:'',readyState:'complete',documentElement:{},
  getElementById(id){return id==='projectsDlg'?dialog:null;},
  addEventListener(){}
};
const PadGradeDiag={mark(name,details){marks.push([name,details]);}};
const windowObj={PadGradeDiag,document,performance:{now:()=>100},requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},MutationObserver:class{observe(){} disconnect(){}},addEventListener(){}};
windowObj.window=windowObj;
const context={window:windowObj,document,performance:windowObj.performance,requestAnimationFrame:windowObj.requestAnimationFrame,MutationObserver:windowObj.MutationObserver,setTimeout,clearTimeout,console};
vm.runInNewContext(v125,context,{filename:'v125-dev.js'});
assert.strictEqual(windowObj.__padGradeDirectCanvasTokenTransportV125,true,'v1.2.5 must opt in to direct-canvas token transport');
windowObj.PadGradeDiag.mark('project.switch-v113-start',{from:'a',to:'b'});
dialog.close();
assert.strictEqual(closeCount,0,'Projects dialog closed before successful target apply');
windowObj.PadGradeDiag.mark('project.switch-v113-complete',{from:'a',to:'b'});
assert.strictEqual(raf.length,1,'first paint barrier frame was not scheduled');
raf.shift()();
assert.strictEqual(closeCount,0,'Projects dialog closed before first paint completed');
assert.strictEqual(raf.length,1,'second paint barrier frame was not scheduled');
raf.shift()();
assert.strictEqual(closeCount,1,'Projects dialog did not close after two-frame barrier');
assert(marks.some(([name])=>name==='project.switch-dialog-close-held'),'held-close diagnostic marker missing');
assert(marks.some(([name])=>name==='project.switch-dialog-closed-after-target-paint'),'post-paint close diagnostic marker missing');

console.log('Pad Grade v1.2.5 renderer-pressure/project-boundary carry-forward self-test passed');
