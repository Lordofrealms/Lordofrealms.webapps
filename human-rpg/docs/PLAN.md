# Implementation plan and completion evidence

Update this file after each meaningful checkpoint. Do not mark a phase complete merely because files exist.

## P0 — Preserve the design before coding
- [x] Inspect existing repository and root instructions.
- [x] Record the accepted rules, superseded proposals, and adjustable defaults.
- [x] Create ordered implementation plan, project state, and future-chat handoff.
- [ ] Commit this documentation alone to the development branch before application code.

## P1 — Exact progression and accounting engine
- [ ] Exact 50-level XP thresholds, activity difficulty, class/equipment multipliers, half-XP late logs.
- [ ] Assessment baseline, gateway progression/recovery, composite character progression and attribute points.
- [ ] Calendar-based daily decay, XP floor, chronological three-month demotions and history.
- [ ] Income reward interpolation at accepted anchors, integer credits and separate purchase permissions.
- [ ] Unique reward ledger, non-stacking legendary resolution, finite cascade handling.
- [ ] Equipment effects/locked slots, cooldowns, conditional same-day bonuses.
- [ ] Open/timed/commitment quests, stakes, deadlines and idempotent completion.
- [ ] Meaningful invariant tests with boundary and adversarial cases.

## P2 — Data and persistence
- [ ] App-scoped IndexedDB, full catalog records, transaction/error handling, revision conflict protection.
- [ ] Backup export/import validation, staged restore, recovery snapshot, photos included.
- [ ] Activity/measurement/attempt ledger and reversible corrections.
- [ ] Profile/date/units, save/backup indicators, persistence request.

## P3 — Content and benchmarks
- [ ] Broad skill/category catalog with specialties, attributes, classes, and meaningful practice tasks.
- [ ] Fifty-rank challenge framework with choices, concealed rubrics, high-rank achievement constraints.
- [ ] Curated representative challenge ladders and honest editorial coverage labels.
- [ ] Gear variants, active effects, shop inventory, milestone purchase suggestions.
- [ ] Goal templates for strengths/weaknesses/balance and user-created quests.
- [ ] Source registry with implemented comparisons, cohort/method limitations and data gaps.
- [ ] Benchmark data checks; unsupported population ranks stay unavailable.

## P4 — Responsive application
- [ ] Quick Start / Full Assessment / later assessment / editable interests and class.
- [ ] Character dashboard, attributes, progress, current/peak/effective rank distinction.
- [ ] Searchable full skill catalog, details, activity logging and promotion attempt flow.
- [ ] Quest board, goals, deadlines, commitment acceptance and completion.
- [ ] Equipment paper doll, inventory choices, buffs, locks and confirmation.
- [ ] Credit shop, extra purchase permissions and redemption history.
- [ ] Measurement trends, supported comparisons and transparent source details.
- [ ] Milestone journal with photos and history/backup settings.
- [ ] Responsive/mobile navigation, accessible dialogs/forms, app install/offline assets.

## P5 — Verify and review
- [ ] Engine/accounting tests and source/syntax checks pass.
- [ ] Browser desktop/mobile checks: onboarding, log, promotion rubric, rewards, gear, quests.
- [ ] Reload and export/restore including photo data; invalid backup leaves original untouched.
- [ ] Lock and stake warnings visible before actions; multi-tab conflict/save failures handled.
- [ ] Source data and labels reviewed; no invented percentiles or hidden personal uploads.
- [ ] Record verification evidence and known limitations in `PROJECT_STATE.md`/`HANDOFF.md`.

## P6 — Repository delivery
- [ ] Commit working source and updated documents to isolated development branch.
- [ ] Create reviewable PR with changes, validation and limits.
- [ ] Confirm remote tree/commit and provide repository links.
- [ ] Record publication state accurately; do not call an unmerged branch a live Pages deployment.

## Future phases (not initial delivery)
- Expand independently reviewed high-level discipline-specific standards and datasets.
- Import/test representative weighted SCF/Census distributions for defensible detailed percentiles.
- Expand training/outcome integrations, custom catalog authoring and optional export formats.
- Partner agreements, accounts/consent, verified tracking, server-side redemption and anti-duplication.
- Optional multi-device synchronization if explicitly requested later.

## Working convention

Each checkpoint records the commit/branch, completed steps, actual test results, unresolved defects, and exact next action. Never restart from chat memory when these files exist.
