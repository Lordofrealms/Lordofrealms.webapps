# Repository-Wide Design Criteria

These rules apply to every software project in this repository unless the user explicitly overrides a rule for a specific project.

## Version numbering — mandatory

User-facing software versions use exactly three numeric components:

`MAJOR.MINOR.PATCH`

Each component must be a single decimal digit from `0` through `9`.

Do not create a two-digit version component. When a component would advance past `9`, carry to the next component and reset the lower component(s) to `0`.

Examples:

- `0.1.8` -> `0.1.9`
- `0.1.9` -> `0.2.0`
- `0.9.9` -> `1.0.0`

Invalid examples include `0.1.10`, `0.1.0.11`, `1.12.0`, and any other version containing a multi-digit component.

If a platform or security policy needs a separate monotonically increasing integer (for example Android `versionCode`, an OTA anti-downgrade sequence, database schema number, or build number), keep that value separate from the user-facing version. It may be derived deterministically from the three single-digit version components when appropriate, but it must not be appended as a fourth version component.

When changing a release version, update all build, package, CI, signing, release, and documentation authorities that assert or display that version. Do not leave stale artifact names or validation gates using the superseded version.
