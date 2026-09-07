using System.Drawing;
using System.Globalization;

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
    private readonly NumericUpDown _calFactor = new();
    private readonly NumericUpDown _calOffset = new();

    public bool ApplyToUnit { get; private set; }

    public DeviceConfigForm(MonitorEntry device)
    {
        _device = device;
        Text = $"Configure {device.DisplayName}";
        Width = 470;
        Height = 620;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        _batteryType.DropDownStyle = ComboBoxStyle.DropDownList;
        _batteryType.Items.Add(new Choice("12 V Lead Acid", "lead_acid"));
        _batteryType.Items.Add(new Choice("4S LiFePO4", "lifepo4_4s"));
        _batteryType.SelectedIndexChanged += (_, _) => { };

        ConfigureNumeric(_low, 6, 20, 2, 0.01m);
        ConfigureNumeric(_critical, 6, 20, 2, 0.01m);
        ConfigureNumeric(_sample, 1, 3600, 0, 1);
        ConfigureNumeric(_poll, 2, 3600, 0, 1);
        ConfigureNumeric(_calFactor, 0.5m, 1.5m, 6, 0.0001m);
        ConfigureNumeric(_calOffset, -5, 5, 4, 0.001m);

        var table = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 12, AutoSize = true };
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
        AddRow(table, 7, "Calibration factor", _calFactor);
        AddRow(table, 8, "Calibration offset (V)", _calOffset);

        var preset = new Button { Text = "Apply Chemistry Defaults", AutoSize = true };
        preset.Click += (_, _) => ApplyPreset();
        table.Controls.Add(preset, 1, 9);

        var info = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(400, 0),
            Text = "Local alias only changes this PC. 'Name stored on unit' is pushed to the ESP32 and is also shown on its web page. LiFePO4 voltage is not a precise state-of-charge gauge; the preset values are alarm defaults and can be tuned."
        };
        table.Controls.Add(info, 0, 10);
        table.SetColumnSpan(info, 2);

        var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        var saveLocal = new Button { Text = "Save Local Only", AutoSize = true };
        var saveBoth = new Button { Text = "Save + Apply to Unit", AutoSize = true };
        saveLocal.Click += (_, _) => SaveAndClose(false);
        saveBoth.Click += (_, _) => SaveAndClose(true);
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(saveBoth);
        buttons.Controls.Add(saveLocal);
        table.Controls.Add(buttons, 0, 11);
        table.SetColumnSpan(buttons, 2);

        AcceptButton = saveBoth;
        CancelButton = cancel;
        LoadValues();
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
        table.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control, 1, row);
    }

    private void LoadValues()
    {
        _localName.Text = _device.LocalName;
        _deviceName.Text = _device.DeviceName;
        _batteryType.SelectedIndex = _device.BatteryType == "lifepo4_4s" ? 1 : 0;
        _low.Value = Clamp((decimal)_device.LowVoltage, _low);
        _critical.Value = Clamp((decimal)_device.CriticalVoltage, _critical);
        _sample.Value = Clamp(_device.SampleIntervalSec, _sample);
        _poll.Value = Clamp(_device.PollIntervalSec, _poll);
        _calFactor.Value = Clamp((decimal)_device.CalibrationFactor, _calFactor);
        _calOffset.Value = Clamp((decimal)_device.CalibrationOffset, _calOffset);
    }

    private static decimal Clamp(decimal value, NumericUpDown n) => Math.Max(n.Minimum, Math.Min(n.Maximum, value));

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
            MessageBox.Show(this, "The name stored on the unit cannot be blank.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (_low.Value <= _critical.Value)
        {
            MessageBox.Show(this, "Low warning must be higher than the critical threshold.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _device.LocalName = _localName.Text.Trim();
        _device.DeviceName = _deviceName.Text.Trim();
        _device.BatteryType = (_batteryType.SelectedItem as Choice)?.Value ?? "lead_acid";
        _device.LowVoltage = (double)_low.Value;
        _device.CriticalVoltage = (double)_critical.Value;
        _device.SampleIntervalSec = (int)_sample.Value;
        _device.PollIntervalSec = (int)_poll.Value;
        _device.CalibrationFactor = (double)_calFactor.Value;
        _device.CalibrationOffset = (double)_calOffset.Value;
        ApplyToUnit = applyToUnit;
        DialogResult = DialogResult.OK;
        Close();
    }

    private sealed record Choice(string Text, string Value)
    {
        public override string ToString() => Text;
    }
}
