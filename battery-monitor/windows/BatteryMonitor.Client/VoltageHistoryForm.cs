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
        _range.SelectedIndexChanged += (_, _) => RefreshPlot();
        _range.SelectedIndex = 1;
        controls.Controls.Add(_range);
        var reload = new Button { Text = "Refresh", AutoSize = true };
        reload.Click += (_, _) => RefreshAll();
        controls.Controls.Add(reload);
        var export = new Button { Text = "Export CSV...", AutoSize = true };
        export.Click += (_, _) => ExportCsv();
        controls.Controls.Add(export);
        controls.Controls.Add(new Label { Text = "Retention", AutoSize = true, Margin = new Padding(14, 9, 2, 0) });
        foreach (var choice in new[] {
            new RetentionChoice("Keep forever", 0),
            new RetentionChoice("1 year", 1),
            new RetentionChoice("5 years", 5),
            new RetentionChoice("10 years", 10) })
            _retention.Items.Add(choice);
        _retention.SelectedIndex = 0;
        controls.Controls.Add(_retention);
        var purge = new Button { Text = "Purge older records...", AutoSize = true };
        purge.Click += async (_, _) => await PurgeAsync(purge);
        controls.Controls.Add(purge);
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
        FormClosed += (_, _) => { };
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
        var since = DateTime.UtcNow - range.Period;
        var points = _store.Query(_device.DeviceId, since);
        _plot.SetData(points);
        _info.Text = $" {points.Count} graph buckets · local database {_store.DatabaseBytes / 1024.0 / 1024.0:0.0} MiB (WAL may add temporary space).";
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

    private async Task PurgeAsync(Button button)
    {
        if (_retention.SelectedItem is not RetentionChoice choice || choice.Years == 0)
        {
            MessageBox.Show(this, "Keep forever does not remove any records.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var confirm = MessageBox.Show(this,
            $"Permanently delete voltage AND event history older than {choice.Years} year(s) across ALL devices?\n\n" +
            "This cannot be undone without a backup. Export each device's history or copy a consistent SQLite backup before proceeding.\n\n" +
            "Deletion is limited to batches of 10,000 rows, with a commit between batches. Continue?",
            "Permanent history deletion", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes) return;
        button.Enabled = false;
        var cutoff = DateTime.UtcNow.AddYears(-choice.Years);
        try
        {
            var progress = new Progress<int>(n => _info.Text = $" Purged {n:N0} old rows...");
            var removed = await VoltageHistoryStore.PurgeOlderThanAsync(_store.DatabasePath, cutoff, progress, CancellationToken.None);
            MessageBox.Show(this, $"Purge complete: {removed:N0} rows removed.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            RefreshAll();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Purge interrupted. Previously committed batches remain deleted; it is safe to retry.\n\n" + ex.Message,
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { button.Enabled = true; }
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
                TextRenderer.DrawText(e.Graphics, "No stored history for this range. Records become available after the first complete logging interval.", Font,
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
