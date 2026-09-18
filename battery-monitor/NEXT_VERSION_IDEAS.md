# Battery Monitor — Next Version Ideas

These are candidate ideas for a future normal Battery Monitor release. They are not committed requirements and should not block the current `0.1.1` / `0.1.2` signing and hardware-qualification work.

## Device voltage history and graphs

Candidate feature: add historical voltage logging per Battery Monitor device and graphing in the desktop application.

Preferred direction to evaluate:

- keep the long-term history database local to the Windows application, using a lightweight embedded database with SQLite as the leading candidate;
- use **one hour as the default history interval both on-device and on the PC**;
- allow the user to configure a shorter logging interval if desired, but hourly logging should be sufficient for most users;
- make **PC-side retention configurable by the user** rather than imposing a short fixed retention period;
- because hourly history is very small, allow very long retention (including multi-year/decade-scale or effectively unlimited retention) without aggressive automatic pruning;
- add a small volatile history buffer on each ESP32 so PC/app outages do not immediately create gaps;
- at the default one-hour interval, use a fixed-size RAM ring buffer of approximately one week: 168 entries per device;
- losing the on-device buffer on power loss/reboot is acceptable by design; do not write this history to ESP32 flash merely for persistence;
- when the Windows application reconnects, retrieve buffered records it has not already stored and merge them into SQLite by stable device identity + timestamp/sequence;
- the device should overwrite the oldest records once its configured ring-buffer capacity is full;
- use the stable BM device identity rather than the user-editable device name for database ownership/deduplication;
- provide per-device voltage-over-time graphs with selectable time ranges;
- preserve PC-side history across application restarts and device reconnects;
- support multiple monitored units without mixing histories when device names change;
- consider export (CSV or similar) after the core logging/graph feature works.

### Suggested hourly record

At minimum:

- timestamp or reconstructable time/sequence;
- measured voltage.

Preferred summary fields if still compact:

- hourly minimum voltage;
- hourly maximum voltage;
- hourly average voltage;
- number of samples represented;
- battery/alert state flags if useful.

A compact fixed-size record should make the RAM cost trivial. For example, 168 records at 16 bytes each is only 2,688 bytes. Even a 24-byte record would be 4,032 bytes.

### Suggested aggregation behavior

Rather than merely taking one instantaneous reading at the top of each hour, accumulate the normal voltage readings during the configured history interval and store one summary containing average/minimum/maximum voltage plus sample count. This preserves short voltage dips or peaks that a single snapshot could miss while keeping history compact.

The same summarized record can be the canonical unit of history transferred to and stored by the Windows application. There is no strong need for the PC to persist every normal polling sample.

### Configurable interval

Default:

- **60 minutes**.

The Windows client may expose a user setting for a shorter interval for users who want finer graphs. The device and PC should use the same configured history interval so on-device gap-fill records merge naturally with the durable SQLite history.

If shorter intervals are supported, decide whether the ESP32 ring buffer should remain a fixed one-week time horizon (which increases record count as the interval shrinks) or remain a fixed maximum record count (which reduces its offline time horizon). One week at the default hourly interval remains the baseline requirement.

### Configurable PC retention

Retention should be user-configurable. Because hourly records are small, defaults can be generous rather than optimizing prematurely for storage.

At a one-hour interval:

- one device produces about 8,766 records per year;
- 10 devices for 10 years produce about **876,600 records total**.

Approximate storage for 876,600 records:

- 16 bytes/record raw payload: about **14.0 MB decimal / 13.4 MiB**;
- 24 bytes/record raw payload: about **21.0 MB / 20.1 MiB**;
- 64 bytes/record effective size: about **56.1 MB / 53.5 MiB**;
- 100 bytes/record effective size: about **87.7 MB / 83.6 MiB**;
- even 128 bytes/record including generous row/index overhead: about **112.2 MB / 107 MiB**.

Actual SQLite size will depend on schema, page fill, indexes, and any additional telemetry fields, but even a conservative roughly 100–128 bytes per hourly row keeps a decade of history for 10 devices around only 0.1 GB.

Therefore retention options can reasonably include long periods such as 1 year, 5 years, 10 years, and/or unlimited/keep forever. A database-size display and optional manual purge are likely more useful than a restrictive default retention cap.


### Retention purge behavior

Retention cleanup must be designed to avoid long-running write locks when a user substantially reduces retention (for example, changing from 10 years to 1 year).

Requirements:

- history rows must have a stable integer primary key suitable for bounded deletion;
- purge by primary key, not by one giant unbounded `DELETE` against the timestamp predicate;
- select eligible primary keys using the retention cutoff and delete in bounded chunks;
- default purge batch size should be approximately **10,000 rows per transaction**;
- commit after each batch so the database is available between chunks rather than holding one transaction for the entire purge;
- continue batches until no eligible rows remain;
- allow cancellation/interruption between batches and safely resume later;
- keep an index supporting the retention cutoff lookup (for example timestamp, with device identity as appropriate);
- do not run `VACUUM` automatically as part of the retention purge, because that can itself create a long exclusive maintenance operation; expose compaction separately if it is ever needed.

A representative SQLite pattern is to identify up to 10,000 old row IDs, delete those IDs in one transaction, commit, then repeat. The exact SQL can use the integer primary key plus an indexed timestamp cutoff. The important rule is that no retention change should translate into one enormous delete transaction.

Design questions to settle before implementation:

1. exact record contents (single reading vs min/max/average/count);
2. supported configurable history intervals and minimum allowed interval;
3. whether device RAM capacity preserves seven days at every interval or only at the default one-hour interval;
4. how the device obtains wall-clock timestamps and handles periods before time synchronization;
5. exact reconnect/history-transfer protocol and acknowledgement/deduplication behavior;
6. PC-side retention choices/default and whether to offer unlimited retention;
7. whether to show current database size and provide manual purge/export controls;
8. downsampling/aggregation policy for very long graph ranges;
9. whether to record derived battery percentage, battery profile, alert state, connectivity/RSSI, and other useful telemetry in SQLite;
10. graph ranges and UX (hours, day, week, month, year, custom range);
11. whether history remains strictly local or later supports backup/sync.

Initial architectural preference: SQLite in the Windows client for durable history, plus a small volatile ESP32 RAM ring buffer. The default history interval is one hour, giving approximately seven days of device-side gap-fill history with 168 records. PC retention is user-configurable and can be very long because hourly history remains small even across many devices and many years.
