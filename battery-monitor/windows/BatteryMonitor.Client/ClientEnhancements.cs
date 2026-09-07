namespace BatteryMonitor.Client;

internal static class ClientEnhancements
{
    public static void Attach(MainForm form, bool launchedAtStartup)
    {
        var toolbar = form.Controls
            .OfType<FlowLayoutPanel>()
            .FirstOrDefault(panel => panel.Dock == DockStyle.Top);

        if (toolbar is not null)
        {
            var usbSetup = new Button { Text = "USB Setup / Flash", AutoSize = true };
            usbSetup.Click += (_, _) =>
            {
                using var dialog = new UsbSetupForm();
                dialog.ShowDialog(form);
            };
            toolbar.Controls.Add(usbSetup);

            var startup = new CheckBox
            {
                Text = "Start with Windows",
                AutoSize = true,
                Checked = StartupManager.IsEnabled(),
                Margin = new Padding(12, 7, 3, 3)
            };
            startup.CheckedChanged += (_, _) =>
            {
                try
                {
                    StartupManager.SetEnabled(startup.Checked);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(form, $"Windows startup setting could not be changed.\n\n{ex.Message}", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    var actual = StartupManager.IsEnabled();
                    if (startup.Checked != actual) startup.Checked = actual;
                }
            };
            toolbar.Controls.Add(startup);
        }

        if (launchedAtStartup)
        {
            form.Shown += (_, _) =>
            {
                form.WindowState = FormWindowState.Minimized;
                // MainForm's Resize handler performs the normal hide-to-tray path.
                form.BeginInvoke(new Action(() => form.WindowState = FormWindowState.Minimized));
            };
        }
    }
}
