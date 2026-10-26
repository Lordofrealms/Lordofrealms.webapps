# Future chat handoff

Read root/app `AGENTS.md`, `PROJECT_STATE.md`, `docs/PLAN.md`, `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/VERIFICATION.md` and `docs/RANKINGS.md`. The owner finished an extensive design discussion; do not ask them to repeat it.

The app is implemented as **0.1.1** under `human-rpg/` on `human-rpg-dev`, tracked by [draft PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109). The separate design-only commit is `e0a56efee379e066ad1c084f9ab4ef19870f732d`, created before source implementation. Confirm the remote head and inspect newer work before editing. There is no deployment or merge to main.

The 0.1.1 implementation was pushed as `9aa71706f2a1b8c04d333c842000b79d49359e36`; this later documentation checkpoint records delivery. All 37 PR paths are inside the app directory. The PR body describes the implemented app, compatibility and actual validation limits. The earlier 0.1.0 implementation was `0f74d14a4114b17fea9c1bb6fd49ed5b5b9ce645`.

## Accepted rules

Fifty ranks; 20s accomplished amateur, 30 expert/local wins, 40 national leaders, 50 sustained historic world-best regardless of age group. XP doubles and character thresholds are 50× skill thresholds. Promotions need XP and a challenge; reveal the rubric after first claimed completion. Passed gateways persist. Current XP decays at the minimum current-rank task award, with the next-lower-rank floor and one demotion per three inactive calendar months, caught up through long absences. Character XP/credits do not decay. Late entries earn half base XP with no bonuses.

Ten gear slots; full cooldown item/slot locks with warnings. Every five character levels gives a free attribute point. Combined legendary ranks grant rewards; apply only the strongest single bonus per target; finite cascades can reach other skills without creating XP. Permissions use total personal income: L10 .2%, L20 1%, L30 10%, L40 50%, L50 100%; L1 .005% is the recorded default. Promotion permissions are extra to the credit store and do not imply ownership.

## Working map

- `catalog.js`: skills, categories, classes, rank/challenge/reward content.
- `engine.js`: pure BigInt XP, projections, quests, gear, reward ledgers, validation.
- `storage.js` / `archive.js` / `checksum.js`: atomic IndexedDB media saves, ZIP/JSON backup/recovery, CRC/SHA-256.
- `benchmarks.js`: CDC and SCF values with cohort limits.
- `rankings.js`: 53-source registry, all-skill coverage, rowing/swimming calculators.
- `app.js` / `style.css` / `index.html`: screens/forms.
- `sw.js` / `manifest.webmanifest`: scoped offline assets/installation metadata.
- `tests/`: 45 Node tests, isolated browser persistence/large-photo checks and generated photo UI fixture.

## 0.1.1 continuation

The ZIP/media checkpoint is committed at `9aa71706f2a1b8c04d333c842000b79d49359e36` on the existing draft PR. Confirm the remote head before starting new work; this documentation checkpoint follows the implementation commit. Follow `docs/BACKUPS.md` for compatibility: old data-URL photos are untouched; new Blob records and their journal references share one transaction. ZIP/Blob readers require 0.1.1+. Downgrade through a saved legacy JSON export/restore within 100 MiB; do not directly downgrade a database with new photos.

Raw repair ZIP includes both current and pre-restore states/photos (2 GiB / 20,000 records) and maps original IDs. It is intentionally not accepted by normal restore. No automatic reset or photo deletion is implemented.

Current browser evidence: 13 small persistence checks plus two 108 MiB checks; photo viewer decoded the original pixel through production UI; mobile backup preparation fit a 390 px iframe (375 px document width with scrollbar). The visible download link is prepared correctly, but Cloud Browser download operations timed out even on small files. **Do not claim OS file saving passed.** Verify it on target browsers before release. Independent Python ZIP extraction/checksums and the actual 0.1.0 legacy reader passed on generated local fixtures. `lastBackupAt` is shown as “Last backup prepared,” not proof of a saved file.

The UI photo fixture uses production app/storage copies with isolated DB/channel imports. It generates its own photo; no upload or real character data is involved. The `$$` collection selector in `hydratePhotos` matters: using `$` there throws instead of rendering photos.

## Next work

Run `npm run check` and `npm test` from the app folder; last result 45/45 pass. See the verification log for browser evidence. Preserve the form dispatch fix using `getAttribute('id')`: an input named `id` shadows the form's ID property. Stale writes are blocked and damaged stored state is never replaced by a blank character. Backups preserve photos and a pre-restore recovery copy.

**Do not trigger another Cloud Browser file-upload approval.** The owner challenged two repeated prompts. Picker UI testing remains pending; generated in-page photo-byte backup/restore tests passed. Preserve this distinction.

Next release gates: HTTPS PWA/offline/update verification and physical mobile tests; file-picker flow only through an appropriate, separately authorized testing arrangement. Next content work: richer challenges and defensible numeric datasets. The 194 mapped skills are not 194 percentile calculators. Normal backups now use ZIP (1 GiB format limit); legacy JSON remains capped at 100 MiB. Browser save/restore passed with 108 MiB of generated photo bytes; 1 GiB and quota exhaustion are not tested.

Maintain single-digit X.Y.Z versions and app-only scope. Warn in-app before restore/correction/commitment/ability actions with consequences. Source belongs in this GitHub repo: no separate Sites project or Library duplicate. `dist/` and `.openai/` are preview-only and ignored. Only synthetic screenshot evidence belongs in docs, never character backups or personal photos.
