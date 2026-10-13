using Microsoft.Data.Sqlite;

namespace BatteryMonitor.Client;

// Windows polling is the primary, immediately durable history source.
public sealed partial class VoltageHistoryStore
{
    private static readonly long FiveMinutes = TimeSpan.FromMinutes(5).Ticks;
    private static readonly long OneHour = TimeSpan.TicksPerHour;

    private void InitializeDesktopSchema()
    {
        Execute(@"CREATE TABLE IF NOT EXISTS desktop_raw(
            id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
            utc_ticks INTEGER NOT NULL, voltage REAL NOT NULL,
            UNIQUE(device_id,utc_ticks));");
        Execute("CREATE INDEX IF NOT EXISTS idx_desktop_raw_device_date ON desktop_raw(device_id,utc_ticks);");
        foreach (var table in new[] { "desktop_5min", "desktop_hourly" })
        {
            Execute($@"CREATE TABLE IF NOT EXISTS {table}(
                id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
                utc_ticks INTEGER NOT NULL, minimum REAL NOT NULL,
                maximum REAL NOT NULL, average REAL NOT NULL,
                sample_count INTEGER NOT NULL,
                UNIQUE(device_id,utc_ticks));");
            Execute($"CREATE INDEX IF NOT EXISTS idx_{table}_device_date ON {table}(device_id,utc_ticks);");
        }
    }

    public void RecordDesktopVoltage(string deviceId, DateTime observedUtc, double voltage)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || observedUtc.Kind != DateTimeKind.Utc ||
            !double.IsFinite(voltage) || voltage < 0 || voltage > 100)
            throw new ArgumentException("Invalid trusted desktop reading.");
        using var command = _db.CreateCommand();
        command.CommandText = @"INSERT OR IGNORE INTO desktop_raw
            (device_id,utc_ticks,voltage) VALUES ($d,$t,$v)";
        command.Parameters.AddWithValue("$d", deviceId);
        command.Parameters.AddWithValue("$t", observedUtc.Ticks);
        command.Parameters.AddWithValue("$v", voltage);
        command.ExecuteNonQuery();
    }

    // Only completed age windows are compacted. Insert and deletion are atomic.
    public void MaintainDesktopRollups(DateTime nowUtc)
    {
        if (nowUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("UTC required.");
        var fiveMinuteCutoff = nowUtc.AddDays(-1).Ticks / FiveMinutes * FiveMinutes;
        var hourlyCutoff = nowUtc.AddDays(-30).Ticks / OneHour * OneHour;
        Compact("desktop_raw", "desktop_5min", FiveMinutes, fiveMinuteCutoff, true);
        Compact("desktop_5min", "desktop_hourly", OneHour, hourlyCutoff, false);
    }

    private void Compact(string source, string destination, long bucket, long cutoff, bool raw)
    {
        using var tx = _db.BeginTransaction();
        using (var insert = _db.CreateCommand())
        {
            insert.Transaction = tx;
            var minimum = raw ? "MIN(voltage)" : "MIN(minimum)";
            var maximum = raw ? "MAX(voltage)" : "MAX(maximum)";
            var average = raw ? "AVG(voltage)" : "SUM(average*sample_count)/SUM(sample_count)";
            var count = raw ? "COUNT(*)" : "SUM(sample_count)";
            insert.CommandText = $@"INSERT INTO {destination}
                (device_id,utc_ticks,minimum,maximum,average,sample_count)
                SELECT device_id, (utc_ticks / $bucket) * $bucket,
                       {minimum},{maximum},{average},{count}
                FROM {source}
                WHERE utc_ticks < $cutoff
                GROUP BY device_id, (utc_ticks / $bucket) * $bucket
                ON CONFLICT(device_id,utc_ticks) DO UPDATE SET
                  minimum=MIN({destination}.minimum,excluded.minimum),
                  maximum=MAX({destination}.maximum,excluded.maximum),
                  average=({destination}.average*{destination}.sample_count
                         + excluded.average*excluded.sample_count)
                         / ({destination}.sample_count+excluded.sample_count),
                  sample_count={destination}.sample_count+excluded.sample_count";
            insert.Parameters.AddWithValue("$bucket", bucket);
            insert.Parameters.AddWithValue("$cutoff", cutoff);
            insert.ExecuteNonQuery();
        }
        using (var deletion = _db.CreateCommand())
        {
            deletion.Transaction = tx;
            deletion.CommandText = $"DELETE FROM {source} WHERE utc_ticks < $cutoff";
            deletion.Parameters.AddWithValue("$cutoff", cutoff);
            deletion.ExecuteNonQuery();
        }
        tx.Commit();
    }
}
