const fs=require('fs'),assert=require('assert');
const gate=fs.readFileSync('pad-grade/v062-dev.js','utf8');
const worker=fs.readFileSync('pad-grade/heatmap-raster-worker-v073.js','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');

// Diagnostic build must inspect the existing raster outputs without changing the
// authoritative v1.1.1 interpolation/color worker.
assert(gate.includes("passive-worker-copy-continuous-99-297-891-crossfade-no-math-change"));
assert(gate.includes("class PadGradeInspectorWorker extends NativeWorker"));
assert(gate.includes("this.addEventListener('message',event=>captureResult(this,event))"));
assert(gate.includes("slider.min='0'"));
assert(gate.includes("slider.max='2'"));
assert(gate.includes("slider.step='.01'"));
assert(gate.includes("99 → 297"));
assert(gate.includes("297 → 891"));
assert(gate.includes("This build does not alter heat-map math or colors."));
assert(!worker.includes('stampMeasuredPointAnchors'));
assert(worker.includes('function surfaceColor(diff,tol,maxCut,maxFill)'));
assert(worker.includes('for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}'));

// Project switching keeps the dialog up during the lazy read, then clears the
// outgoing project before closing and immediately applies the loaded target.
assert(gate.includes("hit.button.textContent='Loading…'"));
assert(gate.includes("loaded=index?.loadProject?await index.loadProject(target):true"));
assert(gate.includes("clearProjectMapLayers();setLowerGridVisible(false)"));
assert(gate.indexOf("clearProjectMapLayers();setLowerGridVisible(false)") < gate.indexOf('closeProjectsDialog();'));
assert(gate.indexOf('closeProjectsDialog();') < gate.indexOf("window.__padGradeSwitchProjectInPlace(target)"));
assert(gate.includes("lazy-load-under-dialog-clear-old-grid-heat-before-close-apply-target-immediately"));

assert(gradle.includes('versionCode = 84'));
assert(gradle.includes('versionName = "1.1.2"'));
console.log('v1.1.2 resolution inspector self-test passed');
