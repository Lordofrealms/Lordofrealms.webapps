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

has(index,'<title>Pad Grade Mapper v1.1.7 DEV</title>','index.html');
const i117=index.indexOf('src="v117-dev.js?v=20260830-1"');
const i115=index.indexOf('src="v115-dev.js?v=20260830-1"');
const i116=index.indexOf('src="v116-dev.js?v=20260830-1"');
if(!(i117>=0&&i115>i117&&i116>i117))throw new Error('index.html: v1.1.7 must load before superseded v1.1.5/v1.1.6 runtimes');

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

has(gradle,'versionCode = 89','build.gradle.kts');
has(gradle,'versionName = "1.1.7"','build.gradle.kts');

not(v117,"type:'canvas',canvas:record.canvas,coordinates:coords",'v117 actual source');
console.log('Pad Grade v1.1.7 ImageSource/background-idle self-test passed.');
