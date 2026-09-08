using System.Drawing;

namespace BatteryMonitor.Client;

public sealed class DeviceConfigForm : Form
{
    private readonly MonitorEntry _device;
    private readonly TextBox _localName = new();
    private readonly TextBox _deviceName = new();
    private readonly ComboBox _batteryType = new();
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly NumericUpDown _sample = new();
    private readonly NumericUpDown _poll = new();
    private readonly NumericUpDown _offlineTimeoutValue = new();
    private readonly ComboBox _offlineTimeoutUnit = new();
    private readonly NumericUpDown _calFactor = new();
    private readonly NumericUpDown _calOffset = new();
    private readonly TextBox _devicePassword = new() { UseSystemPasswordChar = true };
    private readonly TextBox _newPassword = new() { UseSystemPasswordChar = true };
    private readonly TextBox _confirmPassword = new() { UseSystemPasswordChar = true };
    private readonly CheckBox _rememberPassword = new() { Text = "Remember Device Password on this Windows account", AutoSize = true };
    private readonly CheckBox _showPasswords = new() { Text = "Show passwords", AutoSize = true };
    private bool _forgetSavedPassword;

    private AlertProfile _lowAlert;
    private AlertProfile _criticalAlert;
    private AlertProfile _offlineAlert;
    private AlertProfile _recoveryAlert;

    public bool ApplyToUnit { get; private set; }
    public string DevicePassword => _devicePassword.Text;
    public string? NewDevicePassword => string.IsNullOrEmpty(_newPassword.Text) ? null : _newPassword.Text;
    public bool RememberDevicePassword => _rememberPassword.Checked;
    public bool ForgetSavedPassword => _forgetSavedPassword;

    public DeviceConfigForm(MonitorEntry device, string? savedDevicePassword = null)
    {
        _device = device;
        _device.NormalizeLocalSettings();
        _lowAlert = _device.LowAlert.Clone();
        _criticalAlert = _device.CriticalAlert.Clone();
        _offlineAlert = _device.OfflineAlert.Clone();
        _recoveryAlert = _device.RecoveryAlert.Clone();

        Text = $"Configure {device.DisplayName}";
        Icon = AppIcon.Current;
        Width = 560;
        Height = 900;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        _batteryType.DropDownStyle = ComboBoxStyle.DropDownList;
        _batteryType.Items.Add(new Choice("12 V Lead Acid", "lead_acid"));
        _batteryType.Items.Add(new Choice("4S LiFePO4", "lifepo4_4s"));

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        ConfigureNumeric(_poll, 2, 3600, 0, 1);
        ConfigureNumeric(_offlineTimeoutValue, 1, 86400, 0, 1);
        ConfigureNumeric(_calFactor, 0.5m, 1.5m, 6, 0.0001m);
        ConfigureNumeric(_calOffset, -5, 5, 4, 0.001m);

        _offlineTimeoutUnit.DropDownStyle = ComboBoxStyle.DropDownList;
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("seconds", 1));
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("minutes", 60));
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("hours", 3600));

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            RowCount = 22,
            AutoScroll = true
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        Controls.Add(table);

        AddRow(table, 0, "Local alias", _localName);
        AddRow(table, 1, "Name stored on unit", _deviceName);
        AddRow(table, 2, "Battery type", _batteryType);
        AddRow(table, 3, "Low warning (V)", _low);
        AddRow(table, 4, "Critical (V)", _critical);
        AddRow(table, 5, "Unit sample interval (s)", _sample);
        AddRow(table, 6, "PC poll interval (s)", _poll);

        var timeoutPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            AutoSize = true,
            Margin = new Padding(0)
        };
        timeoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55));
        timeoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
        timeoutPanel.Controls.Add(_offlineTimeoutValue, 0, 0);
        _offlineTimeoutUnit.Dock = DockStyle.Fill;
        timeoutPanel.Controls.Add(_offlineTimeoutUnit, 1, 0);
        AddRow(table, 7, "Offline timeout", timeoutPanel);

        AddRow(table, 8, "Calibration factor", _calFactor);
        AddRow(table, 9, "Calibration offset (V)", _calOffset);

        var preset = new Button { Text = "Apply Chemistry Defaults", AutoSize = true };
        preset.Click += (_, _) => ApplyPreset();
        table.Controls.Add(preset, 1, 10);

        var alertButton = new Button { Text = "Configure Alerts...", AutoSize = true };
        alertButton.Click += (_, _) => ConfigureAlerts();
        table.Controls.Add(new Label
        {
            Text = "PC alerts",
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(3, 9, 3, 3)
        }, 0, 11);
        table.Controls.Add(alertButton, 1, 11);

        var securityHeader = new Label
        {
            Text = "Device security",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(3, 14, 3, 3)
        };
        table.Controls.Add(securityHeader, 0, 12);
        table.SetColumnSpan(securityHeader, 2);

        AddRow(table, 13, "Current Device Password", _devicePassword);
        table.Controls.Add(_rememberPassword, 1, 14);

        var forget = new Button { Text = "Forget Saved Password", AutoSize = true };
        forget.Click += (_, _) =>
        {
            _forgetSavedPassword = true;
            _rememberPassword.Checked = false;
            _devicePassword.Clear();
            MessageBox.Show(this,
                "The saved password will be removed when you save/close this dialog.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };
        table.Controls.Add(forget, 1, 15);

        AddRow(table, 16, "New Device Password", _newPassword);
        AddRow(table, 17, "Confirm new password", _confirmPassword);
        table.Controls.Add(_showPasswords, 1, 18);
        _showPasswords.CheckedChanged += (_, _) =>
        {
            var hide = !_showPasswords.Checked;
            _devicePassword.UseSystemPasswordChar = hide;
            _newPassword.UseSystemPasswordChar = hide;
            _confirmPassword.UseSystemPasswordChar = hide;
        };

        var info = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(490, 0),
            Text = "Save + Apply authenticates with the Device Password before changing the unit. Alert settings, the local alias, PC poll interval, and offline timeout are Windows-only settings. A replacement Device Password is optional. Remembered passwords are protected with Windows DPAPI and are not stored in devices.json."
        };
        table.Controls.Add(info, 0, 19);
        table.SetColumnSpan(info, 2);

        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill
        };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        var saveLocal = new Button { Text = "Save Local Only", AutoSize = true };
        var saveBoth = new Button { Text = "Save + Apply to Unit", AutoSize = true };
        saveLocal.Click += (_, _) => SaveAndClose(false);
        saveBoth.Click += (_, _) => SaveAndClose(true);
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(saveBoth);
        buttons.Controls.Add(saveLocal);
        table.Controls.Add(buttons, 0, 20);
        table.SetColumnSpan(buttons, 2);

        AcceptButton = saveBoth;
        CancelButton = cancel;
        LoadValues(savedDevicePassword);
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
        table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        table.Controls.Add(new Label
        {
            Text = label,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(3, 9, 3, 3)
        }, 0, row);
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control, 1, row);
    }

    private void LoadValues(string? savedDevicePassword)
    {
        _localName.Text = _device.LocalName;
        _deviceName.Text = _device.DeviceName;
        _batteryType.SelectedIndex = _device.BatteryType == "lifepo4_4s" ? 1 : 0;
        _low.Value = Clamp((decimal)_device.LowVoltage, _low);
        _critical.Value = Clamp((decimal)_device.CriticalVoltage, _critical);
        _sample.Value = Clamp(_device.SampleIntervalSec, _sample);
        _poll.Value = Clamp(_device.PollIntervalSec, _poll);
        LoadOfflineTimeout(_device.OfflineTimeoutSec <= 0 ? 300 : _device.OfflineTimeoutSec);
        _calFactor.Value = Clamp((decimal)_device.CalibrationFactor, _calFactor);
        _calOffset.Value = Clamp((decimal)_device.CalibrationOffset, _calOffset);

        if (!string.IsNullOrEmpty(savedDevicePassword))
        {
            _devicePassword.Text = savedDevicePassword;
            _rememberPassword.Checked = true;
        }
    }

    private void ConfigureAlerts()
    {
        using var dialog = new AlertSettingsForm(
            _device.DisplayName,
            _lowAlert,
            _criticalAlert,
            _offlineAlert,
            _recoveryAlert);

        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        _lowAlert = dialog.LowAlert;
        _criticalAlert = dialog.CriticalAlert;
        _offlineAlert = dialog.OfflineAlert;
        _recoveryAlert = dialog.RecoveryAlert;
    }

    private void LoadOfflineTimeout(int seconds)
    {
        if (seconds % 3600 == 0)
        {
            _offlineTimeoutUnit.SelectedIndex = 2;
            _offlineTimeoutValue.Value = Clamp(seconds / 3600, _offlineTimeoutValue);
        }
        else if (seconds % 60 == 0)
        {
            _offlineTimeoutUnit.SelectedIndex = 1;
            _offlineTimeoutValue.Value = Clamp(seconds / 60, _offlineTimeoutValue);
        }
        else
        {
            _offlineTimeoutUnit.SelectedIndex = 0;
            _offlineTimeoutValue.Value = Clamp(seconds, _offlineTimeoutValue);
        }
    }

    private int OfflineTimeoutSecondsFromControls()
    {
        var unit = _offlineTimeoutUnit.SelectedItem as TimeUnitChoice
                   ?? new TimeUnitChoice("seconds", 1);
        var seconds = (long)_offlineTimeoutValue.Value * unit.SecondsMultiplier;
        if (seconds < 5 || seconds > 86400) return -1;
        return (int)seconds;
    }

    private static decimal Clamp(decimal value, NumericUpDown n) =>
        Math.Max(n.Minimum, Math.Min(n.Maximum, value));

    private void ApplyPreset()
    {
        var type = (_batteryType.SelectedItem as Choice)?.Value ?? "lead_acid";
        var preset = BatteryPresets.For(type);
        _low.Value = (decimal)preset.Low;
        _critical.Value = (decimal)preset.Critical;
    }

    private void SaveAndClose(bool applyToUnit)
    {
        if (string.IsNullOrWhiteSpace(_deviceName.Text))
        {
            MessageBox.Show(this, "The name stored on the unit cannot be blank.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning must be higher than the critical threshold.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var timeoutSec = OfflineTimeoutSecondsFromControls();
        if (timeoutSec < 0)
        {
            MessageBox.Show(this, "Offline timeout must be between 5 seconds and 24 hours.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (timeoutSec < _poll.Value)
        {
            MessageBox.Show(this, "Offline timeout must be at least as long as the PC poll interval.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (applyToUnit)
        {
            if (!DevicePasswordRules.TryValidate(_devicePassword.Text, out var currentError))
            {
                MessageBox.Show(this,
                    "A valid current Device Password is required to change the unit.\n\n" + currentError,
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!string.IsNullOrEmpty(_newPassword.Text))
            {
                if (!DevicePasswordRules.TryValidate(_newPassword.Text, out var newError))
                {
                    MessageBox.Show(this, newError,
                        "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                if (_newPassword.Text != _confirmPassword.Text)
                {
                    MessageBox.Show(this, "The new Device Password entries do not match.",
                        "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                if (DevicePasswordRules.IsWeak(_newPassword.Text, out var reason))
                {
                    var result = MessageBox.Show(this,
                        $"This Device Password looks weak. {reason}\n\nA person on the same LAN may have an easier time guessing it. Use it anyway?",
                        "Weak Device Password", MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                        MessageBoxDefaultButton.Button2);
                    if (result != DialogResult.Yes) return;
                }
            }
        }
        else if (!string.IsNullOrEmpty(_newPassword.Text))
        {
            MessageBox.Show(this,
                "Changing the Device Password requires Save + Apply to Unit.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _device.LocalName = _localName.Text.Trim();
        _device.DeviceName = _deviceName.Text.Trim();
        _device.BatteryType = (_batteryType.SelectedItem as Choice)?.Value ?? "lead_acid";
        _device.LowVoltage = (double)_low.Value;
        _device.CriticalVoltage = (double)_critical.Value;
        _device.SampleIntervalSec = (int)_sample.Value;
        _device.PollIntervalSec = (int)_poll.Value;
        _device.OfflineTimeoutSec = timeoutSec;
        _device.CalibrationFactor = (double)_calFactor.Value;
        _device.CalibrationOffset = (double)_calOffset.Value;

        _device.LowAlert = _lowAlert.Clone();
        _device.CriticalAlert = _criticalAlert.Clone();
        _device.OfflineAlert = _offlineAlert.Clone();
        _device.RecoveryAlert = _recoveryAlert.Clone();
        _device.NormalizeLocalSettings();

        ApplyToUnit = applyToUnit;
        DialogResult = DialogResult.OK;
        Close();
    }

    private sealed record Choice(string Text, string Value)
    {
        public override string ToString() => Text;
    }

    private sealed record TimeUnitChoice(string Text, int SecondsMultiplier)
    {
        public override string ToString() => Text;
    }
}
