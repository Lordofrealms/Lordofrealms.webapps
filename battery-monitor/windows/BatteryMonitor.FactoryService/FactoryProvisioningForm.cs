using QRCoder;

namespace BatteryMonitor.Client;

internal sealed class FactoryProvisioningForm : Form
{
    private readonly EspFlasher _flasher = new();
    private readonly UsbProvisioner _usb = new();
    private readonly UsbSecurityInfoReader _security = new();
    private readonly FactoryLabelStore _labels = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(720, 0) };
    private readonly Label _device = new() { AutoSize = true };
    private readonly TextBox _password = new() { ReadOnly = true, Width = 230, Font = new Font("Consolas", 11, FontStyle.Bold) };
    private readonly PictureBox _qr = new() { Width = 260, Height = 260, SizeMode = PictureBoxSizeMode.Zoom, BorderStyle = BorderStyle.FixedSingle };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
    private readonly Button _provision = new() { Text = "Provision New Battery Monitor", AutoSize = true };
    private readonly Button _print = new() { Text = "Print Label", AutoSize = true, Enabled = false };
    private readonly Button _copy = new() { Text = "Copy Initial Password", AutoSize = true, Enabled = false };
    private CancellationTokenSource? _cts;
    private FactoryLabelRecord? _completed;

    public FactoryProvisioningForm()
    {
        Text = "Battery Monitor Factory - Provision New Unit";
        Icon = AppIcon.Current;
        Width = 850;
        Height = 780;
        MinimumSize = new Size(760, 680);
        StartPosition = FormStartPosition.CenterParent;
        BuildUi();
        RefreshPorts();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 8 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(800, 0),
            Text = "One factory workflow: verify and flash the signed first-install image to a genuinely blank/un-encrypted ESP32, wait for first boot, prove that release-mode Flash Encryption actually activated, initialize and verify the factory Device Password, then create the unit's QR/label record. Do not use this workflow as recovery on an already-encrypted unit."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        ports.Controls.Add(_port);
        var refresh = new Button { Text = "Refresh", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        var detect = new Button { Text = "Detect ESP32", AutoSize = true };
        detect.Click += async (_, _) => await DetectAsync();
        ports.Controls.Add(refresh); ports.Controls.Add(detect);
        AddRow(root, 1, "USB serial port", ports);

        _provision.Click += async (_, _) => await ProvisionAsync();
        root.Controls.Add(_provision, 1, 2);
        AddRow(root, 3, "Result", _device);
        AddRow(root, 4, "Initial password", _password);

        var result = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        result.Controls.Add(_qr);
        var resultActions = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false, Margin = new Padding(14, 4, 0, 0) };
        _copy.Click += (_, _) => { if (_completed is not null) Clipboard.SetText(ProvisioningCode.Format(ProvisioningCode.Normalize(_completed.InitialPassword))); };
        _print.Click += (_, _) => PrintCompleted();
        var queue = new Button { Text = "Open Label Queue", AutoSize = true };
        queue.Click += (_, _) => { using var f = new FactoryLabelManagerForm(); f.ShowDialog(this); };
        resultActions.Controls.Add(_copy); resultActions.Controls.Add(_print); resultActions.Controls.Add(queue);
        result.Controls.Add(resultActions);
        root.Controls.Add(result, 0, 5); root.SetColumnSpan(result, 2);

        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 6); root.SetColumnSpan(_log, 2);

        var footer = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        _status.Margin = new Padding(3, 8, 16, 3);
        footer.Controls.Add(close); footer.Controls.Add(_status);
        root.Controls.Add(footer, 0, 7); root.SetColumnSpan(footer, 2);
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private void RefreshPorts()
    {
        var old = _port.SelectedItem?.ToString();
        _port.Items.Clear();
        foreach (var p in _flasher.GetSerialPorts()) _port.Items.Add(p);
        if (old is not null && _port.Items.Contains(old)) _port.SelectedItem = old;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        _status.Text = _flasher.IsFactoryReady ? "Signed factory bundle ready." : "Factory package is missing esptool, firmware, or signature.";
    }

    private async Task DetectAsync()
    {
        SetBusy(true);
        try
        {
            foreach (var port in _port.Items.Cast<object>().Select(x => x.ToString()!).ToArray())
            {
                Append($"Probing {port}...");
                var result = await _flasher.ProbeEsp32Async(port);
                if (!result.Success) continue;
                _port.SelectedItem = port;
                Append($"ESP32 detected on {port}.");
                return;
            }
            MessageBox.Show(this, "No ESP32 responded on the available COM ports.", "Battery Monitor Factory", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { SetBusy(false); }
    }

    private async Task ProvisionAsync()
    {
        var port = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(port)) { MessageBox.Show(this, "Select a COM port first.", "Battery Monitor Factory", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!_flasher.IsFactoryReady) { MessageBox.Show(this, "The signed factory bundle is incomplete.", "Battery Monitor Factory", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
        if (MessageBox.Show(this,
                "Confirm this is a blank, unencrypted ESP32. This workflow performs the signed first install and the device will permanently activate release-mode Flash Encryption on first boot. Continue?",
                "Provision New Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;

        ClearResult();
        SetBusy(true);
        _cts = new CancellationTokenSource();
        try
        {
            var token = _cts.Token;
            var canonical = ProvisioningCode.Normalize(ProvisioningCode.GenerateFormatted());
            Append("Step 1/5: verifying signed factory image and flashing blank ESP32...");
            var flash = await _flasher.FactoryFlashAsync(port, Append, token);
            if (!flash.Success) throw new InvalidOperationException("Signed first-install flash failed. See the log. Do not bypass encrypted-flash protection with --force.");

            Append("Step 2/5: waiting for first boot and Battery Monitor firmware...");
            var status = await WaitForBatteryMonitorAsync(port, token);
            Append($"Battery Monitor is running as {status.DeviceId}, firmware {status.FirmwareVersion}.");

            Append("Step 3/5: proving first-boot production security state...");
            var security = await _security.ReadAsync(port, Append, token);
            Append($"Security state: Flash Encryption {(security.FlashEncryptionEnabled ? "enabled" : "disabled")} ({security.FlashEncryptionMode}), Secure Boot {(security.SecureBootEnabled ? "enabled" : "disabled")}, release sequence {security.ReleaseSequence}.");
            if (!security.ProductionFlashEncryptionReady)
                throw new InvalidOperationException($"Factory security verification failed: Flash Encryption must be enabled in release mode before this unit can be labeled (reported enabled={security.FlashEncryptionEnabled}, mode={security.FlashEncryptionMode}).");
            if (!string.Equals(security.FirmwareVersion, status.FirmwareVersion, StringComparison.Ordinal))
                throw new InvalidOperationException($"Factory security verification failed: firmware version changed during verification ({status.FirmwareVersion} vs {security.FirmwareVersion}).");
            if (security.SecureBootEnabled)
                Append("Secure Boot is active on this unit.");
            else
                Append("Secure Boot is not active; this is expected until the separate production Secure Boot/eFuse gate is approved.");

            Append("Step 4/5: initializing and verifying factory Device Password...");
            var identity = await _usb.ReadProvisioningIdentityAsync(port, Append, token);
            var username = identity.IsConfigured && !string.IsNullOrWhiteSpace(identity.Username) ? identity.Username : "batmon";
            await _usb.SetProvisioningCredentialAsync(port, username, canonical, Append, token);
            if (!await _usb.VerifyProvisioningCredentialAsync(port, canonical, Append, token))
                throw new InvalidOperationException("Factory Device Password write did not verify on the unit.");
            identity = await _usb.ReadProvisioningIdentityAsync(port, Append, token);
            if (!identity.IsConfigured || string.IsNullOrWhiteSpace(identity.SetupSsid))
                throw new InvalidOperationException("Provisioning identity was not available after credential initialization.");

            Append("Step 5/5: creating protected QR/label record...");
            var payload = ProvisioningCode.BuildQrPayload(status.DeviceId, identity.SetupSsid, identity.Username, canonical);
            var record = new FactoryLabelRecord
            {
                DeviceId = status.DeviceId,
                SetupSsid = identity.SetupSsid,
                Username = identity.Username,
                InitialPassword = canonical,
                QrPayload = payload,
                CreatedUtc = DateTime.UtcNow
            };
            _labels.AddOrReplace(record);
            ShowCompleted(record);
            Append("Factory provisioning complete. Flash Encryption release mode and Device Password were verified; QR/label record was added to the protected print queue.");
            _status.Text = "Provisioning complete and security-verified.";
        }
        catch (OperationCanceledException) { Append("Operation cancelled."); _status.Text = "Cancelled."; }
        catch (Exception ex)
        {
            Append("ERROR: " + ex.Message);
            _status.Text = "Provisioning failed.";
            MessageBox.Show(this, ex.Message, "Factory Provisioning Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _cts.Dispose(); _cts = null; SetBusy(false);
        }
    }

    private async Task<UsbMonitorStatus> WaitForBatteryMonitorAsync(string port, CancellationToken token)
    {
        var deadline = DateTime.UtcNow.AddMinutes(2);
        Exception? last = null;
        while (DateTime.UtcNow < deadline)
        {
            token.ThrowIfCancellationRequested();
            try { return await _usb.ReadStatusAsync(port, Append, token); }
            catch (Exception ex) { last = ex; }
            await Task.Delay(1500, token);
        }
        throw new TimeoutException("The flashed unit did not return as a Battery Monitor after first boot." + (last is null ? "" : " Last error: " + last.Message));
    }

    private void ShowCompleted(FactoryLabelRecord record)
    {
        _completed = record;
        _device.Text = $"{record.DeviceId} — {record.SetupSsid}";
        _password.Text = ProvisioningCode.Format(ProvisioningCode.Normalize(record.InitialPassword));
        var png = PngByteQRCodeHelper.GetQRCode(record.QrPayload, QRCodeGenerator.ECCLevel.Q, 12);
        using var ms = new MemoryStream(png);
        using var temp = Image.FromStream(ms);
        _qr.Image?.Dispose();
        _qr.Image = new Bitmap(temp);
        _copy.Enabled = true;
        _print.Enabled = true;
    }

    private void PrintCompleted()
    {
        if (_completed is null) return;
        using var document = new System.Drawing.Printing.PrintDocument { DocumentName = $"Battery Monitor {_completed.DeviceId}" };
        document.PrintPage += (_, e) => FactoryLabelManagerForm.DrawLabel(e.Graphics, e.MarginBounds, _completed);
        using var dialog = new PrintDialog { Document = document, UseEXDialog = true };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try { document.Print(); }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Label Printing Failed", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void ClearResult()
    {
        _completed = null;
        _device.Text = "";
        _password.Clear();
        _qr.Image?.Dispose(); _qr.Image = null;
        _copy.Enabled = false; _print.Enabled = false;
    }

    private void SetBusy(bool busy)
    {
        _provision.Enabled = !busy;
        _port.Enabled = !busy;
    }

    private void Append(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(Append), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _qr.Image?.Dispose(); _cts?.Dispose(); }
        base.Dispose(disposing);
    }
}
