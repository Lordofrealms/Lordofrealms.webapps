# Human RPG 0.1.0

A local-first life RPG for desktop and mobile browsers, built under `human-rpg/` in `Lordofrealms/Lordofrealms.webapps`. Development is on `human-rpg-dev` in [draft PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109). It has not been merged or deployed.

## Implemented

- 204 skills in 14 categories, custom skills, editable interests/classes, Quick Start and optional assessment.
- Fifty ranks per skill, exact doubling XP thresholds, promotion challenges with rubrics revealed after the attempt, and a milestone journal with optional local photos.
- Current-skill decay, permanent character XP, free attribute points every five character levels, and separate Reward Credits.
- Ten equipment slots, gear choices, passive effects, active abilities with full cooldown slot locks, and non-stacking legendary reward cascades.
- Open, timed and commitment quests, meaningful task difficulty, credit stakes and audited corrections.
- A credit shop and extra promotion purchase permissions scaled to total annual personal income. These record self-funded rewards; no payment is made.
- Life measurements, sourced comparisons, ranking evidence records and a complete source/gap register.
- IndexedDB persistence, revision conflict protection, full JSON backups including photos, validation before restore and a recoverable pre-restore copy.

## Run and verify

No dependencies or compilation are required. Serve this directory over HTTP for development, for example `python3 -m http.server 8000` from this directory. Use HTTPS or localhost to test service workers and installation; opening `index.html` through `file:` is not supported.

With Node 20 or later:

```sh
npm run check
npm test
node scripts/write-ranking-register.mjs
```

The suite currently has **35 passing tests**. Actual browser checks and remaining limits are in [docs/VERIFICATION.md](docs/VERIFICATION.md). The `scripts/prepare-browser-tests.mjs` helper prepares an isolated persistence harness in an existing `dist/` preview; it does not change the app's database.

## Ranking coverage

[docs/RANKINGS.md](docs/RANKINGS.md) covers every catalog skill. There are 53 researched primary skill sources: 194 skills have a ranking, standard, record or explicitly related reference; 10 have documented research gaps. These counts do **not** imply 194 population percentile calculators.

Local calculations support published CDC BMI/waist percentile bands by available age/sex cohorts, Federal Reserve family net-worth medians by age, a frozen Concept2 2,000 m participant distribution, and World Aquatics short-course swimming points. Competition results and qualifications remain distinct from general-population ranks. Most high-rank challenge objectives are editorial templates, not independently reviewed discipline-specific standards.

## Local data and recovery

The app uses no account, analytics, external fonts or CDN and makes no automatic external requests for personal data. Reference links open only when selected. Export backups regularly and before moving devices or clearing site data. Persistent storage is a browser request, not protection against device loss.

Restore replaces the character, previews what will change and retains one pre-restore recovery copy. `Undo last restore` can switch back; export an independent copy beforehand if newer progress matters. Invalid backups leave the current character intact. The checksum detects corruption, not deliberate tampering. Photos are limited to 12 MB each and full backups to 100 MB in this initial version.

## Continue development

Read root/app `AGENTS.md`, [PROJECT_STATE.md](PROJECT_STATE.md), [HANDOFF.md](HANDOFF.md), [docs/PLAN.md](docs/PLAN.md), [docs/DESIGN.md](docs/DESIGN.md), and [docs/DECISIONS.md](docs/DECISIONS.md). The accepted design was committed before implementation in `e0a56efee379e066ad1c084f9ab4ef19870f732d`. Actual character backups and personal photos do not belong in GitHub. This preview contains synthetic test data only.

![Human RPG desktop preview with synthetic test data](docs/preview-desktop.jpg)
