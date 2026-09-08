using QRCoder;
using System.Drawing;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class ProvisioningAdminForm : Form
{
    private readonly UsbProvisioner _provisioner = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _setupCode = new() { Width = 250, CharacterCasing = CharacterCasing.Upper };
    private readonly Label _deviceLabel = new() { AutoSize = true };
    private readonly Label _identityLabel = new() { AutoSize = true };
    private readonly PictureBox _qr = new() { SizeMode = PictureBoxSizeMode.Zoom, Width = 280, Height = 280, BorderStyle = BorderStyle.FixedSingle };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _buttons = new();
    private CancellationTokenSource? _cts;
    private string _deviceId = "";
    private string _setupSsid = "";
    private string _username = "batmon";
    private byte[]? _qrPng;

    public ProvisioningAdminForm()
    {
        Text = "Battery Monitor - Factory Setup Code / QR";
        Width = 760;
        Height = 780;
        MinimumSize = new Size(680, 660);
        StartPosition = FormStartPosition.CenterParent;
        BuildUi();
        RefreshPorts();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 9 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(700, 0),
            Text = "Factory/manufacturing tool for the historical 16-character / 80-bit printed initial Device Password and matching QR. Use Tools > USB Setup for an arbitrary normal Device Password. A factory code written here is never readable back from the ESP32."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh", (_, _) => RefreshPorts());
        var read = MakeButton("Read Device", async (_, _) => await ReadDeviceAsync());
        ports.Controls.AddRange(new Control[] { _port, refresh, read });
        AddRow(root, 1, "USB serial port", ports);
        AddRow(root, 2, "Device", _deviceLabel);
        AddRow(root, 3, "Provisioning", _identityLabel);

        var codePanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var generate = MakeButton("Generate New", (_, _) => GenerateCode());
        var copy = MakeButton("Copy Code", (_, _) => CopyCode());
        codePanel.Controls.AddRange(new Control[] { _setupCode, generate, copy });
        AddRow(root, 4, "Factory setup code", codePanel);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var write = MakeButton("Write / Rotate Factory Code", async (_, _) => await WriteCredentialAsync());
        var verify = MakeButton("Verify Factory Code", async (_, _) => await VerifyCodeAsync());
        var saveQr = MakeButton("Save QR PNG", (_, _) => SaveQr());
        actions.Controls.AddRange(new Control[] { write, verify, saveQr });
        root.Controls.Add(actions, 0, 5); root.SetColumnSpan(actions, 2);

        var qrPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.LeftToRight };
        qrPanel.Controls.Add(_qr);
        var qrNote = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(330, 0),
            Margin = new Padding(14, 8, 3, 3),
            Text = "The QR contains the same factory code plus the derived WPA2 setup-network password and Espressif Security-2 metadata. Treat a saved/printed QR exactly like the printed initial Device Password."
        };
        qrPanel.Controls.Add(qrNote);
        root.Controls.Add(qrPanel, 0, 6); root.SetColumnSpan(qrPanel, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 7); root.SetColumnSpan(_log, 2);
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 1, 8);
    }

    private Button MakeButton(string text, EventHandler handler)
    {
        var b = new Button { Text = text, AutoSize = true };
        b.Click += handler; _buttons.Add(b); return b;
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private void RefreshPorts()
    {
        var previous = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear(); _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
    }

    private async Task ReadDeviceAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        await RunAsync(async token =>
        {
            var status = await _provisioner.ReadStatusAsync(port, AppendLog, token);
            var identity = await _provisioner.ReadProvisioningIdentityAsync(port, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                // A code shown for a previously read unit must never be rebound to
                // a new Device ID and saved as a QR label before it is written and
                // verified on that device. Credentials are intentionally unreadable.
                _setupCode.Clear();
                _qrPng = null;
                _qr.Image?.Dispose();
                _qr.Image = null;

                _deviceId = status.DeviceId;
                _deviceLabel.Text = $"{status.DeviceId} — {status.DeviceName}";
                if (identity.IsConfigured)
                {
                    _username = identity.Username;
                    _setupSsid = identity.SetupSsid;
                    _identityLabel.Text = $"Configured: {identity.Security}, {_setupSsid}, user {_username}. Current code/password cannot be read back.";
                }
                else
                {
                    _username = "batmon";
                    _setupSsid = "BatteryMonitor-" + status.DeviceId.Replace("BM-", "", StringComparison.OrdinalIgnoreCase);
                    _identityLabel.Text = "Not initialized — generate and write a factory setup code, or use normal USB Setup for a flexible Device Password.";
                }
            }));
        });
    }

    private void GenerateCode()
    {
        _setupCode.Text = ProvisioningCode.GenerateFormatted();
        RebuildQr();
        AppendLog("Generated a new 80-bit factory setup code in memory. It has not been written to the ESP32 yet.");
    }

    private async Task WriteCredentialAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        var canonical = ProvisioningCode.Normalize(_setupCode.Text);
        if (canonical.Length != 16) { MessageBox.Show(this, "Enter or generate a valid 16-character factory setup code.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (string.IsNullOrWhiteSpace(_deviceId)) { MessageBox.Show(this, "Read the connected device first so its identity is known.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (MessageBox.Show(this, "Write this factory setup code to the connected device? If the device already has a Device Password, this replaces it and old saved passwords/labels/codes will stop working.", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        await RunAsync(async token =>
        {
            await _provisioner.SetProvisioningCredentialAsync(port, _username, canonical, AppendLog, token);
            var matched = await _provisioner.VerifyProvisioningCredentialAsync(port, canonical, AppendLog, token);
            if (!matched) throw new InvalidOperationException("The ESP32 accepted the factory credential write but did not verify the same code afterward.");
            var identity = await _provisioner.ReadProvisioningIdentityAsync(port, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                _setupCode.Text = ProvisioningCode.Format(canonical);
                _setupSsid = identity.SetupSsid;
                _username = identity.Username;
                _identityLabel.Text = $"Configured and verified: {identity.Security}, {_setupSsid}, user {_username}";
                RebuildQr();
                MessageBox.Show(this, "Factory setup code written and verified. Save/print the QR or record the displayed code before closing this window.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
        });
    }

    private async Task VerifyCodeAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        var canonical = ProvisioningCode.Normalize(_setupCode.Text);
        if (canonical.Length != 16) { MessageBox.Show(this, "Enter a valid factory setup code to verify.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        await RunAsync(async token =>
        {
            var matched = await _provisioner.VerifyProvisioningCredentialAsync(port, canonical, AppendLog, token);
            BeginInvoke(new Action(() => MessageBox.Show(this,
                matched ? "The factory setup code matches this ESP32's current Device Password." : "The factory setup code does NOT match this ESP32's current Device Password.",
                "Battery Monitor", MessageBoxButtons.OK, matched ? MessageBoxIcon.Information : MessageBoxIcon.Warning)));
        });
    }

    private void CopyCode()
    {
        var canonical = ProvisioningCode.Normalize(_setupCode.Text);
        if (canonical.Length != 16) return;
        Clipboard.SetText(ProvisioningCode.Format(canonical));
    }

    private void RebuildQr()
    {
        _qrPng = null;
        _qr.Image?.Dispose(); _qr.Image = null;
        var canonical = ProvisioningCode.Normalize(_setupCode.Text);
        if (canonical.Length != 16 || string.IsNullOrWhiteSpace(_deviceId) || string.IsNullOrWhiteSpace(_setupSsid)) return;
        var payload = ProvisioningCode.BuildQrPayload(_deviceId, _setupSsid, _username, canonical);
        _qrPng = PngByteQRCodeHelper.GetQRCode(payload, QRCodeGenerator.ECCLevel.Q, 12);
        using var ms = new MemoryStream(_qrPng);
        using var temp = Image.FromStream(ms);
        _qr.Image = new Bitmap(temp);
    }

    private void SaveQr()
    {
        if (_qrPng is null) { MessageBox.Show(this, "Read the device and enter/generate a factory setup code first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        using var dialog = new SaveFileDialog { Filter = "PNG image|*.png", FileName = string.IsNullOrWhiteSpace(_deviceId) ? "BatteryMonitor-Setup.png" : $"{_deviceId}-Setup-QR.png" };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        File.WriteAllBytes(dialog.FileName, _qrPng);
    }

    private async Task RunAsync(Func<CancellationToken, Task> action)
    {
        SetBusy(true); _cts = new CancellationTokenSource();
        try { await action(_cts.Token); }
        catch (OperationCanceledException) { AppendLog("Operation cancelled."); }
        catch (Exception ex) { AppendLog("ERROR: " + ex.Message); MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { _cts.Dispose(); _cts = null; SetBusy(false); }
    }

    private void SetBusy(bool busy) { foreach (var b in _buttons) b.Enabled = !busy; _port.Enabled = !busy; }
    private string? SelectedPort() { var p = _port.SelectedItem?.ToString(); if (!string.IsNullOrWhiteSpace(p)) return p; MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return null; }
    private void AppendLog(string text) { if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; } _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}"); }
    private static int PortNumber(string p) => p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n) ? n : int.MaxValue;

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _qr.Image?.Dispose(); _cts?.Dispose(); }
        base.Dispose(disposing);
    }
}
