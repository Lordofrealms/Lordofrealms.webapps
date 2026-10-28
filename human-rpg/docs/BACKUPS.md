# Backups and photo recovery — 0.1.2

All character data and photos remain in this browser. Clearing site data, private browsing cleanup or losing the device can remove them. A prepared backup is not a saved file: select **Download file**, check the device's downloads folder, and keep an independent copy before clearing data or moving devices.

## Normal transfer and restore

1. Open **Character & data → Export full backup**. Keep the page open while the archive is prepared.
2. Select the visible **Download file** link. The ZIP contains the character and every referenced original photo. No photo is resized or compressed.
3. On the receiving device, use Human RPG **0.1.2 or later**, then **Restore from file** and select the unchanged ZIP.
4. Review the incoming character, counts and replacement warning. Confirm only when ready to replace the receiving character. Existing progress moves to one local recovery slot.
5. Use **Undo last restore** to switch back to that previous state. Each restore replaces the single recovery slot, so save independent copies when several versions matter.

Checksums and character/photo validation finish before replacement. A stale revision, missing attachment, corrupt archive or failed write leaves the saved character intact. The replacement and recovery copy share one IndexedDB transaction.

ZIPs are unencrypted and can include private financial/health observations and photo metadata. Store them privately. Checksums detect corruption, not authenticity or intentional editing. There is no server copy or automatic synchronization.

## Formats and limits

| Format | Maximum | Intended use |
|---|---|---|
| Full ZIP, archive version 1 | 1 GiB; 64 MiB manifest; 10,000 photos | Normal backup/restore on 0.1.1+ |
| Legacy checksummed JSON | 100 MiB including base64 photos | Read existing backups or transfer back to 0.1.0 |
| Raw recovery ZIP | 2 GiB; 128 MiB manifest; 20,000 photo records across both copies | Preserve damaged state for repair; not normal restore |
| One original JPEG, PNG or WebP | 1 byte to 12 MiB | Up to eight new attachments per save |

MiB and GiB use powers of 1024. New photo additions reserve 66 MiB of the normal archive limit for metadata and ZIP structure. The largest browser-tested photo collection is **108 MiB**; the maximum 1 GiB archive has not been tested on physical mobile devices. Storage quota and available memory may impose lower limits. Restore temporarily needs room for the current, incoming and recovery data. Quota-exhaustion testing remains pending.

The writer keeps photos as separate Blob parts and reads one entry at a time for checksums. It is not a streaming file-system API and does not promise constant total browser memory. Metadata is still serialized as one bounded JSON string. No photos are silently deleted or transformed to fit a limit.

## Compatibility and downgrade

Version 0.1.1 uses the existing database name, schema version and stores. It does not rewrite old data-URL photo records. New attachments use binary Blob records and are saved atomically with their activity or challenge attempt.

**Version 0.1.0 cannot read the new ZIP format or new binary photo records directly.** Before downgrading, use **Legacy JSON export** in 0.1.1 and save the file. Restore that compatible JSON in 0.1.0; retain the ZIP separately. Do not clear the source browser until a compatible copy has been checked. A collection over 100 MiB in legacy representation cannot be transferred intact to 0.1.0. Stay on 0.1.1+ for that collection.

The 0.1.0 reader has been checked against a generated 0.1.1 legacy payload and exact original photo bytes. Existing JSON backups remain readable by 0.1.1. Schema numbers, app versions and archive versions are separate.

## ZIP layout and independent extraction

| Entry | Contents |
|---|---|
| `human-rpg.json` | Character state, app/schema/archive versions and photo descriptors |
| `integrity.sha256` | SHA-256 of the exact UTF-8 manifest bytes |
| `photos/000001.png` (or `.jpg` / `.webp`) | Original image bytes; sequential safe names |

Each photo descriptor retains its ID, display filename, media type, byte count, creation time, archive path and SHA-256. Journal entries reference IDs. All entries also have standard ZIP CRC-32 checksums. Unicode display names live in the JSON manifest rather than archive paths.

An ordinary ZIP reader can extract original images for independent recovery; Python's `zipfile` verified the layout and checksums. Keep the original ZIP for app restore. The app deliberately rejects recompressed/repacked/encrypted archives, unsupported extra fields, path traversal, duplicates, overlaps, unexpected members and trailing data. It only imports its own unchanged stored-entry format. External ZIP extraction is optional, not part of normal restore.

Format references: [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) and [MDN structured clone support](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm). No runtime code or data is loaded from either source.

## Damaged local state

If the app cannot validate the saved character, it blocks normal mutation rather than creating an empty character. **Export recovery data** prepares a raw ZIP containing the damaged current state, the prior recovery state if present, and both supported photo collections. `photoMap.current` and `photoMap.recovery` map original IDs to distinct archive records; even the same original ID in both copies is preserved.

A raw recovery bundle is not accepted by normal restore. Retain it for repair, and use a known valid backup or **Recovery copy** to resume. Neither export nor a rejected import clears the original database. Raw export still requires readable, supported photo records; it is not a forensic recovery tool for an unreadable IndexedDB database.

## Verification boundary

See `VERIFICATION.md` for actual checks. Generated photos exercised browser save, failure rollback, large ZIP restore, old JSON restore, raw recovery and the photo viewer without opening a file picker. Actual file-picker testing is deliberately pending; do not repeat the owner's rejected upload-permission requests. This Cloud Browser also timed out waiting for downloads, so OS file-saving completion remains a target-browser release check. A ready status or visible link is not recorded as a completed download.

## Challenge-definition compatibility in 0.1.2

New attempt records include their original objective, safety text, approach, rubric and edition. ZIP and legacy JSON backups preserve these fields; schema and archive format remain version 1. Existing attempts without them keep the original 0.1.0/0.1.1 generator, and no record migration is performed.

Use **0.1.2 or later to review or score new attempts**. Version 0.1.1 can parse the new fields but ignores them when displaying a challenge, so its wording may differ. A legacy JSON export is a photo compatibility format, not a downgrade of challenge terms. Keep an independent backup before switching builds, and use the newer app for snapshot-bearing milestones. Existing earned permissions retain their saved value and suggestion.
