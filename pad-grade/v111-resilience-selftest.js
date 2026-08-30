const fs=require('fs'),assert=require('assert');
const heat=fs.readFileSync('pad-grade/v063-dev.js','utf8');
const resilience=fs.readFileSync('pad-grade/v111-resilience.js','utf8');
const index=fs.readFileSync('pad-grade/index.html','utf8');
const gradle=fs.readFileSync('pad-grade-android/app/build.gradle.kts','utf8');

// Heat workers can start from restored project state before MapLibre is usable.
assert(heat.includes('const pendingRasters=new Map()'));
assert(heat.includes("heatmap.regular-buffered-before-map"));
assert(heat.includes("window.__padGradeHeatmapStartupPolicyV111='project-state-first-workers-buffer-raster-until-map-ready'"));
assert(heat.includes('mapUsableAtStart:mapReadyAtStart,preMapStart:!mapReadyAtStart'));
assert(!heat.includes('if(!mapUsable(mapInstance()))return false;\n    cancelAllJobs();generationKey=key'));
assert(heat.includes('for(const tier of INITIAL_TIERS)buildRaster(tier,points,key,gen)'));
assert(heat.includes('buildRaster(HIGH_TIER,points,key,gen)'));

// Overlay repair is project-generation scoped and survives transient style states.
assert(resilience.includes('const RETRY_DELAYS=Object.freeze([0,16,60,160,350,700,1200,2200,4000,6500])'));
assert(resilience.includes('map.overlay-repair-generation-invalidated'));
assert(resilience.includes('map.overlay-repair-attempt'));
assert(resilience.includes('map.overlay-repair-verified'));
assert(resilience.includes('map.overlay-repair-exhausted'));
assert(resilience.includes('map.overlay-direct-grid-install'));
assert(resilience.includes("map.on('style.load'"));
assert(resilience.includes("map.on('styledata'"));
assert(resilience.includes("'webglcontextlost'"));
assert(resilience.includes("'webglcontextrestored'"));
assert(resilience.includes("'padgrade-location-fallback'"));
assert(resilience.includes("gps.provider-state"));

// Earlier visual reveal does not release the durable recovery/write lock itself.
assert(resilience.includes('pg111RuntimeReady'));
assert(resilience.includes('Restoring project map…'));
assert(resilience.includes('recovery.partial-reveal'));
assert(!resilience.includes('completeProjectFolderRecovery'));
assert(!resilience.includes('__padGradeEndRecoveryVisualHold'));

// The v1.1.1 runtime remains present inside later diagnostic builds.
assert(index.includes('<title>Pad Grade Mapper v1.1.1 DEV</title>'));
assert(index.includes('src="v111-resilience.js?v=20260830-1"'));
assert(gradle.includes('versionCode = 84'));
assert(gradle.includes('versionName = "1.1.2"'));
console.log('v1.1.1 resilience/startup self-test passed inside v1.1.2 diagnostic build');
