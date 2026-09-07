namespace BatteryMonitor.Client;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var form = new MainForm();
        ClientEnhancements.Attach(form, args.Any(a => string.Equals(a, "--startup", StringComparison.OrdinalIgnoreCase)));
        Application.Run(form);
    }
}
