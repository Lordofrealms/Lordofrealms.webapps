namespace BatteryMonitor.Client;

internal sealed class FactorySessionLockForm : Form
{
    public bool ExitRequested { get; private set; }

    public FactorySessionLockForm(string reason)
    {
        Text = "Battery Monitor Factory & Service - Locked";
        Icon = AppIcon.Current;
        Width = 500;
        Height = 245;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ControlBox = false;
        ShowInTaskbar = false;
        TopMost = true;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 1,
            RowCount = 4,
            AutoSize = true
        };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Factory & Service is locked",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 0, 0, 8)
        });
        root.Controls.Add(new Label
        {
            Text = reason,
            AutoSize = true,
            MaximumSize = new Size(440, 0),
            Margin = new Padding(0, 0, 0, 8)
        });
        root.Controls.Add(new Label
        {
            Text = "Open tools, entered values, logs, and in-progress operations remain in memory. Re-enter the Factory & Service password to continue interacting with them.",
            AutoSize = true,
            MaximumSize = new Size(440, 0),
            Margin = new Padding(0, 0, 0, 12)
        });

        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        var unlock = new Button { Text = "Unlock", AutoSize = true };
        unlock.Click += (_, _) => TryUnlock();
        var exit = new Button { Text = "Exit Factory & Service", AutoSize = true };
        exit.Click += (_, _) =>
        {
            if (MessageBox.Show(this,
                    "Exit Factory & Service? Any unsaved form state will be lost. In-progress device operations may be interrupted.",
                    "Battery Monitor Factory & Service",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning,
                    MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                return;

            ExitRequested = true;
            DialogResult = DialogResult.Abort;
            Close();
        };
        buttons.Controls.Add(unlock);
        buttons.Controls.Add(exit);
        root.Controls.Add(buttons);
        AcceptButton = unlock;
    }

    private void TryUnlock()
    {
        if (!AdminSecurity.Authenticate(this)) return;
        DialogResult = DialogResult.OK;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!ExitRequested && DialogResult != DialogResult.OK)
        {
            e.Cancel = true;
            return;
        }
        base.OnFormClosing(e);
    }
}
