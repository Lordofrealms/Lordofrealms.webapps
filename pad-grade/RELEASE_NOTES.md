# Pad Grade Mapper v1.3.7 — DEV BUILD

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
