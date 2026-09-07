using System.Drawing;

namespace BatteryMonitor.Client;

internal sealed class WirelessSetupForm : Form
{
    private readonly WirelessProvisioningService _service = new();
    private readonly TextBox _deviceId = new() { CharacterCasing = CharacterCasing.Upper };
    private readonly TextBox _setupCode = new() { CharacterCasing = CharacterCasing.Upper, UseSystemPasswordChar = true };
    private readonly TextBox _homeSsid = new();
    private readonly TextBox _homePassword = new() { UseSystemPasswordChar = true };
    private readonly Label _setupNetwork = new() { AutoSize = true };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(600, 0) };
    private readonly Button _provision = new() { Text = "Secure Wi-Fi Setup", AutoSize = true };
    private readonly CheckBox _showSecrets = new() { Text = "Show setup code and Wi-Fi password", AutoSize = true };
    private CancellationTokenSource? _cts;

    public WirelessSetupForm()
    {
        Text = "Battery Monitor - Wireless Setup";
        Width = 650;
        Height = 510;
        MinimumSize = new Size(590, 470);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        BuildUi();
        UpdateSetupNetwork();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 2, RowCount = 9 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 165));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(590, 0),
            Text = "Configure Wi-Fi without USB. Enter the Device ID and printed setup code (or values from the QR label). Windows joins the device's temporary WPA2 setup network, authenticates with Espressif Security 2, and sends the home Wi-Fi credentials through the encrypted session."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        AddRow(root, 1, "Device ID", _deviceId);
        AddRow(root, 2, "Setup code", _setupCode);
        AddRow(root, 3, "Setup network", _setupNetwork);
        AddRow(root, 4, "Home Wi-Fi SSID", _homeSsid);
        AddRow(root, 5, "Home Wi-Fi password", _homePassword);

        _deviceId.TextChanged += (_, _) => UpdateSetupNetwork();
        _showSecrets.CheckedChanged += (_, _) =>
        {
            _setupCode.UseSystemPasswordChar = !_showSecrets.Checked;
            _homePassword.UseSystemPasswordChar = !_showSecrets.Checked;
        };
        root.Controls.Add(_showSecrets, 1, 6);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = false };
        _provision.Click += async (_, _) => await ProvisionAsync();
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        actions.Controls.Add(_provision);
        actions.Controls.Add(close);
        root.Controls.Add(actions, 1, 7);

        _status.Text = _service.IsReady
            ? "Ready. The setup code and home Wi-Fi password are not saved by the Windows app."
            : "Secure provisioning helper is missing from this installation package.";
        root.Controls.Add(_status, 0, 8); root.SetColumnSpan(_status, 2);

        for (var i = 0; i < 9; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 10, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private void UpdateSetupNetwork()
    {
        var id = _deviceId.Text.Trim().ToUpperInvariant();
        _setupNetwork.Text = id.StartsWith("BM-", StringComparison.Ordinal) && id.Length == 9
            ? "BatteryMonitor-" + id[3..]
            : "BatteryMonitor-XXXXXX";
    }

    private async Task ProvisionAsync()
    {
        if (!_service.IsReady)
        {
            MessageBox.Show(this, "This installation is missing the bundled Espressif secure provisioning helper.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string deviceId;
        try { deviceId = WirelessProvisioningService.NormalizeDeviceId(_deviceId.Text); }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var setupCode = ProvisioningCode.Normalize(_setupCode.Text);
        if (setupCode.Length != 16)
        {
            MessageBox.Show(this, "Enter the 16-character setup code printed for this Battery Monitor.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (string.IsNullOrWhiteSpace(_homeSsid.Text))
        {
            MessageBox.Show(this, "Enter the home Wi-Fi SSID.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SetBusy(true);
        _cts = new CancellationTokenSource();
        try
        {
            await _service.ProvisionAsync(
                deviceId,
                setupCode,
                _homeSsid.Text,
                _homePassword.Text,
                message => BeginInvoke(new Action(() => _status.Text = message)),
                _cts.Token);

            _status.Text = "Secure provisioning succeeded. Windows should return to its normal network automatically, and the Battery Monitor client will discover the unit on the LAN.";
            _setupCode.Clear();
            _homePassword.Clear();
            MessageBox.Show(this,
                "The Battery Monitor joined the requested Wi-Fi network successfully. The tray client should discover it automatically.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (OperationCanceledException)
        {
            _status.Text = "Wireless setup was cancelled.";
        }
        catch (Exception ex)
        {
            _status.Text = "Wireless setup failed.";
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _cts.Dispose();
            _cts = null;
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        _provision.Enabled = !busy;
        _deviceId.Enabled = !busy;
        _setupCode.Enabled = !busy;
        _homeSsid.Enabled = !busy;
        _homePassword.Enabled = !busy;
        _showSecrets.Enabled = !busy;
    }
}
