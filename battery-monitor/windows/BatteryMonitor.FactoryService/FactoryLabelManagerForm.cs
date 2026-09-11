using QRCoder;
using System.Drawing.Printing;

namespace BatteryMonitor.Client;

internal sealed class FactoryLabelManagerForm : Form
{
    private readonly FactoryLabelStore _store = new();
    private readonly DataGridView _grid = new();
    private List<FactoryLabelRecord> _records = new();

    public FactoryLabelManagerForm()
    {
        Text = "Battery Monitor Factory - QR / Label Manager";
        Icon = AppIcon.Current;
        Width = 960;
        Height = 600;
        StartPosition = FormStartPosition.CenterParent;
        BuildUi();
        Reload();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), RowCount = 3, ColumnCount = 1 };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(900, 0),
            Text = "Provisioned-device label records are stored DPAPI-protected for this Windows account. Initial passwords and QR payloads are revealed only inside this management application."
        });

        _grid.Dock = DockStyle.Fill;
        _grid.ReadOnly = true;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.MultiSelect = true;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        _grid.RowHeadersVisible = false;
        _grid.Columns.Add("device", "Device ID");
        _grid.Columns.Add("ssid", "Setup Network");
        _grid.Columns.Add("created", "Provisioned");
        _grid.Columns.Add("printed", "Printed");
        root.Controls.Add(_grid);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var refresh = new Button { Text = "Refresh", AutoSize = true };
        refresh.Click += (_, _) => Reload();
        var view = new Button { Text = "View Selected", AutoSize = true };
        view.Click += (_, _) => ViewSelected();
        var printSelected = new Button { Text = "Print Selected", AutoSize = true };
        printSelected.Click += (_, _) => Print(SelectedRecords());
        var printUnprinted = new Button { Text = "Print All Unprinted", AutoSize = true };
        printUnprinted.Click += (_, _) => Print(_records.Where(r => r.PrintedCount == 0).ToList());
        var remove = new Button { Text = "Remove Selected", AutoSize = true };
        remove.Click += (_, _) => RemoveSelected();
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        actions.Controls.AddRange([refresh, view, printSelected, printUnprinted, remove, close]);
        root.Controls.Add(actions);
    }

    private void Reload()
    {
        _records = _store.Load().OrderByDescending(r => r.CreatedUtc).ToList();
        _grid.Rows.Clear();
        foreach (var record in _records)
        {
            var index = _grid.Rows.Add(record.DeviceId, record.SetupSsid, record.CreatedUtc.ToLocalTime().ToString("g"), record.PrintedCount);
            _grid.Rows[index].Tag = record;
        }
    }

    private List<FactoryLabelRecord> SelectedRecords() =>
        _grid.SelectedRows.Cast<DataGridViewRow>()
            .Select(r => r.Tag as FactoryLabelRecord)
            .Where(r => r is not null)
            .Cast<FactoryLabelRecord>()
            .ToList();

    private void ViewSelected()
    {
        var record = SelectedRecords().FirstOrDefault();
        if (record is null) return;
        using var preview = new FactoryLabelPreviewForm(record);
        preview.ShowDialog(this);
    }

    private void RemoveSelected()
    {
        var selected = SelectedRecords();
        if (selected.Count == 0) return;
        if (MessageBox.Show(this,
                $"Remove {selected.Count} label record(s) from the protected queue? This does not change any device.",
                "Battery Monitor Factory", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var ids = selected.Select(r => r.DeviceId).ToHashSet(StringComparer.OrdinalIgnoreCase);
        _records.RemoveAll(r => ids.Contains(r.DeviceId));
        _store.Save(_records);
        Reload();
    }

    private void Print(List<FactoryLabelRecord> records)
    {
        if (records.Count == 0)
        {
            MessageBox.Show(this, "There are no matching labels to print.", "Battery Monitor Factory",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var document = new PrintDocument { DocumentName = "Battery Monitor Factory Labels" };
        var index = 0;
        document.PrintPage += (_, e) =>
        {
            DrawLabel(e.Graphics, e.MarginBounds, records[index]);
            index++;
            e.HasMorePages = index < records.Count;
        };
        using var dialog = new PrintDialog { Document = document, UseEXDialog = true };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            document.Print();
            var printedIds = records.Select(r => r.DeviceId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var record in _records.Where(r => printedIds.Contains(r.DeviceId))) record.PrintedCount++;
            _store.Save(_records);
            Reload();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Label Printing Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    internal static void DrawLabel(Graphics graphics, Rectangle bounds, FactoryLabelRecord record)
    {
        using var titleFont = new Font("Segoe UI", 18, FontStyle.Bold);
        using var normalFont = new Font("Segoe UI", 11);
        using var passwordFont = new Font("Consolas", 13, FontStyle.Bold);
        using var brush = new SolidBrush(Color.Black);

        var qrBytes = PngByteQRCodeHelper.GetQRCode(record.QrPayload, QRCodeGenerator.ECCLevel.Q, 12);
        using var ms = new MemoryStream(qrBytes);
        using var qr = Image.FromStream(ms);
        var qrSize = Math.Min(260, Math.Min(bounds.Height - 20, bounds.Width / 3));
        graphics.DrawImage(qr, new Rectangle(bounds.Left, bounds.Top, qrSize, qrSize));

        var x = bounds.Left + qrSize + 24;
        var y = bounds.Top + 6;
        graphics.DrawString("Battery Monitor", titleFont, brush, x, y);
        y += 45;
        graphics.DrawString($"Device: {record.DeviceId}", normalFont, brush, x, y);
        y += 28;
        graphics.DrawString($"Setup Wi-Fi: {record.SetupSsid}", normalFont, brush, x, y);
        y += 28;
        graphics.DrawString("Initial Device Password:", normalFont, brush, x, y);
        y += 28;
        graphics.DrawString(ProvisioningCode.Format(ProvisioningCode.Normalize(record.InitialPassword)), passwordFont, brush, x, y);
        y += 36;
        graphics.DrawString("Scan the QR during initial secure setup. Treat this label like a password.", normalFont, brush,
            new RectangleF(x, y, Math.Max(200, bounds.Right - x), 80));
    }
}

internal sealed class FactoryLabelPreviewForm : Form
{
    public FactoryLabelPreviewForm(FactoryLabelRecord record)
    {
        Text = $"Factory Label - {record.DeviceId}";
        Icon = AppIcon.Current;
        Width = 760;
        Height = 520;
        StartPosition = FormStartPosition.CenterParent;
        DoubleBuffered = true;
        Paint += (_, e) => FactoryLabelManagerForm.DrawLabel(e.Graphics, new Rectangle(30, 40, ClientSize.Width - 60, ClientSize.Height - 90), record);
    }
}
