# Pad Grade Mapper v1.4.2 — DEV BUILD

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
