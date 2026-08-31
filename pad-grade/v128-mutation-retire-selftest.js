const fs=require('fs');
const path=require('path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg);};

const v128=read('v128-dev.js');
const startup=read('v127-startup-map-gate.js');
const v127=read('v127-dev.js');
const v122=read('v122-dev.js');
const v063=read('v063-dev.js');
const index=read('index.html');

// The field log showed stale-canvas suppression at ~0.9 s intervals. Preserve a
// regression explanation proving the legacy caller we are neutralizing still is
// the v1.1.1 maintenance loop, rather than inventing another presentation owner.
must(v063.includes('syncTimer=setInterval(()=>{installMapClick();syncSurface();syncLaserMarker();},900)'), 'legacy 900 ms surface maintenance loop changed');
must(v063.includes('installBestPendingRaster(key);\n    ensureDisplayedRaster();'), 'legacy ensureDisplayedRaster retry caller changed');

// v1.2.7 remains the cancel-first owner. v1.2.8 must wrap that exact mutation
// contract rather than bypassing it, and must clear only AFTER base mutation.
must(v128.includes('if(!base.__padGradeV127MutationFirst)return false'), 'v1.2.8 must require v1.2.7 cancel-first wrapper');
const saveBody=v128.slice(v128.indexOf('const wrapped=function(){'),v128.indexOf('wrapped.__padGradeV128MutationOrder=true'));
must(saveBody.indexOf('base.apply(this,arguments)')>=0, 'base point mutation missing');
must(saveBody.indexOf("afterSurfaceMutation('point-save'")>saveBody.indexOf('base.apply(this,arguments)'), 'invalid heat is being cleared before point mutation');
must(v127.includes("beforeSurfaceMutation('point-save')"), 'v1.2.7 point-save cancellation boundary missing');

const afterBody=v128.slice(v128.indexOf('function afterSurfaceMutation'),v128.indexOf('function installSaveWrapper'));
must(afterBody.indexOf('retireLegacyPresentation(reason)')<afterBody.indexOf('hideCanonicalHeat(reason)'), 'legacy retirement must precede visible clear');
must(afterBody.indexOf('hideCanonicalHeat(reason)')<afterBody.indexOf('requestHeatRefresh(reason)'), 'replacement heat must not start before obsolete display is hidden');

// The protected v1.2.2 architecture must not be torn down to clear invalid heat.
const hideBody=v128.slice(v128.indexOf('function hideCanonicalHeat'),v128.indexOf('function requestHeatRefresh'));
must(hideBody.includes("setLayoutProperty(CANONICAL_LAYER,'visibility','none')"), 'canonical heat layer is not hidden in place');
must(!hideBody.includes('removeSource(')&&!hideBody.includes('removeLayer('), 'v1.2.8 must not recreate/remove protected canonical heat source/layer');
must(v122.includes('MAINTENANCE / CHANGE-CONTROL NOTE — FLICKERLESS HEAT PRESENTATION')&&v122.includes('requires explicit developer\n * agreement'), 'v1.2.2 protected-presentation change-control note missing');

// Retired stale canvases must stop before the v1.2.7 provenance/logging path.
must(v128.includes('if(canvas&&retiredCanvases.has(canvas))'), 'retired-canvas admission guard missing');
must(v128.includes('heatmap.v128-retired-canvas-retry-suppressed'), 'retired retry diagnostic missing');
must(v128.includes('state.sources.delete(id)')&&v128.includes('state.layers.delete(id)'), 'old virtual presentation references are not retired');
must(v128.includes('clearTimeout(state.commitTimer)')&&v128.includes('clearTimeout(state.verifyTimer)'), 'old presentation callbacks are not cancelled');

// Fresh Android installs must be covered from <head>, before the normal body can
// paint, while preserving the original 6-second safety semantics.
const startupTag=index.indexOf('v127-startup-map-gate.js');
const bodyTag=index.indexOf('<body>');
must(startupTag>=0&&startupTag<bodyTag, 'startup/precover gate must load before body');
must(startup.includes('isFreshAndroidInstall()'), 'fresh-install head detection missing');
must(startup.includes("armFreshInstallCover('head-before-body')"), 'fresh-install cover not armed before body');
must(startup.includes("window.addEventListener('padgrade-legal-accepted',()=>armFreshInstallCover('legal-accepted-before-storage-choice'))"), 'Terms-to-storage transition is not re-covered immediately');
must(startup.includes('safetyMaxMs:6000')&&!startup.includes('setInterval(()=>armFreshInstallCover'), 'map/precover layer must preserve the 6-second max rather than continuously rearming it');

console.log('Pad Grade v1.2.8 mutation/retirement + fresh-install precover self-test passed');
