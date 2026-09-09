namespace BatteryMonitor.Client;

internal sealed class AdvancedToolsForm : Form
{
    public AdvancedToolsForm()
    {
        Text = "Battery Monitor - Advanced Tools";
        Width = 540;
        Height = 410;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 7 };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Advanced tools are for factory/manufacturing setup-code/QR work, signed first install on a blank unencrypted ESP32, service-level Wi-Fi radio tuning, and engineering diagnostics. Normal Device Password initialization/rotation is available in Tools > USB Setup and does not require this area. The first-install image is not a recovery image after Flash Encryption has activated.",
            AutoSize = true,
            MaximumSize = new Size(490, 0)
        });

        var provisioning = new Button { Text = "Factory Setup Code / QR", AutoSize = true, Anchor = AnchorStyles.Left };
        provisioning.Click += (_, _) => { using var f = new ProvisioningAdminForm(); f.ShowDialog(this); };
        root.Controls.Add(provisioning);

        var firmware = new Button { Text = "Blank ESP32 First Install", AutoSize = true, Anchor = AnchorStyles.Left };
        firmware.Click += (_, _) => { using var f = new FirmwareFlashForm(); f.ShowDialog(this); };
        root.Controls.Add(firmware);

        var radio = new Button { Text = "Wi-Fi Radio Settings", AutoSize = true, Anchor = AnchorStyles.Left };
        radio.Click += (_, _) => { using var f = new WifiRadioSettingsForm(); f.ShowDialog(this); };
        root.Controls.Add(radio);

        var diagnostics = new Button { Text = "HTTP Diagnostics", AutoSize = true, Anchor = AnchorStyles.Left };
        diagnostics.Click += (_, _) => { using var f = new HttpDiagnosticsForm(); f.ShowDialog(this); };
        root.Controls.Add(diagnostics);

        root.Controls.Add(new Label
        {
            Text = "HTTP Diagnostics is an engineering/service tool. Source Timing performs one uncached NVS/Wi-Fi/ADC probe; Live HTTP Trace records producer, cache, JSON, and socket-send timings while a slow website load is reproduced. Trace is off by default and resets off at reboot.",
            AutoSize = true,
            MaximumSize = new Size(490, 0)
        });

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);
    }
}
