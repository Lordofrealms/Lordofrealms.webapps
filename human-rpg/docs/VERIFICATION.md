# Verification record — 0.1.0

Checked 2026-10-22 through 2026-10-23, America/Chicago. All browser records used synthetic characters/test values, never the owner's private health or financial information.

## Automated checks

`npm run check` passes syntax validation for eight production JavaScript modules. `npm test` passes **35 tests, zero failures** under Node 24.

Coverage includes exact level-50 arithmetic; reward anchors; calendar decay/floors/long absences; recovery; late XP; work/class/hiking bonuses; concealed rubric and idempotent prerequisite rewards; non-stacking legendary cascades; character gear; activation consent/locks; quest stakes, expiration, pause, difficulty and audited correction; permanent XP/credits; attributes; frozen permissions; nested state validation; checksum reference vectors; backup/photo-reference rejection; registry coverage and bounded numeric comparisons.

## Browser checks passed

| Area | Observed result |
|---|---|
| Onboarding | Quick Start created 204 zero-level skill records. Full Assessment created an explicitly self-reported Cooking level 5 baseline. |
| Milestones | First completion revealed the rubric. Passing level-5 validation granted five prerequisite gear choices and five extra purchase permissions once. |
| Equipment | Claimed/equipped a level-5 item. Warning described 24-hour effect and 30-day slot lock; activation disabled unequip for that lock. |
| Activity/quests | Logged a running session; completed a one-session open quest with explicit bonus and 0.25 credits. Commitment form disclosed a 0.25-credit stake before acceptance. |
| Rankings | Rowing 475 s matched the snapshot's median participant position. Swimming 44.84 s in the selected men's 100 m free event produced 1,000 points, explicitly not a percentile. |
| Body measurements | BMI 28.6 in female 30–39 reference matched the published median; source/cohort limits appeared. |
| Persistence | Reload retained data within the browser profile. A new isolated browser session correctly began fresh. |
| Backup download | UI exported a backup; the independent reader verified checksum, version, synthetic profile and all 204 baseline records. |
| Mobile | At 390 px, navigation, skills search and interests worked. Root scroll width matched viewport width; interests dialog measured 338 px with no internal horizontal overflow. |
| Multiple tabs | Saving interests in the mobile frame warned the older desktop tab to reload before changes. Reload recovered the current save. |

`preview-desktop.jpg` contains synthetic QA data. A clipped mobile screenshot attempt timed out; DOM width measurements and interactions succeeded. Do not describe that failed screenshot as visual evidence or mobile-width checks as real-device certification.

## Isolated persistence harness

`tests/browser-storage.mjs` runs production storage functions with a unique test IndexedDB, without touching the character database. It generates a tiny PNG in the page; no picker upload is involved. Seven checks and the final completion message passed:

1. Save/load and revision increment.
2. Stale revision rejected without overwriting newer data.
3. Full backup contains referenced photo and exact bytes.
4. Atomic state/photo restore retains the previous recovery copy.
5. Invalid checksum leaves the original stored character intact.
6. Undo restore recovers prior state/photos.
7. Damaged-state raw recovery export and restore from a validated backup work.

To reproduce, prepare a static `dist/` copy of the app's root assets and docs, then run `node scripts/prepare-browser-tests.mjs`. Serve the preview, open `qa/storage.html` and select `Run persistence checks`. The helper changes only database name and relative import paths in the test copy of `storage.js`. Generated `dist/qa/` is excluded from delivery; `qa/mobile.html` provides the 390 px iframe.

## Explicitly unverified

- Photo attachment and restore through the actual browser picker. Testing stopped after repeated permission prompts frustrated the owner. Do not repeat that request. Storage tests do not establish picker UI success.
- HTTPS service-worker install, offline reload and update lifecycle; managed HTTP preview lacks the required secure context.
- Physical iOS/Android, native installation prompts, assistive-technology audit and storage-quota exhaustion.
- Independently reviewed discipline-specific challenges at every rank; generic upper-rank objectives are labeled editorial standards.

## Limits

Local self-reporting does not provide partner verification or anti-tamper guarantees. The checksum detects corruption, not authenticity. Photos accept JPEG/PNG/WebP up to 12 MB; full backups have a 100 MB cap. Larger lifetime collections need media management. No invented population percentiles, IQ conversion or BMI health ranking is displayed. PR delivery is not a Pages deployment.
