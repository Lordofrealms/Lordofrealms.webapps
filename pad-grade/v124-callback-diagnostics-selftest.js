#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const requireText=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);};

const index=read('index.html');
const v124=read('v124-dev.js');
const v122=read('v122-dev.js');
const bridge=read('v096-native-async.js');
const java=fs.readFileSync(path.join(root,'../pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/PadGradeNativeBridge.java'),'utf8');
const gradle=fs.readFileSync(path.join(root,'../pad-grade-android/app/build.gradle.kts'),'utf8');
const notes=read('RELEASE_NOTES.md');

// v1.2.4 is a retained behavior gate, not a demand that the whole app remain
// frozen at v1.2.4. Current DEV may advance while these capabilities stay wired.
requireText(index,'Pad Grade Mapper v','current DEV title');
requireText(index,'v124-dev.js','v1.2.4 startup wiring');
requireText(v124,'__padGradeResolutionInspectorEnabled=false','inspector retirement flag');
requireText(v124,'#pg112ResolutionInspector,#pg113ResolutionInspector{display:none!important','inspector hidden UI');
requireText(v124,"defaultMode:'auto'",'inspector Auto retirement');

requireText(v122,'MAINTENANCE / CHANGE-CONTROL NOTE — FLICKERLESS HEAT PRESENTATION','presentation change-control note');
requireText(v122,'requires explicit developer','explicit developer agreement requirement');
requireText(v122,'tierSwapSourceRecreate:false','no source recreation policy');
requireText(v122,'tierSwapLayerRecreate:false','no layer recreation policy');

for(const needle of ['nativeQueueWaitMs','androidUiPostWaitMs','webViewEvalToJsMs','file.callback-stage-breakdown','file.callback-microtask-settled'])requireText(bridge,needle,'JS callback stage timing');
for(const needle of ['FileQueueTiming','queueWaitMs','queueAheadCount','uiPostWaitMs','evalInvokedEpochMs'])requireText(java,needle,'Android callback stage timing');
requireText(java,'Executors.newSingleThreadExecutor','file ordering remains single-threaded');

const versionName=(gradle.match(/versionName\s*=\s*"(\d+\.\d+\.\d+)"/)||[])[1];
const versionCode=+(gradle.match(/versionCode\s*=\s*(\d+)/)||[])[1];
const parts=v=>String(v||'').split('.').map(Number);
const atLeast=(v,f)=>{const a=parts(v),b=parts(f);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return true;};
if(!atLeast(versionName,'1.2.4'))throw new Error('Android version regressed below v1.2.4');
if(!(versionCode>=96))throw new Error('Android build regressed below 96');
requireText(notes,'# Pad Grade Mapper v','current release-notes heading');
requireText(notes,'specific developer agreement','release-note presentation change control');

console.log('Pad Grade v1.2.4 callback diagnostics carry-forward self-test passed.');
