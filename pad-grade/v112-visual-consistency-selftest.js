const fs=require('fs'),assert=require('assert');
const transition=fs.readFileSync('pad-grade/v112-visual-consistency.js','utf8');
const heat=fs.readFileSync('pad-grade/heatmap-raster-worker-v073.js','utf8');
const index=fs.readFileSync('pad-grade/index.html','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');

// Project switching must clear the outgoing visual state before the dialog closes.
assert(transition.includes("document.addEventListener('click'"));
assert(transition.includes('event.stopImmediatePropagation()'));
assert(transition.includes("padgrade-before-project-switch"));
assert(transition.includes('cancelOutgoingHeatGeneration()'));
assert(transition.includes('gpsFit=null'));
assert(transition.includes('clearMapProjectLayers()'));
assert(transition.includes("mark('project.switch-preclose-cleared'"));
assert(transition.indexOf('clearMapProjectLayers();') < transition.indexOf('closeProjectsDialog();'));
assert(transition.indexOf('closeProjectsDialog();') < transition.indexOf('requestAnimationFrame(()=>loadAndSwitch'));
assert(index.indexOf('src="v112-visual-consistency.js?v=20260830-1"') < index.indexOf('src="v090-project-switch-boundary.js?v=20260829-6"'));

// Progressive tiers share the measured-point cut/fill normalization, and exact
// measurement colors are now anchored into the nearest pixel of every raster.
assert(heat.includes('for(const p of points){const d=p.v-target;if(d<0)maxCut=Math.max(maxCut,-d);else maxFill=Math.max(maxFill,d);}'));
assert(heat.includes('function stampMeasuredPointAnchors(j)'));
assert(heat.includes('surfaceColor(p.v-j.target,j.tol,j.maxCut,j.maxFill)'));
assert(heat.includes('const anchorPixels=stampMeasuredPointAnchors(done)'));
assert(heat.includes('anchorPixels,buffer:done.rgba.buffer'));
assert(!heat.includes('maxCut=Math.max(maxCut,-diff)'));

// Package metadata for the next DEV build.
assert(index.includes('<title>Pad Grade Mapper v1.1.2 DEV</title>'));
assert(gradle.includes('versionCode = 84'));
assert(gradle.includes('versionName = "1.1.2"'));
console.log('v1.1.2 visual consistency self-test passed');
