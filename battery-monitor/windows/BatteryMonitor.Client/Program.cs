namespace BatteryMonitor.Client;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--protocol-self-test", StringComparison.OrdinalIgnoreCase)))
        {
            // Forces deterministic protocol/security vectors to run without
            // starting WinForms. Any framing/KDF/compatibility regression throws
            // and makes the process fail, which CI treats as a hard build failure.
            MonitoringProtocol.RunSelfTest();
            RunDevicePasswordCompatibilitySelfTest();
            return;
        }

        if (args.Any(a => string.Equals(a, "--history-self-test", StringComparison.OrdinalIgnoreCase)))
        {
            RunHistorySelfTest();
            return;
        }
        if (args.Any(a => string.Equals(a, "--upgrade-path-self-test", StringComparison.OrdinalIgnoreCase)))
        {
            FirmwareUpgradePlanner.SelfTest();
            return;
        }
        ApplicationConfiguration.Initialize();
        var form = new MainForm();
        ClientEnhancements.Attach(form, args.Any(a => string.Equals(a, "--startup", StringComparison.OrdinalIgnoreCase)));
        Application.Run(form);
    }

    private static void RunHistorySelfTest()
    {
        var dir = Path.Combine(Path.GetTempPath(), "battery-monitor-history-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var history = new VoltageHistoryStore(dir);
            var now = DateTime.UtcNow;
            var batch = new DeviceHistoryBatch
            {
                DeviceId = "BM-TEST",
                BootId = "cafebabe",
                Records = new List<double[]>
                {
                    new double[] { 1, 3600, 12, 13, 12.5, 360 },
                    new double[] { 2, 60, 13, 14, 13.5, 360 }
                }
            };
            if (history.AddHistory(batch.DeviceId, batch, now) != 2 ||
                history.AddHistory(batch.DeviceId, batch, now) != 0)
                throw new InvalidOperationException("History insert/idempotency self-test failed.");
            if (history.Query("BM-TEST", now.AddHours(-2)).Count != 2)
                throw new InvalidOperationException("History query self-test failed.");
            history.RecordEvent("BM-TEST", "low", "Test low threshold event");
            if (history.Events("BM-TEST").Count != 1)
                throw new InvalidOperationException("History event self-test failed.");
            var backup = Path.Combine(dir, "backup.sqlite");
            history.BackupDatabase(backup);
            if (!File.Exists(backup) || new FileInfo(backup).Length == 0)
                throw new InvalidOperationException("History backup self-test failed.");
            history.SetRetentionYears(1);
            if (history.RetentionYears != 1)
                throw new InvalidOperationException("History retention setting self-test failed.");
            var deleted = VoltageHistoryStore.PurgeOlderThanAsync(history.DatabasePath,
                now.AddMinutes(-30), null, CancellationToken.None).GetAwaiter().GetResult();
            if (deleted != 1 || history.Query("BM-TEST", now.AddHours(-2)).Count != 1)
                throw new InvalidOperationException("PK-batched history retention self-test failed.");
            // Direct Windows capture must work before an ESP hourly interval closes.
            history.RecordDesktopVoltage("BM-LIVE", now.AddSeconds(-40), 10.0);
            history.RecordDesktopVoltage("BM-LIVE", now.AddSeconds(-20), 14.0);
            var live = history.Query("BM-LIVE", now.AddMinutes(-1), maxBuckets: 1);
            if (live.Count != 1 || live[0].Samples != 2 ||
                Math.Abs(live[0].Average - 12.0) > 0.00001 ||
                Math.Abs(live[0].Minimum - 10.0) > 0.00001 ||
                Math.Abs(live[0].Maximum - 14.0) > 0.00001)
                throw new InvalidOperationException("Windows-primary persisted sampling/weighted graph failed.");

            // An old batch must compact to 5-minute and then hourly summaries,
            // preserving the min, max, number of observations and weighted mean.
            var historical = now.AddDays(-40).AddMinutes(-25);
            history.RecordDesktopVoltage("BM-ROLLUP", historical, 11);
            history.RecordDesktopVoltage("BM-ROLLUP", historical.AddSeconds(10), 13);
            history.RecordDesktopVoltage("BM-ROLLUP", historical.AddSeconds(20), 18);
            history.MaintainDesktopRollups(now);
            var rolled = history.Query("BM-ROLLUP", now.AddDays(-41), maxBuckets: 1);
            if (rolled.Count != 1 || rolled[0].Samples != 3 ||
                Math.Abs(rolled[0].Average - 14) > 0.00001 ||
                Math.Abs(rolled[0].Minimum - 11) > 0.00001 ||
                Math.Abs(rolled[0].Maximum - 18) > 0.00001)
                throw new InvalidOperationException("Tiered retention weighted rollup failed.");
            // Repeating compaction must never duplicate aggregate data.
            history.MaintainDesktopRollups(now);
            if (history.Query("BM-ROLLUP", now.AddDays(-41), maxBuckets: 1)[0].Samples != 3)
                throw new InvalidOperationException("History rollup was not idempotent.");

        }
        finally
        {
            // Self-test uses its own disposable temporary directory; production
            // history and device settings are never opened or touched.
            try { Directory.Delete(dir, recursive: true); } catch { }
        }
    }

    private static void RunDevicePasswordCompatibilitySelfTest()
    {
        const string formatted = "ABCD-EFGH-JKMN-PQRS";
        const string canonical = "ABCDEFGHJKMNPQRS";
        const string lowerFormatted = "abcd-efgh-jkmn-pqrs";
        const string nearMatch = "ABCO-EFGH-JKMN-PQRS"; // O is outside the historical alphabet.
        const string arbitrary = "custom-password";
        const string deviceId = "BM-A1B2C3";

        if (DevicePasswordRules.InitialCodeCompatibility(formatted) != canonical)
            throw new InvalidOperationException("Formatted legacy Device Password compatibility vector failed.");
        if (DevicePasswordRules.InitialCodeCompatibility(lowerFormatted) != canonical)
            throw new InvalidOperationException("Lowercase legacy Device Password compatibility vector failed.");
        if (DevicePasswordRules.InitialCodeCompatibility(nearMatch) != nearMatch)
            throw new InvalidOperationException("Near-match Device Password was incorrectly canonicalized.");
        if (DevicePasswordRules.InitialCodeCompatibility(arbitrary) != arbitrary)
            throw new InvalidOperationException("Arbitrary Device Password was incorrectly changed.");

        if (!DevicePasswordRules.DeriveSoftApPassword(deviceId, formatted)
                .Equals(DevicePasswordRules.DeriveSoftApPassword(deviceId, canonical), StringComparison.Ordinal))
            throw new InvalidOperationException("Legacy Device Password SoftAP derivation compatibility failed.");

        var formattedManagement = DevicePasswordRules.DeriveManagementKey(deviceId, formatted);
        var canonicalManagement = DevicePasswordRules.DeriveManagementKey(deviceId, canonical);
        try
        {
            if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(formattedManagement, canonicalManagement))
                throw new InvalidOperationException("Legacy Device Password management-key compatibility failed.");
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(formattedManagement);
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(canonicalManagement);
        }
    }
}
