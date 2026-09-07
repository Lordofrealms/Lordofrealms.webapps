using System.Drawing;
using System.Globalization;

namespace BatteryMonitor.Client;

internal sealed class UsbSetupForm : Form
{
    private readonly EspFlasher _flasher = new();
    private readonly UsbProvisioner _provisioner = new();

    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _deviceName = new();
    private readonly TextBox _wifiSsid = new();
    private readonly TextBox _wifiPassword = new() { UseSystemPasswordChar = true };
    private readonly ComboBox _batteryType = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly NumericUpDown _sample = new();
    private readonly NumericUpDown _calFactor = new();
    private readonly NumericUpDown _calOffset = new();
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly Label _bundleStatus = new();
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;

    public bool ConfigurationCompleted { get; private set; }

    public UsbSetupForm()
    {
        Text = "Battery Monitor - USB Setup / Flash";
        Width = 720;
        Height = 760;
        MinimumSize = new Size(650, 650);
        StartPosition = FormStartPosition.CenterParent;

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        ConfigureNumeric(_calFactor, 0.5m, 1.5m, 6, 0.0001m);
        ConfigureNumeric(_calOffset, -5, 5, 4, 0.001m);

        _batteryType.Items.Add(new Choice("12 V Lead Acid", "lead_acid"));
        _batteryType.Items.Add(new Choice("4S LiFePO4", "lifepo4_4s"));
        _batteryType.SelectedIndex = 0;
        _batteryType.SelectedIndexChanged += (_, _) => ApplyPreset();
        _sample.Value = 10;
        _calFactor.Value = 1.0m;
        ApplyPreset();

        BuildUi();
        RefreshPorts();
        UpdateBundleStatus();
        FormClosing += (_, _) => _operationCts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            ColumnCount = 2,
            RowCount = 15
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(650, 0),
            Text = "Connect an ESP32-WROOM-32 development board by USB. A new board can be flashed and configured here; an existing Battery Monitor can be configured over USB without reflashing. Flashing the merged factory image clears prior ESP32 settings."
        };
        root.Controls.Add(intro, 0, 0);
        root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh Ports", (_, _) => RefreshPorts());
        var detect = MakeButton("Detect ESP32", async (_, _) => await DetectEsp32Async());
        portPanel.Controls.Add(_port);
        portPanel.Controls.Add(refresh);
        portPanel.Controls.Add(detect);
        AddRow(root, 1, "USB serial port", portPanel);

        _bundleStatus.AutoSize = true;
        root.Controls.Add(_bundleStatus, 1, 2);

        AddRow(root, 3, "Device name", _deviceName);
        AddRow(root, 4, "Home Wi-Fi SSID", _wifiSsid);
        AddRow(root, 5, "Home Wi-Fi password", _wifiPassword);
        AddRow(root, 6, "Battery type", _batteryType);

        var thresholds = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        thresholds.Controls.Add(new Label { Text = "Low", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        _low.Width = 90;
        thresholds.Controls.Add(_low);
        thresholds.Controls.Add(new Label { Text = "Critical", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        _critical.Width = 90;
        thresholds.Controls.Add(_critical);
        AddRow(root, 7, "Voltage thresholds", thresholds);

        AddRow(root, 8, "Sample interval (seconds)", _sample);

        var calibration = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        calibration.Controls.Add(new Label { Text = "Factor", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        _calFactor.Width = 105;
        calibration.Controls.Add(_calFactor);
        calibration.Controls.Add(new Label { Text = "Offset V", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        _calOffset.Width = 105;
        calibration.Controls.Add(_calOffset);
        AddRow(root, 9, "ADC calibration", calibration);

        var operations = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var read = MakeButton("Read Current", async (_, _) => await ReadCurrentAsync());
        var configure = MakeButton("Configure USB", async (_, _) => await ConfigureAsync(false));
        var flash = MakeButton("Flash Firmware", async (_, _) => await FlashOnlyAsync());
        var flashConfigure = MakeButton("Flash + Configure", async (_, _) => await ConfigureAsync(true));
        operations.Controls.AddRange(new Control[] { read, configure, flash, flashConfigure });
        root.Controls.Add(operations, 0, 10);
        root.SetColumnSpan(operations, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 11);
        root.SetColumnSpan(_log, 2);
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
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
        root.Controls.Add(close, 1, 12);
    }

    private Button MakeButton(string text, EventHandler handler)
    {
        var button = new Button { Text = text, AutoSize = true };
        button.Click += handler;
        _operationButtons.Add(button);
        return button;
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
        var tool = _flasher.EsptoolPath is not null ? "esptool bundled" : "esptool MISSING";
        var firmware = _flasher.FirmwarePath is not null ? "firmware bundled" : "firmware MISSING";
        _bundleStatus.Text = $"Bundle: {tool}; {firmware}.";
    }

    private async Task DetectEsp32Async()
    {
        if (_port.Items.Count == 0) RefreshPorts();
        if (_port.Items.Count == 0) return;

        await RunOperationAsync(async token =>
        {
            foreach (var item in _port.Items.Cast<object>().Select(x => x.ToString()!).ToArray())
            {
                AppendLog($"Probing {item} with esptool...");
                var result = await _flasher.ProbeEsp32Async(item, token);
                if (!result.Success) continue;
                BeginInvoke(new Action(() => _port.SelectedItem = item));
                AppendLog($"ESP32 detected on {item}.");
                return;
            }
            throw new InvalidOperationException("No ESP32 responded on the available COM ports.");
        });
    }

    private async Task ReadCurrentAsync()
    {
        var port = SelectedPort();
        if (port is null) return;

        await RunOperationAsync(async token =>
        {
            var status = await _provisioner.ReadStatusAsync(port, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                _deviceName.Text = status.DeviceName;
                _wifiSsid.Text = status.WifiSsid;
                _batteryType.SelectedIndex = status.BatteryType == "lifepo4_4s" ? 1 : 0;
                _low.Value = Clamp((decimal)status.LowVoltage, _low);
                _critical.Value = Clamp((decimal)status.CriticalVoltage, _critical);
                _sample.Value = Clamp(status.SampleIntervalSec, _sample);
                AppendLog($"Loaded {status.DeviceId}: {status.Voltage:0.00} V.");
            }));
        });
    }

    private async Task FlashOnlyAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        if (!_flasher.IsReady)
        {
            MessageBox.Show(this, "The Windows package does not contain both esptool and the merged firmware image.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        if (MessageBox.Show(this, "Flash the bundled Battery Monitor factory image? This clears any settings currently stored on the ESP32.", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        await RunOperationAsync(async token =>
        {
            var result = await _flasher.FlashAsync(port, AppendLog, token);
            if (!result.Success) throw new InvalidOperationException("ESP32 flashing failed. See the log for details.");
            AppendLog("Flash completed and verified by esptool. The ESP32 was reset into Battery Monitor firmware.");
        });
    }

    private async Task ConfigureAsync(bool flashFirst)
    {
        var port = SelectedPort();
        if (port is null) return;
        if (!TryGetSettings(out var settings)) return;

        if (flashFirst)
        {
            if (!_flasher.IsReady)
            {
                MessageBox.Show(this, "The Windows package does not contain both esptool and the merged firmware image.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (MessageBox.Show(this, "Flash the ESP32 and then configure it over USB? Flashing clears any existing ESP32 settings.", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        }

        await RunOperationAsync(async token =>
        {
            if (flashFirst)
            {
                AppendLog("Starting ESP32 factory flash...");
                var flash = await _flasher.FlashAsync(port, AppendLog, token);
                if (!flash.Success) throw new InvalidOperationException("ESP32 flashing failed. See the log for details.");
                AppendLog("Flash complete. Waiting for Battery Monitor firmware to start...");
                await Task.Delay(1400, token);
            }

            await _provisioner.ConfigureAsync(port, settings, AppendLog, token);
            ConfigurationCompleted = true;
            AppendLog("USB configuration complete. The ESP32 is rebooting and should join the configured Wi-Fi. The main client will auto-discover it when it appears on the LAN.");
            BeginInvoke(new Action(() => MessageBox.Show(this,
                "Configuration complete. The monitor is rebooting and will attempt to join your Wi-Fi. Return to the main window and it should appear automatically when reachable.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        });
    }

    private bool TryGetSettings(out UsbProvisioningSettings settings)
    {
        settings = new UsbProvisioningSettings();
        var name = _deviceName.Text.Trim();
        var ssid = _wifiSsid.Text.Trim();
        if (name.Length < 1 || name.Length > 48)
        {
            MessageBox.Show(this, "Enter a device name between 1 and 48 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (ssid.Length > 32)
        {
            MessageBox.Show(this, "Wi-Fi SSID cannot exceed 32 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (_wifiPassword.Text.Length > 63)
        {
            MessageBox.Show(this, "Wi-Fi password cannot exceed 63 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning voltage must be higher than the critical voltage.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        settings = new UsbProvisioningSettings
        {
            DeviceName = name,
            WifiSsid = ssid,
            WifiPassword = _wifiPassword.Text,
            BatteryType = (_batteryType.SelectedItem as Choice)?.Value ?? "lead_acid",
            LowVoltage = (double)_low.Value,
            CriticalVoltage = (double)_critical.Value,
            SampleIntervalSec = (int)_sample.Value,
            CalibrationFactor = (double)_calFactor.Value,
            CalibrationOffset = (double)_calOffset.Value,
            RebootAfterConfiguration = true
        };
        return true;
    }

    private async Task RunOperationAsync(Func<CancellationToken, Task> operation)
    {
        SetBusy(true);
        _operationCts = new CancellationTokenSource();
        try
        {
            await operation(_operationCts.Token);
        }
        catch (OperationCanceledException)
        {
            AppendLog("Operation cancelled.");
        }
        catch (Exception ex)
        {
            AppendLog("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _operationCts.Dispose();
            _operationCts = null;
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        foreach (var button in _operationButtons) button.Enabled = !busy;
        _port.Enabled = !busy;
    }

    private string? SelectedPort()
    {
        var port = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(port)) return port;
        MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private void ApplyPreset()
    {
        var lifepo4 = (_batteryType.SelectedItem as Choice)?.Value == "lifepo4_4s";
        _low.Value = lifepo4 ? 12.80m : 12.20m;
        _critical.Value = lifepo4 ? 12.00m : 11.90m;
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action<string>(AppendLog), text);
            return;
        }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static void ConfigureNumeric(NumericUpDown control, decimal min, decimal max, int decimals, decimal increment)
    {
        control.Minimum = min;
        control.Maximum = max;
        control.DecimalPlaces = decimals;
        control.Increment = increment;
        control.Dock = DockStyle.Fill;
    }

    private static void AddRow(TableLayoutPanel table, int row, string label, Control control)
    {
        table.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control, 1, row);
    }

    private static decimal Clamp(decimal value, NumericUpDown control) => Math.Max(control.Minimum, Math.Min(control.Maximum, value));

    private sealed record Choice(string Text, string Value)
    {
        public override string ToString() => Text;
    }
}
