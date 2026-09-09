namespace BatteryMonitor.Client;

internal sealed class AdvancedToolsForm : Form
{
    public AdvancedToolsForm()
    {
        Text = "Battery Monitor - Advanced Tools";
        Width = 600;
        Height = 550;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 10 };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Advanced tools are for factory/manufacturing setup-code/QR work, signed first install on a blank unencrypted ESP32, service-level Wi-Fi/HTTP transport tuning, hardware verification, trusted-USB serial interaction, and engineering diagnostics. Normal Device Password initialization/rotation is available in Tools > USB Setup and does not require this area. The first-install image is not a recovery image after Flash Encryption has activated.",
            AutoSize = true,
            MaximumSize = new Size(550, 0)
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

        var http = new Button { Text = "HTTP Transport Settings", AutoSize = true, Anchor = AnchorStyles.Left };
        http.Click += (_, _) => { using var f = new HttpRuntimeSettingsForm(); f.ShowDialog(this); };
        root.Controls.Add(http);

        var hardware = new Button { Text = "Hardware Identity", AutoSize = true, Anchor = AnchorStyles.Left };
        hardware.Click += (_, _) => { using var f = new HardwareIdentityForm(); f.ShowDialog(this); };
        root.Controls.Add(hardware);

        var serial = new Button { Text = "Serial Console", AutoSize = true, Anchor = AnchorStyles.Left };
        serial.Click += (_, _) => { using var f = new SerialConsoleForm(); f.ShowDialog(this); };
        root.Controls.Add(serial);

        var diagnostics = new Button { Text = "HTTP Diagnostics", AutoSize = true, Anchor = AnchorStyles.Left };
        diagnostics.Click += (_, _) => { using var f = new HttpDiagnosticsForm(); f.ShowDialog(this); };
        root.Controls.Add(diagnostics);

        root.Controls.Add(new Label
        {
            Text = "HTTP Transport Settings changes the monitor's persisted native-HTTP client limit; the 12,288-byte TCP send buffer and 30-socket lwIP ceiling are firmware build settings. Hardware Identity reads the actual chip package/core information. Serial Console keeps one trusted USB port open for raw line-oriented BATMON1 commands and includes quick Wi-Fi diagnostics; firmware-transfer commands are blocked there and remain owned by the signed updater.",
            AutoSize = true,
            MaximumSize = new Size(550, 0)
        });

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);
    }
}
