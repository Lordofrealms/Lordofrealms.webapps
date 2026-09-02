# Pad Grade Mapper v1.4.1 — DEV BUILD

## v1.4.1 — project identity repair and cleaner project switching

v1.4.1 is a focused reliability build following the v1.4.0 stable promotion. Heatmap interpolation, progressive 99 / 297 / 891 computation, atomic complete-frame presentation, grading math, and imagery quality are unchanged.

### Fixed — duplicate project identities in the persistent folder

On persistent-directory restoration, Pad Grade now checks project IDs and six-character file IDs before the indexed project controller is allowed to restore a project.

- Duplicate project IDs are repaired automatically.
- Duplicate file IDs are repaired automatically.
- The newest colliding project keeps the existing identity; older colliding files receive new unique identities.
- Repairs are write-first/delete-second so an original file is not removed until its repaired replacement is safely written.
- If cleanup of the old file fails, the replacement is rolled back rather than silently creating an ambiguous second copy.
- A repaired duplicate project invalidates the shared old-ID heat cache, and the rebuildable project index is invalidated so it is reconstructed from the repaired authoritative files.
- Normal recovery writes remain locked; only the explicit integrity-repair transaction can write during this pre-restore check.

### Fixed — stale heat work after a project switch

The old heat workers were already being terminated, but the older heat producer still retained its last completed canvas. Its 900 ms maintenance pass could therefore keep trying to restore that dead canvas after a switch.

v1.4.1 clears that producer state at the existing project-switch boundary. The old workers, pending rasters, completed canvas reference, slot ownership, and old surface key are retired before the new project is applied. The maintenance loop itself remains available for the new project.

This does not wait for the new heatmap before returning to the map and does not change the no-flicker complete-frame presenter.

### Diagnostics

- Persistent diagnostic retention increases from 2,400 to **50,000 entries**.
- IndexedDB remains append-based.
- Once the log exceeds 50,000 entries it prunes back to 48,000 in a batch, avoiding continuous one-entry pruning at the cap.
- The emergency in-memory fallback remains smaller so a storage failure cannot consume excessive RAM.

### Version

- Android DEV version: **1.4.1**
- build: **112**
- application ID: `com.lordofrealms.padgrade.dev`
