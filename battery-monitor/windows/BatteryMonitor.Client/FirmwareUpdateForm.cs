using System.Drawing;

namespace BatteryMonitor.Client;

internal sealed class FirmwareUpdateForm : Form
{
    private readonly EspFlasher _flasher = new();
    private readonly UsbProvisioner _provisioner = new();
    private readonly DeviceClient _deviceClient = new();
    private readonly SettingsStore _settings = new();
    private readonly DeviceCredentialStore _credentials = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly ComboBox _lanDevice = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Label _detected = new() { AutoSize = true };
    private readonly Label _lanDetected = new() { AutoSize = true };
    private readonly Label _bundle = new() { AutoSize = true };
    private readonly TextBox _output = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, WordWrap = false };
    private readonly Button _usbUpdate = new() { Text = "Update over USB", AutoSize = true };
    private readonly Button _lanUpdate = new() { Text = "Update over Wi-Fi", AutoSize = true };
    private readonly Button _detect = new() { Text = "Detect USB Device", AutoSize = true };
    private readonly Button _checkLan = new() { Text = "Check Wi-Fi Device", AutoSize = true };
    private readonly List<Button> _busyButtons = new();
    private readonly List<MonitorEntry> _lanDevices = new();
    private CancellationTokenSource? _operationCts;
    private UsbMonitorStatus? _detectedStatus;
    private DeviceStatus? _lanStatus;

    public FirmwareUpdateForm()
    {
        Text = "Battery Monitor - Firmware Update";
        Icon = AppIcon.Current;
        Width = 790;
        Height = 720;
        MinimumSize = new Size(700, 600);
        StartPosition = FormStartPosition.CenterParent;

        BuildUi();
        RefreshPorts();
        RefreshLanDevices();
        RefreshBundleStatus();
        FormClosing += (_, _) => _operationCts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 1,
            RowCount = 10
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(730, 0),
            Text = "Normal Battery Monitor updates use the signed application image in this package. Wi-Fi OTA is the convenient path once the installed firmware supports it; trusted USB remains the recovery/admin path. Both transports use the same inactive OTA slot, production RSA-PSS signature verification, release floor, 60-second health probation, and automatic rollback."
        }, 0, 0);

        var usbHeader = new Label
        {
            Text = "USB update",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 12, 0, 2)
        };
        root.Controls.Add(usbHeader, 0, 1);

        var usbRow = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        _port.Width = 110;
        var refreshPorts = new Button { Text = "Refresh Ports", AutoSize = true };
        refreshPorts.Click += (_, _) => RefreshPorts();
        _detect.Click += async (_, _) => await DetectAsync();
        _usbUpdate.Click += async (_, _) => await UpdateUsbAsync();
        usbRow.Controls.AddRange([new Label { Text = "Port", AutoSize = true, Margin = new Padding(0, 8, 4, 0) }, _port, refreshPorts, _detect, _usbUpdate]);
        root.Controls.Add(usbRow, 0, 2);
        root.Controls.Add(_detected, 0, 3);

        var lanHeader = new Label
        {
            Text = "Wi-Fi update",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 12, 0, 2)
        };
        root.Controls.Add(lanHeader, 0, 4);

        var lanRow = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        _lanDevice.Width = 290;
        var refreshLan = new Button { Text = "Refresh Saved Devices", AutoSize = true };
        refreshLan.Click += (_, _) => RefreshLanDevices();
        _checkLan.Click += async (_, _) => await CheckLanAsync();
        _lanUpdate.Click += async (_, _) => await UpdateLanAsync();
        lanRow.Controls.AddRange([_lanDevice, refreshLan, _checkLan, _lanUpdate]);
        root.Controls.Add(lanRow, 0, 5);
        root.Controls.Add(_lanDetected, 0, 6);

        var bundleGroup = new GroupBox { Text = "Signed firmware package", AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(10) };
        bundleGroup.Controls.Add(_bundle);
        _bundle.Dock = DockStyle.Fill;
        root.Controls.Add(bundleGroup, 0, 7);

        _output.Dock = DockStyle.Fill;
        _output.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_output, 0, 8);

        var bottom = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        var cancel = new Button { Text = "Cancel Operation", AutoSize = true };
        cancel.Click += (_, _) => _operationCts?.Cancel();
        bottom.Controls.Add(close);
        bottom.Controls.Add(cancel);
        root.Controls.Add(bottom, 0, 9);

        _busyButtons.AddRange([refreshPorts, _detect, _usbUpdate, refreshLan, _checkLan, _lanUpdate]);
    }

    private void RefreshPorts()
    {
        var previous = _port.SelectedItem?.ToString();
        var ports = _flasher.GetSerialPorts().ToArray();
        _port.Items.Clear();
        _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        _detectedStatus = null;
        _detected.Text = ports.Length == 0 ? "No COM ports found." : "Select a port and detect the running Battery Monitor.";
        RefreshUpdateButtons();
    }

    private void RefreshLanDevices()
    {
        var previousId = (_lanDevice.SelectedItem as LanDeviceChoice)?.Device.DeviceId;
        _lanDevices.Clear();
        foreach (var device in _settings.Load()
                     .Where(d => !d.IsCandidate && !string.IsNullOrWhiteSpace(d.DeviceId) && !string.IsNullOrWhiteSpace(d.Address))
                     .OrderBy(d => d.DisplayName, StringComparer.OrdinalIgnoreCase))
        {
            device.NormalizeLocalSettings();
            _lanDevices.Add(device);
        }

        _lanDevice.Items.Clear();
        foreach (var device in _lanDevices) _lanDevice.Items.Add(new LanDeviceChoice(device));
        if (!string.IsNullOrWhiteSpace(previousId))
        {
            for (var i = 0; i < _lanDevice.Items.Count; i++)
            {
                if (_lanDevice.Items[i] is LanDeviceChoice choice &&
                    choice.Device.DeviceId.Equals(previousId, StringComparison.OrdinalIgnoreCase))
                {
                    _lanDevice.SelectedIndex = i;
                    break;
                }
            }
        }
        if (_lanDevice.SelectedIndex < 0 && _lanDevice.Items.Count > 0) _lanDevice.SelectedIndex = 0;
        _lanStatus = null;
        _lanDetected.Text = _lanDevices.Count == 0
            ? "No saved Battery Monitor devices with a known LAN address. Pair/discover a monitor in the main window first."
            : "Select a saved monitor. Check Wi-Fi Device can refresh its currently reported firmware before updating.";
        RefreshUpdateButtons();
    }

    private void RefreshBundleStatus()
    {
        var updateImage = _flasher.UpdateFirmwarePath;
        var signature = _flasher.UpdateSignaturePath;
        var packageVersion = _flasher.UpdateVersion;
        if (!_flasher.IsUpdateReady)
        {
            _bundle.Text = "Signed application-update image/signature are incomplete in this package. Firmware update is disabled.";
        }
        else
        {
            _bundle.Text =
                $"Package version: {packageVersion ?? "unknown"}\r\n" +
                $"Application image: {Path.GetFileName(updateImage)}\r\n" +
                $"Signature: {Path.GetFileName(signature)}\r\n" +
                $"Trust root: RSA-3072-PSS-SHA256 / {FirmwareSignatureVerifier.PublicKeySpkiSha256}";
        }
        RefreshUpdateButtons();
    }

    private async Task DetectAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        await RunOperationAsync(async token =>
        {
            AppendOutput($"Detecting Battery Monitor on {port}...");
            var status = await _provisioner.ReadStatusAsync(port, AppendOutput, token);
            BeginInvoke(new Action(() =>
            {
                _detectedStatus = status;
                _detected.Text = DeviceVersionText(status.DeviceId, status.FirmwareVersion);
                RefreshUpdateButtons();
            }));
        });
    }

    private async Task CheckLanAsync()
    {
        var device = SelectedLanDevice();
        if (device is null) return;
        await RunOperationAsync(async token =>
        {
            AppendOutput($"Checking {device.DisplayName} at {device.Address}...");
            var status = await _deviceClient.GetStatusAsync(device, token);
            BeginInvoke(new Action(() =>
            {
                _lanStatus = status;
                device.FirmwareVersion = status.FirmwareVersion;
                _lanDetected.Text = DeviceVersionText(device.DeviceId, status.FirmwareVersion) + $" | {device.Address}";
                RefreshUpdateButtons();
            }));
        });
    }

    private string DeviceVersionText(string deviceId, string installedVersion)
    {
        var packageVersion = _flasher.UpdateVersion;
        return $"{deviceId} | installed {DisplayVersion(installedVersion)} | package {DisplayVersion(packageVersion)} | {FirmwareVersionInfo.ComparisonLabel(installedVersion, packageVersion)}";
    }

    private async Task UpdateUsbAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        if (_detectedStatus is null)
        {
            MessageBox.Show(this, "Detect the running Battery Monitor on this USB port before updating.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!_flasher.IsUpdateReady)
        {
            MessageBox.Show(this, "The signed application firmware package is incomplete.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var comparison = FirmwareVersionInfo.ComparisonLabel(_detectedStatus.FirmwareVersion, _flasher.UpdateVersion);
        if (!ConfirmUpdate("USB", _detectedStatus.DeviceId, _detectedStatus.FirmwareVersion, comparison)) return;

        await RunOperationAsync(async token =>
        {
            AppendOutput("Starting signed USB OTA. Do not disconnect USB or remove power during transfer.");
            var result = await _flasher.UpdateFirmwareAsync(port, AppendOutput, token);
            if (!result.Success) throw new InvalidOperationException(result.Output);
            BeginInvoke(new Action(() =>
            {
                MessageBox.Show(this,
                    $"Signed firmware {result.Output} was verified by the device and selected for boot. The monitor will reboot and retain its encrypted settings/NVS. The new image remains rollback-armed until its health probation passes.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                _detectedStatus = null;
                _detected.Text = "Device rebooting. Detect again after it returns to verify the installed version.";
                RefreshUpdateButtons();
            }));
        });
    }

    private async Task UpdateLanAsync()
    {
        var device = SelectedLanDevice();
        if (device is null) return;
        if (!_flasher.IsUpdateReady || _flasher.UpdateFirmwarePath is null || _flasher.UpdateSignaturePath is null)
        {
            MessageBox.Show(this, "The signed application firmware package is incomplete.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var installedVersion = _lanStatus?.FirmwareVersion;
        if (string.IsNullOrWhiteSpace(installedVersion)) installedVersion = device.FirmwareVersion;
        var comparison = FirmwareVersionInfo.ComparisonLabel(installedVersion, _flasher.UpdateVersion);
        if (!ConfirmUpdate("Wi-Fi", device.DeviceId, installedVersion, comparison, device.Address)) return;

        var savedPassword = _credentials.Load(device.DeviceId);
        using var passwordDialog = new DevicePasswordPromptForm(device.DisplayName, savedPassword);
        if (passwordDialog.ShowDialog(this) != DialogResult.OK) return;

        var password = passwordDialog.DevicePassword;
        var remember = passwordDialog.Remember;
        await RunOperationAsync(async token =>
        {
            AppendOutput($"Starting signed Wi-Fi OTA to {device.DisplayName} at {device.Address}. Keep device power and LAN connectivity stable during transfer.");
            var version = await _deviceClient.UpdateFirmwareOverLanAsync(
                device,
                password,
                _flasher.UpdateFirmwarePath,
                _flasher.UpdateSignaturePath,
                AppendOutput,
                token);

            if (remember) _credentials.Save(device.DeviceId, password);
            else _credentials.Forget(device.DeviceId);

            BeginInvoke(new Action(() =>
            {
                MessageBox.Show(this,
                    $"Signed firmware {version} was independently verified by the monitor and selected for boot. It is rebooting now; the candidate remains rollback-armed until its health probation passes.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                _lanStatus = null;
                _lanDetected.Text = "Device rebooting. Check Wi-Fi Device after it returns to verify the installed version.";
                RefreshUpdateButtons();
            }));
        });
    }

    private bool ConfirmUpdate(string transport, string deviceId, string? installedVersion, string comparison, string? address = null)
    {
        var target = string.IsNullOrWhiteSpace(address) ? deviceId : $"{deviceId} at {address}";
        var message =
            $"Update {target} over {transport}?\n\n" +
            $"Installed: {DisplayVersion(installedVersion)}\n" +
            $"Package: {_flasher.UpdateVersion ?? "unknown"}\n" +
            $"Status: {comparison}\n\n" +
            "The PC verifies the production signature before transfer. The monitor then independently verifies the hash, RSA-PSS signature, BatteryMonitor application identity, and release sequence before selecting the inactive OTA slot. Interrupted or invalid transfers do not replace the current boot image.";
        return MessageBox.Show(this, message, "Battery Monitor Firmware Update",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
    }

    private void RefreshUpdateButtons()
    {
        var idle = _operationCts is null;
        _usbUpdate.Enabled = idle && _flasher.IsUpdateReady && _detectedStatus is not null;
        _lanUpdate.Enabled = idle && _flasher.IsUpdateReady && SelectedLanDevice(silent: true) is not null;
        _detect.Enabled = idle && _port.SelectedItem is not null;
        _checkLan.Enabled = idle && SelectedLanDevice(silent: true) is not null;
    }

    private string? SelectedPort()
    {
        var port = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(port)) return port;
        MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private MonitorEntry? SelectedLanDevice(bool silent = false)
    {
        if (_lanDevice.SelectedItem is LanDeviceChoice choice) return choice.Device;
        if (!silent)
            MessageBox.Show(this, "Select a saved Battery Monitor first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private async Task RunOperationAsync(Func<CancellationToken, Task> operation)
    {
        if (_operationCts is not null) return;
        _operationCts = new CancellationTokenSource();
        SetBusy(true);
        try { await operation(_operationCts.Token); }
        catch (OperationCanceledException) { AppendOutput("Operation cancelled."); }
        catch (Exception ex)
        {
            AppendOutput("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _operationCts.Dispose();
            _operationCts = null;
            SetBusy(false);
            RefreshUpdateButtons();
        }
    }

    private void SetBusy(bool busy)
    {
        foreach (var button in _busyButtons) button.Enabled = !busy;
        _port.Enabled = !busy;
        _lanDevice.Enabled = !busy;
    }

    private void AppendOutput(string line)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(AppendOutput), line); return; }
        _output.AppendText($"[{DateTime.Now:T}] {line}{Environment.NewLine}");
        _output.SelectionStart = _output.TextLength;
        _output.ScrollToCaret();
    }

    private static string DisplayVersion(string? version) => string.IsNullOrWhiteSpace(version) ? "unknown" : version;

    private sealed record LanDeviceChoice(MonitorEntry Device)
    {
        public override string ToString() => $"{Device.DisplayName} ({Device.DeviceId}) - {Device.Address}";
    }
}
