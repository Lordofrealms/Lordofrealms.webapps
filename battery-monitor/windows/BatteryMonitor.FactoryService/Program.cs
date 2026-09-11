namespace BatteryMonitor.Client;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var gateOwner = new Form
        {
            ShowInTaskbar = false,
            Opacity = 0,
            Width = 1,
            Height = 1,
            StartPosition = FormStartPosition.CenterScreen
        };
        gateOwner.CreateControl();
        if (!AdminSecurity.Authenticate(gateOwner)) return;
        Application.Run(new FactoryMainForm());
        AdminSecurity.LockSession();
    }
}
