namespace BatteryMonitor.Client;

internal sealed class AdvancedToolsForm : Form
{
    public AdvancedToolsForm()
    {
        Text = "Battery Monitor - Advanced Tools";
        Width = 520;
        Height = 355;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 6 };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Advanced tools are for factory/manufacturing setup-code/QR work, signed first install on a blank unencrypted ESP32, and service-level Wi-Fi radio tuning. Normal Device Password initialization/rotation is available in Tools > USB Setup and does not require this area. The first-install image is not a recovery image after Flash Encryption has activated.",
            AutoSize = true,
            MaximumSize = new Size(470, 0)
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

        root.Controls.Add(new Label
        {
            Text = "Wi-Fi radio settings are stored on the monitor in encrypted NVS and apply immediately, so sleep mode or TX power can be changed later without rebuilding firmware. Factory-code tooling still uses the historical printed-code format; use USB Setup for an arbitrary normal Device Password.",
            AutoSize = true,
            MaximumSize = new Size(470, 0)
        });

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);
    }
}
