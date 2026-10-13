# Battery Monitor history architecture (Windows 0.1.5)

## Source and durability

**Windows is the primary history recorder.** Every successful authenticated
10-second (or user-configured) status poll writes an observation immediately
to the existing local SQLite database. The Windows app can collect readings
from older, authenticated ESP32 firmware that has no history endpoint.

The ESP32 firmware retains up to 168 completed intervals in volatile RAM.
It does **not** write its rolling samples to flash. On reconnection, Windows
uses these authenticated records as **gap recovery**, not its normal source.
ESP32 0.1.4 already supports this; no firmware change is required in order to
implement Windows-primary logging.

ESP32 backups are hourly by default and are not 10-second samples. We can
recover hourly summaries across full gaps, but must never invent detailed
within-hour readings that the ESP32 does not have. Existing legacy ESP32
history rows remain intact in `voltage_samples`.

## Resolution tiers

| Age | Windows data persisted | Cleanup policy |
|---|---|---|
| 0–24 hours | Individual authenticated poll measurements | Preserve live samples |
| 24 hours–30 days | Aligned UTC 5-minute summaries | Replace raw readings **in the same transaction** |
| Older than 30 days | Aligned UTC hourly summaries | Replace 5-minute summaries **in the same transaction** |

Each summary carries `minimum`, `maximum`, `average`, and
`sample_count`. When combining summaries, compute the average as
`sum(average * sample_count) / sum(sample_count)`. Never choose a random
reading or compute an unweighted average of aggregate averages. Missing polls
are not treated as zeroes; a shorter coverage interval has fewer samples.

All tiers are stored in
`%LOCALAPPDATA%\\BatteryMonitor\\voltage-history.sqlite`.
The existing `voltage_samples` and event tables are retained by the
migration. Keep-forever retention (the default) preserves hourly summaries
indefinitely; if users choose 1/5/10-year expiry, cleanup also includes
Windows resolution tiers and battery event history. Destructive retention
settings retain the existing explicit confirmation/backup flow.

Maintenance is run no more than hourly, and rollup/deletion occur within
one SQLite transaction per resolution level so interrupted maintenance
cannot discard observations without their corresponding summaries. Late
observations for already-compacted periods are merged using weighted
averages and sample counts. Windows capture does not wait for a complete
hour before making readings visible.

## Device fallback and display

Authenticated ESP32 records have device identity + boot ID + sequence
deduplication. For graph display, a Windows-covered UTC hour takes precedence
over the ESP32 backup for that hour; an entirely uncovered hour can use the
ESP32 summary. This avoids double-counting, but a partially missing hour
cannot be reconstructed at the original 10-second resolution from an ESP32
hourly average. The original backup is retained in the database separately.

The graph supports rolling time ranges and a custom local start/end date
and time. It refreshes once every 60 seconds while open and also offers a
manual Refresh button. For long ranges, displayed buckets are further
downsampled in-memory with count-weighted averaging and exact min/max; this
does not change stored history.

## Release independence

Windows customer app version: `battery-monitor/windows/version.txt`.
ESP32 firmware version: `battery-monitor/firmware/idf/version.txt`.
They intentionally advance independently. Windows 0.1.5 uses **exactly**
the previously signed ESP32 firmware 0.1.4 and signed legacy bridge; it
does not rebuild or resign firmware. Windows-specific CI compiles/tests
and packages the application using pinned prior signed firmware artifacts.
Battery Monitor Toolchain is reserved for firmware/Android/signing changes.

## Verification

The `--history-self-test` exercises authenticated ESP32 history ingestion,
deduplication, immediate Windows sampling, weighted averaging, rollup,
idempotence, backup, events, and retention. Windows validation is the CI
authority for app-only changes. Hardware validation should confirm visible
Windows history within the first couple of successful polls on 0.1.0.9,
and continued logging, auto-refresh, and backfill on 0.1.4.
