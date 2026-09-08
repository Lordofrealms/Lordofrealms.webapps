using System.Drawing;

namespace BatteryMonitor.Client;

public sealed class AlertSettingsForm : Form
{
    private readonly AlertEditor _low;
    private readonly AlertEditor _critical;
    private readonly AlertEditor _offline;
    private readonly AlertEditor _recovery;

    public AlertProfile LowAlert => _low.BuildProfile();
    public AlertProfile CriticalAlert => _critical.BuildProfile();
    public AlertProfile OfflineAlert => _offline.BuildProfile();
    public AlertProfile RecoveryAlert => _recovery.BuildProfile();

    public AlertSettingsForm(string deviceName,
                             AlertProfile low,
                             AlertProfile critical,
                             AlertProfile offline,
                             AlertProfile recovery)
    {
        Text = $"Alerts - {deviceName}";
        Icon = AppIcon.Current;
        Width = 720;
        Height = 760;
        MinimumSize = new Size(650, 650);
        StartPosition = FormStartPosition.CenterParent;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            RowCount = 6,
            ColumnCount = 1,
            AutoScroll = true
        };

        root.Controls.Add(new Label
        {
            Text = "Alert settings are stored on this Windows PC for this monitor. Each alert can use a built-in sound or a custom MP3/WAV file and its own volume.",
            AutoSize = true,
            MaximumSize = new Size(650, 0),
            Margin = new Padding(3, 3, 3, 10)
        });

        _low = new AlertEditor("Low battery", low, showRepeat: true);
        _critical = new AlertEditor("Critical battery", critical, showRepeat: true);
        _offline = new AlertEditor("Device offline", offline, showRepeat: true);
        _recovery = new AlertEditor("Device back online", recovery, showRepeat: false);

        root.Controls.Add(_low);
        root.Controls.Add(_critical);
        root.Controls.Add(_offline);
        root.Controls.Add(_recovery);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.RightToLeft
        };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, AutoSize = true };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);
        root.Controls.Add(buttons);

        Controls.Add(root);
        AcceptButton = ok;
        CancelButton = cancel;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        AlertSoundPlayer.Stop();
        base.OnFormClosed(e);
    }

    private sealed class AlertEditor : GroupBox
    {
        private readonly CheckBox _enabled = new() { Text = "Enabled", AutoSize = true };
        private readonly ComboBox _sound = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly TextBox _customPath = new() { ReadOnly = true };
        private readonly Button _browse = new() { Text = "Browse...", AutoSize = true };
        private readonly Button _preview = new() { Text = "Preview", AutoSize = true };
        private readonly TrackBar _volume = new()
        {
            Minimum = 0,
            Maximum = 100,
            TickFrequency = 10,
            SmallChange = 5,
            LargeChange = 10,
            AutoSize = true
        };
        private readonly Label _volumeLabel = new() { AutoSize = true };
        private readonly NumericUpDown _repeat = new()
        {
            Minimum = 0,
            Maximum = 1440,
            DecimalPlaces = 0,
            Increment = 1,
            Width = 90
        };
        private readonly bool _showRepeat;

        public AlertEditor(string title, AlertProfile source, bool showRepeat)
        {
            Text = title;
            Dock = DockStyle.Top;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Padding = new Padding(10);
            Margin = new Padding(3, 5, 3, 5);
            _showRepeat = showRepeat;

            source = source.Clone();
            source.Normalize();

            foreach (var choice in AlertSoundCatalog.Choices) _sound.Items.Add(choice);
            var selectedIndex = Array.FindIndex(AlertSoundCatalog.Choices,
                choice => string.Equals(choice.Id, source.SoundId, StringComparison.OrdinalIgnoreCase));
            _sound.SelectedIndex = selectedIndex >= 0 ? selectedIndex : 1;

            _enabled.Checked = source.Enabled;
            _customPath.Text = source.CustomSoundPath;
            _volume.Value = Math.Clamp(source.VolumePercent, 0, 100);
            _repeat.Value = Math.Clamp(source.RepeatMinutes, 0, 1440);
            UpdateVolumeLabel();

            var table = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                AutoSize = true,
                ColumnCount = 3,
                RowCount = showRepeat ? 5 : 4,
                Padding = new Padding(4)
            };
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            table.Controls.Add(_enabled, 1, 0);
            table.SetColumnSpan(_enabled, 2);

            table.Controls.Add(LabelFor("Sound"), 0, 1);
            _sound.Dock = DockStyle.Fill;
            table.Controls.Add(_sound, 1, 1);
            table.Controls.Add(_preview, 2, 1);

            table.Controls.Add(LabelFor("Custom file"), 0, 2);
            _customPath.Dock = DockStyle.Fill;
            table.Controls.Add(_customPath, 1, 2);
            table.Controls.Add(_browse, 2, 2);

            table.Controls.Add(LabelFor("Volume"), 0, 3);
            var volumePanel = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 2, Margin = new Padding(0) };
            volumePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            volumePanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            _volume.Dock = DockStyle.Fill;
            volumePanel.Controls.Add(_volume, 0, 0);
            volumePanel.Controls.Add(_volumeLabel, 1, 0);
            table.Controls.Add(volumePanel, 1, 3);
            table.SetColumnSpan(volumePanel, 2);

            if (showRepeat)
            {
                table.Controls.Add(LabelFor("Repeat"), 0, 4);
                var repeatPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0) };
                repeatPanel.Controls.Add(_repeat);
                repeatPanel.Controls.Add(new Label
                {
                    Text = "minutes (0 = only when state changes)",
                    AutoSize = true,
                    Margin = new Padding(6, 7, 3, 3)
                });
                table.Controls.Add(repeatPanel, 1, 4);
                table.SetColumnSpan(repeatPanel, 2);
            }

            Controls.Add(table);

            _volume.ValueChanged += (_, _) => UpdateVolumeLabel();
            _sound.SelectedIndexChanged += (_, _) => UpdateCustomState();
            _browse.Click += (_, _) => Browse();
            _preview.Click += (_, _) => Preview();
            _enabled.CheckedChanged += (_, _) => UpdateEnabledState();
            UpdateCustomState();
            UpdateEnabledState();
        }

        public AlertProfile BuildProfile()
        {
            var choice = _sound.SelectedItem as AlertSoundChoice ?? AlertSoundCatalog.Choices[1];
            return new AlertProfile
            {
                Enabled = _enabled.Checked,
                SoundId = choice.Id,
                CustomSoundPath = _customPath.Text.Trim(),
                VolumePercent = _volume.Value,
                RepeatMinutes = _showRepeat ? (int)_repeat.Value : 0
            };
        }

        private static Label LabelFor(string text) =>
            new() { Text = text, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 8, 3, 3) };

        private void UpdateVolumeLabel() => _volumeLabel.Text = $"{_volume.Value}%";

        private void UpdateCustomState()
        {
            var custom = (_sound.SelectedItem as AlertSoundChoice)?.Id == "custom";
            _customPath.Enabled = custom && _enabled.Checked;
            _browse.Enabled = custom && _enabled.Checked;
        }

        private void UpdateEnabledState()
        {
            _sound.Enabled = _enabled.Checked;
            _preview.Enabled = _enabled.Checked;
            _volume.Enabled = _enabled.Checked;
            _repeat.Enabled = _enabled.Checked && _showRepeat;
            UpdateCustomState();
        }

        private void Browse()
        {
            using var dialog = new OpenFileDialog
            {
                Title = "Choose alert sound",
                Filter = "Audio files (*.mp3;*.wav)|*.mp3;*.wav|MP3 files (*.mp3)|*.mp3|WAV files (*.wav)|*.wav",
                CheckFileExists = true,
                Multiselect = false
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            _customPath.Text = dialog.FileName;
            var customIndex = Array.FindIndex(AlertSoundCatalog.Choices, c => c.Id == "custom");
            if (customIndex >= 0) _sound.SelectedIndex = customIndex;
        }

        private void Preview()
        {
            var profile = BuildProfile();
            if (profile.SoundId == "custom" && !File.Exists(profile.CustomSoundPath))
            {
                MessageBox.Show(this, "Choose an existing MP3 or WAV file first.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            AlertSoundPlayer.Play(profile);
        }
    }
}
