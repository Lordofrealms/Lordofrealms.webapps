# Human RPG project state

Updated: 2026-10-28 (America/Chicago).

## Paused by owner — book first

The owner chose to finish the **1000 Steps book** in its own repository, then return to Human RPG and use the book's results as input for relevant skill content. Do not work on that book here. Do not continue RPG implementation until the owner resumes it. No book repository was opened or changed for this checkpoint.

Published app: **0.1.2**. Development branch: **unfinished 0.1.3**, based on `719062bd56c3e9697032a11243072a4cfd713fa3`. This checkpoint preserves work in progress only; it is not merged or deployed. Read `docs/CONTENT-REVISION.md` for exact completed/remaining work. The 55-test result below applies to 0.1.2, not this partial revision.

- Repository: `Lordofrealms/Lordofrealms.webapps`; path `human-rpg/`.
- Published branch: `main`; [PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109) merged as `c7ba445328029e81ec4913ee70de28652ca76721`. Development branch: `human-rpg-dev`.
- Original base main: `efd9e88818e55cf184218856d5f2d74a1295a952`.
- Design-before-code checkpoint: `e0a56efee379e066ad1c084f9ab4ef19870f732d`.
- Latest implementation checkpoint: `bc9212c3646772ff379285dd63c50089ea16f788` (0.1.2; 44 total PR paths, all within `human-rpg/`).
- Previous implementation checkpoint: `9aa71706f2a1b8c04d333c842000b79d49359e36` (0.1.1; 37 total PR paths, all within `human-rpg/`).
- Initial 0.1.0 implementation: `0f74d14a4114b17fea9c1bb6fd49ed5b5b9ce645`.
- Version: **0.1.2**, published for early review. Remaining verification is listed below.
- Deployment: **[GitHub Pages](https://lordofrealms.github.io/Lordofrealms.webapps/human-rpg/)**. The existing Pages deployment from `main` succeeded in [run 40609886604](https://github.com/Lordofrealms/Lordofrealms.webapps/actions/runs/40609886604). Other webapps and their storage are unchanged.

## Public review checkpoint

On 2026-10-27 (America/Chicago), PR #109 was made ready and merged at its verified head `d3a6746c7be1a604e34619756321e041c248c184`. The resulting merge is `c7ba445328029e81ec4913ee70de28652ca76721`. GitHub Pages completed successfully; the public HTTPS URL rendered the onboarding screen, 204-skill count, Quick Start and assessment actions, and version 0.1.2. `docs/preview-live-0.1.2.jpg` records that empty onboarding screen. No personal character data was entered.

No application code, hosting settings or storage format changed for publication. The successful online load does not establish offline/update lifecycle or the other pending checks. Temporary-preview progress stays at its original browser origin until explicitly exported/restored. Future implementation needs a new PR; #109 is closed and merged.

## Published 0.1.2 — implemented and checked

P1–P4 are implemented: exact XP/progression, decay, assessments/gateway rewards, attributes, classes, quests/stakes, equipment/cooldown locks, legendary cascades, credit shop, income-scaled purchase permissions, local database, photos/recoverable backups, responsive UI, measurements and ranking evidence. See `docs/PLAN.md` for the checklist.

Catalog: 204 skills in 14 categories; 53 primary ranking/standards/context sources map to 194 skills, with 10 explicit gaps. `docs/RANKINGS.md` lists all 204 and distinguishes source types. Numerical support includes CDC body-measurement bands, SCF family medians, Concept2 participant brackets and World Aquatics swimming points. No automatic rank-to-RPG-level conversions or external account integrations are claimed.

Validation: **55 tests pass, zero failures**; production modules pass syntax checks. Browser checks passed for onboarding, assessment, logging, concealed-then-revealed rubric, prerequisite gear, ability warnings/locks, quest completion/stake warnings, ranking calculators, reload persistence, mobile navigation/search/interests at 390 px, cross-tab conflict notification, and a downloadable 204-skill backup verified by the independent reader. Isolated browser tests passed photo-byte roundtrip, atomic restore, recovery copy, stale-write rejection, checksum rejection without replacement, and damaged-state recovery. Details: `docs/VERIFICATION.md`.

## Remaining work

1. **File-picker UI attachment/import testing is deliberately pending.** The owner objected to repeated browser upload permission requests. Do not repeat them. Generated in-page photo data exercised storage/backup internals; this is distinct from a picker UI test.
2. HTTPS service-worker install/offline/update lifecycle, physical iOS/Android tests, assistive-technology audit and browser storage-quota exhaustion remain unverified.
3. Expand the remaining 184 general challenge frameworks and obtain independent discipline review. Twenty paths now contain 580 concrete objectives through level 29; levels 30–50 retain editorial evidence standards.
4. Add further validated numeric datasets, including representative weighted income/wealth distributions. Competition links and proficiency frameworks are evidence, not invented population ranks.
5. Confirm actual file saving on target browsers: Cloud Browser download waits timed out in this checkpoint. ZIP/JSON preparation, format validation and restore passed; these do not prove OS file saving.
6. Further media management and device-scale testing beyond the 108 MiB verified collection / 1 GiB format limit. No photo deletion control is shipped.

## 0.1.2 checkpoint

Twenty skill paths span all fourteen categories, each with 29 concrete objectives and discipline-specific quality/safety/evidence context. Three approach briefs preserve the same rank standing. The fifty-level roadmap previews XP, gear and current-income purchase permissions without mutations or scoring-criterion exposure. The complete challenge coverage and primary-source limits are in `docs/CHALLENGES.md`.

New attempts snapshot their full definition; old attempts keep the unchanged legacy generator. Pending, scoring and milestone views read the recorded definition. ZIP and JSON preserve it. No schema migration/reset is performed. Use 0.1.2+ to review new attempts; older builds may display older wording despite parsing the backup. Existing permissions remain frozen.

All 55 Node tests and ten production syntax checks pass. Desktop checks covered roadmap/reward anchors, read-only browsing, reference disclosure, live approach preview, reload persistence and the first-claim/pass flow. A 390 px iframe covered legacy rubric continuity, full-width selectors, no horizontal overflow and Escape/focus return. Screenshots and exact limits are in `docs/VERIFICATION.md`.

Source and documentation were pushed as `bc9212c3646772ff379285dd63c50089ea16f788`. All 22 changed file blobs matched the local source/screenshots, and the branch comparison confirmed app-only scope. PR #109 contained 44 app files before publication. The public review checkpoint above supersedes its earlier draft-only delivery status.

## 0.1.1 checkpoint

Full ZIP backups preserve original photo bytes and use per-entry CRC/SHA validation. Normal archives support up to 1 GiB; legacy JSON export remains available up to 100 MiB. New photo blobs and their journal references save atomically. Existing photo records remain untouched. Emergency raw recovery includes current and previous copies, up to 2 GiB. The backup guide explains downgrade and recovery limits; new photos/ZIPs require 0.1.1+.

Thirteen isolated browser checks and two large-collection checks passed, including 108 MiB of original photo bytes, failed-save rollback, atomic restore and recovery. Python independently read the ZIP and checked all hashes. The actual 0.1.0 reader accepted a generated legacy export. The photo viewer and 390 px backup controls worked. Download completion is unverified after Cloud Browser timeouts. The UI now says ready/prepared and offers an explicit file link. `docs/VERIFICATION.md` distinguishes these results from 0.1.0 evidence.

Source and documentation were pushed as `9aa71706f2a1b8c04d333c842000b79d49359e36`. The branch comparison confirmed the app-only 0.1.1 changes and remote package 0.1.1. At that checkpoint the PR had 37 app paths and was draft and unmerged. Publication is recorded above.

## Earlier delivery checkpoint

Implementation commit `0f74d14a4114b17fea9c1bb6fd49ed5b5b9ce645` was pushed and verified remotely. PR #109 was then open, draft, mergeable and unmerged; its description recorded implemented behavior, passing checks and limitations. That initial delivery was not a Pages deployment. Confirm current remote heads before continuing; never force-push over an unreviewed newer head.
