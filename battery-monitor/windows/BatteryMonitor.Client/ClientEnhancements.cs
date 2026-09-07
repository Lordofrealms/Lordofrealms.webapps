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
            var usbSetup = new Button { Text = "USB Setup", AutoSize = true };
            usbSetup.Click += (_, _) =>
            {
                using var dialog = new UsbSetupForm();
                dialog.ShowDialog(form);
            };
            toolbar.Controls.Add(usbSetup);

            var wirelessSetup = new Button { Text = "Wireless Setup", AutoSize = true };
            wirelessSetup.Click += (_, _) =>
            {
                using var dialog = new WirelessSetupForm();
                dialog.ShowDialog(form);
            };
            toolbar.Controls.Add(wirelessSetup);

            var firmwareUpdate = new Button { Text = "Update Firmware", AutoSize = true };
            firmwareUpdate.Click += (_, _) =>
            {
                using var dialog = new FirmwareUpdateForm();
                dialog.ShowDialog(form);
            };
            toolbar.Controls.Add(firmwareUpdate);

            var advanced = new Button { Text = "Advanced...", AutoSize = true };
            advanced.Click += (_, _) =>
            {
                if (!AdminSecurity.Authenticate(form)) return;
                using var dialog = new AdvancedToolsForm();
                dialog.ShowDialog(form);
            };
            toolbar.Controls.Add(advanced);

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
                form.BeginInvoke(new Action(() => form.WindowState = FormWindowState.Minimized));
            };
        }
    }
}
