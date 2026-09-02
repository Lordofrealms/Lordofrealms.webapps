# Pad Grade Mapper v1.4.4 — STABLE

## v1.4.4 — what changed since v1.4.0

Pad Grade v1.4.4 promotes the field-tested improvements made since the previous stable release, **v1.4.0**. The main changes are more reliable project-file handling and consistent heat-map interpolation.

### More reliable projects
- Persistent project folders are checked for duplicate project/File IDs during restoration and repaired automatically before normal project loading continues.
- Deleting a project now removes it consistently from saved storage and the project list, preventing deleted projects from returning as unusable “ghost” entries.
- Copied projects with the six-character human-readable filename prefix are deleted using their real saved filename.
- Already-missing project files can still have their stale Project Manager entry cleaned up normally.

### Consistent heat maps
- Foreground, background, and cached heat maps now all use the same nearby triangle/rectangle interpolation rules. A project should no longer look different merely because one heat map came from a background/cache path and another was freshly regenerated.
- Older heat-map caches with ambiguous interpolation history are automatically discarded and rebuilt once when needed. Your project measurements are not changed.
- Project switching now retires obsolete completed heat state in addition to cancelling old computation, reducing unnecessary stale heat activity after a switch.
- The existing progressive **99 → 297 → 891** generation, parallel processing, and complete-frame/no-flicker presentation are preserved.

### Better diagnostic history
- Optional diagnostic history now retains up to **50,000 entries**, making longer troubleshooting sessions easier to capture.
- Diagnostic logging still defaults **off** in the stable app unless you have explicitly enabled it.

### What has not changed
- These fixes do not change survey readings, target/grade calculations, earthwork-volume calculations, GPS geometry, aerial imagery, or normal map reveal timing.

### Stable release
- Stable Android version: **v1.4.4 build 115**.
- Stable package: `com.lordofrealms.padgrade`.
- DEV remains separately installable as `com.lordofrealms.padgrade.dev`.
