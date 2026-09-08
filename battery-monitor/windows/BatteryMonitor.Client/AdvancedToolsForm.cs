namespace BatteryMonitor.Client;

internal sealed class AdvancedToolsForm : Form
{
    public AdvancedToolsForm()
    {
        Text = "Battery Monitor - Advanced Tools";
        Width = 490;
        Height = 290;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 5 };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Advanced tools are for factory/manufacturing setup-code/QR work or a signed first install on a blank, unencrypted ESP32. Normal Device Password initialization/rotation is available in Tools > USB Setup and does not require this area. The first-install image is not a recovery image after Flash Encryption has activated.",
            AutoSize = true,
            MaximumSize = new Size(440, 0)
        });

        var provisioning = new Button { Text = "Factory Setup Code / QR", AutoSize = true, Anchor = AnchorStyles.Left };
        provisioning.Click += (_, _) => { using var f = new ProvisioningAdminForm(); f.ShowDialog(this); };
        root.Controls.Add(provisioning);

        var firmware = new Button { Text = "Blank ESP32 First Install", AutoSize = true, Anchor = AnchorStyles.Left };
        firmware.Click += (_, _) => { using var f = new FirmwareFlashForm(); f.ShowDialog(this); };
        root.Controls.Add(firmware);

        root.Controls.Add(new Label
        {
            Text = "The factory code tool intentionally generates the historical 16-character printed-code format and QR metadata. Use USB Setup for an arbitrary normal Device Password. The app does not keep a plaintext copy of generated factory codes.",
            AutoSize = true,
            MaximumSize = new Size(440, 0)
        });

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);
    }
}
