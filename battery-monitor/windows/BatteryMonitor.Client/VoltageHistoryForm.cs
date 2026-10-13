using System.Drawing.Drawing2D;

namespace BatteryMonitor.Client;

public sealed class VoltageHistoryForm : Form
{
    private readonly VoltageHistoryStore _store;
    private readonly MonitorEntry _device;
    private readonly ComboBox _range = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 145 };
    private readonly ComboBox _retention = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 135 };
    private readonly VoltagePlot _plot = new() { Dock = DockStyle.Fill, BackColor = Color.White };
    private readonly ListView _events = new() { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true };
    private readonly Label _info = new() { AutoSize = true };
    private readonly DateTimePicker _from = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "yyyy-MM-dd HH:mm", Width = 145, Enabled = false };
    private readonly DateTimePicker _to = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "yyyy-MM-dd HH:mm", Width = 145, Enabled = false };
    private readonly System.Windows.Forms.Timer _autoRefresh = new() { Interval = 60000 };
    private CancellationTokenSource? _purgeCts;

    private sealed record RangeChoice(string Name, TimeSpan Period)
    {
        public override string ToString() => Name;
    }
    private sealed record RetentionChoice(string Name, int Years)
    {
        public override string ToString() => Name;
    }

    public VoltageHistoryForm(VoltageHistoryStore store, MonitorEntry device)
    {
        _store = store;
        _device = device;
        Text = $"{device.DisplayName} — Voltage History";
        Icon = AppIcon.Current;
        Width = 1080;
        Height = 680;
        StartPosition = FormStartPosition.CenterParent;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1 };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var controls = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Padding = new Padding(6) };
        controls.Controls.Add(new Label { Text = "Show", AutoSize = true, Margin = new Padding(4, 9, 2, 0) });
        foreach (var choice in new[] {
            new RangeChoice("24 hours", TimeSpan.FromDays(1)),
            new RangeChoice("7 days", TimeSpan.FromDays(7)),
            new RangeChoice("30 days", TimeSpan.FromDays(30)),
            new RangeChoice("1 year", TimeSpan.FromDays(365)),
            new RangeChoice("10 years", TimeSpan.FromDays(3652)),
            new RangeChoice("All history", TimeSpan.FromDays(36500)) })
            _range.Items.Add(choice);
        _range.Items.Add(new RangeChoice("Custom range", TimeSpan.Zero));
        _range.SelectedIndexChanged += (_, _) =>
        {
            _from.Enabled = _to.Enabled = _range.SelectedItem is RangeChoice c && c.Period == TimeSpan.Zero;
            RefreshPlot();
        };
        _range.SelectedIndex = 1;
        controls.Controls.Add(_range);
        _from.Value = DateTime.Now.AddDays(-7);
        _to.Value = DateTime.Now;
        _from.ValueChanged += (_, _) => { if (_from.Enabled) RefreshPlot(); };
        _to.ValueChanged += (_, _) => { if (_to.Enabled) RefreshPlot(); };
        controls.Controls.Add(new Label { Text = "From", AutoSize = true, Margin = new Padding(6, 9, 2, 0) });
        controls.Controls.Add(_from);
        controls.Controls.Add(new Label { Text = "To", AutoSize = true, Margin = new Padding(6, 9, 2, 0) });
        controls.Controls.Add(_to);
        var reload = new Button { Text = "Refresh", AutoSize = true };
        reload.Click += (_, _) => RefreshAll();
        controls.Controls.Add(reload);
        var export = new Button { Text = "Export CSV...", AutoSize = true };
        export.Click += (_, _) => ExportCsv();
        controls.Controls.Add(export);
        var backup = new Button { Text = "Backup database...", AutoSize = true };
        backup.Click += (_, _) => BackupDatabase();
        controls.Controls.Add(backup);
        controls.Controls.Add(new Label { Text = "Retention", AutoSize = true, Margin = new Padding(14, 9, 2, 0) });
        foreach (var choice in new[] {
            new RetentionChoice("Keep forever", 0),
            new RetentionChoice("1 year", 1),
            new RetentionChoice("5 years", 5),
            new RetentionChoice("10 years", 10) })
            _retention.Items.Add(choice);
        for (var i = 0; i < _retention.Items.Count; i++)
            if (_retention.Items[i] is RetentionChoice c && c.Years == _store.RetentionYears) _retention.SelectedIndex = i;
        if (_retention.SelectedIndex < 0) _retention.SelectedIndex = 0;
        controls.Controls.Add(_retention);
        var purge = new Button { Text = "Apply retention policy...", AutoSize = true };
        var cancelPurge = new Button { Text = "Cancel purge", AutoSize = true, Enabled = false };
        cancelPurge.Click += (_, _) => _purgeCts?.Cancel();
        purge.Click += async (_, _) => await PurgeAsync(purge, cancelPurge);
        controls.Controls.Add(purge);
        controls.Controls.Add(cancelPurge);
        root.Controls.Add(controls, 0, 0);

        var tabs = new TabControl { Dock = DockStyle.Fill };
        var graph = new TabPage("Voltage Graph");
        graph.Controls.Add(_plot);
        tabs.TabPages.Add(graph);
        var events = new TabPage("Alert / Event History");
        _events.Columns.Add("Date", 160);
        _events.Columns.Add("Category", 160);
        _events.Columns.Add("Details", 680);
        events.Controls.Add(_events);
        tabs.TabPages.Add(events);
        root.Controls.Add(tabs, 0, 1);
        root.Controls.Add(_info, 0, 2);
        FormClosing += (_, _) => _purgeCts?.Cancel();
        _autoRefresh.Tick += (_, _) => RefreshAll();
        Shown += (_, _) => _autoRefresh.Start();
        Activated += (_, _) => RefreshAll();
        FormClosed += (_, _) => _autoRefresh.Dispose();
        RefreshAll();
    }

    private void RefreshAll()
    {
        RefreshPlot();
        _events.BeginUpdate();
        _events.Items.Clear();
        foreach (var item in _store.Events(_device.DeviceId))
            _events.Items.Add(new ListViewItem(new[] {
                item.Utc.ToLocalTime().ToString("g"), item.Category, item.Message }));
        _events.EndUpdate();
    }

    private void RefreshPlot()
    {
        if (_range.SelectedItem is not RangeChoice range) return;
        var end = range.Period == TimeSpan.Zero ? _to.Value.ToUniversalTime() : DateTime.UtcNow;
        var since = range.Period == TimeSpan.Zero ? _from.Value.ToUniversalTime() : end - range.Period;
        if (end <= since)
        {
            _plot.SetData(new List<VoltageHistoryPoint>());
            _info.Text = " Choose a To date later than the From date.";
            return;
        }
        var points = _store.Query(_device.DeviceId, since, latestUtc: end);
        _plot.SetData(points);
        _info.Text = $" {points.Count} graph buckets · auto-refresh every 60 seconds · local database {_store.DatabaseBytes / 1024.0 / 1024.0:0.0} MiB (WAL may add temporary space).";
    }

    private void ExportCsv()
    {
        using var save = new SaveFileDialog { Filter = "CSV files (*.csv)|*.csv", FileName = "BatteryMonitor-voltage-history.csv" };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            _store.ExportCsv(_device.DeviceId, save.FileName);
            MessageBox.Show(this, "History exported successfully.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Export failed: " + ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void BackupDatabase()
    {
        using var save = new SaveFileDialog { Filter = "SQLite database (*.sqlite)|*.sqlite", FileName = "BatteryMonitor-history-backup.sqlite", OverwritePrompt = false };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        if (File.Exists(save.FileName))
        {
            MessageBox.Show(this, "Choose a new filename. Existing backups are never overwritten.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try { _store.BackupDatabase(save.FileName); MessageBox.Show(this, "Database backup complete (voltages and events).", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        catch (Exception ex) { MessageBox.Show(this, "Backup failed: " + ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private async Task PurgeAsync(Button button, Button cancel)
    {
        if (_retention.SelectedItem is not RetentionChoice choice) return;
        if (choice.Years == 0)
        {
            _store.SetRetentionYears(0);
            MessageBox.Show(this, "Retention set to keep forever. No records were deleted.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var confirm = MessageBox.Show(this,
            $"Setting {choice.Years}-year retention will permanently delete voltage AND event history older than that period across ALL devices, now and during future maintenance.\n\n" +
            "Deleted records cannot be recovered without a backup. YES: make a SQLite backup first. NO: delete without backup. CANCEL: keep existing policy.\n\n" +
            "Deletion uses indexed PK batches of 10,000 rows, with commits between batches.",
            "Permanent history deletion", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button3);
        if (confirm == DialogResult.Cancel) return;
        if (confirm == DialogResult.Yes)
        {
            using var backup = new SaveFileDialog { Filter = "SQLite database (*.sqlite)|*.sqlite", FileName = "BatteryMonitor-history-backup.sqlite", OverwritePrompt = false };
            if (backup.ShowDialog(this) != DialogResult.OK) return;
            if (File.Exists(backup.FileName)) { MessageBox.Show(this, "Choose a new backup filename."); return; }
            try { _store.BackupDatabase(backup.FileName); }
            catch (Exception ex) { MessageBox.Show(this, "Backup failed; no records removed. " + ex.Message); return; }
        }
        _store.SetRetentionYears(choice.Years);
        button.Enabled = false;
        cancel.Enabled = true;
        _purgeCts = new CancellationTokenSource();
        var cutoff = DateTime.UtcNow.AddYears(-choice.Years);
        try
        {
            var progress = new Progress<int>(n => _info.Text = $" Purged {n:N0} old rows...");
            var removed = await VoltageHistoryStore.PurgeOlderThanAsync(_store.DatabasePath, cutoff, progress, _purgeCts.Token);
            MessageBox.Show(this, $"Purge complete: {removed:N0} rows removed.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            RefreshAll();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Purge interrupted. Previously committed batches remain deleted; it is safe to retry.\n\n" + ex.Message,
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { button.Enabled = true; cancel.Enabled = false; _purgeCts?.Dispose(); _purgeCts = null; }
    }

    private sealed class VoltagePlot : Control
    {
        private List<VoltageHistoryPoint> _points = new();
        public VoltagePlot()
        {
            DoubleBuffered = true;
            ResizeRedraw = true;
        }
        public void SetData(List<VoltageHistoryPoint> points) { _points = points; Invalidate(); }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            if (_points.Count == 0)
            {
                TextRenderer.DrawText(e.Graphics, "No history for this range. Windows stores each successful authenticated voltage poll.", Font,
                    ClientRectangle, Color.DimGray, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            var canvas = new Rectangle(70, 22, Math.Max(1, Width - 95), Math.Max(1, Height - 80));
            var min = _points.Min(x => x.Minimum);
            var max = _points.Max(x => x.Maximum);
            var pad = Math.Max(.1, (max - min) * .1);
            min -= pad; max += pad;
            var begin = _points[0].Utc.Ticks;
            var end = _points[^1].Utc.Ticks;
            double X(long ticks) => canvas.Left + (ticks - begin) / (double)Math.Max(1L, end - begin) * canvas.Width;
            float Y(double value) => canvas.Bottom - (float)((value - min) / (max - min) * canvas.Height);
            using var axis = new Pen(Color.Silver, 1);
            using var bounds = new Pen(Color.FromArgb(150, 95, 125, 180), 1.5f);
            using var avg = new Pen(Color.FromArgb(35, 105, 185), 2);
            for (var i = 0; i <= 4; i++)
            {
                var y = canvas.Top + canvas.Height * i / 4;
                e.Graphics.DrawLine(axis, canvas.Left, y, canvas.Right, y);
                e.Graphics.DrawString((max - (max-min)*i/4).ToString("0.00") + " V", Font, Brushes.DimGray, 4, y - 8);
            }
            for (var i = 0; i < _points.Count; i++)
            {
                var point = _points[i];
                float x = (float)X(point.Utc.Ticks);
                e.Graphics.DrawLine(bounds, x, Y(point.Minimum), x, Y(point.Maximum));
                if (i > 0)
                {
                    var previous = _points[i-1];
                    e.Graphics.DrawLine(avg, (float)X(previous.Utc.Ticks), Y(previous.Average), x, Y(point.Average));
                }
            }
            e.Graphics.DrawString(_points[0].Utc.ToLocalTime().ToString("g"), Font, Brushes.DimGray, canvas.Left, canvas.Bottom + 12);
            var last = _points[^1].Utc.ToLocalTime().ToString("g");
            var size = e.Graphics.MeasureString(last, Font);
            e.Graphics.DrawString(last, Font, Brushes.DimGray, canvas.Right - size.Width, canvas.Bottom + 12);
            e.Graphics.DrawString("Average (blue) • min/max (vertical bars)", Font, Brushes.DimGray, canvas.Left, 3);
        }
    }
}
