using System.Drawing;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class UsbSetupForm : Form
{
    private readonly UsbProvisioner _provisioner = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _deviceName = new();
    private readonly CheckBox _updateWifi = new() { Text = "Update home Wi-Fi credentials", AutoSize = true };
    private readonly TextBox _wifiSsid = new();
    private readonly TextBox _wifiPassword = new() { UseSystemPasswordChar = true };
    private readonly ComboBox _batteryType = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly NumericUpDown _sample = new();
    private readonly NumericUpDown _calFactor = new();
    private readonly NumericUpDown _calOffset = new();
    private readonly CheckBox _reboot = new() { Text = "Reboot device after saving", Checked = true, AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;

    public bool ConfigurationCompleted { get; private set; }

    public UsbSetupForm()
    {
        Text = "Battery Monitor - USB Setup";
        Icon = AppIcon.Current;
        Width = 700;
        Height = 690;
        MinimumSize = new Size(620, 600);
        StartPosition = FormStartPosition.CenterParent;

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        ConfigureNumeric(_calFactor, 0.5m, 1.5m, 6, 0.0001m);
        ConfigureNumeric(_calOffset, -5, 5, 4, 0.001m);

        _batteryType.Items.Add(new Choice("12 V Lead Acid", "lead_acid"));
        _batteryType.Items.Add(new Choice("4S LiFePO4", "lifepo4_4s"));
        _batteryType.SelectedIndex = 0;
        _sample.Value = 10;
        _calFactor.Value = 1.0m;
        ApplyPreset();

        _updateWifi.CheckedChanged += (_, _) => UpdateWifiEnabledState();
        BuildUi();
        UpdateWifiEnabledState();
        RefreshPorts();
        FormClosing += (_, _) => _operationCts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            ColumnCount = 2,
            RowCount = 14
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(640, 0),
            Text = "Connect an already-flashed Battery Monitor by USB. This is the normal trusted setup path for device name, Wi-Fi, battery thresholds, sample interval, and calibration. Firmware flashing and provisioning-code manufacture are under Advanced Tools."
        };
        root.Controls.Add(intro, 0, 0);
        root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh Ports", (_, _) => RefreshPorts());
        var read = MakeButton("Read Current", async (_, _) => await ReadCurrentAsync());
        portPanel.Controls.AddRange(new Control[] { _port, refresh, read });
        AddRow(root, 1, "USB serial port", portPanel);

        AddRow(root, 2, "Device name", _deviceName);

        root.Controls.Add(_updateWifi, 1, 3);
        AddRow(root, 4, "Home Wi-Fi SSID", _wifiSsid);
        AddRow(root, 5, "Home Wi-Fi password", _wifiPassword);
        var wifiNote = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(440, 0),
            Text = "The current SSID can be read, but the password is intentionally never returned. Leave 'Update home Wi-Fi credentials' unchecked to preserve the existing password."
        };
        root.Controls.Add(wifiNote, 1, 6);

        var batteryPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _batteryType.Width = 170;
        batteryPanel.Controls.Add(_batteryType);
        batteryPanel.Controls.Add(MakeButton("Apply Chemistry Defaults", (_, _) => ApplyPreset()));
        AddRow(root, 7, "Battery type", batteryPanel);

        var thresholds = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        thresholds.Controls.Add(new Label { Text = "Low", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        _low.Width = 90; thresholds.Controls.Add(_low);
        thresholds.Controls.Add(new Label { Text = "Critical", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        _critical.Width = 90; thresholds.Controls.Add(_critical);
        AddRow(root, 8, "Voltage thresholds", thresholds);

        AddRow(root, 9, "Sample interval (seconds)", _sample);
        var calibration = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        calibration.Controls.Add(new Label { Text = "Factor", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        _calFactor.Width = 105; calibration.Controls.Add(_calFactor);
        calibration.Controls.Add(new Label { Text = "Offset V", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        _calOffset.Width = 105; calibration.Controls.Add(_calOffset);
        AddRow(root, 10, "ADC calibration", calibration);

        var savePanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        var save = MakeButton("Save to Device", async (_, _) => await ConfigureAsync());
        savePanel.Controls.Add(save);
        savePanel.Controls.Add(_reboot);
        root.Controls.Add(savePanel, 0, 11);
        root.SetColumnSpan(savePanel, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 12);
        root.SetColumnSpan(_log, 2);

        for (var i = 0; i < 12; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 1, 13);
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
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear();
        _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
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
                _wifiPassword.Clear();
                _updateWifi.Checked = false;
                _batteryType.SelectedIndex = status.BatteryType == "lifepo4_4s" ? 1 : 0;
                _low.Value = Clamp((decimal)status.LowVoltage, _low);
                _critical.Value = Clamp((decimal)status.CriticalVoltage, _critical);
                _sample.Value = Clamp(status.SampleIntervalSec, _sample);
                _calFactor.Value = Clamp((decimal)status.CalibrationFactor, _calFactor);
                _calOffset.Value = Clamp((decimal)status.CalibrationOffset, _calOffset);
                AppendLog($"Loaded {status.DeviceId}: {status.Voltage:0.00} V; calibration {status.CalibrationFactor:0.######} / {status.CalibrationOffset:+0.####;-0.####;0} V.");
            }));
        });
    }

    private async Task ConfigureAsync()
    {
        var port = SelectedPort();
        if (port is null || !TryGetSettings(out var settings)) return;
        await RunOperationAsync(async token =>
        {
            await _provisioner.ConfigureAsync(port, settings, AppendLog, token);
            ConfigurationCompleted = true;
            AppendLog(settings.RebootAfterConfiguration
                ? "USB configuration complete. The device is rebooting."
                : "USB configuration complete.");
            BeginInvoke(new Action(() => MessageBox.Show(this,
                settings.RebootAfterConfiguration
                    ? "Configuration saved. The monitor is rebooting and should return on its configured Wi-Fi."
                    : "Configuration saved to the monitor.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        });
    }

    private bool TryGetSettings(out UsbProvisioningSettings settings)
    {
        settings = new UsbProvisioningSettings();
        var name = _deviceName.Text.Trim();
        if (name.Length < 1 || name.Length > 48)
        {
            MessageBox.Show(this, "Enter a device name between 1 and 48 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning voltage must be higher than the critical voltage.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (_updateWifi.Checked)
        {
            if (string.IsNullOrWhiteSpace(_wifiSsid.Text) || _wifiSsid.Text.Trim().Length > 32)
            {
                MessageBox.Show(this, "Enter a valid home Wi-Fi SSID (1-32 characters).", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            if (_wifiPassword.Text.Length > 63)
            {
                MessageBox.Show(this, "Wi-Fi password cannot exceed 63 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        settings = new UsbProvisioningSettings
        {
            DeviceName = name,
            UpdateWifi = _updateWifi.Checked,
            WifiSsid = _wifiSsid.Text.Trim(),
            WifiPassword = _wifiPassword.Text,
            BatteryType = (_batteryType.SelectedItem as Choice)?.Value ?? "lead_acid",
            LowVoltage = (double)_low.Value,
            CriticalVoltage = (double)_critical.Value,
            SampleIntervalSec = (int)_sample.Value,
            CalibrationFactor = (double)_calFactor.Value,
            CalibrationOffset = (double)_calOffset.Value,
            RebootAfterConfiguration = _reboot.Checked
        };
        return true;
    }

    private void UpdateWifiEnabledState()
    {
        _wifiSsid.Enabled = _updateWifi.Checked;
        _wifiPassword.Enabled = _updateWifi.Checked;
        if (!_updateWifi.Checked) _wifiPassword.Clear();
    }

    private async Task RunOperationAsync(Func<CancellationToken, Task> operation)
    {
        SetBusy(true);
        _operationCts = new CancellationTokenSource();
        try { await operation(_operationCts.Token); }
        catch (OperationCanceledException) { AppendLog("Operation cancelled."); }
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
        if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static void ConfigureNumeric(NumericUpDown control, decimal min, decimal max, int decimals, decimal increment)
    {
        control.Minimum = min; control.Maximum = max; control.DecimalPlaces = decimals; control.Increment = increment; control.Dock = DockStyle.Fill;
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill; root.Controls.Add(control, 1, row);
    }

    private static decimal Clamp(decimal value, NumericUpDown control) => Math.Max(control.Minimum, Math.Min(control.Maximum, value));
    private static int PortNumber(string p) => p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n) ? n : int.MaxValue;

    private sealed record Choice(string Text, string Value) { public override string ToString() => Text; }
}
