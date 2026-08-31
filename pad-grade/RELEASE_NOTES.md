# Pad Grade Mapper v1.2.3 — DEV BUILD

## v1.2.3 — development build

### Fixed — Auto/manual heat-map color consistency
- v1.2.2 field testing confirmed that the no-flicker direct-canvas presentation works, but the DEV resolution inspector could display an older completed 99 / 297 / 891 raster while **Auto** had already advanced to a newer raster of the same nominal tier.
- The diagnostic proved this was real pixel-data divergence, not MapLibre scaling: manual 891 and Auto 891 were both 750×891 yet encoded to different PNG sizes.
- v1.2.3 captures the exact completed canvases used by the regular/Auto path and binds the 99 / 297 / 891 picker to those same canvases. The picker no longer relies on an independently stale inspector raster when an exact Auto tier is available.
- If a newer regular tier finishes while that manual tier is selected, the inspector virtual source is rebound to the new completed canvas immediately.
- Exact-tier captures are cleared at the project-switch boundary so an outgoing project's raster cannot be reused by the next project.

### No-flicker behavior retained
- The v1.2.2 permanent canonical heat source/layer is unchanged.
- Inspector rebinding only replaces v1.2.0 virtual inspector inputs; it does **not** remove or recreate the canonical MapLibre source or raster layer.
- The previously committed complete image remains visible until the replacement completed canvas is ready, with zero intentional crossfade.

### Diagnostics / regression coverage
- Added `heatmap.v123-auto-tier-captured`, `heatmap.v123-inspector-bound-to-auto-tier`, `heatmap.v123-tier-cache-cleared`, and bind-failure diagnostics.
- Added a regression test proving manual 891 receives the exact same canvas object as Auto 891, refreshes when a newer same-tier Auto canvas completes, does not leak an old-project canvas across a project switch, and never removes the canonical source/layer.
- Existing v1.2.2 no-flicker and Android regression gates remain required.

### Other field-log findings
- No v1.2.2 heat presentation failure/timeout, renderer crash, heat worker crash, or heat-cache read/install/write failure was present in the supplied test log.
- Long-task/timer-lag diagnostics remain visible under heavy work. On the tested device the final 891 worker calculation can take roughly 24 seconds, but it remains off-thread and no longer causes a blank heat transition.

### Changed
- Android DEV package is **version 1.2.3 / build 95** and installs separately from stable.

### DEV verification
- Open the same project used for v1.2.2 testing and let Auto reach 891.
- Switch **Auto → 99 → 297 → 891 → Auto**. Resolution should change shape/detail as expected, but a manual tier and Auto at that same completed tier should have the same color field.
- Repeat 891 ↔ Auto after the final Auto 891 finishes and confirm there is no visible color jump and no flicker.
