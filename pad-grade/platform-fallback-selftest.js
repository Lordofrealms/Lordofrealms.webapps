'use strict';
const fs=require('fs');
const assert=require('assert');
const path=require('path');

const text=fs.readFileSync(path.join(__dirname,'platform.js'),'utf8');
assert.ok(text.includes('originalGeolocation'),'platform must preserve the original WebView/native geolocation provider before Precision Location shadows it');
assert.ok(text.includes('activateNativeFallback'),'platform must have an explicit Precision-to-native failover path');
assert.ok(text.includes('startFallbackWatch'),'ongoing GPS watches must migrate to native GPS after Precision Location fails');
assert.ok(text.includes('startFallbackOneShot'),'pending one-shot GPS requests must migrate to native GPS after Precision Location fails');
assert.ok(/__padGradeNativeProviderStopped[\s\S]*activateNativeFallback/.test(text),'Precision STOPPED must activate native fallback');
assert.ok(/__padGradeNativeLocationError[\s\S]*activateNativeFallback/.test(text),'Precision errors must activate native fallback');
assert.ok(text.includes("provider:'native'"),'fallback must report Native GPS as the active provider');
assert.ok(text.includes('fallbackActive=false'),'fallback must reset after all subscriptions are released so a later GPS session can retry Precision Location');
console.log('Pad Grade platform fallback self-test PASS');
