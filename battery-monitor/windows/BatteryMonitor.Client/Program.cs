namespace BatteryMonitor.Client;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--protocol-self-test", StringComparison.OrdinalIgnoreCase)))
        {
            // Forces MonitoringProtocol's deterministic P0-3 HMAC vector to run
            // without starting WinForms. Any vector/framing regression throws and
            // makes the process fail, which CI treats as a hard build failure.
            MonitoringProtocol.RunSelfTest();
            return;
        }

        ApplicationConfiguration.Initialize();
        var form = new MainForm();
        ClientEnhancements.Attach(form, args.Any(a => string.Equals(a, "--startup", StringComparison.OrdinalIgnoreCase)));
        Application.Run(form);
    }
}
