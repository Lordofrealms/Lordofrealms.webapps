# Human RPG project state

Updated: 2026-10-23 (America/Chicago).

- Repository: `Lordofrealms/Lordofrealms.webapps`; path `human-rpg/`.
- Branch: `human-rpg-dev`; [draft PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109).
- Base main: `efd9e88818e55cf184218856d5f2d74a1295a952`.
- Design-before-code checkpoint: `e0a56efee379e066ad1c084f9ab4ef19870f732d`.
- Version: **0.1.0**. Initial implementation complete for review; publication is separate.
- Deployment: none. Other webapps and their storage are unchanged.

## Implemented and checked

P1–P4 are implemented: exact XP/progression, decay, assessments/gateway rewards, attributes, classes, quests/stakes, equipment/cooldown locks, legendary cascades, credit shop, income-scaled purchase permissions, local database, photos/recoverable backups, responsive UI, measurements and ranking evidence. See `docs/PLAN.md` for the checklist.

Catalog: 204 skills in 14 categories; 53 primary ranking/standards/context sources map to 194 skills, with 10 explicit gaps. `docs/RANKINGS.md` lists all 204 and distinguishes source types. Numerical support includes CDC body-measurement bands, SCF family medians, Concept2 participant brackets and World Aquatics swimming points. No automatic rank-to-RPG-level conversions or external account integrations are claimed.

Validation: **35 tests pass, zero failures**; production modules pass syntax checks. Browser checks passed for onboarding, assessment, logging, concealed-then-revealed rubric, prerequisite gear, ability warnings/locks, quest completion/stake warnings, ranking calculators, reload persistence, mobile navigation/search/interests at 390 px, cross-tab conflict notification, and a downloadable 204-skill backup verified by the independent reader. Isolated browser tests passed photo-byte roundtrip, atomic restore, recovery copy, stale-write rejection, checksum rejection without replacement, and damaged-state recovery. Details: `docs/VERIFICATION.md`.

## Remaining work

1. **File-picker UI attachment/import testing is deliberately pending.** The owner objected to repeated browser upload permission requests. Do not repeat them. Generated in-page photo data exercised storage/backup internals; this is distinct from a picker UI test.
2. HTTPS service-worker install/offline/update lifecycle, physical iOS/Android tests, assistive-technology audit and browser storage-quota exhaustion remain unverified.
3. Expand discipline-specific challenges beyond the six curated starter ladders: cooking, baking, running, hiking, programming and sales. Levels 30–50 use explicitly editorial evidence-oriented standards.
4. Add further validated numeric datasets, including representative weighted income/wealth distributions. Competition links and proficiency frameworks are evidence, not invented population ranks.
5. Media management or a larger/streamed archive is needed before lifetime photo collections exceed the initial 100 MB backup limit. No photo deletion control is shipped.

## Delivery checkpoint

The implementation commit and subsequent documentation checkpoint on `human-rpg-dev` are the source of truth. Confirm PR head before continuing; never force-push over an unreviewed newer head. Keep this PR draft while release verification remains outstanding. No live Pages URL is claimed.
