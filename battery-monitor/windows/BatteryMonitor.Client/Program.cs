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

        ApplicationConfiguration.Initialize();
        var form = new MainForm();
        ClientEnhancements.Attach(form, args.Any(a => string.Equals(a, "--startup", StringComparison.OrdinalIgnoreCase)));
        Application.Run(form);
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
