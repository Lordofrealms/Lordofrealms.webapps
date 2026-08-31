'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=__dirname;
const recovery=fs.readFileSync(path.join(root,'recovery-visual-v073.js'),'utf8');
const gate=fs.readFileSync(path.join(root,'v127-startup-map-gate.js'),'utf8');

function makeClassList(){const s=new Set();return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x),values:()=>[...s]};}
const classList=makeClassList();
const styles=new Map();
const document={
  documentElement:{classList},head:{appendChild(el){if(el.id)styles.set(el.id,el);}},
  getElementById(id){return styles.get(id)||null;},querySelector(){return null;},
  createElement(){return {id:'',textContent:'',dataset:{},remove(){if(this.id)styles.delete(this.id);}};}
};
const local=new Map(),session=new Map();
const localStorage={getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k),get length(){return local.size;},key:i=>[...local.keys()][i]??null};
const sessionStorage={getItem:k=>session.has(k)?session.get(k):null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
let timerSeq=0;
const timers=new Map();
function setTimeoutFake(fn,ms){const id=++timerSeq;timers.set(id,{fn,ms,cancelled:false});return id;}
function clearTimeoutFake(id){const t=timers.get(id);if(t)t.cancelled=true;}
function fire(id){const t=timers.get(id);if(t&&!t.cancelled){t.cancelled=true;t.fn();}}
const marks=[];
const windowObj={document,localStorage,sessionStorage,__padGradeBaseMapRenderedV127:false,PadGradeDiag:{mark:(n,d)=>marks.push([n,d])},addEventListener(){}};
windowObj.window=windowObj;
const ctx={window:windowObj,document,localStorage,sessionStorage,Date,setTimeout:setTimeoutFake,clearTimeout:clearTimeoutFake,setInterval:()=>999,clearInterval(){},console};
vm.runInNewContext(recovery,ctx,{filename:'recovery-visual-v073.js'});

// Arm ordinary recovery before the map gate is installed, matching index.html order.
windowObj.__padGradeBeginRecoveryVisualHold();
assert(classList.contains('padGradeRecoveryHold'),'recovery hold did not arm');
const firstFailsafe=[...timers.entries()].filter(([,t])=>t.ms===6000&&!t.cancelled).at(-1)?.[0];
assert(firstFailsafe,'initial six-second failsafe missing');
vm.runInNewContext(gate,ctx,{filename:'v127-startup-map-gate.js'});
assert(classList.contains('padGradeV127BaseMapGate'),'base-map preference gate did not attach');

// The normal map-preference path may not renew the recovery timer. v1.2.8 has a
// separate fresh-install precover path which is intentionally allowed to call
// begin() at head time / legal release; this non-Android test does not enter it.
const activeSixSecondBefore=[...timers.values()].filter(t=>t.ms===6000&&!t.cancelled).length;
assert.strictEqual(activeSixSecondBefore,1,'map preference gate created or renewed a six-second recovery timer');
fire(firstFailsafe);
assert(!classList.contains('padGradeRecoveryHold'),'legacy six-second failsafe was prevented by map gate');
assert.strictEqual(windowObj.__padGradeBaseMapRenderedV127,false,'test unexpectedly rendered map');

// Directory/first-run logic renews by calling begin() itself. That existing behavior
// must still reset the same six-second timeout rather than being owned by the map gate.
windowObj.__padGradeBeginRecoveryVisualHold();
const renewalA=[...timers.entries()].filter(([,t])=>t.ms===6000&&!t.cancelled).at(-1)?.[0];
windowObj.__padGradeBeginRecoveryVisualHold();
const renewalB=[...timers.entries()].filter(([,t])=>t.ms===6000&&!t.cancelled).at(-1)?.[0];
assert(renewalA&&renewalB&&renewalA!==renewalB,'begin() did not create a renewed failsafe');
assert(timers.get(renewalA).cancelled,'renewing begin() did not cancel the prior failsafe');
assert(!timers.get(renewalB).cancelled,'renewed failsafe is not active');
fire(renewalB);
assert(!classList.contains('padGradeRecoveryHold'),'renewed six-second failsafe did not eventually reveal');

assert(gate.includes('preservesLegacyFailsafe:true'),'preserved-failsafe diagnostic contract missing');
const keepCovered=gate.slice(gate.indexOf('function keepCovered'),gate.indexOf('function observeSafetyRelease'));
assert(!keepCovered.includes('__padGradeBeginRecoveryVisualHold?.();'),'base-map wait must not re-arm recovery itself');
assert(gate.includes("armFreshInstallCover('head-before-body')"),'v1.2.8 fresh-install head precover missing');
console.log('Pad Grade v1.2.7/v1.2.8 startup map preference / six-second safety self-test passed');
