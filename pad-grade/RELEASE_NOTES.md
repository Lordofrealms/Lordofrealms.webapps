# Pad Grade Mapper v1.4.3 — DEV BUILD

## v1.4.3 — durable project deletion consistency

v1.4.3 fixes a project-manager bug where a deleted project could reappear as a non-openable ghost row after the durable file had already been removed.

### Fixed — project deletion is now one coordinated operation

- Resolves the exact durable project filename before removing local project state, including the six-character File ID prefix.
- Deletes the project’s derived `.pgheatcache` along with the project.
- Removes the project from local storage, the local project list, the in-memory indexed catalog, and `Pad-Grade-Project-Index.pgindex`.
- Treats an already-missing durable project file as successfully deleted so existing ghost entries can be cleaned up normally.
- Performs two post-delete reconciliations so an already-running stale catalog refresh cannot resurrect the deleted project.
- If the deleted project is the active project, updates durable `lastProjectId` to the replacement project before reload.
- Shared all-project backup files are rewritten to remove only the deleted project rather than deleting the entire backup.

### Regression coverage

- Verifies deletion uses the exact prefixed durable filename rather than the obsolete unprefixed fallback.
- Reproduces a stale first reconciliation and proves the project still remains deleted afterward.
- Reproduces the field-log ghost case where the durable file is already gone but the catalog row remains.
- Verifies active-project deletion preserves settings and points recovery at the replacement project.
- Verifies shared backup deletion removes only the selected project.

### Preserved

- Heatmap interpolation, cache schema v2, 99 → 297 → 891 progressive tiers, parallel compute, and atomic presentation are unchanged from v1.4.2.
- Imagery, GPS geometry, grading/volume calculations, project switching, and recovery-cover behavior are unchanged.

### Version

- Android DEV version: **1.4.3**
- build: **114**
- application ID: `com.lordofrealms.padgrade.dev`
