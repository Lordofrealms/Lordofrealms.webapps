using System.Drawing;

namespace BatteryMonitor.Client;

internal sealed class FirmwareFlashForm : Form
{
    private readonly EspFlasher _flasher = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Label _bundleStatus = new() { AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _buttons = new();
    private CancellationTokenSource? _cts;

    public FirmwareFlashForm()
    {
        Text = "Battery Monitor - Advanced Firmware Flash";
        Width = 700;
        Height = 560;
        MinimumSize = new Size(620, 480);
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

        var warning = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(650, 0),
            Text = "Advanced/recovery function. Flashing writes the complete bundled factory image at 0x0 and clears existing ESP32 settings, including Wi-Fi, calibration, and provisioning identity. Normal configuration does not require reflashing."
        };
        root.Controls.Add(warning, 0, 0); root.SetColumnSpan(warning, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh", (_, _) => RefreshPorts());
        var detect = MakeButton("Detect ESP32", async (_, _) => await DetectAsync());
        ports.Controls.AddRange(new Control[] { _port, refresh, detect });
        AddRow(root, 1, "USB serial port", ports);

        root.Controls.Add(_bundleStatus, 1, 2);

        var flash = MakeButton("Flash Factory Firmware", async (_, _) => await FlashAsync());
        root.Controls.Add(flash, 1, 3);

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
        var firmware = _flasher.FirmwarePath is null ? "firmware MISSING" : "firmware bundled";
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
                AppendLog($"Probing {candidate}...");
                var result = await _flasher.ProbeEsp32Async(candidate, token);
                if (!result.Success) continue;
                BeginInvoke(new Action(() => _port.SelectedItem = candidate));
                AppendLog($"ESP32 detected on {candidate}.");
                return;
            }
            throw new InvalidOperationException("No ESP32 responded on the available COM ports.");
        });
    }

    private async Task FlashAsync()
    {
        var port = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(port)) { MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!_flasher.IsReady) { MessageBox.Show(this, "The installed package is missing the bundled esptool or firmware image.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

        if (MessageBox.Show(this,
            "This factory flash erases the monitor's current settings and provisioning identity. Continue?",
            "Battery Monitor - Factory Flash", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        await RunAsync(async token =>
        {
            var result = await _flasher.FlashAsync(port, AppendLog, token);
            if (!result.Success) throw new InvalidOperationException("ESP32 flashing failed. See the log for details.");
            AppendLog("Factory firmware flash completed successfully.");
            BeginInvoke(new Action(() => MessageBox.Show(this,
                "Firmware flash completed. The device has factory settings and must be configured/provisioned again.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information)));
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
