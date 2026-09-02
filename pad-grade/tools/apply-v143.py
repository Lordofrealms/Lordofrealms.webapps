from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PG=ROOT/'pad-grade'
ANDROID=ROOT/'pad-grade-android'

RELEASE_NOTES='''# Pad Grade Mapper v1.4.3 — DEV BUILD

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
'''

CHANGELOG_ENTRY='''## v1.4.3 DEV / build 114 — authoritative project deletion and ghost-row cleanup

- Fixed project-manager deletion ordering so the exact durable filename is resolved before local project state is removed; human-readable File-ID prefixes are no longer lost during deletion.
- Added a v1.4.3 deletion owner that intercepts project delete actions before the lazy-load/catalog layer, allowing already-missing-body ghost rows to be deleted instead of being trapped in a failed lazy-load loop.
- Deletes the durable project payload first, then removes the local project body/index/File-ID map, derived heat cache, indexed catalog row, and durable `Pad-Grade-Project-Index.pgindex` entry.
- Treats an already-missing durable project file as success so the field-observed ghost state can self-repair.
- Runs a join reconcile followed by a guaranteed fresh reconcile after deletion, preventing a stale in-flight catalog refresh from resurrecting the deleted project.
- Active-project deletion updates durable `lastProjectId` to the selected replacement before the project payload is removed; a failed durable delete restores the original settings text.
- Shared all-project backup files are rewritten to remove only the selected project instead of deleting the shared backup container.
- Added v1.4.3 regression coverage for exact prefixed filenames, stale-reconcile resurrection, already-missing durable files, active-project recovery settings, heat-cache cleanup, and shared-backup preservation.
- Heatmap, imagery, GPS, grading math, project-switch reveal timing, and recovery-cover behavior are unchanged.

'''

ANDROID_CHANGELOG_ENTRY='''## 1.4.3 DEV (build 114)

- Fixed durable project deletion so File-ID-prefixed project files, local/index state, and heat caches are removed consistently.
- Prevents deleted projects from reappearing as non-openable ghost rows after folder reconciliation.
- Updates active-project recovery state before deleting the current project and preserves shared backup containers.
- No heatmap, imagery, GPS, or grading-math changes.

'''

# Register project-delete ownership before v107's lazy-load capture listener.
defaults=PG/'v096-dev-defaults.js'
text=defaults.read_text(encoding='utf-8')
marker="  window.__padGradeDiagnosticDefaultV096='dev-on-stable-off';\n"
block='''  // v1.4.3: register delete ownership before the v1.0.7 lazy-load capture listener.\n  // The actual handler is supplied by v143-delete-consistency.js after body scripts load.\n  if(!window.__padGradeDeleteCaptureV143){\n    window.__padGradeDeleteCaptureV143=true;\n    document.addEventListener('click',event=>{\n      const btn=event.target?.closest?.('button[data-act="delete"]'),row=btn?.closest?.('[data-id]');\n      if(!row)return;\n      const handler=window.PadGradeDeleteConsistencyV143?.handleDeleteClick;\n      if(typeof handler!=='function')return;\n      event.preventDefault();event.stopImmediatePropagation();handler(event,btn,row);\n    },true);\n  }\n'''
if '__padGradeDeleteCaptureV143' not in text:
    if marker not in text: raise SystemExit('v096 dev-default marker missing')
    text=text.replace(marker,block+marker,1)
defaults.write_text(text,encoding='utf-8')

# Load the v1.4.3 deletion handler after established body modules and advance the visible DEV version.
index=PG/'index.html'
text=index.read_text(encoding='utf-8')
if '<title>Pad Grade Mapper v1.4.2 DEV</title>' not in text: raise SystemExit('expected v1.4.2 index title missing')
text=text.replace('<title>Pad Grade Mapper v1.4.2 DEV</title>','<title>Pad Grade Mapper v1.4.3 DEV</title>',1)
load='<script src="v143-delete-consistency.js?v=20260902-1"></script>\n'
anchor='<script src="v106-map-hitbox.js?v=20260830-1"></script>\n'
if 'v143-delete-consistency.js' not in text:
    if anchor not in text: raise SystemExit('v106 index anchor missing')
    text=text.replace(anchor,anchor+load,1)
index.write_text(text,encoding='utf-8')

# Android DEV version/build.
gradle=ANDROID/'app'/'build.gradle.kts'
text=gradle.read_text(encoding='utf-8')
for old,new in [
    ('// v1.4.2 DEV: unify heat interpolation paths and invalidate ambiguous legacy heat caches.','// v1.4.3 DEV: make project deletion authoritative across durable/local/index state.'),
    ('versionCode = 113','versionCode = 114'),
    ('versionName = "1.4.2"','versionName = "1.4.3"')]:
    if old not in text: raise SystemExit(f'gradle marker missing: {old}')
    text=text.replace(old,new,1)
gradle.write_text(text,encoding='utf-8')

(PG/'RELEASE_NOTES.md').write_text(RELEASE_NOTES,encoding='utf-8')
for path,entry,marker in [
    (PG/'CHANGELOG.md',CHANGELOG_ENTRY,'## v1.4.3 DEV / build 114'),
    (ANDROID/'CHANGELOG.md',ANDROID_CHANGELOG_ENTRY,'## 1.4.3 DEV (build 114)')]:
    old=path.read_text(encoding='utf-8')
    if marker not in old:path.write_text(entry+old,encoding='utf-8')

# Guard against partial versioning or missing runtime ownership.
assert (PG/'v143-delete-consistency.js').is_file()
assert (PG/'v143-delete-consistency-selftest.js').is_file()
assert 'v143-delete-consistency.js?v=20260902-1' in (PG/'index.html').read_text(encoding='utf-8')
assert '__padGradeDeleteCaptureV143' in (PG/'v096-dev-defaults.js').read_text(encoding='utf-8')
assert 'versionCode = 114' in gradle.read_text(encoding='utf-8')
assert 'versionName = "1.4.3"' in gradle.read_text(encoding='utf-8')
assert '## v1.4.3 —' in (PG/'RELEASE_NOTES.md').read_text(encoding='utf-8')
print('Pad Grade v1.4.3 delete-consistency source patch applied')
