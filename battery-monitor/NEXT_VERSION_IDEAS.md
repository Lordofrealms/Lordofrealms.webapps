# Battery Monitor — Next Version Ideas

These are candidate ideas for a future normal Battery Monitor release. They are not committed requirements and should not block the current `0.1.1` / `0.1.2` signing and hardware-qualification work.

## Device voltage history and graphs

Candidate feature: add historical voltage logging per Battery Monitor device and graphing in the desktop application.

Preferred direction to evaluate:

- keep the primary history database local to the Windows application rather than adding database/storage complexity to each ESP32 device;
- use a lightweight embedded database, with SQLite as the leading candidate;
- store at minimum device identity, timestamp, measured voltage, and any useful state/profile fields needed to interpret the reading;
- leverage the existing periodic device polling rather than requiring a separate high-rate telemetry channel unless later requirements justify one;
- provide per-device voltage-over-time graphs with selectable time ranges;
- preserve history across application restarts and device reconnects;
- support multiple monitored units without mixing histories when device names change;
- consider export (CSV or similar) after the core logging/graph feature works.

Design questions to settle before implementation:

1. sampling interval and whether every successful poll is persisted;
2. retention period and/or maximum database size;
3. downsampling/aggregation policy for long time ranges;
4. handling gaps while a unit or PC is offline;
5. whether to record only voltage or also derived battery percentage, battery profile, alert state, connectivity/RSSI, and other useful telemetry;
6. graph ranges and UX (hours, day, week, month, custom range);
7. whether history remains strictly local or later supports backup/sync.

Initial architectural preference: SQLite in the Windows client is likely a better fit than storing long-term history on the ESP32. This keeps flash wear and firmware complexity low while allowing richer querying and graphing on the PC.
