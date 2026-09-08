namespace BatteryMonitor.Client;

internal sealed class AlertSnoozeForm : Form
{
    private readonly DateTimePicker _customUntil = new()
    {
        Format = DateTimePickerFormat.Custom,
        CustomFormat = "g",
        Width = 190
    };

    public DateTime? SnoozeUntilUtc { get; private set; }

    public AlertSnoozeForm(string deviceName, DateTime? currentUntilUtc)
    {
        Text = $"Alert Snooze - {deviceName}";
        Icon = AppIcon.Current;
        Width = 500;
        Height = 300;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var now = DateTime.Now;
        var currentLocal = currentUntilUtc.HasValue && currentUntilUtc.Value > DateTime.UtcNow
            ? currentUntilUtc.Value.ToLocalTime()
            : (DateTime?)null;
        _customUntil.Value = currentLocal ?? now.AddHours(1);
        _customUntil.MinDate = now.AddMinutes(1);
        _customUntil.MaxDate = now.AddYears(1);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 1,
            RowCount = 5,
            AutoSize = true
        };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(450, 0),
            Text = "Temporarily silence low-battery, critical-battery, offline, and recovery notifications for this device. Monitoring and status updates continue normally. Identity/security failures are never snoozed."
        });

        root.Controls.Add(new Label
        {
            AutoSize = true,
            Margin = new Padding(3, 10, 3, 3),
            Text = currentLocal.HasValue
                ? $"Currently snoozed until {currentLocal.Value:g}."
                : "Alerts are currently active."
        });

        var presets = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        presets.Controls.Add(MakePreset("15 minutes", TimeSpan.FromMinutes(15)));
        presets.Controls.Add(MakePreset("1 hour", TimeSpan.FromHours(1)));
        presets.Controls.Add(MakePreset("4 hours", TimeSpan.FromHours(4)));
        presets.Controls.Add(MakePreset("8 hours", TimeSpan.FromHours(8)));
        root.Controls.Add(presets);

        var custom = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        custom.Controls.Add(new Label { Text = "Custom resume time", AutoSize = true, Margin = new Padding(3, 8, 8, 3) });
        custom.Controls.Add(_customUntil);
        var applyCustom = new Button { Text = "Snooze Until", AutoSize = true };
        applyCustom.Click += (_, _) => ApplyCustom();
        custom.Controls.Add(applyCustom);
        root.Controls.Add(custom);

        var actions = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill
        };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        var resume = new Button { Text = "Resume Alerts Now", AutoSize = true };
        resume.Click += (_, _) =>
        {
            SnoozeUntilUtc = null;
            DialogResult = DialogResult.OK;
            Close();
        };
        actions.Controls.Add(cancel);
        actions.Controls.Add(resume);
        root.Controls.Add(actions);

        CancelButton = cancel;
    }

    private Button MakePreset(string text, TimeSpan duration)
    {
        var button = new Button { Text = text, AutoSize = true };
        button.Click += (_, _) =>
        {
            SnoozeUntilUtc = DateTime.UtcNow.Add(duration);
            DialogResult = DialogResult.OK;
            Close();
        };
        return button;
    }

    private void ApplyCustom()
    {
        var selectedLocal = DateTime.SpecifyKind(_customUntil.Value, DateTimeKind.Local);
        var selectedUtc = selectedLocal.ToUniversalTime();
        if (selectedUtc <= DateTime.UtcNow)
        {
            MessageBox.Show(this, "Choose a resume time in the future.", "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SnoozeUntilUtc = selectedUtc;
        DialogResult = DialogResult.OK;
        Close();
    }
}
