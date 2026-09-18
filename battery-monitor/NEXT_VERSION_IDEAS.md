# Battery Monitor — Next Version Ideas

These are candidate ideas for a future normal Battery Monitor release. They are not committed requirements and should not block the current `0.1.1` / `0.1.2` signing and hardware-qualification work.

## Device voltage history and graphs

Candidate feature: add historical voltage logging per Battery Monitor device and graphing in the desktop application.

Preferred direction to evaluate:

- keep the long-term history database local to the Windows application, using a lightweight embedded database with SQLite as the leading candidate;
- add a small volatile history buffer on each ESP32 so short PC/app outages do not create immediate gaps;
- use a fixed-size RAM ring buffer of approximately one week of hourly records: 168 entries per device;
- losing the on-device buffer on power loss/reboot is acceptable by design; do not write this history to ESP32 flash merely for persistence;
- when the Windows application reconnects, retrieve any buffered records it has not already stored, merge them into the local database by stable device identity + timestamp, then continue normal polling;
- the device should overwrite the oldest hourly records once the 168-entry ring buffer is full;
- use the stable BM device identity rather than the user-editable device name for database ownership/deduplication;
- provide per-device voltage-over-time graphs with selectable time ranges;
- preserve PC-side history across application restarts and device reconnects;
- support multiple monitored units without mixing histories when device names change;
- consider export (CSV or similar) after the core logging/graph feature works.

### Suggested hourly record

At minimum:

- timestamp;
- measured voltage.

Potentially useful additions if still compact:

- hourly minimum voltage;
- hourly maximum voltage;
- hourly average voltage;
- number of samples represented;
- battery/alert state flags.

A compact fixed-size record should make the RAM cost trivial. For example, 168 records at 16 bytes each is only 2,688 bytes. Even a 24-byte record would be 4,032 bytes.

### Suggested aggregation behavior

Rather than merely taking one instantaneous reading at the top of each hour, consider accumulating readings during the hour and storing one hourly summary containing average/minimum/maximum voltage plus sample count. This would preserve short voltage dips or peaks that a single hourly snapshot could miss while keeping the buffer at only 168 records.

The Windows application can continue storing higher-frequency readings while it is connected if desired; the device-side hourly buffer is primarily a gap-filling mechanism.

Design questions to settle before implementation:

1. exact device-side hourly record contents (single reading vs min/max/average/count);
2. how the device obtains wall-clock timestamps and handles periods before time synchronization;
3. exact reconnect/history-transfer protocol and acknowledgement/deduplication behavior;
4. PC-side normal sampling interval and whether every successful poll is persisted;
5. PC-side retention period and/or maximum database size;
6. downsampling/aggregation policy for long graph ranges;
7. whether to record derived battery percentage, battery profile, alert state, connectivity/RSSI, and other useful telemetry in SQLite;
8. graph ranges and UX (hours, day, week, month, custom range);
9. whether history remains strictly local or later supports backup/sync.

Initial architectural preference: SQLite in the Windows client for durable history, plus a small volatile ESP32 RAM ring buffer for approximately seven days of hourly summaries. This avoids ESP32 flash wear while still recovering useful history after the Windows app has been offline.
