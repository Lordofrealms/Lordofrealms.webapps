using System.Diagnostics;
using System.Drawing;
using System.Media;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

public sealed class MainForm : Form
{
    private readonly SettingsStore _settings = new();
    private readonly DeviceCredentialStore _credentials = new();
    private readonly MonitoringIdentityStore _monitoringIdentities = new();
    private readonly DeviceClient _deviceClient = new();
    private readonly DiscoveryService _discovery;
    private readonly List<MonitorEntry> _devices;
    private readonly HashSet<string> _pairing = new(StringComparer.OrdinalIgnoreCase);
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
            device.NormalizeLocalSettings();
            device.MonitoringTrustState = _monitoringIdentities.Has(device.DeviceId) ? "Trusted" : "Unpaired";
        }

        _discovery = new DiscoveryService(id => _monitoringIdentities.Load(id));

        Text = "Battery Monitor";
        Icon = AppIcon.Current;
        Width = 1220;
        Height = 620;
        MinimumSize = new Size(980, 480);
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
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Margin = new Padding(0),
            Padding = new Padding(0)
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        Controls.Add(root);

        var menu = BuildMenu();
        MainMenuStrip = menu;
        root.Controls.Add(menu, 0, 0);

        var quick = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8, 7, 8, 4),
            WrapContents = false
        };
        var discover = new Button { Text = "Discover Now", AutoSize = true };
        var configure = new Button { Text = "Configure", AutoSize = true };
        var openWeb = new Button { Text = "Open Web Page", AutoSize = true };
        discover.Click += async (_, _) => await DiscoverNowAsync();
        configure.Click += async (_, _) => await ConfigureSelectedAsync();
        openWeb.Click += (_, _) => OpenSelectedWebPage();
        quick.Controls.AddRange([discover, configure, openWeb]);
        root.Controls.Add(quick, 0, 1);

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
        _grid.Columns.Add("trust", "Trust");
        _grid.Columns.Add("type", "Battery");
        _grid.Columns.Add("address", "Address");
        _grid.Columns.Add("lastSeen", "Last Seen");
        _grid.Columns.Add("rssi", "RSSI");
        _grid.Columns.Add("id", "Device ID");
        _grid.DoubleClick += async (_, _) => await ConfigureSelectedAsync();
        root.Controls.Add(_grid, 0, 2);

        _summary.Dock = DockStyle.Fill;
        _summary.Padding = new Padding(8, 6, 8, 4);
        root.Controls.Add(_summary, 0, 3);

        RenderGrid();
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip();

        var file = new ToolStripMenuItem("&File");
        file.DropDownItems.Add("E&xit", null, (_, _) => { _allowClose = true; Close(); });

        var devices = new ToolStripMenuItem("&Devices");
        devices.DropDownItems.Add("&Discover Now", null, async (_, _) => await DiscoverNowAsync());
        devices.DropDownItems.Add(new ToolStripSeparator());
        devices.DropDownItems.Add("&Pair / Trust", null, async (_, _) => await PairSelectedAsync());
        devices.DropDownItems.Add("&Configure...", null, async (_, _) => await ConfigureSelectedAsync());
        devices.DropDownItems.Add("Change &Wi-Fi...", null, async (_, _) => await ChangeWifiSelectedAsync());
        devices.DropDownItems.Add("&Open Web Page", null, (_, _) => OpenSelectedWebPage());
        devices.DropDownItems.Add(new ToolStripSeparator());
        devices.DropDownItems.Add("&Remove from PC", null, (_, _) => RemoveSelected());

        var tools = new ToolStripMenuItem("&Tools");
        tools.DropDownItems.Add("&USB Setup...", null, (_, _) => OpenUsbSetup());
        tools.DropDownItems.Add("USB Pair / &Trust...", null, (_, _) => OpenUsbTrust());
        tools.DropDownItems.Add("&Wireless Setup...", null, (_, _) => OpenWirelessSetup());
        tools.DropDownItems.Add("&Update Firmware...", null, (_, _) => OpenFirmwareUpdate());
        tools.DropDownItems.Add(new ToolStripSeparator());
        tools.DropDownItems.Add("&Advanced Tools...", null, (_, _) => OpenAdvancedTools());
        tools.DropDownItems.Add(new ToolStripSeparator());

        var startup = new ToolStripMenuItem("Start with &Windows")
        {
            CheckOnClick = true,
            Checked = StartupManager.IsEnabled()
        };
        startup.CheckedChanged += (_, _) =>
        {
            try
            {
                StartupManager.SetEnabled(startup.Checked);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, $"Windows startup setting could not be changed.\n\n{ex.Message}",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                var actual = StartupManager.IsEnabled();
                if (startup.Checked != actual) startup.Checked = actual;
            }
        };
        tools.DropDownItems.Add(startup);

        var help = new ToolStripMenuItem("&Help");
        help.DropDownItems.Add("&Getting Started...", null, (_, _) => OpenHelp("Getting Started"));
        help.DropDownItems.Add("&Wi-Fi and Recovery...", null, (_, _) => OpenHelp("Wi-Fi"));
        help.DropDownItems.Add("&Alerts...", null, (_, _) => OpenHelp("Alerts"));
        help.DropDownItems.Add("&Troubleshooting...", null, (_, _) => OpenHelp("Troubleshooting"));
        help.DropDownItems.Add(new ToolStripSeparator());
        help.DropDownItems.Add("&About Battery Monitor...", null, (_, _) => OpenHelp("About"));

        menu.Items.AddRange([file, devices, tools, help]);
        return menu;
    }

    private void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Show", null, (_, _) => ShowFromTray());
        menu.Items.Add("Discover Now", null, async (_, _) => await DiscoverNowAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => { _allowClose = true; Close(); });

        _tray.Icon = AppIcon.Current;
        _tray.Text = "Battery Monitor";
        _tray.Visible = true;
        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick += (_, _) => ShowFromTray();
    }

    private void OpenUsbSetup()
    {
        using var dialog = new UsbSetupForm();
        dialog.ShowDialog(this);
    }

    private void OpenUsbTrust()
    {
        using var dialog = new UsbMonitoringTrustForm();
        dialog.ShowDialog(this);
    }

    private void OpenWirelessSetup()
    {
        using var dialog = new WirelessSetupForm();
        dialog.ShowDialog(this);
    }

    private void OpenFirmwareUpdate()
    {
        using var dialog = new FirmwareUpdateForm();
        dialog.ShowDialog(this);
    }

    private void OpenAdvancedTools()
    {
        if (!AdminSecurity.Authenticate(this)) return;
        using var dialog = new AdvancedToolsForm();
        dialog.ShowDialog(this);
    }

    private void OpenHelp(string topic)
    {
        using var dialog = new HelpForm(topic);
        dialog.ShowDialog(this);
    }

    private async void Tick(object? sender, EventArgs e)
    {
        var now = DateTime.UtcNow;
        if ((now - _lastDiscoveryUtc).TotalSeconds >= 30)
            await DiscoverNowAsync();

        foreach (var device in _devices.ToArray())
        {
            if (!device.IsCandidate && !device.PollInProgress &&
                (now - device.LastPollUtc).TotalSeconds >= Math.Max(2, device.PollIntervalSec))
                _ = PollDeviceAsync(device);

            if (device.MonitoringTrustState == "Trusted" && !device.IdentityFailure)
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
        var hasTrust = _monitoringIdentities.Has(found.DeviceId);

        if (found.IdentityFailure && hasTrust)
        {
            if (device is not null)
                ApplyIdentityFailure(device, "Authenticated discovery proof failed for a known Device ID.");
            return;
        }

        if (!found.Authenticated && hasTrust) return;

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
                OfflineTimeoutSec = 300,
                IsCandidate = !found.Authenticated,
                MonitoringTrustState = found.Authenticated ? "Trusted" : "Unpaired"
            };
            device.NormalizeLocalSettings();
            _devices.Add(device);

            if (!device.IsCandidate) _settings.Save(_devices);
            ShowBalloon(found.Authenticated ? "Trusted Battery Monitor Found" : "Unpaired Battery Monitor Found",
                found.Authenticated
                    ? $"Authenticated {device.DisplayName} at {device.Address}."
                    : $"Found candidate {device.DisplayName} at {device.Address}. Pair it before trusting battery readings.",
                ToolTipIcon.Info);
        }
        else
        {
            device.NormalizeLocalSettings();
            var changed = !string.Equals(device.Address, found.Ip, StringComparison.OrdinalIgnoreCase)
                || device.Port != found.Port
                || !string.Equals(device.Hostname, found.Hostname, StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(found.Name) &&
                    !string.Equals(device.DeviceName, found.Name, StringComparison.Ordinal));

            device.Address = found.Ip;
            device.Port = found.Port;
            device.Hostname = found.Hostname;
            if (!string.IsNullOrWhiteSpace(found.Name)) device.DeviceName = found.Name;

            if (found.Authenticated)
            {
                device.IsCandidate = false;
                device.IdentityFailure = false;
                device.MonitoringTrustState = "Trusted";
            }

            if (changed && !device.IsCandidate) _settings.Save(_devices);
        }

        if (!found.Authenticated && !_pairing.Contains(device.DeviceId))
        {
            var savedPassword = _credentials.Load(device.DeviceId);
            if (!string.IsNullOrEmpty(savedPassword))
                _ = PairDeviceAsync(device, savedPassword, rememberPassword: true, silent: true);
        }

        RenderGrid();
    }

    private async Task PairSelectedAsync()
    {
        var device = SelectedDevice();
        if (device is null) return;

        var savedPassword = _credentials.Load(device.DeviceId);
        using var dialog = new DevicePasswordPromptForm(device.DisplayName, savedPassword);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        await PairDeviceAsync(device, dialog.DevicePassword, dialog.Remember, silent: false);
    }

    private async Task<bool> PairDeviceAsync(MonitorEntry device, string password, bool rememberPassword, bool silent)
    {
        if (!_pairing.Add(device.DeviceId)) return false;
        try
        {
            var key = await _deviceClient.PairMonitoringIdentityAsync(device, password);
            try { _monitoringIdentities.Save(device.DeviceId, key); }
            finally { CryptographicOperations.ZeroMemory(key); }

            if (rememberPassword) _credentials.Save(device.DeviceId, password);
            else _credentials.Forget(device.DeviceId);

            device.IsCandidate = false;
            device.IdentityFailure = false;
            device.MonitoringTrustState = "Trusted";
            device.FailureStartedUtc = null;
            _settings.Save(_devices);

            if (!silent)
            {
                MessageBox.Show(this,
                    "This PC is now paired with the monitor. Future discovery and battery status must authenticate with the monitor's separate DPAPI-protected trust key.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            await PollDeviceAsync(device);
            return true;
        }
        catch (Exception ex)
        {
            device.MonitoringTrustState = "Unpaired";
            if (!silent)
                MessageBox.Show(this, $"Could not pair/trust this monitor.\n\n{ex.Message}",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            RenderGrid();
            return false;
        }
        finally
        {
            _pairing.Remove(device.DeviceId);
        }
    }

    private async Task PollDeviceAsync(MonitorEntry device)
    {
        var key = _monitoringIdentities.Load(device.DeviceId);
        if (key is null)
        {
            device.MonitoringTrustState = "Unpaired";
            device.FailureStartedUtc = null;
            return;
        }

        device.PollInProgress = true;
        device.LastPollUtc = DateTime.UtcNow;
        try
        {
            var status = await _deviceClient.GetAuthenticatedStatusAsync(device, key);
            if (!IsDisposed) BeginInvoke(new Action(() => ApplyStatus(device, status)));
        }
        catch (MonitoringIdentityException ex)
        {
            if (!IsDisposed) BeginInvoke(new Action(() => ApplyIdentityFailure(device, ex.Message)));
        }
        catch
        {
            if (!IsDisposed) BeginInvoke(new Action(() => ApplyFailure(device)));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            device.PollInProgress = false;
        }
    }

    private void ApplyStatus(MonitorEntry device, DeviceStatus status)
    {
        var wasOffline = device.OfflineAlerted || IsOffline(device, DateTime.UtcNow);

        device.FailureStartedUtc = null;
        device.OfflineAlerted = false;
        device.LastOfflineAlertUtc = DateTime.MinValue;
        device.IdentityFailure = false;
        device.MonitoringTrustState = "Trusted";
        device.Voltage = status.Voltage;
        device.State = status.State;
        device.Rssi = status.Rssi;
        device.LastSeenUtc = DateTime.UtcNow;

        var persistentChanged = !string.Equals(device.DeviceName, status.Name, StringComparison.Ordinal)
            || !string.Equals(device.Hostname, status.Hostname, StringComparison.OrdinalIgnoreCase)
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

        if (persistentChanged) _settings.Save(_devices);

        if (wasOffline && device.RecoveryAlert.Enabled)
        {
            AlertSoundPlayer.Play(device.RecoveryAlert);
            ShowBalloon("Battery Monitor Online",
                $"{device.DisplayName} is authenticated and reachable again at {device.Voltage:0.00} V.",
                ToolTipIcon.Info);
        }

        HandleVoltageAlert(device);
        RenderGrid();
    }

    private void ApplyIdentityFailure(MonitorEntry device, string reason)
    {
        var first = !device.IdentityFailure;
        device.IdentityFailure = true;
        device.MonitoringTrustState = "Identity failure";
        device.Voltage = null;
        device.State = "unknown";
        device.FailureStartedUtc = null;
        device.OfflineAlerted = false;

        if (first)
        {
            SystemSounds.Hand.Play();
            ShowBalloon("Battery Monitor Identity Failure", $"{device.DisplayName}: {reason}", ToolTipIcon.Error);
        }

        RenderGrid();
    }

    private void ApplyFailure(MonitorEntry device)
    {
        if (device.IdentityFailure || device.MonitoringTrustState != "Trusted") return;
        if (!device.FailureStartedUtc.HasValue)
            device.FailureStartedUtc = device.LastSeenUtc ?? DateTime.UtcNow;

        EvaluateOfflineState(device, DateTime.UtcNow);
        RenderGrid();
    }

    private void EvaluateOfflineState(MonitorEntry device, DateTime now)
    {
        if (device.IdentityFailure || device.MonitoringTrustState != "Trusted" || !IsOffline(device, now)) return;

        var first = !device.OfflineAlerted;
        var profile = device.OfflineAlert;
        var repeatDue = device.OfflineAlerted && profile.RepeatMinutes > 0 &&
                        (now - device.LastOfflineAlertUtc).TotalMinutes >= profile.RepeatMinutes;

        device.OfflineAlerted = true;
        if (!first && !repeatDue) return;

        device.LastOfflineAlertUtc = now;
        if (!profile.Enabled) return;

        AlertSoundPlayer.Play(profile);
        ShowBalloon("Battery Monitor Offline",
            $"{device.DisplayName} has been unreachable for {FormatDuration(device.OfflineTimeoutSec)}.",
            ToolTipIcon.Warning);
    }

    private static bool IsOffline(MonitorEntry device, DateTime now)
    {
        if (!device.FailureStartedUtc.HasValue) return false;
        var timeoutSec = Math.Max(5, device.OfflineTimeoutSec);
        return (now - device.FailureStartedUtc.Value).TotalSeconds >= timeoutSec;
    }

    private void HandleVoltageAlert(MonitorEntry device)
    {
        if (device.MonitoringTrustState != "Trusted" || device.IdentityFailure) return;

        var current = device.State;
        if (current != "low" && current != "critical")
        {
            device.LastAlertState = current;
            device.LastAlertUtc = DateTime.MinValue;
            return;
        }

        var profile = current == "critical" ? device.CriticalAlert : device.LowAlert;
        var changed = !string.Equals(current, device.LastAlertState, StringComparison.OrdinalIgnoreCase);
        var neverAlerted = device.LastAlertUtc == DateTime.MinValue;
        var repeatDue = profile.RepeatMinutes > 0 &&
                        (DateTime.UtcNow - device.LastAlertUtc).TotalMinutes >= profile.RepeatMinutes;

        if (profile.Enabled && (changed || neverAlerted || repeatDue))
        {
            AlertSoundPlayer.Play(profile);
            var title = current == "critical" ? "CRITICAL Battery" : "Low Battery";
            ShowBalloon(title, $"{device.DisplayName}: {device.Voltage:0.00} V",
                current == "critical" ? ToolTipIcon.Error : ToolTipIcon.Warning);
            device.LastAlertUtc = DateTime.UtcNow;
        }

        device.LastAlertState = current;
    }

    private async Task ConfigureSelectedAsync()
    {
        var device = SelectedDevice();
        if (device is null) return;

        device.NormalizeLocalSettings();
        var savedPassword = _credentials.Load(device.DeviceId);
        using var dialog = new DeviceConfigForm(device, savedPassword);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        if (!device.IsCandidate) _settings.Save(_devices);
        EvaluateOfflineState(device, DateTime.UtcNow);
        if (dialog.ForgetSavedPassword) _credentials.Forget(device.DeviceId);

        if (dialog.ApplyToUnit)
        {
            var configApplied = false;
            try
            {
                await _deviceClient.ApplyConfigAsync(device, dialog.DevicePassword);
                configApplied = true;

                if (!_monitoringIdentities.Has(device.DeviceId))
                {
                    var key = await _deviceClient.PairMonitoringIdentityAsync(device, dialog.DevicePassword);
                    try { _monitoringIdentities.Save(device.DeviceId, key); }
                    finally { CryptographicOperations.ZeroMemory(key); }

                    device.IsCandidate = false;
                    device.MonitoringTrustState = "Trusted";
                    _settings.Save(_devices);
                }

                if (!string.IsNullOrEmpty(dialog.NewDevicePassword))
                {
                    await _deviceClient.RotateDevicePasswordAsync(device, dialog.DevicePassword, dialog.NewDevicePassword);
                    if (dialog.RememberDevicePassword) _credentials.Save(device.DeviceId, dialog.NewDevicePassword);
                    else _credentials.Forget(device.DeviceId);

                    MessageBox.Show(this,
                        "Settings were applied, this PC is paired for authenticated monitoring, and the Device Password was changed. Monitoring trust is intentionally unchanged by password rotation.",
                        "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    if (dialog.RememberDevicePassword) _credentials.Save(device.DeviceId, dialog.DevicePassword);
                    else _credentials.Forget(device.DeviceId);

                    MessageBox.Show(this,
                        "Settings were saved locally/applied to the unit, and authenticated monitoring trust is established on this PC.",
                        "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }

                await PollDeviceAsync(device);
            }
            catch (Exception ex)
            {
                if (configApplied && dialog.RememberDevicePassword)
                    _credentials.Save(device.DeviceId, dialog.DevicePassword);

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
            if (!_monitoringIdentities.Has(device.DeviceId))
            {
                var key = await _deviceClient.PairMonitoringIdentityAsync(device, passwordDialog.DevicePassword);
                try { _monitoringIdentities.Save(device.DeviceId, key); }
                finally { CryptographicOperations.ZeroMemory(key); }

                device.IsCandidate = false;
                device.MonitoringTrustState = "Trusted";
                _settings.Save(_devices);
            }

            await _deviceClient.EnterSecureProvisioningAsync(device, passwordDialog.DevicePassword);
            if (passwordDialog.Remember) _credentials.Save(device.DeviceId, passwordDialog.DevicePassword);
            else _credentials.Forget(device.DeviceId);

            MessageBox.Show(this,
                "The monitor accepted the authenticated request and is starting its secure setup network. Windows setup will now connect to it using the same Device Password. The separate monitoring trust key remains unchanged.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);

            using var setup = new WirelessSetupForm(device.DeviceId, passwordDialog.DevicePassword);
            setup.ShowDialog(this);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Could not start secure Wi-Fi setup.\n\n{ex.Message}",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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

        try
        {
            Process.Start(new ProcessStartInfo($"http://{device.Address}:{device.Port}/") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void RemoveSelected()
    {
        var device = SelectedDevice();
        if (device is null) return;

        if (MessageBox.Show(this,
                $"Remove {device.DisplayName} from this PC? The ESP32 itself will not be changed. Any remembered Device Password and the DPAPI-protected Monitoring Identity Key on this PC will also be removed.",
                "Battery Monitor", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            return;

        _credentials.Forget(device.DeviceId);
        _monitoringIdentities.Forget(device.DeviceId);
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
            var offline = device.MonitoringTrustState == "Trusted" && IsOffline(device, now);
            var unreachable = device.MonitoringTrustState == "Trusted" &&
                              device.FailureStartedUtc.HasValue && !offline;

            var lastSeen = device.LastSeenUtc.HasValue ? ToAge(device.LastSeenUtc.Value) : "Never";
            var stateText = device.IdentityFailure
                ? "IDENTITY FAILURE"
                : device.MonitoringTrustState != "Trusted"
                    ? "UNPAIRED"
                    : offline
                        ? "OFFLINE"
                        : unreachable
                            ? $"UNREACHABLE {FormatDuration((int)Math.Max(0, (now - device.FailureStartedUtc!.Value).TotalSeconds))}/{FormatDuration(device.OfflineTimeoutSec)}"
                            : device.State.ToUpperInvariant();

            var rowIndex = _grid.Rows.Add(
                device.DisplayName,
                device.DeviceName,
                device.Voltage.HasValue && device.MonitoringTrustState == "Trusted" && !device.IdentityFailure
                    ? $"{device.Voltage:0.00} V"
                    : "--",
                stateText,
                device.IsCandidate ? "Unpaired candidate" : device.MonitoringTrustState,
                BatteryPresets.FriendlyName(device.BatteryType),
                device.Address,
                lastSeen,
                device.Rssi == 0 ? "--" : $"{device.Rssi} dBm",
                device.DeviceId);

            var row = _grid.Rows[rowIndex];
            row.Tag = device;
            if (device.DeviceId == selectedId) row.Selected = true;
        }

        var trusted = _devices.Count(d => d.MonitoringTrustState == "Trusted" && !d.IdentityFailure);
        var good = _devices.Count(d => d.MonitoringTrustState == "Trusted" && !d.IdentityFailure &&
                                       !d.FailureStartedUtc.HasValue && d.State == "good");
        var alert = _devices.Count(d => d.MonitoringTrustState == "Trusted" && !d.IdentityFailure &&
                                        !d.FailureStartedUtc.HasValue && d.State is "low" or "critical");
        var identityFailures = _devices.Count(d => d.IdentityFailure);
        var unpaired = _devices.Count(d => d.MonitoringTrustState != "Trusted" && !d.IdentityFailure);
        var offlineCount = _devices.Count(d => d.MonitoringTrustState == "Trusted" && !d.IdentityFailure &&
                                               IsOffline(d, now));
        var unreachableCount = _devices.Count(d => d.MonitoringTrustState == "Trusted" && !d.IdentityFailure &&
                                                   d.FailureStartedUtc.HasValue && !IsOffline(d, now));

        _summary.Text =
            $"{_devices.Count} visible | {trusted} trusted | {good} good | {alert} battery alert(s) | {unpaired} unpaired | {identityFailures} identity failure(s) | {unreachableCount} unreachable | {offlineCount} offline";

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
        if (seconds < 3600)
            return seconds % 60 == 0 ? $"{seconds / 60}m" : $"{seconds / 60}m {seconds % 60}s";

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
        AlertSoundPlayer.Stop();
        _tray.Visible = false;
        _tray.Dispose();
    }
}
