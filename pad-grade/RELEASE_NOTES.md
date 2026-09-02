# Pad Grade Mapper v1.3.8 — DEV BUILD

## v1.3.8 — remove the stale picker-cover frame before restoration

v1.3.8 is intentionally narrow. Heatmap processing remains exactly as v1.3.6/v1.3.7, and imagery remains exactly as v1.3.7. This build fixes only the visual ownership transition after a successful durable-folder selection.

## Fixed — folder-picker cover → restoring cover

The v1.3.7 field log showed that Android's successful folder result was already reaching Pad Grade while the app was still hidden behind the system picker. The remaining flash was therefore not an Android-picker dismissal delay and not an uncovered frame.

The actual cause was the first-run CSS ownership class `padGradeFirstRunSetupV127`. That class intentionally changes the shared recovery pseudo-element from `Restoring saved project…` to `Choose project storage to continue` while the durable-folder picker is active. v1.3.7 re-armed the shared recovery hold after a successful folder result but left that picker-specific class active, so the old folder cover could remain visible until the recovery reload.

v1.3.8 keeps the same cover element/pseudo-element and changes only its ownership:

- durable-folder picker launch marks the existing picker-cover state as active;
- when the existing native success callback re-arms the recovery hold while Android still covers the app, v1.3.8 removes only `padGradeFirstRunSetupV127`;
- the shared `padGradeRecoveryHold` remains active, so the first Pad Grade frame exposed after the system picker closes already says `Restoring saved project…`;
- a small ownership guard prevents the legacy first-run keepalive from re-adding the picker wording during that recovery window;
- canceling the picker or rejecting the selected folder returns ownership to the existing folder-choice cover.

No new cover, overlay, native curtain or arbitrary delay is added. TOS, folder indexing, durable recovery, reload timing, project restoration, map startup and map-ready cover release are unchanged.

Diagnostic proof: `recovery.v138-picker-cover-promoted-to-restoring` should occur before Pad Grade becomes visible after a successful picker result and report `noNewCover:true`, `samePseudoElement:true`, and `pickerOverrideRemoved:true`.

## Heatmap — unchanged

- 99 / 297 / 891 remain on the proven parallel Blob-worker path.
- Atomic full-frame presentation and the no-row-painting/no-flicker boundary are unchanged.
- No heatmap files or algorithms are modified by v1.3.8.

## Imagery — unchanged

v1.3.7 remains the active imagery policy. The latest field log proved the live map selected the best positive-resolution USGS NAIP Plus candidate available at the tested location: 0.6 m selected and 0.6 m best-positive, with `selectedMatchesBestPositive:true`. v1.3.8 makes no imagery-source, quality, request, diagnostic or layer-order changes.

## Release pipeline

The fresh synthetic main-equivalent tag anchor from v1.3.7 is retained so DEV releases remain reliable and sort newest-first.

## Version

- Android DEV version: **1.3.8**
- build: **110**
- application ID remains `com.lordofrealms.padgrade.dev`.

## DEV field test

1. Install/update v1.3.8 DEV.
2. On a clean/reinstall recovery test, accept TOS and choose the durable folder.
3. Complete the Android folder picker.
4. When the picker disappears, the very first Pad Grade frame should already be the existing `Restoring saved project…` cover. The `Choose project storage to continue` cover should not flash again.
5. Let recovery/map startup complete normally.
6. Export a diagnostic log and confirm `recovery.v138-picker-cover-promoted-to-restoring` precedes the post-picker visible state.
