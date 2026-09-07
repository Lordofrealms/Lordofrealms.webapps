using System.Diagnostics;
using System.Drawing;
using System.Media;

namespace BatteryMonitor.Client;

public sealed class MainForm : Form
{
    private readonly SettingsStore _settings = new();
    private readonly DeviceCredentialStore _credentials = new();
    private readonly DeviceClient _deviceClient = new();
    private readonly DiscoveryService _discovery = new();
    private readonly List<MonitorEntry> _devices;
    private readonly DataGridView _grid = new();
    private readonly Label _summary = new();
    private readonly NotifyIcon _tray = new();
    private readonly System.Windows.Forms.Timer _tick = new() { Interval = 1000 };
    private DateTime _lastDiscoveryUtc = DateTime.MinValue;
    private bool _allowClose;

    public MainForm()
    {
        _devices = _settings.Load();
        foreach (var device in _devices)
        {
            if (device.OfflineTimeoutSec <= 0) device.OfflineTimeoutSec = 300;
            if (device.PollIntervalSec < 2) device.PollIntervalSec = 10;
        }

        Text = "Battery Monitor";
        Width = 1120;
        Height = 560;
        MinimumSize = new Size(900, 430);
        StartPosition = FormStartPosition.CenterScreen;

        BuildUi();
        BuildTray();

        _discovery.DeviceDiscovered += OnDeviceDiscovered;
        _tick.Tick += Tick;
        _tick.Start();
        Shown += async (_, _) => await DiscoverNowAsync();
        FormClosing += OnFormClosing;
        Resize += (_, _) => { if (WindowState == FormWindowState.Minimized) HideToTray(); };
    }

    private void BuildUi()
    {
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(8), WrapContents = false };
        var discover = new Button { Text = "Discover Now", AutoSize = true };
        var configure = new Button { Text = "Configure", AutoSize = true };
        var changeWifi = new Button { Text = "Change Wi-Fi", AutoSize = true };
        var openWeb = new Button { Text = "Open Web Page", AutoSize = true };
        var remove = new Button { Text = "Remove from PC", AutoSize = true };
        discover.Click += async (_, _) => await DiscoverNowAsync();
        configure.Click += async (_, _) => await ConfigureSelectedAsync();
        changeWifi.Click += async (_, _) => await ChangeWifiSelectedAsync();
        openWeb.Click += (_, _) => OpenSelectedWebPage();
        remove.Click += (_, _) => RemoveSelected();
        top.Controls.AddRange(new Control[] { discover, configure, changeWifi, openWeb, remove });
        Controls.Add(top);

        _grid.Dock = DockStyle.Fill;
        _grid.ReadOnly = true;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.MultiSelect = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        _grid.RowHeadersVisible = false;
        _grid.Columns.Add("name", "Name");
        _grid.Columns.Add("unit", "Unit Name");
        _grid.Columns.Add("voltage", "Voltage");
        _grid.Columns.Add("state", "State");
        _grid.Columns.Add("type", "Battery");
        _grid.Columns.Add("address", "Address");
        _grid.Columns.Add("lastSeen", "Last Seen");
        _grid.Columns.Add("rssi", "RSSI");
        _grid.Columns.Add("id", "Device ID");
        _grid.DoubleClick += async (_, _) => await ConfigureSelectedAsync();
        Controls.Add(_grid);
        _grid.BringToFront();

        _summary.Dock = DockStyle.Bottom;
        _summary.Height = 30;
        _summary.Padding = new Padding(8, 6, 8, 4);
        Controls.Add(_summary);
        RenderGrid();
    }

    private void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Show", null, (_, _) => ShowFromTray());
        menu.Items.Add("Discover Now", null, async (_, _) => await DiscoverNowAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => { _allowClose = true; Close(); });
        _tray.Icon = SystemIcons.Information;
        _tray.Text = "Battery Monitor";
        _tray.Visible = true;
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => ShowFromTray();
    }

    private async void Tick(object? sender, EventArgs e)
    {
        var now = DateTime.UtcNow;
        if ((now - _lastDiscoveryUtc).TotalSeconds >= 30)
            await DiscoverNowAsync();

        foreach (var device in _devices.ToArray())
        {
            if (!device.PollInProgress && (now - device.LastPollUtc).TotalSeconds >= Math.Max(2, device.PollIntervalSec))
                _ = PollDeviceAsync(device);
            EvaluateOfflineState(device, now);
        }
        RenderGrid();
    }

    private async Task DiscoverNowAsync()
    {
        _lastDiscoveryUtc = DateTime.UtcNow;
        try { await _discovery.DiscoverAsync(); }
        catch { }
    }

    private void OnDeviceDiscovered(DiscoveredDevice found)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => OnDeviceDiscovered(found)));
            return;
        }

        var device = _devices.FirstOrDefault(d => d.DeviceId.Equals(found.DeviceId, StringComparison.OrdinalIgnoreCase));
        if (device is null)
        {
            device = new MonitorEntry
            {
                DeviceId = found.DeviceId,
                DeviceName = found.Name,
                Hostname = found.Hostname,
                Address = found.Ip,
                Port = found.Port,
                PollIntervalSec = 10,
                OfflineTimeoutSec = 300
            };
            _devices.Add(device);
            _settings.Save(_devices);
            ShowBalloon("Battery Monitor Found", $"Found {device.DisplayName} at {device.Address}", ToolTipIcon.Info);
        }
        else
        {
            var changed = !string.Equals(device.Address, found.Ip, StringComparison.OrdinalIgnoreCase)
                || device.Port != found.Port
                || !string.Equals(device.Hostname, found.Hostname, StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(found.Name) && !string.Equals(device.DeviceName, found.Name, StringComparison.Ordinal));
            device.Address = found.Ip;
            device.Port = found.Port;
            device.Hostname = found.Hostname;
            if (!string.IsNullOrWhiteSpace(found.Name)) device.DeviceName = found.Name;
            if (changed) _settings.Save(_devices);
        }
        RenderGrid();
    }

    private async Task PollDeviceAsync(MonitorEntry device)
    {
        device.PollInProgress = true;
        device.LastPollUtc = DateTime.UtcNow;
        try
        {
            var status = await _deviceClient.GetStatusAsync(device);
            BeginInvoke(new Action(() => ApplyStatus(device, status)));
        }
        catch
        {
            BeginInvoke(new Action(() => ApplyFailure(device)));
        }
        finally
        {
            device.PollInProgress = false;
        }
    }

    private void ApplyStatus(MonitorEntry device, DeviceStatus status)
    {
        var wasOffline = device.OfflineAlerted || IsOffline(device, DateTime.UtcNow);
        device.FailureStartedUtc = null;
        device.OfflineAlerted = false;
        device.Voltage = status.Voltage;
        device.State = status.State;
        device.Rssi = status.Rssi;
        device.LastSeenUtc = DateTime.UtcNow;

        var newAddress = string.IsNullOrWhiteSpace(status.Ip) ? device.Address : status.Ip;
        var persistentChanged = !string.Equals(device.DeviceName, status.Name, StringComparison.Ordinal)
            || !string.Equals(device.Hostname, status.Hostname, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(device.Address, newAddress, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(device.BatteryType, status.BatteryType, StringComparison.Ordinal)
            || Math.Abs(device.LowVoltage - status.LowVoltage) > 0.0001
            || Math.Abs(device.CriticalVoltage - status.CriticalVoltage) > 0.0001
            || device.SampleIntervalSec != status.SampleIntervalSec
            || Math.Abs(device.CalibrationFactor - status.CalibrationFactor) > 0.000001
            || Math.Abs(device.CalibrationOffset - status.CalibrationOffset) > 0.0001;

        device.DeviceName = status.Name;
        device.Hostname = status.Hostname;
        device.BatteryType = status.BatteryType;
        device.LowVoltage = status.LowVoltage;
        device.CriticalVoltage = status.CriticalVoltage;
        device.SampleIntervalSec = status.SampleIntervalSec;
        device.CalibrationFactor = status.CalibrationFactor;
        device.CalibrationOffset = status.CalibrationOffset;
        device.Address = newAddress;
        if (persistentChanged) _settings.Save(_devices);

        if (wasOffline)
            ShowBalloon("Battery Monitor Online", $"{device.DisplayName} is reachable again at {device.Voltage:0.00} V.", ToolTipIcon.Info);

        HandleVoltageAlert(device);
        RenderGrid();
    }

    private void ApplyFailure(MonitorEntry device)
    {
        if (!device.FailureStartedUtc.HasValue)
            device.FailureStartedUtc = device.LastSeenUtc ?? DateTime.UtcNow;
        EvaluateOfflineState(device, DateTime.UtcNow);
        RenderGrid();
    }

    private void EvaluateOfflineState(MonitorEntry device, DateTime now)
    {
        if (!IsOffline(device, now) || device.OfflineAlerted) return;
        device.OfflineAlerted = true;
        SystemSounds.Asterisk.Play();
        ShowBalloon("Battery Monitor Offline", $"{device.DisplayName} has been unreachable for {FormatDuration(device.OfflineTimeoutSec)}.", ToolTipIcon.Warning);
    }

    private static bool IsOffline(MonitorEntry device, DateTime now)
    {
        if (!device.FailureStartedUtc.HasValue) return false;
        var timeoutSec = Math.Max(5, device.OfflineTimeoutSec);
        return (now - device.FailureStartedUtc.Value).TotalSeconds >= timeoutSec;
    }

    private void HandleVoltageAlert(MonitorEntry device)
    {
        var current = device.State;
        var isAlert = current is "low" or "critical";
        var changed = !string.Equals(current, device.LastAlertState, StringComparison.OrdinalIgnoreCase);
        var repeatDue = isAlert && (DateTime.UtcNow - device.LastAlertUtc).TotalMinutes >= 30;
        if ((changed && isAlert) || repeatDue)
        {
            if (current == "critical") SystemSounds.Hand.Play(); else SystemSounds.Exclamation.Play();
            var title = current == "critical" ? "CRITICAL Battery" : "Low Battery";
            ShowBalloon(title, $"{device.DisplayName}: {device.Voltage:0.00} V", current == "critical" ? ToolTipIcon.Error : ToolTipIcon.Warning);
            device.LastAlertUtc = DateTime.UtcNow;
        }
        device.LastAlertState = current;
    }

    private async Task ConfigureSelectedAsync()
    {
        var device = SelectedDevice();
        if (device is null) return;
        var savedPassword = _credentials.Load(device.DeviceId);
        using var dialog = new DeviceConfigForm(device, savedPassword);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        _settings.Save(_devices);
        EvaluateOfflineState(device, DateTime.UtcNow);
        if (dialog.ForgetSavedPassword) _credentials.Forget(device.DeviceId);

        if (dialog.ApplyToUnit)
        {
            var configApplied = false;
            try
            {
                var status = await _deviceClient.ApplyConfigAsync(device, dialog.DevicePassword);
                configApplied = true;
                ApplyStatus(device, status);

                if (!string.IsNullOrEmpty(dialog.NewDevicePassword))
                {
                    await _deviceClient.RotateDevicePasswordAsync(device, dialog.DevicePassword, dialog.NewDevicePassword);
                    if (dialog.RememberDevicePassword) _credentials.Save(device.DeviceId, dialog.NewDevicePassword);
                    else _credentials.Forget(device.DeviceId);
                    MessageBox.Show(this, "Settings were applied and the Device Password was changed. Existing management sessions were invalidated.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    if (dialog.RememberDevicePassword) _credentials.Save(device.DeviceId, dialog.DevicePassword);
                    else _credentials.Forget(device.DeviceId);
                    MessageBox.Show(this, "Settings were saved locally and applied to the unit.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                if (configApplied && dialog.RememberDevicePassword) _credentials.Save(device.DeviceId, dialog.DevicePassword);
                MessageBox.Show(this,
                    configApplied
                        ? $"Device settings were applied, but the later security operation failed.\n\n{ex.Message}"
                        : $"Local settings were saved, but the unit could not be updated.\n\n{ex.Message}",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        RenderGrid();
    }

    private async Task ChangeWifiSelectedAsync()
    {
        var device = SelectedDevice();
        if (device is null) return;
        var savedPassword = _credentials.Load(device.DeviceId);
        using var passwordDialog = new DevicePasswordPromptForm(device.DisplayName, savedPassword);
        if (passwordDialog.ShowDialog(this) != DialogResult.OK) return;

        try
        {
            await _deviceClient.EnterSecureProvisioningAsync(device, passwordDialog.DevicePassword);
            if (passwordDialog.Remember) _credentials.Save(device.DeviceId, passwordDialog.DevicePassword);
            else _credentials.Forget(device.DeviceId);

            MessageBox.Show(this,
                "The monitor accepted the authenticated request and is starting its secure setup network. Windows setup will now connect to it using the same Device Password.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            using var setup = new WirelessSetupForm(device.DeviceId, passwordDialog.DevicePassword);
            setup.ShowDialog(this);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Could not start secure Wi-Fi setup.\n\n{ex.Message}", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private MonitorEntry? SelectedDevice()
    {
        if (_grid.SelectedRows.Count != 1) return null;
        return _grid.SelectedRows[0].Tag as MonitorEntry;
    }

    private void OpenSelectedWebPage()
    {
        var device = SelectedDevice();
        if (device is null || string.IsNullOrWhiteSpace(device.Address)) return;
        try { Process.Start(new ProcessStartInfo($"http://{device.Address}:{device.Port}/") { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void RemoveSelected()
    {
        var device = SelectedDevice();
        if (device is null) return;
        if (MessageBox.Show(this, $"Remove {device.DisplayName} from this PC? The ESP32 itself will not be changed. Any remembered Device Password on this PC will also be removed.", "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        _credentials.Forget(device.DeviceId);
        _devices.Remove(device);
        _settings.Save(_devices);
        RenderGrid();
    }

    private void RenderGrid()
    {
        if (IsDisposed) return;
        var now = DateTime.UtcNow;
        var selectedId = SelectedDevice()?.DeviceId;
        _grid.Rows.Clear();
        foreach (var device in _devices.OrderBy(d => d.DisplayName, StringComparer.OrdinalIgnoreCase))
        {
            var offline = IsOffline(device, now);
            var unreachable = device.FailureStartedUtc.HasValue && !offline;
            var lastSeen = device.LastSeenUtc.HasValue ? ToAge(device.LastSeenUtc.Value) : "Never";
            var stateText = offline
                ? "OFFLINE"
                : unreachable
                    ? $"UNREACHABLE {FormatDuration((int)Math.Max(0, (now - device.FailureStartedUtc!.Value).TotalSeconds))}/{FormatDuration(device.OfflineTimeoutSec)}"
                    : device.State.ToUpperInvariant();

            var rowIndex = _grid.Rows.Add(
                device.DisplayName,
                device.DeviceName,
                device.Voltage.HasValue ? $"{device.Voltage:0.00} V" : "--",
                stateText,
                BatteryPresets.FriendlyName(device.BatteryType),
                device.Address,
                lastSeen,
                device.Rssi == 0 ? "--" : $"{device.Rssi} dBm",
                device.DeviceId);
            var row = _grid.Rows[rowIndex];
            row.Tag = device;
            if (device.DeviceId == selectedId) row.Selected = true;
        }

        var good = _devices.Count(d => !d.FailureStartedUtc.HasValue && d.State == "good");
        var alert = _devices.Count(d => !d.FailureStartedUtc.HasValue && d.State is "low" or "critical");
        var offlineCount = _devices.Count(d => IsOffline(d, now));
        var unreachableCount = _devices.Count(d => d.FailureStartedUtc.HasValue && !IsOffline(d, now));
        _summary.Text = $"{_devices.Count} monitor(s) | {good} good | {alert} battery alert(s) | {unreachableCount} unreachable | {offlineCount} offline";
        _tray.Text = _devices.Count == 0 ? "Battery Monitor" : $"Battery Monitor - {_devices.Count} device(s)";
    }

    private static string ToAge(DateTime utc)
    {
        var age = DateTime.UtcNow - utc;
        if (age.TotalSeconds < 60) return $"{Math.Max(0, (int)age.TotalSeconds)}s ago";
        if (age.TotalMinutes < 60) return $"{(int)age.TotalMinutes}m ago";
        if (age.TotalHours < 24) return $"{(int)age.TotalHours}h ago";
        return utc.ToLocalTime().ToString("g");
    }

    private static string FormatDuration(int seconds)
    {
        seconds = Math.Max(0, seconds);
        if (seconds < 60) return $"{seconds}s";
        if (seconds < 3600) return seconds % 60 == 0 ? $"{seconds / 60}m" : $"{seconds / 60}m {seconds % 60}s";
        var hours = seconds / 3600;
        var minutes = (seconds % 3600) / 60;
        return minutes == 0 ? $"{hours}h" : $"{hours}h {minutes}m";
    }

    private void ShowBalloon(string title, string text, ToolTipIcon icon)
    {
        _tray.BalloonTipTitle = title;
        _tray.BalloonTipText = text;
        _tray.BalloonTipIcon = icon;
        _tray.ShowBalloonTip(5000);
    }

    private void HideToTray()
    {
        Hide();
        ShowInTaskbar = false;
    }

    private void ShowFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!_allowClose && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            HideToTray();
            return;
        }
        _tick.Stop();
        _discovery.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
    }
}
