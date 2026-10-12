using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

namespace BatteryMonitor.Client;

public sealed record VoltageHistoryPoint(DateTime Utc, double Minimum, double Maximum, double Average, int Samples);
public sealed record BatteryHistoryEvent(DateTime Utc, string Category, string Message);

// The long-lived data belongs to this Windows account, never to the ESP32 flash.
// WAL and indexed, PK-limited purge transactions keep graphs available during cleanup.
public sealed class VoltageHistoryStore : IDisposable
{
    private readonly SqliteConnection _db;
    public int RetentionYears { get; private set; }
    public string DatabasePath { get; }
    public long DatabaseBytes => File.Exists(DatabasePath) ? new FileInfo(DatabasePath).Length : 0;

    public VoltageHistoryStore(string? directoryOverride = null)
    {
        var directory = directoryOverride ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
        Directory.CreateDirectory(directory);
        DatabasePath = Path.Combine(directory, "voltage-history.sqlite");
        _db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = DatabasePath, Pooling = false, DefaultTimeout = 5 }.ToString());
        _db.Open();
        Execute("PRAGMA journal_mode=WAL;");
        Execute("PRAGMA busy_timeout=3000;");
        Execute(@"CREATE TABLE IF NOT EXISTS voltage_samples(
            id INTEGER PRIMARY KEY,
            device_id TEXT NOT NULL,
            boot_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            utc_ticks INTEGER NOT NULL,
            minimum REAL NOT NULL,
            maximum REAL NOT NULL,
            average REAL NOT NULL,
            sample_count INTEGER NOT NULL,
            UNIQUE(device_id,boot_id,sequence));");
        Execute("CREATE INDEX IF NOT EXISTS idx_voltage_device_date ON voltage_samples(device_id,utc_ticks);");
        Execute("CREATE INDEX IF NOT EXISTS idx_voltage_age ON voltage_samples(utc_ticks,id);");
        Execute(@"CREATE TABLE IF NOT EXISTS battery_events(
            id INTEGER PRIMARY KEY,
            device_id TEXT NOT NULL,
            utc_ticks INTEGER NOT NULL,
            category TEXT NOT NULL,
            message TEXT NOT NULL);");
        Execute("CREATE INDEX IF NOT EXISTS idx_events_device_date ON battery_events(device_id,utc_ticks);");
        Execute("CREATE INDEX IF NOT EXISTS idx_events_age ON battery_events(utc_ticks,id);");
        Execute("CREATE TABLE IF NOT EXISTS history_settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL);");
        using var retention = _db.CreateCommand();
        retention.CommandText = "SELECT value FROM history_settings WHERE key = 'retention_years'";
        var raw = retention.ExecuteScalar();
        RetentionYears = raw is long years && years is >= 0 and <= 100 ? (int)years : 0;
    }

    private void Execute(string sql)
    {
        using var command = _db.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    public int AddHistory(string deviceId, DeviceHistoryBatch batch, DateTime receivedUtc)
    {
        if (!string.Equals(deviceId, batch.DeviceId, StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(batch.BootId) || batch.Records.Count > 168)
            throw new InvalidOperationException("Invalid authenticated device history identity or record count.");
        using var transaction = _db.BeginTransaction();
        using var command = _db.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"INSERT OR IGNORE INTO voltage_samples
          (device_id,boot_id,sequence,utc_ticks,minimum,maximum,average,sample_count)
          VALUES ($d,$b,$s,$t,$min,$max,$avg,$n)";
        command.Parameters.AddWithValue("$d", deviceId);
        command.Parameters.AddWithValue("$b", batch.BootId);
        var sequence = command.Parameters.Add("$s", SqliteType.Integer);
        var ticks = command.Parameters.Add("$t", SqliteType.Integer);
        var minimum = command.Parameters.Add("$min", SqliteType.Real);
        var maximum = command.Parameters.Add("$max", SqliteType.Real);
        var average = command.Parameters.Add("$avg", SqliteType.Real);
        var samples = command.Parameters.Add("$n", SqliteType.Integer);
        var inserted = 0;
        foreach (var record in batch.Records)
        {
            if (record.Length != 6 || record[0] < 1 || record[1] < 0 || record[1] > 7 * 86400 + 7200 ||
                record[5] <= 0 || record[5] > 1000000 ||
                record[2] < 0 || record[3] < record[2] || record[3] > 100 ||
                record[4] < record[2] - 0.01 || record[4] > record[3] + 0.01)
                continue;
            var timestamp = receivedUtc.AddSeconds(-record[1]);
            sequence.Value = (long)record[0];
            ticks.Value = timestamp.Ticks;
            minimum.Value = record[2];
            maximum.Value = record[3];
            average.Value = record[4];
            samples.Value = (int)record[5];
            inserted += command.ExecuteNonQuery();
        }
        transaction.Commit();
        return inserted;
    }

    public void RecordEvent(string deviceId, string category, string message)
    {
        using var command = _db.CreateCommand();
        command.CommandText = "INSERT INTO battery_events(device_id,utc_ticks,category,message) VALUES ($d,$t,$c,$m)";
        command.Parameters.AddWithValue("$d", deviceId);
        command.Parameters.AddWithValue("$t", DateTime.UtcNow.Ticks);
        command.Parameters.AddWithValue("$c", category);
        command.Parameters.AddWithValue("$m", message);
        command.ExecuteNonQuery();
    }

    public List<VoltageHistoryPoint> Query(string deviceId, DateTime earliestUtc, int maxBuckets = 1200)
    {
        var results = new List<VoltageHistoryPoint>();
        var bucket = Math.Max(TimeSpan.FromMinutes(1).Ticks,
            (DateTime.UtcNow.Ticks - earliestUtc.Ticks) / Math.Max(1, maxBuckets));
        using var command = _db.CreateCommand();
        command.CommandText = @"SELECT MIN(utc_ticks), MIN(minimum), MAX(maximum), AVG(average), SUM(sample_count)
          FROM voltage_samples WHERE device_id=$d AND utc_ticks >= $start
          GROUP BY (utc_ticks / $bucket) ORDER BY MIN(utc_ticks)";
        command.Parameters.AddWithValue("$d", deviceId);
        command.Parameters.AddWithValue("$start", earliestUtc.Ticks);
        command.Parameters.AddWithValue("$bucket", bucket);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new VoltageHistoryPoint(
                new DateTime(reader.GetInt64(0), DateTimeKind.Utc),
                reader.GetDouble(1), reader.GetDouble(2), reader.GetDouble(3),
                (int)Math.Min(int.MaxValue, reader.GetInt64(4))));
        }
        return results;
    }

    public List<BatteryHistoryEvent> Events(string deviceId, int max = 1000)
    {
        var result = new List<BatteryHistoryEvent>();
        using var command = _db.CreateCommand();
        command.CommandText = "SELECT utc_ticks,category,message FROM battery_events WHERE device_id=$d ORDER BY utc_ticks DESC LIMIT $n";
        command.Parameters.AddWithValue("$d", deviceId);
        command.Parameters.AddWithValue("$n", max);
        using var reader = command.ExecuteReader();
        while (reader.Read())
            result.Add(new BatteryHistoryEvent(new DateTime(reader.GetInt64(0), DateTimeKind.Utc), reader.GetString(1), reader.GetString(2)));
        return result;
    }

    public void ExportCsv(string deviceId, string filename)
    {
        using var writer = new StreamWriter(filename, false, new UTF8Encoding(false));
        writer.WriteLine("utc_timestamp,voltage_min,voltage_max,voltage_average,samples");
        using var command = _db.CreateCommand();
        command.CommandText = "SELECT utc_ticks,minimum,maximum,average,sample_count FROM voltage_samples WHERE device_id=$d ORDER BY utc_ticks";
        command.Parameters.AddWithValue("$d", deviceId);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var utc = new DateTime(reader.GetInt64(0), DateTimeKind.Utc);
            writer.WriteLine(string.Join(",", utc.ToString("O", CultureInfo.InvariantCulture),
                reader.GetDouble(1).ToString("0.000", CultureInfo.InvariantCulture),
                reader.GetDouble(2).ToString("0.000", CultureInfo.InvariantCulture),
                reader.GetDouble(3).ToString("0.000", CultureInfo.InvariantCulture),
                reader.GetInt32(4).ToString(CultureInfo.InvariantCulture)));
        }
    }

    public static async Task<int> PurgeOlderThanAsync(string path, DateTime cutoffUtc, IProgress<int>? progress, CancellationToken cancellation)
    {
        // Separate connection, short transactions, PK-selected deletes; never VACUUM.
        using var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false, DefaultTimeout = 5 }.ToString());
        await db.OpenAsync(cancellation);
        using (var pragma = db.CreateCommand()) { pragma.CommandText = "PRAGMA busy_timeout=3000;"; await pragma.ExecuteNonQueryAsync(cancellation); }
        var removed = 0;
        foreach (var table in new[] { "voltage_samples", "battery_events" })
        {
            while (true)
            {
                cancellation.ThrowIfCancellationRequested();
                using var transaction = db.BeginTransaction();
                using var cmd = db.CreateCommand();
                cmd.Transaction = transaction;
                // Table names are compile-time literals above, not external input.
                cmd.CommandText = $"DELETE FROM {table} WHERE id IN (SELECT id FROM {table} WHERE utc_ticks < $cutoff ORDER BY utc_ticks,id LIMIT 10000)";
                cmd.Parameters.AddWithValue("$cutoff", cutoffUtc.Ticks);
                var rows = await cmd.ExecuteNonQueryAsync(cancellation);
                transaction.Commit();
                removed += rows;
                progress?.Report(removed);
                if (rows < 10000) break;
                await Task.Delay(20, cancellation);
            }
        }
        return removed;
    }

    public void SetRetentionYears(int years)
    {
        if (years is not (0 or 1 or 5 or 10)) throw new ArgumentOutOfRangeException(nameof(years));
        using var command = _db.CreateCommand();
        command.CommandText = "INSERT INTO history_settings(key,value) VALUES ('retention_years',$n) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
        command.Parameters.AddWithValue("$n", years);
        command.ExecuteNonQuery();
        RetentionYears = years;
    }

    public void BackupDatabase(string destination)
    {
        if (File.Exists(destination)) throw new IOException("Backup destination already exists.");
        using var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = destination, Pooling = false }.ToString());
        backup.Open();
        _db.BackupDatabase(backup);
    }

    public void Dispose() => _db.Dispose();
}
