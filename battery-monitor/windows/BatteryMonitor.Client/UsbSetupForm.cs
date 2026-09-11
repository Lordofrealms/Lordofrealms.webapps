using System.Drawing;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class UsbSetupForm : Form
{
    private readonly UsbProvisioner _provisioner = new();
    private readonly DeviceCredentialStore _credentials = new();
    private readonly BatteryProfileCatalog _profiles = BatteryProfileCatalog.Current;
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Label _passwordStatus = new() { AutoSize = true };
    private readonly TextBox _devicePassword = new() { UseSystemPasswordChar = true };
    private readonly TextBox _confirmDevicePassword = new() { UseSystemPasswordChar = true };
    private readonly CheckBox _showDevicePassword = new() { Text = "Show Device Password", AutoSize = true };
    private readonly CheckBox _rememberDevicePassword = new() { Text = "Remember on this Windows account", Checked = true, AutoSize = true };
    private readonly TextBox _deviceName = new();
    private readonly CheckBox _updateWifi = new() { Text = "Update home Wi-Fi credentials", AutoSize = true };
    private readonly TextBox _wifiSsid = new();
    private readonly TextBox _wifiPassword = new() { UseSystemPasswordChar = true };
    private readonly ComboBox _batteryType = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly NumericUpDown _sample = new();
    private readonly CheckBox _reboot = new() { Text = "Reboot device after saving", Checked = true, AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;
    private string _deviceId = "";
    private string _provisioningUsername = "batmon";
    private double _currentCalibrationFactor = 1.0;
    private double _currentCalibrationOffset;
    private bool _deviceLoaded;

    public bool ConfigurationCompleted { get; private set; }

    public UsbSetupForm()
    {
        Text = "Battery Monitor - USB Setup / Recovery";
        Icon = AppIcon.Current;
        Width = 760;
        Height = 790;
        MinimumSize = new Size(660, 660);
        StartPosition = FormStartPosition.CenterParent;

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        LoadBatteryProfiles();
        _sample.Value = 10;
        ApplyProfileDefaults();

        _updateWifi.CheckedChanged += (_, _) => UpdateWifiEnabledState();
        _showDevicePassword.CheckedChanged += (_, _) =>
        {
            var hide = !_showDevicePassword.Checked;
            _devicePassword.UseSystemPasswordChar = hide;
            _confirmDevicePassword.UseSystemPasswordChar = hide;
        };
        BuildUi();
        UpdateWifiEnabledState();
        RefreshPorts();
        FormClosing += (_, _) => _operationCts?.Cancel();
    }

    private void LoadBatteryProfiles(string? selectId = null, double? currentLow = null, double? currentCritical = null)
    {
        _profiles.Reload();
        _batteryType.Items.Clear();
        foreach (var profile in _profiles.All) _batteryType.Items.Add(profile);
        if (!string.IsNullOrWhiteSpace(selectId) && _profiles.Find(selectId) is null)
        {
            _batteryType.Items.Add(new BatteryProfile
            {
                Id = selectId,
                Name = "Custom Battery",
                LowVoltage = currentLow ?? 12.20,
                CriticalVoltage = currentCritical ?? 11.90,
                BuiltIn = false
            });
        }

        var selected = -1;
        if (!string.IsNullOrWhiteSpace(selectId))
        {
            for (var i = 0; i < _batteryType.Items.Count; i++)
            {
                if (_batteryType.Items[i] is BatteryProfile profile && profile.Id.Equals(selectId, StringComparison.OrdinalIgnoreCase))
                {
                    selected = i;
                    break;
                }
            }
        }
        _batteryType.SelectedIndex = selected >= 0 ? selected : (_batteryType.Items.Count > 0 ? 0 : -1);
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 2, RowCount = 17 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(690, 0),
            Text = "Connect an already-flashed Battery Monitor by USB. This is the normal setup/recovery path for Device Password, device name, Wi-Fi, battery profile/thresholds, and sample interval. Existing calibration is preserved and can only be changed with the separate Factory & Service application."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh Ports", (_, _) => RefreshPorts());
        var read = MakeButton("Read Current", async (_, _) => await ReadCurrentAsync());
        portPanel.Controls.AddRange([_port, refresh, read]);
        AddRow(root, 1, "USB serial port", portPanel);

        AddRow(root, 2, "Device Password", _passwordStatus);
        AddRow(root, 3, "New Device Password", _devicePassword);
        AddRow(root, 4, "Confirm password", _confirmDevicePassword);

        var passwordActions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        passwordActions.Controls.Add(_showDevicePassword);
        passwordActions.Controls.Add(_rememberDevicePassword);
        passwordActions.Controls.Add(MakeButton("Set / Rotate Device Password", async (_, _) => await SetDevicePasswordAsync()));
        root.Controls.Add(passwordActions, 1, 5);

        AddRow(root, 6, "Device name", _deviceName);
        root.Controls.Add(_updateWifi, 1, 7);
        AddRow(root, 8, "Home Wi-Fi SSID", _wifiSsid);
        AddRow(root, 9, "Home Wi-Fi password", _wifiPassword);
        var wifiNote = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(500, 0),
            Text = "The current SSID can be read, but the password is intentionally never returned. Leave Update home Wi-Fi credentials unchecked to preserve the existing password."
        };
        root.Controls.Add(wifiNote, 1, 10);

        var batteryPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _batteryType.Width = 250;
        batteryPanel.Controls.Add(_batteryType);
        var manage = new Button { Text = "⚙", AutoSize = true, AccessibleName = "Manage Battery Profiles", Margin = new Padding(8, 3, 3, 3) };
        var tip = new ToolTip();
        tip.SetToolTip(manage, "Manage Battery Profiles");
        manage.Click += (_, _) => ManageProfiles();
        batteryPanel.Controls.Add(manage);
        batteryPanel.Controls.Add(MakeButton("Apply Profile Defaults", (_, _) => ApplyProfileDefaults()));
        AddRow(root, 11, "Battery profile", batteryPanel);

        var thresholds = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        thresholds.Controls.Add(new Label { Text = "Low", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        _low.Width = 90; thresholds.Controls.Add(_low);
        thresholds.Controls.Add(new Label { Text = "Critical", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        _critical.Width = 90; thresholds.Controls.Add(_critical);
        AddRow(root, 12, "Voltage thresholds", thresholds);
        AddRow(root, 13, "Sample interval (seconds)", _sample);

        var savePanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        var save = MakeButton("Save to Device", async (_, _) => await ConfigureAsync());
        savePanel.Controls.Add(save); savePanel.Controls.Add(_reboot);
        root.Controls.Add(savePanel, 0, 14); root.SetColumnSpan(savePanel, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 15); root.SetColumnSpan(_log, 2);
        for (var i = 0; i < 15; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 1, 16);
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
        _port.Items.Clear(); _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
    }

    private async Task ReadCurrentAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        await RunOperationAsync(async token =>
        {
            var status = await _provisioner.ReadStatusAsync(port, AppendLog, token);
            var identity = await _provisioner.ReadProvisioningIdentityAsync(port, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                _deviceId = status.DeviceId;
                _deviceLoaded = true;
                _provisioningUsername = identity.IsConfigured && !string.IsNullOrWhiteSpace(identity.Username) ? identity.Username : "batmon";
                _currentCalibrationFactor = status.CalibrationFactor;
                _currentCalibrationOffset = status.CalibrationOffset;
                UpdatePasswordStatus(identity.IsConfigured);
                _deviceName.Text = status.DeviceName;
                _wifiSsid.Text = status.WifiSsid;
                _wifiPassword.Clear();
                _updateWifi.Checked = false;
                LoadBatteryProfiles(status.BatteryType, status.LowVoltage, status.CriticalVoltage);
                _low.Value = Clamp((decimal)status.LowVoltage, _low);
                _critical.Value = Clamp((decimal)status.CriticalVoltage, _critical);
                _sample.Value = Clamp(status.SampleIntervalSec, _sample);
                var fw = string.IsNullOrWhiteSpace(status.FirmwareVersion) ? "unknown" : status.FirmwareVersion;
                AppendLog($"Loaded {status.DeviceId}: FW {fw}; {status.Voltage:0.00} V; profile {BatteryPresets.FriendlyName(status.BatteryType)}. Existing service calibration will be preserved.");
            }));
        });
    }

    private async Task SetDevicePasswordAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        var password = _devicePassword.Text;
        if (!DevicePasswordRules.TryValidate(password, out var validationError))
        {
            MessageBox.Show(this, validationError, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return;
        }
        if (!string.Equals(password, _confirmDevicePassword.Text, StringComparison.Ordinal))
        {
            MessageBox.Show(this, "The Device Password and confirmation do not match.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return;
        }
        if (DevicePasswordRules.IsWeak(password, out var weakReason) &&
            MessageBox.Show(this, $"This Device Password is allowed, but it may be weak.\n\n{weakReason}\n\nUse it anyway?", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        if (MessageBox.Show(this, "Set this monitor's Device Password over trusted USB? If one is already initialized, this rotates it immediately.", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var remember = _rememberDevicePassword.Checked;
        await RunOperationAsync(async token =>
        {
            var status = await _provisioner.ReadStatusAsync(port, AppendLog, token);
            var identity = await _provisioner.ReadProvisioningIdentityAsync(port, AppendLog, token);
            var username = identity.IsConfigured && !string.IsNullOrWhiteSpace(identity.Username) ? identity.Username : "batmon";
            await _provisioner.SetProvisioningCredentialAsync(port, username, password, AppendLog, token);
            if (!await _provisioner.VerifyProvisioningCredentialAsync(port, password, AppendLog, token))
                throw new InvalidOperationException("The ESP32 accepted the Device Password write but did not verify the same password afterward.");
            if (remember) _credentials.Save(status.DeviceId, password); else _credentials.Forget(status.DeviceId);
            BeginInvoke(new Action(() =>
            {
                _deviceId = status.DeviceId;
                _provisioningUsername = username;
                UpdatePasswordStatus(true);
                _devicePassword.Clear(); _confirmDevicePassword.Clear();
                MessageBox.Show(this, "Device Password initialized/rotated and verified.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            AppendLog(settings.RebootAfterConfiguration ? "USB configuration complete. The device is rebooting." : "USB configuration complete.");
            BeginInvoke(new Action(() => MessageBox.Show(this,
                settings.RebootAfterConfiguration ? "Configuration saved. The monitor is rebooting." : "Configuration saved to the monitor.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        });
    }

    private bool TryGetSettings(out UsbProvisioningSettings settings)
    {
        settings = new UsbProvisioningSettings();
        if (!_deviceLoaded)
        {
            MessageBox.Show(this, "Click Read Current before saving. This ensures existing calibration and settings are preserved.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information); return false;
        }
        var name = _deviceName.Text.Trim();
        if (name.Length < 1 || name.Length > 48)
        {
            MessageBox.Show(this, "Enter a device name between 1 and 48 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false;
        }
        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning voltage must be higher than the critical voltage.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false;
        }
        if (_batteryType.SelectedItem is not BatteryProfile selectedProfile || !BatteryProfileCatalog.IsValidProfileId(selectedProfile.Id))
        {
            MessageBox.Show(this, "Select a valid battery profile.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false;
        }
        if (_updateWifi.Checked)
        {
            if (string.IsNullOrWhiteSpace(_wifiSsid.Text) || _wifiSsid.Text.Trim().Length > 32)
            {
                MessageBox.Show(this, "Enter a valid home Wi-Fi SSID (1-32 characters).", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false;
            }
            if (_wifiPassword.Text.Length > 63)
            {
                MessageBox.Show(this, "Wi-Fi password cannot exceed 63 characters.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false;
            }
        }

        settings = new UsbProvisioningSettings
        {
            DeviceName = name,
            UpdateWifi = _updateWifi.Checked,
            WifiSsid = _wifiSsid.Text.Trim(),
            WifiPassword = _wifiPassword.Text,
            BatteryType = selectedProfile.Id,
            LowVoltage = (double)_low.Value,
            CriticalVoltage = (double)_critical.Value,
            SampleIntervalSec = (int)_sample.Value,
            CalibrationFactor = _currentCalibrationFactor,
            CalibrationOffset = _currentCalibrationOffset,
            RebootAfterConfiguration = _reboot.Checked
        };
        return true;
    }

    private void ManageProfiles()
    {
        var selectedId = (_batteryType.SelectedItem as BatteryProfile)?.Id;
        using var dialog = new BatteryProfilesForm();
        dialog.ShowDialog(this);
        LoadBatteryProfiles(selectedId, (double)_low.Value, (double)_critical.Value);
    }

    private void ApplyProfileDefaults()
    {
        if (_batteryType.SelectedItem is not BatteryProfile profile) return;
        _low.Value = Clamp((decimal)profile.LowVoltage, _low);
        _critical.Value = Clamp((decimal)profile.CriticalVoltage, _critical);
    }

    private void UpdateWifiEnabledState()
    {
        _wifiSsid.Enabled = _updateWifi.Checked;
        _wifiPassword.Enabled = _updateWifi.Checked;
        if (!_updateWifi.Checked) _wifiPassword.Clear();
    }

    private void UpdatePasswordStatus(bool configured)
    {
        if (string.IsNullOrWhiteSpace(_deviceId)) { _passwordStatus.Text = "Read the connected monitor to see credential status."; return; }
        var remembered = _credentials.Has(_deviceId) ? "; remembered on this PC" : "";
        _passwordStatus.Text = configured
            ? $"Initialized for {_deviceId}{remembered}. Password is never read back."
            : $"Not initialized for {_deviceId}. Set a Device Password before wireless provisioning.";
    }

    private async Task RunOperationAsync(Func<CancellationToken, Task> operation)
    {
        SetBusy(true); _operationCts = new CancellationTokenSource();
        try { await operation(_operationCts.Token); }
        catch (OperationCanceledException) { AppendLog("Operation cancelled."); }
        catch (Exception ex) { AppendLog("ERROR: " + ex.Message); MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { _operationCts.Dispose(); _operationCts = null; SetBusy(false); }
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
        MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning); return null;
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
}
