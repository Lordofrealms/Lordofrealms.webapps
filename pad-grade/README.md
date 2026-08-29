# Pad Grade Mapper

Pad Grade Mapper is an Android/web grading and survey-planning tool. The `main` branch is the stable release line; active development continues on `pad-grade-dev`.

## Development test status

The current `pad-grade-dev` line is v0.9.6. It includes local diagnostic timing logging (default on for DEV), asynchronous durable-folder recovery/persistence work, authoritative worker-based lower-grid sizing, and earlier project-map grid refreshes. v0.9.6 remains a device-test build; after reproducing any remaining slow startup or project switch, export the diagnostic log from **Settings → Advanced Settings** before stable promotion.

## Feature test status

As of the v0.7.5 stable promotion, the following features are implemented but have **not yet been field-tested**:

- **Metric units**
- **Feet and tenths**
- **Laser-avoidance pathing**

These features are included in the stable build, but should be treated as unverified until field testing is completed.
