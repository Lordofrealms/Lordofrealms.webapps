namespace BatteryMonitor.Client;

internal sealed class BatteryProfilesForm : Form
{
    private readonly BatteryProfileCatalog _catalog = BatteryProfileCatalog.Current;
    private readonly ListBox _profiles = new() { Dock = DockStyle.Fill };
    private readonly TextBox _id = new();
    private readonly TextBox _name = new();
    private readonly NumericUpDown _low = new();
    private readonly NumericUpDown _critical = new();
    private readonly Label _kind = new() { AutoSize = true };
    private readonly Button _save = new() { Text = "Save Profile", AutoSize = true };
    private readonly Button _delete = new() { Text = "Delete Profile", AutoSize = true };
    private bool _loading;

    public BatteryProfilesForm()
    {
        Text = "Battery Monitor - Battery Profiles";
        Icon = AppIcon.Current;
        Width = 720;
        Height = 480;
        MinimumSize = new Size(650, 430);
        StartPosition = FormStartPosition.CenterParent;

        ConfigureVoltage(_low);
        ConfigureVoltage(_critical);
        BuildUi();
        LoadProfiles();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            RowCount = 2
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var left = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3 };
        left.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        left.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        left.Controls.Add(new Label { Text = "Available profiles", AutoSize = true });
        left.Controls.Add(_profiles);
        var add = new Button { Text = "New Custom Profile", AutoSize = true };
        add.Click += (_, _) => NewProfile();
        left.Controls.Add(add);
        root.Controls.Add(left, 0, 0);

        var editor = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12, 0, 0, 0), ColumnCount = 2, RowCount = 7 };
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(editor, 0, "Profile type", _kind);
        AddRow(editor, 1, "Stable profile ID", _id);
        AddRow(editor, 2, "Display name", _name);
        AddRow(editor, 3, "Low warning (V)", _low);
        AddRow(editor, 4, "Critical (V)", _critical);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(390, 0),
            Text = "Built-in profiles come from the packaged battery-profiles.json and are read-only. Custom profiles are stored separately under your Windows application-data folder so app upgrades do not delete them. Applying profile defaults is always explicit."
        };
        editor.Controls.Add(note, 0, 5);
        editor.SetColumnSpan(note, 2);

        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        _save.Click += (_, _) => SaveProfile();
        _delete.Click += (_, _) => DeleteProfile();
        buttons.Controls.Add(_save);
        buttons.Controls.Add(_delete);
        editor.Controls.Add(buttons, 1, 6);
        root.Controls.Add(editor, 1, 0);

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 1, 1);

        _profiles.SelectedIndexChanged += (_, _) => LoadSelected();
    }

    private static void ConfigureVoltage(NumericUpDown control)
    {
        control.Minimum = 6;
        control.Maximum = 20;
        control.DecimalPlaces = 2;
        control.Increment = 0.01m;
        control.Dock = DockStyle.Fill;
    }

    private static void AddRow(TableLayoutPanel table, int row, string label, Control control)
    {
        table.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 9, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control, 1, row);
    }

    private void LoadProfiles(string? selectId = null)
    {
        _loading = true;
        try
        {
            _catalog.Reload();
            _profiles.Items.Clear();
            foreach (var profile in _catalog.All) _profiles.Items.Add(profile);
            if (_profiles.Items.Count == 0) return;
            var index = 0;
            if (!string.IsNullOrWhiteSpace(selectId))
            {
                for (var i = 0; i < _profiles.Items.Count; i++)
                {
                    if (_profiles.Items[i] is BatteryProfile p && p.Id.Equals(selectId, StringComparison.OrdinalIgnoreCase))
                    {
                        index = i;
                        break;
                    }
                }
            }
            _profiles.SelectedIndex = index;
        }
        finally
        {
            _loading = false;
        }
        LoadSelected();
    }

    private void LoadSelected()
    {
        if (_loading) return;
        if (_profiles.SelectedItem is not BatteryProfile profile) return;
        _kind.Text = profile.BuiltIn ? "Built-in (packaged)" : "Custom (user)";
        _id.Text = profile.Id;
        _name.Text = profile.Name;
        _low.Value = Clamp((decimal)profile.LowVoltage, _low);
        _critical.Value = Clamp((decimal)profile.CriticalVoltage, _critical);
        _id.ReadOnly = true;
        _name.ReadOnly = profile.BuiltIn;
        _low.Enabled = !profile.BuiltIn;
        _critical.Enabled = !profile.BuiltIn;
        _save.Enabled = !profile.BuiltIn;
        _delete.Enabled = !profile.BuiltIn;
    }

    private void NewProfile()
    {
        _profiles.ClearSelected();
        _kind.Text = "New custom profile";
        _id.ReadOnly = false;
        _id.Text = "custom_";
        _name.ReadOnly = false;
        _name.Text = "Custom Battery";
        _low.Enabled = true;
        _critical.Enabled = true;
        _low.Value = 12.20m;
        _critical.Value = 11.90m;
        _save.Enabled = true;
        _delete.Enabled = false;
        _id.Focus();
        _id.SelectionStart = _id.Text.Length;
    }

    private void SaveProfile()
    {
        try
        {
            var profile = new BatteryProfile
            {
                Id = _id.Text.Trim(),
                Name = _name.Text.Trim(),
                LowVoltage = (double)_low.Value,
                CriticalVoltage = (double)_critical.Value,
                BuiltIn = false
            };
            _catalog.SaveUserProfile(profile);
            LoadProfiles(profile.Id);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void DeleteProfile()
    {
        if (_profiles.SelectedItem is not BatteryProfile profile || profile.BuiltIn) return;
        if (MessageBox.Show(this,
                $"Delete custom battery profile '{profile.Name}'? Devices already using it will keep their stored profile ID and active voltage thresholds.",
                "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            return;
        _catalog.DeleteUserProfile(profile.Id);
        LoadProfiles();
    }

    private static decimal Clamp(decimal value, NumericUpDown control) =>
        Math.Max(control.Minimum, Math.Min(control.Maximum, value));
}
