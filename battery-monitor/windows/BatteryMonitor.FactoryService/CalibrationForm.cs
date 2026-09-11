using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class CalibrationForm : Form
{
    private readonly UsbProvisioner _usb = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly Label _device = new() { AutoSize = true };
    private readonly Label _current = new() { AutoSize = true };
    private readonly NumericUpDown _reference = new();
    private readonly Label _point1 = new() { AutoSize = true };
    private readonly Label _point2 = new() { AutoSize = true };
    private readonly NumericUpDown _proposedFactor = new();
    private readonly NumericUpDown _proposedOffset = new();
    private readonly Label _preview = new() { AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
    private UsbMonitorStatus? _status;
    private CalibrationPoint? _p1;
    private CalibrationPoint? _p2;
    private CancellationTokenSource? _cts;

    public CalibrationForm()
    {
        Text = "Battery Monitor Factory - Calibration";
        Icon = AppIcon.Current;
        Width = 780;
        Height = 650;
        MinimumSize = new Size(700, 580);
        StartPosition = FormStartPosition.CenterParent;

        Configure(_reference, 0, 30, 3, 0.001m);
        Configure(_proposedFactor, 0.5m, 1.5m, 6, 0.0001m);
        Configure(_proposedOffset, -5, 5, 4, 0.001m);
        _proposedFactor.ValueChanged += (_, _) => UpdatePreview();
        _proposedOffset.ValueChanged += (_, _) => UpdatePreview();
        BuildUi();
        RefreshPorts();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 11 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 0; i < 10; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(730, 0),
            Text = "Factory/service calibration only. Compare against a trusted reference meter. One-point calibration adjusts the proportional factor while preserving the current offset. Two-point calibration solves both factor and offset. Nothing is written until Apply Calibration is clicked."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        ports.Controls.Add(_port);
        var refresh = new Button { Text = "Refresh", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        var read = new Button { Text = "Read Monitor", AutoSize = true };
        read.Click += async (_, _) => await ReadAsync();
        ports.Controls.Add(refresh); ports.Controls.Add(read);
        AddRow(root, 1, "USB serial port", ports);
        AddRow(root, 2, "Device", _device);
        AddRow(root, 3, "Current calibration", _current);
        AddRow(root, 4, "Trusted reference (V)", _reference);

        var capture = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var p1 = new Button { Text = "Capture Point 1", AutoSize = true };
        p1.Click += async (_, _) => await CaptureAsync(1);
        var p2 = new Button { Text = "Capture Point 2", AutoSize = true };
        p2.Click += async (_, _) => await CaptureAsync(2);
        var calculate = new Button { Text = "Calculate", AutoSize = true };
        calculate.Click += (_, _) => Calculate();
        capture.Controls.AddRange([p1, p2, calculate]);
        root.Controls.Add(capture, 1, 5);

        var points = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false };
        points.Controls.Add(_point1); points.Controls.Add(_point2);
        AddRow(root, 6, "Captured points", points);

        var proposed = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _proposedFactor.Width = 115; _proposedOffset.Width = 105;
        proposed.Controls.Add(new Label { Text = "Factor", AutoSize = true, Margin = new Padding(3, 8, 3, 3) });
        proposed.Controls.Add(_proposedFactor);
        proposed.Controls.Add(new Label { Text = "Offset (V)", AutoSize = true, Margin = new Padding(16, 8, 3, 3) });
        proposed.Controls.Add(_proposedOffset);
        AddRow(root, 7, "Proposed calibration", proposed);
        AddRow(root, 8, "Preview", _preview);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        var apply = new Button { Text = "Apply Calibration", AutoSize = true };
        apply.Click += async (_, _) => await ApplyAsync();
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        actions.Controls.Add(apply); actions.Controls.Add(close);
        root.Controls.Add(actions, 1, 9);

        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 10); root.SetColumnSpan(_log, 2);
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private static void Configure(NumericUpDown control, decimal min, decimal max, int decimals, decimal increment)
    {
        control.Minimum = min; control.Maximum = max; control.DecimalPlaces = decimals; control.Increment = increment;
    }

    private void RefreshPorts()
    {
        var old = _port.SelectedItem?.ToString();
        _port.Items.Clear();
        foreach (var p in SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(p => p, StringComparer.OrdinalIgnoreCase)) _port.Items.Add(p);
        if (old is not null && _port.Items.Contains(old)) _port.SelectedItem = old;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
    }

    private async Task ReadAsync()
    {
        var port = SelectedPort(); if (port is null) return;
        await RunAsync(async token =>
        {
            var status = await _usb.ReadStatusAsync(port, Append, token);
            BeginInvoke(new Action(() => LoadStatus(status)));
        });
    }

    private async Task CaptureAsync(int number)
    {
        var port = SelectedPort(); if (port is null) return;
        var reference = (double)_reference.Value;
        if (reference <= 0) { MessageBox.Show(this, "Enter the trusted reference voltage first.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        await RunAsync(async token =>
        {
            var status = await _usb.ReadStatusAsync(port, Append, token);
            var baseVoltage = Uncalibrated(status.Voltage, status.CalibrationFactor, status.CalibrationOffset);
            var point = new CalibrationPoint(status.Voltage, baseVoltage, reference);
            BeginInvoke(new Action(() =>
            {
                LoadStatus(status);
                if (number == 1) _p1 = point; else _p2 = point;
                RenderPoints();
            }));
        });
    }

    private void LoadStatus(UsbMonitorStatus status)
    {
        _status = status;
        _device.Text = $"{status.DeviceId} — {status.DeviceName} — measured {status.Voltage:0.000} V";
        _current.Text = $"Factor {status.CalibrationFactor:0.######}; offset {status.CalibrationOffset:+0.####;-0.####;0} V";
        _proposedFactor.Value = Clamp((decimal)status.CalibrationFactor, _proposedFactor);
        _proposedOffset.Value = Clamp((decimal)status.CalibrationOffset, _proposedOffset);
        if (_reference.Value == 0) _reference.Value = Clamp((decimal)status.Voltage, _reference);
        UpdatePreview();
    }

    private void RenderPoints()
    {
        _point1.Text = _p1 is null ? "Point 1: not captured" : $"Point 1: monitor {_p1.Measured:0.000} V → reference {_p1.Reference:0.000} V";
        _point2.Text = _p2 is null ? "Point 2: not captured" : $"Point 2: monitor {_p2.Measured:0.000} V → reference {_p2.Reference:0.000} V";
    }

    private void Calculate()
    {
        if (_status is null || _p1 is null)
        {
            MessageBox.Show(this, "Read the monitor and capture at least Point 1 first.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        double factor;
        double offset;
        if (_p2 is not null && Math.Abs(_p2.BaseVoltage - _p1.BaseVoltage) >= 0.05)
        {
            factor = (_p2.Reference - _p1.Reference) / (_p2.BaseVoltage - _p1.BaseVoltage);
            offset = _p1.Reference - factor * _p1.BaseVoltage;
        }
        else
        {
            offset = _status.CalibrationOffset;
            factor = (_p1.Reference - offset) / _p1.BaseVoltage;
        }

        if (factor < 0.5 || factor > 1.5 || offset < -5 || offset > 5)
        {
            MessageBox.Show(this, $"Calculated calibration is outside device limits: factor {factor:0.######}, offset {offset:0.####} V.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        _proposedFactor.Value = (decimal)factor;
        _proposedOffset.Value = (decimal)offset;
        UpdatePreview();
    }

    private void UpdatePreview()
    {
        if (_status is null) { _preview.Text = "Read the monitor to preview calibration."; return; }
        var baseVoltage = Uncalibrated(_status.Voltage, _status.CalibrationFactor, _status.CalibrationOffset);
        var corrected = baseVoltage * (double)_proposedFactor.Value + (double)_proposedOffset.Value;
        _preview.Text = $"Current raw/divider estimate {baseVoltage:0.000} V → proposed corrected reading {corrected:0.000} V";
    }

    private async Task ApplyAsync()
    {
        if (_status is null) { MessageBox.Show(this, "Read the monitor first.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        var port = SelectedPort(); if (port is null) return;
        var factor = (double)_proposedFactor.Value;
        var offset = (double)_proposedOffset.Value;
        if (MessageBox.Show(this,
                $"Apply calibration to {_status.DeviceId}?\n\nFactor: {factor:0.######}\nOffset: {offset:+0.####;-0.####;0} V\n\nThis is an explicit service change.",
                "Apply Calibration", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;

        var original = _status;
        await RunAsync(async token =>
        {
            await _usb.ConfigureAsync(port, new UsbProvisioningSettings
            {
                DeviceName = original.DeviceName,
                BatteryType = original.BatteryType,
                LowVoltage = original.LowVoltage,
                CriticalVoltage = original.CriticalVoltage,
                SampleIntervalSec = original.SampleIntervalSec,
                CalibrationFactor = factor,
                CalibrationOffset = offset,
                UpdateWifi = false,
                RebootAfterConfiguration = false
            }, Append, token);
            var refreshed = await _usb.ReadStatusAsync(port, Append, token);
            BeginInvoke(new Action(() =>
            {
                LoadStatus(refreshed);
                _p1 = _p2 = null;
                RenderPoints();
                MessageBox.Show(this, "Calibration applied and read back from the monitor.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
        });
    }

    private async Task RunAsync(Func<CancellationToken, Task> action)
    {
        _cts = new CancellationTokenSource();
        try { await action(_cts.Token); }
        catch (OperationCanceledException) { Append("Operation cancelled."); }
        catch (Exception ex) { Append("ERROR: " + ex.Message); MessageBox.Show(this, ex.Message, "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { _cts.Dispose(); _cts = null; }
    }

    private string? SelectedPort()
    {
        var p = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(p)) return p;
        MessageBox.Show(this, "Select a COM port first.", "Calibration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private void Append(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(Append), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static double Uncalibrated(double measured, double factor, double offset) =>
        Math.Abs(factor) < 0.000001 ? measured : (measured - offset) / factor;
    private static decimal Clamp(decimal value, NumericUpDown c) => Math.Max(c.Minimum, Math.Min(c.Maximum, value));
    private static int PortNumber(string p) => p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n) ? n : int.MaxValue;
    private sealed record CalibrationPoint(double Measured, double BaseVoltage, double Reference);
}
