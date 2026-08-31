# Pad Grade Mapper v1.2.2 — DEV BUILD

## v1.2.2 — development build

### Fixed — direct completed-canvas heat presentation
- Field diagnostics from v1.2.1 confirmed that same-frame ImageSource request deduplication was working, but the first large local PNG data-URL image still never completed loading in MapLibre. The heat canvas itself was already fully populated, so the remaining failure was in the URL/decode presentation path rather than raster generation.
- v1.2.2 bypasses that URL/decode path. A completed worker/cache canvas is copied synchronously into a private static canonical canvas used by the single permanent MapLibre heat source.
- The existing canonical WebGL texture is refreshed in place after the completed canvas copy. Resolution changes no longer require removing or recreating the real heat source or raster layer.
- The previously committed complete heat frame remains visible until the replacement frame is fully ready. There is no intentional crossfade and no blank handoff between 99 / 297 / 891 resolution tiers.
- v1.2.1 remains in the repository for history/regression coverage but is runtime-suppressed by v1.2.2.

### Diagnostics / regression coverage
- Added a no-flicker regression gate that performs 250 same-frame update attempts and verifies zero source recreation, zero layer recreation, and zero unnecessary texture re-upload.
- Added tier-swap coverage proving a 99 → 297 replacement reuses the same canonical source and layer.
- Added same-dimension changed-pixel coverage proving that a genuinely changed completed canvas still triggers exactly one texture refresh.
- Existing Pad Grade startup, grid, storage, project comparison, recovery, and Android packaging regression suites remain required for the build.

### Changed
- Active heat presentation moves to the v1.2.2 direct completed-canvas path while preserving the existing worker calculations, cached completed rasters, IDW² interpolation, measured-point/color-scale behavior, project schema, grid geometry, and Project Comparison math.
- Android DEV package is **version 1.2.2 / build 94** and installs separately from the stable Pad Grade package.

### DEV verification
- Open a project with heat data and confirm the heat map becomes visible.
- Switch **Auto → 99 → 297 → 891 → Auto** and watch specifically for any bare-map flash, blank frame, dark overlap, or flicker during tier replacement.
- Open Project Comparison and confirm its heat map also appears and replaces completed tiers without recreating the visible heat source/layer.
- If a heat problem remains, export a diagnostic log from this v1.2.2 build before changing versions so the new presentation path can be identified unambiguously.
