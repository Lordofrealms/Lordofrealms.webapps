from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match for {old!r}, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def prepend_once(path, marker, block):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if marker in text:
        return
    p.write_text(block.rstrip() + '\n\n' + text, encoding='utf-8')


# v1.1.3 owns background/inspector cache generation. Its captured NativeWorker
# intentionally bypasses the later v1.3.6 Worker redirect, so point it directly
# at the local-surface worker rather than the historical global-IDW worker.
replace_once(
    'pad-grade/v113-dev.js',
    " * The authoritative IDW² worker math and 99/297/891 resolutions are unchanged.\n",
    " * Background/inspector heat work now uses the same local surface definition as foreground heat.\n",
)
replace_once(
    'pad-grade/v113-dev.js',
    "  const CACHE_VERSION=1;\n  const WORKER_URL='heatmap-raster-worker-v073.js?v=20260825-1';",
    "  const CACHE_VERSION=2;\n  const CACHE_ENGINE='local-surface-v078-edge-locked';\n  const WORKER_URL='heatmap-raster-worker-v078.js?v=20260826-2';",
)
replace_once(
    'pad-grade/v113-dev.js',
    "raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.projectId",
    "raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.engine!==CACHE_ENGINE||raw.projectId",
)
replace_once(
    'pad-grade/v113-dev.js',
    "{format:CACHE_FORMAT,version:CACHE_VERSION,projectId",
    "{format:CACHE_FORMAT,version:CACHE_VERSION,engine:CACHE_ENGINE,projectId",
)

# v1.3.0 performs the foreground cache preflight before workers start. It must
# reject the same legacy/ambiguous caches that v1.1.3 now rejects.
replace_once(
    'pad-grade/v130-dev.js',
    "  const CACHE_VERSION=1;\n  const SNAPSHOT_LIMIT=2;",
    "  const CACHE_VERSION=2;\n  const CACHE_ENGINE='local-surface-v078-edge-locked';\n  const SNAPSHOT_LIMIT=2;",
)
replace_once(
    'pad-grade/v130-dev.js',
    "raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.projectId",
    "raw?.format!==CACHE_FORMAT||+raw.version!==CACHE_VERSION||raw.engine!==CACHE_ENGINE||raw.projectId",
)

# Version/package identity.
replace_once('pad-grade/index.html', '<title>Pad Grade Mapper v1.4.1 DEV</title>', '<title>Pad Grade Mapper v1.4.2 DEV</title>')
replace_once(
    'pad-grade-android/app/build.gradle.kts',
    '        // v1.4.1 DEV: durable identity repair, extended diagnostics, stale heat retirement.\n        versionCode = 112\n        versionName = "1.4.1"',
    '        // v1.4.2 DEV: unify heat interpolation paths and invalidate ambiguous legacy heat caches.\n        versionCode = 113\n        versionName = "1.4.2"',
)

# Persistent regression coverage in the normal Android pipeline.
replace_once(
    '.github/workflows/pad-grade-android.yml',
    '          node pad-grade/v126-generation-cancel-selftest.js\n',
    '          node pad-grade/v126-generation-cancel-selftest.js\n          node pad-grade/v142-heat-consistency-selftest.js\n',
)

selftest = r'''/* v1.4.2 regression: every heat producer uses the local surface engine and
 * legacy global-IDW caches cannot be admitted as current heat.
 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const surface=require('./surface-local-v078.js');

const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const v113=read('v113-dev.js');
const v130=read('v130-dev.js');
const v078=read('heatmap-raster-worker-v078.js');
const v136=read('heatmap-raster-worker-v136.js');
const index=read('index.html');
const gradle=read('../pad-grade-android/app/build.gradle.kts');

for(const token of [
  "const CACHE_VERSION=2",
  "const CACHE_ENGINE='local-surface-v078-edge-locked'",
  "const WORKER_URL='heatmap-raster-worker-v078.js?v=20260826-2'",
  'raw.engine!==CACHE_ENGINE',
  'engine:CACHE_ENGINE'
])assert(v113.includes(token),`v113 missing ${token}`);
assert(!v113.includes("const WORKER_URL='heatmap-raster-worker-v073.js"),'background/inspector must not use global-IDW v073');
for(const token of [
  "const CACHE_VERSION=2",
  "const CACHE_ENGINE='local-surface-v078-edge-locked'",
  'raw.engine!==CACHE_ENGINE'
])assert(v130.includes(token),`v130 missing ${token}`);
assert(v078.includes("importScripts('surface-local-v078.js?v=20260826-2')"));
assert(v078.includes('PadGradeLocalSurface.rasterize'));
assert(v136.includes("const SURFACE_URL=new URL('surface-local-v078.js?v=20260826-2'"));
assert(v136.includes('PadGradeLocalSurface.rasterize'));
assert(index.includes('<title>Pad Grade Mapper v1.4.2 DEV</title>'));
assert(gradle.includes('versionCode = 113'));
assert(gradle.includes('versionName = "1.4.2"'));

// A local triangle made entirely of on-grade measurements must not be pulled
// off grade by distant measurements outside its support.
const target=64;
const localTriangle=[
  {x:0,y:0,v:target},
  {x:10,y:0,v:target},
  {x:0,y:10,v:target},
  {x:35,y:35,v:84},
  {x:40,y:10,v:44}
];
const center=surface.interpolateAt(2.5,2.5,localTriangle,true);
assert(center&&Number.isFinite(center.value));
assert(Math.abs(center.value-target)<1e-9,`local triangle was influenced by distant points: ${center.value}`);

// Edge locking: an on-grade measured edge remains on grade even when the other
// two measured corners of the promoted rectangle are strongly off grade.
const rectangle=[
  {x:0,y:0,v:target,r:0,c:0},
  {x:10,y:0,v:target,r:0,c:1},
  {x:0,y:10,v:74,r:1,c:0},
  {x:10,y:10,v:74,r:1,c:1}
];
for(const x of [1,2.5,5,7.5,9]){
  const edge=surface.interpolateAt(x,0,rectangle,true);
  assert(edge&&Number.isFinite(edge.value));
  assert(Math.abs(edge.value-target)<1e-9,`edge lock failed at x=${x}: ${edge.value}`);
}

// The v1.3.6 band split must remain numerically identical to one whole local
// raster, proving foreground parallel output and whole-worker background output
// are the same surface definition.
function proveBandEquivalence(nx,ny,width,length,points,nWorkers=7){
  const whole=surface.rasterize({nx,ny,width,length,points,flipY:true});
  const values=new Float64Array(nx*ny);values.fill(NaN);
  const counts=new Uint16Array(nx*ny);
  let last=0,cells=0;
  for(let i=0;i<nWorkers;i++){
    const start=Math.floor(i*ny/nWorkers),end=Math.floor((i+1)*ny/nWorkers),rows=end-start;
    assert.strictEqual(start,last);last=end;
    if(!rows)continue;
    const bottom=length-(end/ny)*length,bandLength=(rows/ny)*length;
    const translated=points.map(p=>({...p,y:p.y-bottom}));
    const part=surface.rasterize({nx,ny:rows,width,length:bandLength,points:translated,flipY:true});
    cells+=part.cells;
    for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){
      const src=row*nx+col,dst=(start+row)*nx+col;
      values[dst]=part.values[src];counts[dst]=part.counts[src];
    }
  }
  assert.strictEqual(last,ny);assert.strictEqual(cells,whole.cells);
  for(let i=0;i<whole.values.length;i++){
    assert.strictEqual(counts[i],whole.counts[i],`count mismatch ${i}`);
    const a=values[i],b=whole.values[i];
    if(Number.isNaN(a)||Number.isNaN(b))assert(Number.isNaN(a)&&Number.isNaN(b),`NaN mismatch ${i}`);
    else assert(Math.abs(a-b)<1e-9,`value mismatch ${i}: ${a} vs ${b}`);
  }
}
const width=64,length=76,points=[];
for(let r=0;r<5;r++)for(let c=0;c<5;c++)points.push({x:c*width/4,y:r*length/4,v:58+r*1.7+c*.8+((r+c)%3)*.25,r,c});
for(const tier of [99,297,891]){
  const nx=Math.max(25,Math.round(tier*width/length)),ny=tier;
  proveBandEquivalence(nx,ny,width,length,points,7);
}

console.log('v1.4.2 regression passed: foreground/background/inspector share local-surface-v078; cache schema v2 rejects ambiguous legacy heat; local/edge/band invariants hold.');
'''
(ROOT / 'pad-grade/v142-heat-consistency-selftest.js').write_text(selftest, encoding='utf-8')

release_notes = '''# Pad Grade Mapper v1.4.2 — DEV BUILD

## v1.4.2 — consistent local heatmap interpolation

v1.4.2 fixes an inconsistency discovered while comparing regenerated heatmaps across projects. The normal foreground heatmap had already moved to the locality-first triangle/rectangle surface model, but two older auxiliary paths could still generate the final 891 heatmap with the historical global IDW² worker.

### Fixed — one heatmap surface model everywhere

- Foreground 99 / 297 / 891 heat generation continues to use the existing v1.3.6 parallel local-surface coordinator.
- Background final-heat caching now uses the same `surface-local-v078` triangle/rectangle interpolation model instead of the old global-IDW² worker.
- The DEV resolution inspector now uses that same local-surface worker as well.
- Local element edge locking is preserved, including the rule that an edge between two measured on-grade endpoints evaluates on grade along that edge.

### Fixed — ambiguous old heat caches

Earlier `.pgheatcache` files did not identify which interpolation engine generated them, so an old global-IDW² 891 image could be accepted as if it were a current local-surface result.

- Heat-cache schema advances to **v2**.
- New caches carry the engine ID `local-surface-v078-edge-locked`.
- Older v1 caches, or caches without the expected engine ID, are rejected and regenerated automatically.
- Project data and readings are not changed; only the derived heat image is regenerated.

### Preserved

- Progressive tiers remain **99 → 297 → 891**.
- Every tier retains the existing parallel band computation on capable devices.
- Bands remain compute-only and offscreen; only a complete assembled frame is presented.
- No row painting, band painting, partial-frame publication, cross-fade, or heatmap-gated map reveal was introduced.
- Imagery, project recovery, GPS geometry, and grading/volume calculations are unchanged.

### Version

- Android DEV version: **1.4.2**
- build: **113**
- application ID: `com.lordofrealms.padgrade.dev`
'''
(ROOT / 'pad-grade/RELEASE_NOTES.md').write_text(release_notes, encoding='utf-8')

changelog = '''## v1.4.2 DEV / build 113 — unify local heat interpolation and invalidate ambiguous caches

- Fixed a mixed-engine heat path: foreground 99/297/891 jobs already used `surface-local-v078`, while v1.1.3 background-cache and DEV-inspector jobs used a captured native Worker pointed at the historical global-IDW² v073 worker.
- Redirected those background/inspector jobs to `heatmap-raster-worker-v078.js`, which uses the same locality-first triangle/rectangle evaluator and edge-locking rules as the v1.3.6 foreground coordinator.
- Advanced the durable heat-cache schema to v2 and added the engine identity `local-surface-v078-edge-locked`; v1/unknown-engine cache images are rejected and regenerated rather than silently mixing interpolation models.
- Added v1.4.2 regression coverage for local-triangle isolation from distant measurements, exact on-grade edge locking, cache-engine/schema invariants, and whole-raster versus seven-band equivalence at the 99/297/891 tiers.
- Preserved progressive 99 → 297 → 891 scheduling, parallel compute, atomic full-frame presentation, no-row/no-band painting, map reveal timing, imagery, GPS geometry, and project recovery behavior.
'''
for rel in ('pad-grade/CHANGELOG.md','pad-grade-android/CHANGELOG.md'):
    prepend_once(rel, '## v1.4.2 DEV / build 113', changelog)

print('Applied Pad Grade v1.4.2 heat consistency changes.')
