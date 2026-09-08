namespace BatteryMonitor.Client;

internal static class ClientEnhancements
{
    public static void Attach(MainForm form, bool launchedAtStartup)
    {
        if (!launchedAtStartup) return;

        form.Shown += (_, _) =>
        {
            form.WindowState = FormWindowState.Minimized;
            form.BeginInvoke(new Action(() => form.WindowState = FormWindowState.Minimized));
        };
    }
}
