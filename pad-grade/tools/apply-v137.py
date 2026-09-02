from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,text):
    p=ROOT/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text,encoding='utf-8')

def replace_once(text,old,new,label):
    if old not in text:
        if new in text: return text
        raise SystemExit(f'missing expected token for {label}')
    if text.count(old)!=1: raise SystemExit(f'expected one {label}, found {text.count(old)}')
    return text.replace(old,new,1)

# Android: on successful folder result, re-arm the EXISTING restoring cover and
# wait for that JS handoff before beginning folder indexing/recovery.
main_rel='pad-grade-android/app/src/main/java/com/lordofrealms/padgrade/MainActivity.java'
main=read(main_rel)
old='''                nativeBridge.onProjectFolderSelected(uri);'''
new='''                final PadGradeNativeBridge bridgeAtResult = nativeBridge;
                if (webView == null) {
                    bridgeAtResult.onProjectFolderSelected(uri);
                } else {
                    webView.evaluateJavascript(
                            "(function(){try{if(window.__padGradeBeginRecoveryVisualHold)window.__padGradeBeginRecoveryVisualHold();try{window.PadGradeDiag&&window.PadGradeDiag.mark&&window.PadGradeDiag.mark('recovery.v137-folder-picker-success-cover-handoff',{existingRecoveryCover:true,noNewCover:true,source:'android-folder-result'});}catch(e){}return !!document.documentElement.classList.contains('padGradeRecoveryHold');}catch(e){return false;}})();",
                            value -> {
                                if (!isFinishing() && !isDestroyed() && nativeBridge == bridgeAtResult) {
                                    bridgeAtResult.onProjectFolderSelected(uri);
                                }
                            });
                }'''
main=replace_once(main,old,new,'folder picker success handoff')
write(main_rel,main)

# Version and HTML wiring.
build_rel='pad-grade-android/app/build.gradle.kts'
build=read(build_rel)
build=replace_once(build,'versionCode = 108','versionCode = 109','versionCode')
build=replace_once(build,'versionName = "1.3.6"','versionName = "1.3.7"','versionName')
write(build_rel,build)

index_rel='pad-grade/index.html'
index=read(index_rel)
index=replace_once(index,'<title>Pad Grade Mapper v1.3.6 DEV</title>','<title>Pad Grade Mapper v1.3.7 DEV</title>','HTML title')
needle='<script src="v132-imagery-quality.js?v=20260901-2"></script>'
insert=needle+'\n<script src="v137-imagery-selection-fix.js?v=20260901-1"></script>'
index=replace_once(index,needle,insert,'v137 imagery script tag')
write(index_rel,index)

imagery_js=r'''/* Pad Grade v1.3.7 DEV — positive-resolution USGS NAIP selection fix.
 *
 * v1.3.6 proved that the resolution_value-nearest-zero rule could select a
 * zero/unknown-resolution catalog record ahead of a real positive-resolution
 * candidate. v1.3.7 preserves the existing USGS NAIP Plus provider, Natural
 * Color, 512-for-256 export density, cubic interpolation and quality 95, but
 * adds a server-side mosaic subset: resolution_value > 0.
 *
 * This file operates at the request boundary so it corrects both live exportImage
 * requests and the existing paired identify proof without replacing the provider.
 */
(function installPadGrade137ImagerySelectionFix(){
  'use strict';
  if(window.__padGradeV137ImagerySelectionFix)return;
  window.__padGradeV137ImagerySelectionFix=true;

  const HOST='imagery.nationalmap.gov';
  const SERVICE='/arcgis/rest/services/USGSNAIPPlus/ImageServer/';
  const POSITIVE_WHERE='resolution_value > 0';
  const mark=(name,details)=>{try{window.PadGradeDiag?.mark?.(name,details);}catch(e){}};

  function targetPath(pathname){return pathname===SERVICE+'exportImage'||pathname===SERVICE+'identify';}
  function normalizedWhere(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function mergePositiveWhere(existing){
    const current=normalizedWhere(existing);
    if(!current)return POSITIVE_WHERE;
    if(/resolution_value\s*>\s*0/i.test(current))return current;
    return `(${current}) AND (${POSITIVE_WHERE})`;
  }
  function rewriteUrl(value){
    let u;
    try{u=new URL(String(value||''),location.href);}catch(e){return String(value||'');}
    if(u.hostname!==HOST||!targetPath(u.pathname))return u.href;
    const raw=u.searchParams.get('mosaicRule');
    if(!raw)return u.href;
    let rule;
    try{rule=JSON.parse(raw);}catch(e){return u.href;}
    const mosaicMethod=String(rule?.mosaicMethod||'');
    const sortField=String(rule?.sortField||'');
    if(mosaicMethod!=='esriMosaicAttribute'||sortField!=='resolution_value'||Number(rule?.sortValue)!==0)return u.href;
    const nextWhere=mergePositiveWhere(rule.where);
    if(nextWhere===rule.where)return u.href;
    rule={...rule,where:nextWhere};
    u.searchParams.set('mosaicRule',JSON.stringify(rule));
    return u.href;
  }
  function classify(value){
    try{
      const u=new URL(String(value||''),location.href);
      if(u.hostname!==HOST||!targetPath(u.pathname))return null;
      const raw=u.searchParams.get('mosaicRule');if(!raw)return null;
      const rule=JSON.parse(raw),where=normalizedWhere(rule?.where);
      return {
        target:true,
        mosaicMethod:String(rule?.mosaicMethod||''),
        sortField:String(rule?.sortField||''),
        sortValue:Number(rule?.sortValue),
        positiveFiltered:/resolution_value\s*>\s*0/i.test(where),
        wherePresent:!!where
      };
    }catch(e){return null;}
  }

  const baseFetch=typeof window.fetch==='function'?window.fetch.bind(window):null;
  if(baseFetch){
    window.fetch=function(input,init){
      try{
        if(typeof input==='string'||input instanceof URL){
          return baseFetch(rewriteUrl(String(input)),init);
        }
        if(input&&typeof input.url==='string'&&typeof Request==='function'){
          const next=rewriteUrl(input.url);
          if(next!==input.url)return baseFetch(new Request(next,input),init);
        }
      }catch(e){}
      return baseFetch(input,init);
    };
  }

  const xhrOpen=XMLHttpRequest?.prototype?.open;
  if(typeof xhrOpen==='function'){
    XMLHttpRequest.prototype.open=function(method,url,...rest){
      return xhrOpen.call(this,method,rewriteUrl(String(url||'')),...rest);
    };
  }

  let firstObserved=false,observer=null;
  if(typeof PerformanceObserver==='function'){
    try{
      observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          const proof=classify(entry?.name);if(!proof?.positiveFiltered)continue;
          if(!firstObserved){
            firstObserved=true;
            mark('imagery.v137-positive-resolution-policy-observed',{
              actualResourceObserved:true,
              provider:'USGSNAIPPlus',
              positiveResolutionFilter:true,
              filter:POSITIVE_WHERE,
              sortField:'resolution_value',sortValue:0,
              zeroUnknownExcluded:true,
              urlsLogged:false,coordinatesLogged:false
            });
          }
        }
      });
      observer.observe({type:'resource',buffered:true});
    }catch(e){}
  }

  window.PadGradeImageryV137={version:'1.3.7',positiveWhere:POSITIVE_WHERE,rewriteUrl,classify,mergePositiveWhere};
  try{document.title='Pad Grade Mapper v1.3.7 DEV';}catch(e){}
  mark('imagery.v137-selection-policy-installed',{
    version:'1.3.7',build:109,
    provider:'USGSNAIPPlus',providerUnchanged:true,
    filter:POSITIVE_WHERE,zeroUnknownExcluded:true,
    resolutionOrderingUnchanged:true,
    naturalColorUnchanged:true,exportDensityUnchanged:true,
    cubicInterpolationUnchanged:true,compressionQualityUnchanged:true,
    behaviorChanged:true,noAdditionalImageryProvider:true,
    urlsLogged:false,coordinatesLogged:false
  });
})();
'''
write('pad-grade/v137-imagery-selection-fix.js',imagery_js)

selftest_js=r'''/* v1.3.7 regression: positive-resolution mosaic filtering only. */
'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const source=fs.readFileSync(__dirname+'/v137-imagery-selection-fix.js','utf8');
function FakeXHR(){};FakeXHR.prototype.open=function(method,url){this.method=method;this.url=url;};
const calls=[];
const window={fetch:(input)=>{calls.push(String(input));return Promise.resolve({ok:true});},PadGradeDiag:{mark:()=>{}}};
const document={title:'Pad Grade Mapper v1.3.6 DEV'};
const location={href:'https://appassets.androidplatform.net/assets/index.html'};
const context={window,document,location,URL,Request:undefined,XMLHttpRequest:FakeXHR,PerformanceObserver:undefined,JSON,String,Number,Object,RegExp,console};
context.globalThis=context;vm.createContext(context);vm.runInContext(source,context,{filename:'v137-imagery-selection-fix.js'});
const api=window.PadGradeImageryV137;assert(api);assert.strictEqual(api.version,'1.3.7');
assert.strictEqual(document.title,'Pad Grade Mapper v1.3.7 DEV');
const base='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const rule={mosaicMethod:'esriMosaicAttribute',sortField:'resolution_value',sortValue:0,ascending:true,mosaicOperation:'MT_FIRST'};
const u=new URL(base);u.searchParams.set('mosaicRule',JSON.stringify(rule));u.searchParams.set('size','512,512');
const rewritten=new URL(api.rewriteUrl(u.href));const r=JSON.parse(rewritten.searchParams.get('mosaicRule'));
assert.strictEqual(r.where,'resolution_value > 0');assert.strictEqual(r.sortField,'resolution_value');assert.strictEqual(r.sortValue,0);
assert.strictEqual(api.classify(rewritten.href).positiveFiltered,true);
const existing={...rule,where:"Category=1"};const x=new URL(base);x.searchParams.set('mosaicRule',JSON.stringify(existing));
const xr=JSON.parse(new URL(api.rewriteUrl(x.href)).searchParams.get('mosaicRule'));
assert.strictEqual(xr.where,'(Category=1) AND (resolution_value > 0)');
const query='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/query?where=resolution_value%20%3E%200';
assert.strictEqual(api.rewriteUrl(query),query);
assert(!source.includes('heatmap-raster-worker'));
console.log('v1.3.7 imagery regression passed: zero/unknown resolution records are excluded before existing resolution ordering.');
'''
write('pad-grade/v137-imagery-selftest.js',selftest_js)

notes='''# Pad Grade Mapper v1.3.7 — DEV BUILD

## v1.3.7 — fix best-positive USGS imagery + seamless folder-picker cover handoff

v1.3.7 keeps the v1.3.6 parallel heatmap implementation unchanged and focuses on the two field findings from the latest diagnostic log: the NAIP mosaic rule was choosing a zero/unknown-resolution record instead of the available 0.6 m positive-resolution source, and the successful durable-folder picker return could expose the prior cover briefly before the existing restoring cover visibly took ownership.

## Heatmap — unchanged from v1.3.6

The proven all-tier Blob-worker path remains unchanged:

- 99, 297 and 891 all remain parallel.
- On the current 8-thread phone the healthy path remains 7 compute workers / 7 completed bands.
- Child workers still have no canvas or MapLibre presentation authority.
- Only complete full-tier buffers are published, preserving the no-row-painting/no-partial-frame invariant.
- No new sequential benchmark or heatmap tuning is included in this build.

## Imagery — exclude zero/unknown resolution records before sorting

The v1.3.6 field proof showed `selected-differs-from-best-positive`: the independent catalog query found a real 0.6 m positive-resolution candidate while the existing `resolution_value`-nearest-zero mosaic rule selected a record with no trustworthy positive resolution.

v1.3.7 keeps the same USGS NAIP Plus source and quality settings, but adds a server-side mosaic subset:

`resolution_value > 0`

The existing `esriMosaicAttribute` ordering by `resolution_value` nearest zero then runs only across valid positive-resolution candidates. This means a zero/null/unknown record can no longer beat a genuine 0.6 m, 0.3 m, or other positive-resolution source.

Unchanged imagery behavior:

- USGS NAIP Plus only; no Esri imagery provider is added.
- Natural Color rendering remains unchanged.
- 512 × 512 export for a 256 logical tile remains unchanged.
- cubic convolution remains unchanged.
- compression quality 95 remains unchanged.
- cached USGS fallback and layer order remain unchanged.

The existing v1.3.6 identify + best-positive diagnostics are intentionally retained. Because v1.3.7 rewrites the same mosaic rule at the request boundary, those diagnostics now test the corrected policy too. The next log should ideally report `selectedMatchesBestPositive: true` / `selectionVerdict: selected-is-best-positive` when the service metadata is consistent.

A new `imagery.v137-positive-resolution-policy-observed` event proves that an actual live request contained the positive-resolution subset.

## Folder picker → restoring cover handoff

No new cover was added.

The existing flow remains:

TOS → durable-folder choice/cover → Android folder picker → existing `Restoring saved project…` cover → load/recovery → existing map-ready release.

The only transition changed is the successful Android folder-picker return. Before native folder indexing/recovery begins, Android now asks the already-loaded page to re-arm the existing recovery visual hold and waits for that JavaScript handoff to execute. Only then does it call `onProjectFolderSelected()`.

This removes the timing race between the system picker returning and the existing restoring cover taking ownership, without changing cancellation behavior, project recovery semantics, TOS behavior, map startup, or the map-ready cover release.

Diagnostic event: `recovery.v137-folder-picker-success-cover-handoff` with `existingRecoveryCover:true` and `noNewCover:true`.

## Release ordering

The dev-release permission workaround is retained, but the tag is no longer anchored directly to an older `main` commit.

For each new dev version, the anchor workflow now creates a fresh synthetic commit whose tree is byte-for-byte identical to the current default-branch tree and whose parent is the current default-branch commit. The tag points to that fresh no-op commit. `main` itself is not moved or modified.

This preserves the Releases-API workaround while giving GitHub a current tagged-commit timestamp, so new dev releases should appear in normal newest-first order instead of being sorted near an older `main` commit.

## Version

- Android DEV version: **1.3.7**
- build: **109**
- application ID remains `com.lordofrealms.padgrade.dev`.

## DEV field test

1. Install/update v1.3.7 DEV.
2. On a clean/reinstall recovery test, accept TOS and choose the durable folder. Confirm the folder picker transitions directly to the existing `Restoring saved project…` cover with no stale-cover pause or exposed app frame.
3. Let recovery finish normally and confirm the cover still releases only through the existing startup/map-ready logic.
4. Pan/zoom close aerial imagery until NAIP settles. The log should contain `imagery.v137-positive-resolution-policy-observed`.
5. Allow the paired imagery proof to run. Check `selectedMatchesBestPositive` and `selectionVerdict`.
6. Optionally edit a measured point and confirm heat remains the known-good 99 → 297 → 891 parallel progression with no flicker or row painting.
7. Export the diagnostic log.
'''
write('pad-grade/RELEASE_NOTES.md',notes)

web_change='''## v1.3.7 — development build\n\n### Imagery — best positive-resolution NAIP source\n- Excludes `resolution_value <= 0` / unknown-resolution NAIP records before the existing resolution-nearest-zero ordering, preventing invalid catalog rows from outranking real positive-resolution imagery.\n- Retains USGS NAIP Plus, Natural Color, 512-for-256 exports, cubic interpolation and quality 95.\n- Adds live proof that the positive-resolution filter reached an actual imagery request.\n\n### Recovery UI — successful folder-picker handoff\n- Adds no new cover. The successful Android folder-picker result now re-arms the existing restoring cover and waits for that JS handoff before folder indexing begins.\n- Cancellation, TOS, recovery logic, startup and map-ready release are unchanged.\n\n### Heatmap\n- No heatmap code changes; v1.3.6 all-tier parallel/atomic behavior is carried forward unchanged.\n\n### Release pipeline\n- Dev tags now point to fresh no-op commits with the current `main` tree/parent, preserving the release-permission workaround while restoring normal newest-first release ordering.\n\n### Version\n- Android DEV package: **1.3.7 / build 109**.\n\n'''
for rel in ['pad-grade/CHANGELOG.md','pad-grade-android/CHANGELOG.md']:
    current=read(rel)
    if '## v1.3.7 — development build' not in current:
        if current.startswith('# Changelog\n'):
            current='# Changelog\n\n'+web_change+current[len('# Changelog\n'):].lstrip('\n')
        else:
            current=web_change+current
        write(rel,current)

print('Applied Pad Grade v1.3.7 source update.')
