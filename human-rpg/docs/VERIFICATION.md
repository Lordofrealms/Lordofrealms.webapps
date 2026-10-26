# Verification record — 0.1.1

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

The file-picker attachment/import UI is deliberately pending; the owner objected to repeated upload permission requests. Do not repeat them. No upload permission was requested in this checkpoint. HTTPS service-worker install/offline/update lifecycle, physical iOS/Android, assistive technology and quota exhaustion remain unverified. The draft PR is not merged or deployed.

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
