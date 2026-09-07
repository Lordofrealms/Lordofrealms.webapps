using System.Drawing;

namespace BatteryMonitor.Client;

internal sealed class DevicePasswordPromptForm : Form
{
    private readonly TextBox _password = new() { UseSystemPasswordChar = true };
    private readonly CheckBox _remember = new() { Text = "Remember on this Windows account", AutoSize = true };
    private readonly CheckBox _show = new() { Text = "Show password", AutoSize = true };

    public string DevicePassword => _password.Text;
    public bool Remember => _remember.Checked;

    public DevicePasswordPromptForm(string deviceName, string? savedPassword = null)
    {
        Text = $"Device Password - {deviceName}";
        Width = 470;
        Height = 240;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 6 };
        Controls.Add(root);
        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(420, 0),
            Text = "Enter this monitor's Device Password. It authenticates management commands and secure Wi-Fi provisioning."
        });
        _password.Text = savedPassword ?? string.Empty;
        root.Controls.Add(_password);
        root.Controls.Add(_remember);
        root.Controls.Add(_show);
        _show.CheckedChanged += (_, _) => _password.UseSystemPasswordChar = !_show.Checked;
        if (!string.IsNullOrEmpty(savedPassword)) _remember.Checked = true;

        var actions = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
        var ok = new Button { Text = "Continue", AutoSize = true };
        ok.Click += (_, _) =>
        {
            if (!DevicePasswordRules.TryValidate(_password.Text, out var error))
            {
                MessageBox.Show(this, error, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            DialogResult = DialogResult.OK;
            Close();
        };
        actions.Controls.Add(cancel);
        actions.Controls.Add(ok);
        root.Controls.Add(actions);
        AcceptButton = ok;
        CancelButton = cancel;
    }
}
