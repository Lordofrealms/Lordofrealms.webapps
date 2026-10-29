# Future chat handoff

Read root/app `AGENTS.md`, `PROJECT_STATE.md`, `docs/PLAN.md`, `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/VERIFICATION.md`, `docs/RANKINGS.md` and `docs/CHALLENGES.md`. The owner finished an extensive design discussion; do not ask them to repeat it.

## Pause instruction — 2026-10-28

**Stop app implementation until the owner returns after finishing the 1000 Steps book.** The book has its own GitHub repository and must not be worked on here. Later use its completed results as input for relevant RPG skills, prerequisites, tasks, assessments and milestones. Preserve source chapter/step IDs and distinguish book-derived content from areas the book does not cover; XP/reward balance and outside ranking evidence still need their own validation.

`human-rpg-dev` contains an unfinished **0.1.3** checkpoint based on `719062bd56c3e9697032a11243072a4cfd713fa3`. It adds `skill-profiles.js` (204 profiles, six capabilities each), `curriculum.js` (prototype presets, assessment estimates and anchor-based challenges), and partial engine integration. `app.js` still has the old assessment/logging forms. New logic, balance, imports and browser behavior are not validated by the historical 55-test result. Do not merge or publish this checkpoint. See `docs/CONTENT-REVISION.md` before resuming. There are no new built-in skill IDs and no database reset/migration.

The app is published as **0.1.2** for early review at **[Human RPG on GitHub Pages](https://lordofrealms.github.io/Lordofrealms.webapps/human-rpg/)**. [PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109) merged into `main` as `c7ba445328029e81ec4913ee70de28652ca76721`. Existing Pages [run 40609886604](https://github.com/Lordofrealms/Lordofrealms.webapps/actions/runs/40609886604) succeeded, and the public onboarding screen showed 0.1.2. The separate design-only commit is `e0a56efee379e066ad1c084f9ab4ef19870f732d`, created before source implementation. Confirm remote heads and inspect newer work before editing. Future implementation needs a new PR; preserve app-only scope.

The repository is public and Pages deploys from `main`; no new hosting project or setting was needed. Temporary-preview data does not automatically transfer to the live origin. Leave any user-entered preview progress available for export and restore. `docs/preview-live-0.1.2.jpg` shows the public empty onboarding screen. An online HTTPS load is not an offline/update-lifecycle test; remaining verification below still applies.

The 0.1.2 implementation was pushed and verified as `bc9212c3646772ff379285dd63c50089ea16f788`: all 22 changed file blobs matched locally and all 44 PR paths stayed inside the app. This documentation checkpoint follows it. Prior implementation checkpoints: 0.1.1 `9aa71706f2a1b8c04d333c842000b79d49359e36`; 0.1.0 `0f74d14a4114b17fea9c1bb6fd49ed5b5b9ce645`.

## Accepted rules

Fifty ranks; 20s accomplished amateur, 30 expert/local wins, 40 national leaders, 50 sustained historic world-best regardless of age group. XP doubles and character thresholds are 50× skill thresholds. Promotions need XP and a challenge; reveal the rubric after first claimed completion. Passed gateways persist. Current XP decays at the minimum current-rank task award, with the next-lower-rank floor and one demotion per three inactive calendar months, caught up through long absences. Character XP/credits do not decay. Late entries earn half base XP with no bonuses.

Ten gear slots; full cooldown item/slot locks with warnings. Every five character levels gives a free attribute point. Combined legendary ranks grant rewards; apply only the strongest single bonus per target; finite cascades can reach other skills without creating XP. Permissions use total personal income: L10 .2%, L20 1%, L30 10%, L40 50%, L50 100%; L1 .005% is the recorded default. Promotion permissions are extra to the credit store and do not imply ownership.

## Working map

- `catalog.js`: skills/classes/gear/rewards and the immutable legacy challenge generator.
- `challenges.js`: twenty expanded paths, 580 concrete objectives and discipline evidence context.
- `engine.js`: pure BigInt XP, projections, quests, gear, reward ledgers, validation.
- `storage.js` / `archive.js` / `checksum.js`: atomic IndexedDB media saves, ZIP/JSON backup/recovery, CRC/SHA-256.
- `benchmarks.js`: CDC and SCF values with cohort limits.
- `rankings.js`: 53-source registry, all-skill coverage, rowing/swimming calculators.
- `app.js` / `style.css` / `index.html`: screens/forms.
- `sw.js` / `manifest.webmanifest`: scoped offline assets/installation metadata.
- `tests/`: 55 Node tests, isolated browser persistence/large-photo checks and generated photo UI fixture.

## 0.1.2 continuation

The expanded challenge checkpoint is committed at `bc9212c3646772ff379285dd63c50089ea16f788` and was included in merged PR #109. Read the current remote heads before new work. Continue from published `main` or a development branch synchronized with it, and open a new PR for future implementation.

`startAttempt` saves a format-1 challenge snapshot. Always use `attemptChallenge` for existing attempts; never regenerate them with the current catalog. Pre-0.1.2 attempts have no snapshot and must keep the exact legacy generator. The read-only roadmap uses the current catalog and never includes the scoring rubric. Do not change `legacyChallengeFor` or its original starter arrays. Snapshot validation is part of backup validation. Review/score new attempts in 0.1.2+; older builds may display the wrong challenge terms. No migration/reset is required.

Twenty paths cover all fourteen categories; the remaining 184 built-in skills still use general frameworks. Upper-level milestones remain editorial, not independently validated numerical cutoffs. Source notes distinguish competition, qualification, participant and population evidence. Regenerate `docs/CHALLENGES.md` with `node scripts/write-challenge-register.mjs` after content changes.

Browser fixture `qa/challenge-ui.html` uses production UI/storage copies with fixed isolated DB/channel `human-rpg-challenge-ui-v012`; it seeds once, so reload tests persistence. `qa/challenge-mobile.html` embeds it at 390 px. No file upload/picker is needed. The browser flow passed first-claim reveal, reload, prerequisite rewards, legacy continuity, roadmap anchors and mobile/Escape behavior. See verification for exact evidence.

## Earlier 0.1.1 checkpoint

The ZIP/media checkpoint is committed at `9aa71706f2a1b8c04d333c842000b79d49359e36` and was included in merged PR #109. Follow `docs/BACKUPS.md` for compatibility: old data-URL photos are untouched; new Blob records and their journal references share one transaction. ZIP/Blob readers require 0.1.1+. Downgrade through a saved legacy JSON export/restore within 100 MiB; do not directly downgrade a database with new photos.

Raw repair ZIP includes both current and pre-restore states/photos (2 GiB / 20,000 records) and maps original IDs. It is intentionally not accepted by normal restore. No automatic reset or photo deletion is implemented.

Current browser evidence: 13 small persistence checks plus two 108 MiB checks; photo viewer decoded the original pixel through production UI; mobile backup preparation fit a 390 px iframe (375 px document width with scrollbar). The visible download link is prepared correctly, but Cloud Browser download operations timed out even on small files. **Do not claim OS file saving passed.** Verify it on target browsers before release. Independent Python ZIP extraction/checksums and the actual 0.1.0 legacy reader passed on generated local fixtures. `lastBackupAt` is shown as “Last backup prepared,” not proof of a saved file.

The UI photo fixture uses production app/storage copies with isolated DB/channel imports. It generates its own photo; no upload or real character data is involved. The `$$` collection selector in `hydratePhotos` matters: using `$` there throws instead of rendering photos.

## When the owner resumes

First read the completed book's own status and outputs in its repository. Map applicable steps to stable RPG skills and specialties, prerequisites, concrete tasks, gateway evidence and assessment questions. Audit coverage and gaps before continuing the prototype. Do not assume the book covers every sport, art, language or personal-life skill.

Run `npm run check` and `npm test` from the app folder; last result 55/55 pass. See the verification log for browser evidence. Preserve the form dispatch fix using `getAttribute('id')`: an input named `id` shadows the form's ID property. Stale writes are blocked and damaged stored state is never replaced by a blank character. Backups preserve photos and a pre-restore recovery copy.

**Do not trigger another Cloud Browser file-upload approval.** The owner challenged two repeated prompts. Picker UI testing remains pending; generated in-page photo-byte backup/restore tests passed. Preserve this distinction.

Next release gates: HTTPS PWA/offline/update verification and physical mobile tests; file-picker flow only through an appropriate, separately authorized testing arrangement. Next content work: richer challenges and defensible numeric datasets. The 194 mapped skills are not 194 percentile calculators. Normal backups now use ZIP (1 GiB format limit); legacy JSON remains capped at 100 MiB. Browser save/restore passed with 108 MiB of generated photo bytes; 1 GiB and quota exhaustion are not tested.

Maintain single-digit X.Y.Z versions and app-only scope. Warn in-app before restore/correction/commitment/ability actions with consequences. Source belongs in this GitHub repo: no separate Sites project or Library duplicate. `dist/` and `.openai/` are preview-only and ignored. Only synthetic screenshot evidence belongs in docs, never character backups or personal photos.
