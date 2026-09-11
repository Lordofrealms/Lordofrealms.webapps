using System.Drawing;

namespace BatteryMonitor.Client;

public sealed class DeviceConfigForm : Form
{
    private readonly MonitorEntry _device;
    private readonly BatteryProfileCatalog _profiles = BatteryProfileCatalog.Current;
    private readonly TextBox _localName = new();
    private readonly TextBox _deviceName = new();
    private readonly ComboBox _batteryType = new();
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly NumericUpDown _sample = new();
    private readonly NumericUpDown _poll = new();
    private readonly NumericUpDown _offlineTimeoutValue = new();
    private readonly ComboBox _offlineTimeoutUnit = new();
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
        Width = 640;
        Height = 850;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        _batteryType.DropDownStyle = ComboBoxStyle.DropDownList;
        LoadBatteryProfiles(_device.BatteryType, _device.LowVoltage, _device.CriticalVoltage);

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        ConfigureNumeric(_poll, 2, 3600, 0, 1);
        ConfigureNumeric(_offlineTimeoutValue, 1, 86400, 0, 1);

        _offlineTimeoutUnit.DropDownStyle = ComboBoxStyle.DropDownList;
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("seconds", 1));
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("minutes", 60));
        _offlineTimeoutUnit.Items.Add(new TimeUnitChoice("hours", 3600));

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            RowCount = 20,
            AutoScroll = true
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        Controls.Add(table);

        AddRow(table, 0, "Local alias", _localName);
        AddRow(table, 1, "Name stored on unit", _deviceName);

        var profilePanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _batteryType.Width = 255;
        profilePanel.Controls.Add(_batteryType);
        var manageProfiles = new Button
        {
            Text = "⚙",
            AutoSize = true,
            AccessibleName = "Manage Battery Profiles",
            Margin = new Padding(8, 3, 3, 3)
        };
        var profileTip = new ToolTip();
        profileTip.SetToolTip(manageProfiles, "Manage Battery Profiles");
        manageProfiles.Click += (_, _) => ManageProfiles();
        profilePanel.Controls.Add(manageProfiles);
        AddRow(table, 2, "Battery profile", profilePanel);

        AddRow(table, 3, "Low warning (V)", _low);
        AddRow(table, 4, "Critical (V)", _critical);
        var preset = new Button { Text = "Apply Profile Defaults", AutoSize = true };
        preset.Click += (_, _) => ApplyPreset();
        table.Controls.Add(preset, 1, 5);

        AddRow(table, 6, "Unit sample interval (s)", _sample);
        AddRow(table, 7, "PC poll interval (s)", _poll);

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
        AddRow(table, 8, "Offline timeout", timeoutPanel);

        var alertButton = new Button { Text = "Configure Alerts", AutoSize = true };
        alertButton.Click += (_, _) => ConfigureAlerts();
        table.Controls.Add(new Label
        {
            Text = "PC alerts",
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(3, 9, 3, 3)
        }, 0, 9);
        table.Controls.Add(alertButton, 1, 9);

        var securityHeader = new Label
        {
            Text = "Device security",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(3, 14, 3, 3)
        };
        table.Controls.Add(securityHeader, 0, 10);
        table.SetColumnSpan(securityHeader, 2);

        AddRow(table, 11, "Current Device Password", _devicePassword);
        table.Controls.Add(_rememberPassword, 1, 12);

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
        table.Controls.Add(forget, 1, 13);

        AddRow(table, 14, "New Device Password", _newPassword);
        AddRow(table, 15, "Confirm new password", _confirmPassword);
        table.Controls.Add(_showPasswords, 1, 16);
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
            MaximumSize = new Size(560, 0),
            Text = "Save + Apply authenticates with the Device Password before changing the unit. Battery profile and active voltage thresholds are stored on the unit; custom profile definitions remain Windows-side. Applying profile defaults is explicit. Calibration is a factory/service function and is intentionally not changed here. Alert settings, local alias, PC poll interval, and offline timeout are Windows-only settings."
        };
        table.Controls.Add(info, 0, 17);
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
        table.Controls.Add(buttons, 0, 18);
        table.SetColumnSpan(buttons, 2);

        AcceptButton = saveBoth;
        CancelButton = cancel;
        LoadValues(savedDevicePassword);
    }

    private void LoadBatteryProfiles(string? selectId, double currentLow, double currentCritical)
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
                LowVoltage = currentLow,
                CriticalVoltage = currentCritical,
                BuiltIn = false
            });
        }
        SelectBatteryProfile(selectId);
    }

    private void SelectBatteryProfile(string? id)
    {
        for (var i = 0; i < _batteryType.Items.Count; i++)
        {
            if (_batteryType.Items[i] is BatteryProfile profile && profile.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
            {
                _batteryType.SelectedIndex = i;
                return;
            }
        }
        if (_batteryType.Items.Count > 0) _batteryType.SelectedIndex = 0;
    }

    private void ManageProfiles()
    {
        var selectedId = (_batteryType.SelectedItem as BatteryProfile)?.Id ?? _device.BatteryType;
        using var dialog = new BatteryProfilesForm();
        dialog.ShowDialog(this);
        LoadBatteryProfiles(selectedId, (double)_low.Value, (double)_critical.Value);
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
        SelectBatteryProfile(_device.BatteryType);
        _low.Value = Clamp((decimal)_device.LowVoltage, _low);
        _critical.Value = Clamp((decimal)_device.CriticalVoltage, _critical);
        _sample.Value = Clamp(_device.SampleIntervalSec, _sample);
        _poll.Value = Clamp(_device.PollIntervalSec, _poll);
        LoadOfflineTimeout(_device.OfflineTimeoutSec <= 0 ? 300 : _device.OfflineTimeoutSec);

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
        var unit = _offlineTimeoutUnit.SelectedItem as TimeUnitChoice ?? new TimeUnitChoice("seconds", 1);
        var seconds = (long)_offlineTimeoutValue.Value * unit.SecondsMultiplier;
        if (seconds < 5 || seconds > 86400) return -1;
        return (int)seconds;
    }

    private static decimal Clamp(decimal value, NumericUpDown n) => Math.Max(n.Minimum, Math.Min(n.Maximum, value));

    private void ApplyPreset()
    {
        if (_batteryType.SelectedItem is not BatteryProfile profile) return;
        _low.Value = Clamp((decimal)profile.LowVoltage, _low);
        _critical.Value = Clamp((decimal)profile.CriticalVoltage, _critical);
    }

    private void SaveAndClose(bool applyToUnit)
    {
        if (string.IsNullOrWhiteSpace(_deviceName.Text))
        {
            MessageBox.Show(this, "The name stored on the unit cannot be blank.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (_batteryType.SelectedItem is not BatteryProfile selectedProfile || !BatteryProfileCatalog.IsValidProfileId(selectedProfile.Id))
        {
            MessageBox.Show(this, "Select a valid battery profile.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning must be higher than the critical threshold.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var timeoutSec = OfflineTimeoutSecondsFromControls();
        if (timeoutSec < 0)
        {
            MessageBox.Show(this, "Offline timeout must be between 5 seconds and 24 hours.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (timeoutSec < _poll.Value)
        {
            MessageBox.Show(this, "Offline timeout must be at least as long as the PC poll interval.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (applyToUnit)
        {
            if (!DevicePasswordRules.TryValidate(_devicePassword.Text, out var currentError))
            {
                MessageBox.Show(this, "A valid current Device Password is required to change the unit.\n\n" + currentError, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!string.IsNullOrEmpty(_newPassword.Text))
            {
                if (!DevicePasswordRules.TryValidate(_newPassword.Text, out var newError))
                {
                    MessageBox.Show(this, newError, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (_newPassword.Text != _confirmPassword.Text)
                {
                    MessageBox.Show(this, "The new Device Password entries do not match.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (DevicePasswordRules.IsWeak(_newPassword.Text, out var reason))
                {
                    var result = MessageBox.Show(this,
                        $"This Device Password looks weak. {reason}\n\nA person on the same LAN may have an easier time guessing it. Use it anyway?",
                        "Weak Device Password", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                    if (result != DialogResult.Yes) return;
                }
            }
        }
        else if (!string.IsNullOrEmpty(_newPassword.Text))
        {
            MessageBox.Show(this, "Changing the Device Password requires Save + Apply to Unit.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _device.LocalName = _localName.Text.Trim();
        _device.DeviceName = _deviceName.Text.Trim();
        _device.BatteryType = selectedProfile.Id;
        _device.LowVoltage = (double)_low.Value;
        _device.CriticalVoltage = (double)_critical.Value;
        _device.SampleIntervalSec = (int)_sample.Value;
        _device.PollIntervalSec = (int)_poll.Value;
        _device.OfflineTimeoutSec = timeoutSec;
        // Calibration remains untouched here; it is owned by the Factory & Service application.

        _device.LowAlert = _lowAlert.Clone();
        _device.CriticalAlert = _criticalAlert.Clone();
        _device.OfflineAlert = _offlineAlert.Clone();
        _device.RecoveryAlert = _recoveryAlert.Clone();
        _device.NormalizeLocalSettings();

        ApplyToUnit = applyToUnit;
        DialogResult = DialogResult.OK;
        Close();
    }

    private sealed record TimeUnitChoice(string Text, int SecondsMultiplier)
    {
        public override string ToString() => Text;
    }
}
