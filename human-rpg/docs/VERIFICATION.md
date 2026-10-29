# Verification — published 0.1.2 / paused 0.1.3

## Unfinished 0.1.3 checkpoint — 2026-10-28

Implementation stopped at the owner's request to finish the 1000 Steps book first. `skill-profiles.js` structurally contains 204 matching existing IDs and 1,224 capabilities, with no missing or extra IDs. This count does not establish curriculum quality or calibration. New task, assessment and challenge-fallback logic is only partially integrated; UI work and new automated/browser verification are pending. The 55 passing tests recorded below apply to the published 0.1.2 source and must not be attributed to this draft.

No app-data migration, file upload, new browser exercise or publication was performed for this checkpoint. The book's repository was not opened or modified.

`npm run check` passed syntax checks for twelve production modules at the pause checkpoint. Syntax checks do not establish functional correctness; the full test suite was not rerun on this unfinished revision.

## Published 0.1.2 evidence

Checked 2026-10-26, America/Chicago. Synthetic fixtures only. This section records new checks; the earlier records below remain historical evidence, not claims that every browser flow was repeated.

## Public hosting — 2026-10-27, America/Chicago

[PR #109](https://github.com/Lordofrealms/Lordofrealms.webapps/pull/109) merged into `main` as `c7ba445328029e81ec4913ee70de28652ca76721`. Existing GitHub Pages [run 40609886604](https://github.com/Lordofrealms/Lordofrealms.webapps/actions/runs/40609886604) completed successfully. No hosting settings or application code changed for publication.

The browser opened **https://lordofrealms.github.io/Lordofrealms.webapps/human-rpg/** and rendered the complete onboarding form, 204-skill count, Quick Start and assessment actions, and footer v0.1.2. `preview-live-0.1.2.jpg` records this live empty onboarding screen; no personal character data was entered. No file-picker, upload or download operation was attempted.

This verifies public online loading, not HTTPS offline/update lifecycle, physical devices, accessibility or actual OS file saving. Those checks remain pending. The separate pre-existing APK publishing workflow failed; the Pages deployment itself succeeded. Preview-origin data remains separate and requires explicit backup/restore to transfer.

## Automated checks

`npm run check` passed for ten production modules. `npm test` passed **55 tests, zero failures** under Node 24. Ten new tests cover:

- Twenty paths / 580 unique within-path objectives / all fourteen categories and valid source IDs; valid gateways for every built-in and custom skill.
- Three distinct approach briefs with unchanged rank standing and visible safety.
- Immutable new snapshots despite later catalog edits or mutation of a returned display copy.
- Legacy in-progress and passed milestones retain exact original wording without migration. A golden SHA-256 digest of all 30,600 legacy definitions matches the actual 0.1.1 catalog fetched at commit `1d1398786675ebd99e00c52088e0d9dd9f4dd350`; legacy rank labels/descriptions are isolated from future display changes.
- Rejection of malformed, oversized or mismatched snapshots; future supported edition strings and source IDs remain readable.
- First completion claim and four explicit true criteria before passing; prerequisite rewards once.
- Existing permission prices/titles stay frozen after income or catalog changes.
- ZIP and legacy JSON preserve old/new attempts and first-claim state; invalid snapshot rejected before restore.

Existing XP, decay, legendary cascade, quest, photo/archive and ranking tests also passed. Large archive tests ran as part of that suite. Storage/photo implementation is unchanged in this checkpoint.

## Browser checks

Production UI/storage copies use a dedicated synthetic database/channel in `qa/challenge-ui.html`, prepared by `scripts/prepare-browser-tests.mjs`. The fixture contains assessed cooking/baking/Spanish, one legacy baking attempt, and no uploaded photos. Reload retains this fixture's state.

| Check | Observed result |
|---|---|
| Roadmap | Levels 1, 20, 30, 40 and 50 displayed the correct rank scope and income anchors; 50 showed $100,000 at $100,000 annual income and sustained open-age historic standing. |
| Read-only behavior | No criterion checkboxes were present in the roadmap. After browsing, reward permissions remained zero and credits/character XP were unchanged. |
| Sources | WorldSkills evidence disclosure showed type, cohort and limits; it explicitly denied automatic RPG level conversion. No external data was fetched by the app. |
| Approach | Changing core to practical brief changed the visible objective before beginning. The selected wording remained after starting and reloading. |
| New attempt | The edition-0.1.2 rubric stayed concealed before the first claim. Claiming completion exposed four cooking-specific criteria. Passing level-5 validation granted five prerequisite gear choices; the next gateway required more XP. |
| Legacy attempt | Mobile skill card/dialog retained “Bake a yeast-raised loaf and explain the fermentation” and edition 0.1.1. First claim revealed the four legacy criteria; browsing current-edition level 3 separately showed its new title. |
| Mobile | A 390 px iframe (375 px document width) showed no page or dialog horizontal overflow, including the longest level-50 wording. Dialog width/scroll width both 338 px. Stacked selectors were 296 px wide and displayed their full selected labels. |
| Keyboard | Escape closed the mobile roadmap and returned focus to its opening button. |

`preview-challenges-0.1.2.jpg` and `preview-challenges-mobile-0.1.2.jpg` show the desktop and narrow layouts with synthetic data. This is not a physical iOS/Android or assistive-technology audit. The final console check showed extension metadata errors, with no app-origin error observed.

No file-picker, upload or download test was attempted in this checkpoint. Actual OS file saving, picker flows, HTTPS service-worker lifecycle and physical-device testing remain release gates. The earlier 108 MiB browser storage evidence remains the largest tested collection. Expanded objectives are original editorial content, not independently certified progression standards.

---

## Historical verification — 0.1.1

Checked 2026-10-25, America/Chicago. Synthetic records only. This section is the current checkpoint; the 0.1.0 record below is retained as historical evidence.

## Automated and independent checks

- `npm run check`: all nine production JavaScript modules pass syntax validation.
- `npm test`: **45 pass, zero failures**, Node 24. The 35 earlier engine/data invariants still pass; ten archive tests add binary checksum reference vectors, exact original bytes/Unicode metadata, 0.1.0 data-URL compatibility, truncation/CRC/SHA rejection, missing/unexpected/duplicate/unsafe paths, unsupported compression/type/size rejection, a 108 MiB archive, and a 20,000-record raw recovery archive.
- Python `zipfile` independently opened a generated app ZIP, validated standard CRCs, confirmed stored entries and checked manifest/photo SHA-256. This was a local generated fixture, not a file claimed to have downloaded from the browser.
- The actual 0.1.0 `storage.js` reader fetched from repository commit `16ef8236ed642a0831b5be78ea62c32bc5f8194e` accepted a generated 0.1.1 legacy JSON payload and original photo. Only import paths were adapted for this temporary Node check.

## Browser results

The isolated harness passed 13 small checks plus its completion marker: save/load; stale state/photo rejection; atomic activity/photo save; injected DataCloneError rolling back an earlier photo put; ZIP exact-byte/reference roundtrip; lossless legacy conversion; atomic restore/recovery; corrupt archive rejection; direct missing-photo rejection; undo; legacy-format retention; raw damaged-state preservation with both photo collections; and decoding the restored image. A special `__proto__` photo ID checks that raw-recovery mappings preserve arbitrary supported IDs without object-prototype collisions.

Two additional browser checks saved nine 12 MiB generated photos, built a ZIP over 108 MiB, validated and atomically restored it, reloaded persisted state, and compared all original bytes. Oversized legacy JSON export rejected without affecting saved data. This is the largest browser collection tested; it is not evidence for full 1 GiB operation or low-memory physical mobile devices.

The generated photo UI fixture exercised production rendering: a thumbnail opened the photo dialog, and the binary image decoded to its original 1×1 pixels. A collection-selector defect found during review was fixed in `hydratePhotos`. No file picker or upload was used. Settings prepared a ZIP on desktop and legacy JSON on a 390 px mobile iframe. The mobile document and scroll width were both 375 px (excluding the scrollbar); the prepared download panel was 358 px wide and within the visible document. Dismissal worked.

`preview-backups-0.1.1.jpg` shows the updated settings and explicit **Download file** action with synthetic data. “Last backup prepared” records archive preparation, not OS file saving. The app leaves an explicit downloadable file link available rather than declaring success after an automatic click.

## Download limitation and remaining gates

Cloud Browser operations waiting for downloads timed out for both automatic and explicit small-file links, including its `downloadMedia` operation. No completed 0.1.1 browser file save was observed. The failure has not been isolated to the app or the browser test environment. File generation, validation and IndexedDB restore passed independently; **actual OS file saving is still a release check**, including original-photo downloads and large archives.

The file-picker attachment/import UI is deliberately pending; the owner objected to repeated upload permission requests. Do not repeat them. No upload permission was requested in this checkpoint. HTTPS service-worker install/offline/update lifecycle, physical iOS/Android, assistive technology and quota exhaustion remain unverified. The PR was still draft at this historical checkpoint; later publication is recorded above.

## Reproduction

Prepare a static `dist/` copy of the app root assets/docs, then run `node scripts/prepare-browser-tests.mjs`. On the local preview, `qa/storage.html` runs isolated persistence checks and optionally the 108 MiB check. `qa/photo-ui.html` generates a separate photo-bearing character for production UI checks; storage imports and the broadcast channel are isolated. `qa/mobile.html` frames the real app at 390 px. These fixtures are ignored preview output, not release assets. The checked-in harness source contains only generated test data.

See `BACKUPS.md` for exact format and recovery limits. Checksums are corruption checks, not partner verification or anti-tamper guarantees. The uncompressed archive preserves original images; it is not a claim of constant total browser memory.

---

## Historical verification — 0.1.0

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
