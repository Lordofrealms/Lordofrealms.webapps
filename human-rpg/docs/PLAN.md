# Implementation plan and completion evidence

Update this file after each meaningful checkpoint. Do not mark a phase complete merely because files exist.

## P0 — Preserve the design before coding
- [x] Inspect existing repository and root instructions.
- [x] Record the accepted rules, superseded proposals, and adjustable defaults.
- [x] Create ordered implementation plan, project state, and future-chat handoff.
- [x] Commit this documentation alone to the development branch before application code.

## P1 — Exact progression and accounting engine
- [x] Exact 50-level XP thresholds, activity difficulty, class/equipment multipliers, half-XP late logs.
- [x] Assessment baseline, gateway progression/recovery, composite character progression and attribute points.
- [x] Calendar-based daily decay, XP floor, chronological three-month demotions and history.
- [x] Income reward interpolation at accepted anchors, integer credits and separate purchase permissions.
- [x] Unique reward ledger, non-stacking legendary resolution, finite cascade handling.
- [x] Equipment effects/locked slots, cooldowns, conditional same-day bonuses.
- [x] Open/timed/commitment quests, stakes, deadlines and idempotent completion.
- [x] Meaningful invariant tests with boundary and adversarial cases.

## P2 — Data and persistence
- [x] App-scoped IndexedDB, full catalog records, transaction/error handling, revision conflict protection.
- [x] Backup export/import validation, staged restore, recovery snapshot, photos included.
- [x] Activity/measurement/attempt ledger and reversible corrections.
- [x] Profile/date/units, save/backup indicators, persistence request.

## P3 — Content and benchmarks
- [x] Broad skill/category catalog with specialties, attributes, classes, and meaningful practice tasks.
- [x] Fifty-rank challenge framework with choices, concealed rubrics, high-rank achievement constraints.
- [x] Curated representative challenge ladders and honest editorial coverage labels.
- [x] Gear variants, active effects, shop inventory, milestone purchase suggestions.
- [x] Goal templates for strengths/weaknesses/balance and user-created quests.
- [x] Source registry with implemented comparisons, cohort/method limitations and data gaps.
- [x] Benchmark data checks; unsupported population ranks stay unavailable.

## P4 — Responsive application
- [x] Quick Start / Full Assessment / later assessment / editable interests and class.
- [x] Character dashboard, attributes, progress, current/peak/effective rank distinction.
- [x] Searchable full skill catalog, details, activity logging and promotion attempt flow.
- [x] Quest board, goals, deadlines, commitment acceptance and completion.
- [x] Equipment paper doll, inventory choices, buffs, locks and confirmation.
- [x] Credit shop, extra purchase permissions and redemption history.
- [x] Measurement trends, supported comparisons and transparent source details.
- [x] Milestone journal with photos and history/backup settings.
- [x] Responsive/mobile navigation, accessible dialogs/forms, app install/offline assets.

Implementation checks above describe source included in the development branch, not a live deployment. Browser verification is tracked separately below. P0 documentation commit: e0a56efee379e066ad1c084f9ab4ef19870f732d.

## P5 — Verify and review
- [x] Engine/accounting tests and syntax checks pass: 45 tests, zero failures.
- [x] Desktop workflows: onboarding, assessment, log, promotion/rubric, gear rewards, activation lock, quests, comparisons and backup download.
- [x] Mobile-width navigation, skills search and interests form at 390 px; no horizontal overflow in checked views.
- [x] Reload and backup checksum verified; isolated browser photo-byte restore/recovery and invalid-backup rejection passed.
- [x] Lock/stake warnings observed; stale writes rejected in persistence harness and multi-tab conflict notice observed in UI.
- [ ] Actual photo/file-picker attachment and import UI: deliberately pending; do not repeat upload permission requests.
- [ ] HTTPS PWA install/offline/update lifecycle, physical mobile devices, accessibility audit and quota-exhaustion tests.
- [x] Source data and labels reviewed; no invented percentiles or hidden personal uploads.
- [x] Verification evidence and limits recorded in `docs/VERIFICATION.md`, `PROJECT_STATE.md` and `HANDOFF.md`.

## P6 — Repository delivery
- [x] Commit working source and updated documents to isolated development branch: `0f74d14a4114b17fea9c1bb6fd49ed5b5b9ce645`.
- [x] Update draft PR #109 with implemented behavior, validation and limits.
- [x] Verify remote head, package version and all 32 changed paths; repository links recorded in README/state/handoff.
- [x] Publication state recorded accurately: draft branch/PR only, no merge or live deployment.

## Follow-up delivery
### 0.1.1 — Larger photo backups and atomic media saves
- [x] Add standard, uncompressed ZIP backups with per-photo integrity and bounded reads.
- [x] Read existing JSON backups and retain a legacy export for rollback.
- [x] Save new photo blobs and their activity/attempt references in one transaction.
- [x] Reject corrupt, truncated, unsafe, unsupported or incomplete archives before replacement.
- [x] Verify archives above 100 MB, ZIP interoperability, legacy recovery and failed-save rollback.
- [x] Update backup UI, version authorities, verification evidence and durable handoff.
- [x] Push 0.1.1 to the existing draft PR and verify remote package/branch changes: `9aa71706f2a1b8c04d333c842000b79d49359e36`; 37 app-only PR paths.
- [ ] Confirm actual OS file saving on target desktop/mobile browsers; Cloud Browser download waits timed out. Preparation, checksums and storage roundtrips passed independently.

### Later work
- Expand independently reviewed high-level discipline-specific standards and datasets.
- Import/test representative weighted SCF/Census distributions for defensible detailed percentiles.
- Expand training/outcome integrations, custom catalog editing and optional export formats.
- Add media management and further device-scale archive testing beyond the 108 MiB validated browser collection and 1 GiB format limit.
- Partner agreements, accounts/consent, verified tracking, server-side redemption and anti-duplication.
- Optional multi-device synchronization if explicitly requested later.

## Working convention

Each checkpoint records the commit/branch, completed steps, actual test results, unresolved defects, and exact next action. Never restart from chat memory when these files exist.
