using System.Drawing;

namespace BatteryMonitor.Client;

internal sealed class FirmwareUpdateForm : Form
{
    private readonly EspFlasher _flasher = new();
    private readonly UsbProvisioner _provisioner = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Label _bundleStatus = new() { AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _buttons = new();
    private CancellationTokenSource? _cts;

    public FirmwareUpdateForm()
    {
        Text = "Battery Monitor - Firmware Update";
        Width = 700;
        Height = 520;
        MinimumSize = new Size(620, 450);
        StartPosition = FormStartPosition.CenterParent;
        BuildUi();
        RefreshPorts();
        UpdateBundleStatus();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 6 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(650, 0),
            Text = "Normal firmware update. This verifies that the selected USB device is already running Battery Monitor, then writes only the application partition. Wi-Fi credentials, setup identity/code verifier, battery settings, and ADC calibration are preserved. Use Advanced > Factory Flash only for blank-board/recovery work or a future partition-layout migration."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh", (_, _) => RefreshPorts());
        var detect = MakeButton("Detect Battery Monitor", async (_, _) => await DetectAsync());
        ports.Controls.AddRange(new Control[] { _port, refresh, detect });
        AddRow(root, 1, "USB serial port", ports);

        root.Controls.Add(_bundleStatus, 1, 2);
        var update = MakeButton("Update Firmware", async (_, _) => await UpdateAsync());
        root.Controls.Add(update, 1, 3);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 4); root.SetColumnSpan(_log, 2);
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 1, 5);
    }

    private Button MakeButton(string text, EventHandler handler)
    {
        var b = new Button { Text = text, AutoSize = true }; b.Click += handler; _buttons.Add(b); return b;
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        root.Controls.Add(control, 1, row);
    }

    private void RefreshPorts()
    {
        var previous = _port.SelectedItem?.ToString();
        _port.Items.Clear();
        foreach (var port in _flasher.GetSerialPorts()) _port.Items.Add(port);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(_port.Items.Count == 0 ? "No COM ports found." : $"Found {_port.Items.Count} COM port(s).");
    }

    private void UpdateBundleStatus()
    {
        var tool = _flasher.EsptoolPath is null ? "esptool MISSING" : "esptool bundled";
        var firmware = _flasher.UpdateFirmwarePath is null ? "update image MISSING" : "update image bundled";
        _bundleStatus.Text = $"Bundle: {tool}; {firmware}.";
    }

    private async Task DetectAsync()
    {
        if (_port.Items.Count == 0) RefreshPorts();
        if (_port.Items.Count == 0) return;
        await RunAsync(async token =>
        {
            foreach (var candidate in _port.Items.Cast<object>().Select(x => x.ToString()!).ToArray())
            {
                AppendLog($"Checking {candidate} for Battery Monitor USB protocol...");
                try
                {
                    var status = await _provisioner.ReadStatusAsync(candidate, AppendLog, token);
                    _port.SelectedItem = candidate;
                    AppendLog($"Battery Monitor {status.DeviceId} detected on {candidate} ({status.Voltage:0.00} V).");
                    return;
                }
                catch (OperationCanceledException) { throw; }
                catch { }
            }
            throw new InvalidOperationException("No running Battery Monitor firmware responded on the available COM ports. Use Advanced > Factory Flash / Recovery for a blank or damaged ESP32.");
        });
    }

    private async Task UpdateAsync()
    {
        var port = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(port)) { MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!_flasher.IsUpdateReady) { MessageBox.Show(this, "The installed package is missing the bundled update image or esptool.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

        await RunAsync(async token =>
        {
            AppendLog("Verifying Battery Monitor identity before update...");
            var status = await _provisioner.ReadStatusAsync(port, AppendLog, token);
            if (MessageBox.Show(this,
                    $"Update Battery Monitor {status.DeviceId} ({status.DeviceName}) while preserving its settings?",
                    "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            {
                AppendLog("Firmware update cancelled by user.");
                return;
            }

            AppendLog($"Verified {status.DeviceId}; entering bootloader and writing application partition only...");
            var result = await _flasher.UpdateFirmwareAsync(port, AppendLog, token);
            if (!result.Success) throw new InvalidOperationException("Firmware update failed. See the log for details.");
            AppendLog("Firmware update completed successfully; NVS/settings partitions were not written.");
            MessageBox.Show(this,
                "Firmware update completed. The monitor was reset and should return using its existing configuration.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
        });
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
    private void AppendLog(string text) { if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; } _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}"); }
}
