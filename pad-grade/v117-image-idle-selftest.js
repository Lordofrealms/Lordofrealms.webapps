#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=__dirname;
const android=path.resolve(root,'../pad-grade-android');

function text(file){return fs.readFileSync(file,'utf8');}
function has(haystack,needle,label){if(!haystack.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function not(haystack,needle,label){if(haystack.includes(needle))throw new Error(`${label}: unexpected ${needle}`);}

const v117=text(path.join(root,'v117-dev.js'));
const index=text(path.join(root,'index.html'));
const main=text(path.join(android,'app/src/main/java/com/lordofrealms/padgrade/MainActivity.java'));
const life=text(path.join(android,'app/src/main/java/com/lordofrealms/padgrade/PadGradeLifecycleBridge.java'));
const gradle=text(path.join(android,'app/build.gradle.kts'));

// Historical v1.1.7 implementation remains testable as history, but later releases are
// allowed to remove it from executable startup when they replace the presentation path.
for(const needle of [
  "const VERSION='1.1.7'",
  "IMAGE_SOURCE_ID='pad-grade-v117-heat-image-source'",
  "IMAGE_LAYER_ID='pad-grade-v117-heat-image-layer'",
  "type:'image'",
  'createImageBitmap(canvas)',
  'updateImage({image:frame.image,coordinates:coords})',
  'const map=state?.map;if(!map)return false;',
  "'raster-fade-duration':0",
  'window.__padGradeDevV115=true',
  'window.__padGradeDevV116=true',
  'background.gps-suspended',
  'background.imagery-unloaded',
  'android.process.exit-reason',
  'process.previous-exit'
])has(v117,needle,'v117-dev.js');

if(!/<title>Pad Grade Mapper v\d+\.\d+\.\d+ DEV<\/title>/.test(index))throw new Error('index.html: current DEV title missing');
has(index,'src="v119-dev.js','index.html current heat cutover');
for(const old of ['v115-dev.js','v116-dev.js','v117-dev.js','v118-dev.js']){
  if(index.includes(`<script src="${old}`))throw new Error(`index.html: superseded ${old} must not remain executable after v1.1.9 cutover`);
}

for(const needle of [
  'PadGradeLifecycleBridge.recordHistoricalExitReasons(this, activityInstanceId);',
  'webView.onPause();',
  'webView.pauseTimers();',
  'webView.resumeTimers();',
  'webView.onResume();',
  '"webview.backgroundPaused"',
  '"webview.backgroundResumed"'
])has(main,needle,'MainActivity.java');

for(const needle of [
  'getHistoricalProcessExitReasons',
  '"process.previous-exit"',
  '"exitReasonName"',
  '"exitPssKb"',
  '"exitRssKb"',
  'case 14: return "FREEZER";',
  'isLowMemoryKillReportSupported'
])has(life,needle,'PadGradeLifecycleBridge.java');

const codeMatch=gradle.match(/versionCode\s*=\s*(\d+)/);
if(!codeMatch||Number(codeMatch[1])<89)throw new Error('build.gradle.kts: current versionCode must carry forward from 89');
const nameMatch=gradle.match(/versionName\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
if(!nameMatch)throw new Error('build.gradle.kts: semantic versionName missing');
const version=[+nameMatch[1],+nameMatch[2],+nameMatch[3]];
if(version[0]<1||(version[0]===1&&version[1]<1)||(version[0]===1&&version[1]===1&&version[2]<7))throw new Error('build.gradle.kts: versionName must carry forward from 1.1.7');

not(v117,"type:'canvas',canvas:record.canvas,coordinates:coords",'v117 actual source');
console.log('Pad Grade v1.1.7 ImageSource/background-idle carry-forward self-test passed.');
