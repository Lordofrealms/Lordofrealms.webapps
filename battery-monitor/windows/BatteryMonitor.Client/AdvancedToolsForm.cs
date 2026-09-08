namespace BatteryMonitor.Client;

internal sealed class AdvancedToolsForm : Form
{
    public AdvancedToolsForm()
    {
        Text = "Battery Monitor - Advanced Tools";
        Width = 470;
        Height = 270;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 5 };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Advanced tools can rotate device setup credentials or perform a signed first install on a blank, unencrypted ESP32. The first-install image is not a recovery image after Flash Encryption has activated. Ordinary USB configuration is available from the main window without entering this area.",
            AutoSize = true,
            MaximumSize = new Size(420, 0)
        });

        var provisioning = new Button { Text = "Provisioning Setup Code / QR...", AutoSize = true, Anchor = AnchorStyles.Left };
        provisioning.Click += (_, _) => { using var f = new ProvisioningAdminForm(); f.ShowDialog(this); };
        root.Controls.Add(provisioning);

        var firmware = new Button { Text = "Blank ESP32 First Install...", AutoSize = true, Anchor = AnchorStyles.Left };
        firmware.Click += (_, _) => { using var f = new FirmwareFlashForm(); f.ShowDialog(this); };
        root.Controls.Add(firmware);

        root.Controls.Add(new Label
        {
            Text = "Provisioning-code generation/rotation is intentionally separate from normal Wi-Fi and battery settings. The app does not keep a copy of generated setup codes.",
            AutoSize = true,
            MaximumSize = new Size(420, 0)
        });

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);
    }
}
