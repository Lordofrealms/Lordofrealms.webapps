using System.Globalization;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class WifiRadioSettingsForm : Form
{
    private readonly UsbRadioProvisioner _provisioner = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly CheckBox _sleepEnabled = new()
    {
        Text = "Enable Wi-Fi modem sleep",
        AutoSize = true
    };
    private readonly ComboBox _txPower = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Label _actual = new() { AutoSize = true };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;

    public WifiRadioSettingsForm()
    {
        Text = "Battery Monitor - Wi-Fi Radio Settings";
        Icon = AppIcon.Current;
        Width = 610;
        Height = 500;
        MinimumSize = new Size(570, 450);
        StartPosition = FormStartPosition.CenterParent;

        foreach (var choice in PowerChoices()) _txPower.Items.Add(choice);
        SelectTxPower(80); // preferred/default 20 dBm

        BuildUi();
        RefreshPorts();
        FormClosing += (_, _) => _operationCts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            RowCount = 8
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(550, 0),
            Text = "Service-level Wi-Fi radio controls. Settings are stored on the monitor in encrypted NVS and applied immediately. The production defaults are modem sleep OFF and requested TX power 20 dBm. Actual RF output can still be limited by the ESP32, regulatory domain, board/antenna, or access point conditions."
        };
        root.Controls.Add(intro, 0, 0);
        root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh Ports", (_, _) => RefreshPorts());
        var read = MakeButton("Read Current", async (_, _) => await ReadCurrentAsync());
        portPanel.Controls.AddRange([_port, refresh, read]);
        AddRow(root, 1, "USB serial port", portPanel);

        AddRow(root, 2, "Power save", _sleepEnabled);
        _txPower.Width = 180;
        AddRow(root, 3, "Requested TX power", _txPower);
        AddRow(root, 4, "Applied TX power", _actual);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(390, 0),
            Text = "Disabling modem sleep favors responsiveness/reliability at the cost of higher idle power. TX power is represented internally in 0.25 dBm units; only supported ESP32 power steps are offered here."
        };
        root.Controls.Add(note, 1, 5);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        actions.Controls.Add(MakeButton("Save to Device", async (_, _) => await SaveAsync()));
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        actions.Controls.Add(close);
        root.Controls.Add(actions, 0, 6);
        root.SetColumnSpan(actions, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 7);
        root.SetColumnSpan(_log, 2);

        for (var i = 0; i < 7; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
    }

    private Button MakeButton(string text, EventHandler handler)
    {
        var button = new Button { Text = text, AutoSize = true };
        button.Click += handler;
        _operationButtons.Add(button);
        return button;
    }

    private async Task ReadCurrentAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        await RunOperationAsync(async token =>
        {
            var settings = await _provisioner.ReadAsync(port, AppendLog, token);
            BeginInvoke(new Action(() => ApplyReadback(settings)));
        });
    }

    private async Task SaveAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        if (_txPower.SelectedItem is not PowerChoice power)
        {
            MessageBox.Show(this, "Select a TX power level first.", "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        await RunOperationAsync(async token =>
        {
            var settings = await _provisioner.SetAsync(port, _sleepEnabled.Checked, power.QuarterDbm, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                ApplyReadback(settings);
                MessageBox.Show(this,
                    "Wi-Fi radio settings were saved to encrypted NVS and applied. No firmware rebuild or reboot is required.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
        });
    }

    private void ApplyReadback(UsbWifiRadioSettings settings)
    {
        _sleepEnabled.Checked = settings.SleepEnabled;
        SelectTxPower(settings.RequestedTxQuarterDbm);
        if (settings.ActualTxQuarterDbm == UsbWifiRadioSettings.RadioInactive)
        {
            _actual.Text = "Radio inactive; requested value will apply when Wi-Fi starts.";
        }
        else
        {
            var actual = FormatDbm(settings.ActualTxQuarterDbm);
            var requested = FormatDbm(settings.RequestedTxQuarterDbm);
            _actual.Text = settings.ActualTxQuarterDbm == settings.RequestedTxQuarterDbm
                ? $"{actual} dBm"
                : $"{actual} dBm (requested {requested} dBm)";
        }
    }

    private void SelectTxPower(int quarterDbm)
    {
        for (var i = 0; i < _txPower.Items.Count; i++)
        {
            if (_txPower.Items[i] is PowerChoice choice && choice.QuarterDbm == quarterDbm)
            {
                _txPower.SelectedIndex = i;
                return;
            }
        }
        if (_txPower.Items.Count > 0 && _txPower.SelectedIndex < 0) _txPower.SelectedIndex = 0;
    }

    private void RefreshPorts()
    {
        var previous = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear();
        _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
    }

    private async Task RunOperationAsync(Func<CancellationToken, Task> operation)
    {
        SetBusy(true);
        _operationCts = new CancellationTokenSource();
        try { await operation(_operationCts.Token); }
        catch (OperationCanceledException) { AppendLog("Operation cancelled."); }
        catch (Exception ex)
        {
            AppendLog("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _operationCts.Dispose();
            _operationCts = null;
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        foreach (var button in _operationButtons) button.Enabled = !busy;
        _port.Enabled = !busy;
        _sleepEnabled.Enabled = !busy;
        _txPower.Enabled = !busy;
    }

    private string? SelectedPort()
    {
        var port = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(port)) return port;
        MessageBox.Show(this, "Select a COM port first.", "Battery Monitor",
            MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label
        {
            Text = label,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(3, 9, 3, 3)
        }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private static int PortNumber(string p) =>
        p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n)
            ? n : int.MaxValue;

    private static string FormatDbm(int quarterDbm) => (quarterDbm / 4.0).ToString("0.##", CultureInfo.InvariantCulture);

    private static IEnumerable<PowerChoice> PowerChoices()
    {
        yield return new("21 dBm", 84);
        yield return new("20.5 dBm", 82);
        yield return new("20 dBm (default)", 80);
        yield return new("19.5 dBm", 78);
        yield return new("19 dBm", 76);
        yield return new("18.5 dBm", 74);
        yield return new("17 dBm", 68);
        yield return new("15 dBm", 60);
        yield return new("13 dBm", 52);
        yield return new("11 dBm", 44);
        yield return new("8.5 dBm", 34);
        yield return new("7 dBm", 28);
        yield return new("5 dBm", 20);
        yield return new("2 dBm", 8);
        yield return new("-1 dBm", -4);
    }

    private sealed record PowerChoice(string Text, int QuarterDbm)
    {
        public override string ToString() => Text;
    }
}

internal sealed class UsbRadioProvisioner
{
    private const int BaudRate = 115200;
    private static readonly HashSet<int> SupportedTxQuarterDbm =
        [-4, 8, 20, 28, 34, 44, 52, 60, 68, 74, 76, 78, 80, 82, 84];

    public async Task<UsbWifiRadioSettings> ReadAsync(
        string portName,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            return ParseRadio(SendCommand(port, "BATMON1 RADIOSTATUS", log, cancellationToken, TimeSpan.FromSeconds(3)));
        }, cancellationToken);
    }

    public async Task<UsbWifiRadioSettings> SetAsync(
        string portName,
        bool sleepEnabled,
        int txPowerQuarterDbm,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        if (!SupportedTxQuarterDbm.Contains(txPowerQuarterDbm))
            throw new ArgumentOutOfRangeException(nameof(txPowerQuarterDbm), "Unsupported ESP32 TX power step.");

        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            var reply = SendCommand(port,
                $"BATMON1 SET RADIO {(sleepEnabled ? 1 : 0)} {txPowerQuarterDbm.ToString(CultureInfo.InvariantCulture)}",
                log, cancellationToken, TimeSpan.FromSeconds(3));
            return ParseRadio(reply);
        }, cancellationToken);
    }

    private static SerialPort OpenPort(string portName)
    {
        var port = new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 250,
            WriteTimeout = 5000,
            DtrEnable = false,
            RtsEnable = false,
            Handshake = Handshake.None
        };
        port.Open();
        return port;
    }

    private static void WaitForFirmwareAfterOpen(SerialPort port, Action<string>? log, CancellationToken cancellationToken)
    {
        log?.Invoke($"Opened {port.PortName}; waiting for ESP32 firmware...");
        SleepWithCancellation(TimeSpan.FromMilliseconds(1800), cancellationToken);
        try { port.DiscardInBuffer(); } catch { }
        try { port.DiscardOutBuffer(); } catch { }
    }

    private static void EnsureBatteryMonitor(SerialPort port, Action<string>? log, CancellationToken cancellationToken)
    {
        string? last = null;
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            last = SendCommand(port, "BATMON1 PING", log, cancellationToken, TimeSpan.FromSeconds(2), throwOnTimeout: false);
            if (last.StartsWith("BATMON1 OK PONG ", StringComparison.Ordinal)) return;
            SleepWithCancellation(TimeSpan.FromMilliseconds(350), cancellationToken);
        }
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(last)
            ? "The selected COM port did not respond as a Battery Monitor."
            : $"The selected COM port returned an unexpected response: {last}");
    }

    private static string SendCommand(
        SerialPort port,
        string command,
        Action<string>? log,
        CancellationToken cancellationToken,
        TimeSpan timeout,
        bool throwOnTimeout = true)
    {
        cancellationToken.ThrowIfCancellationRequested();
        log?.Invoke($"> {command}");
        port.Write(command + "\n");
        return ReadProtocolResponse(port, log, cancellationToken, timeout, throwOnTimeout);
    }

    private static string ReadProtocolResponse(
        SerialPort port,
        Action<string>? log,
        CancellationToken cancellationToken,
        TimeSpan timeout,
        bool throwOnTimeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var line = port.ReadLine().Trim();
                if (line.Length == 0) continue;
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal))
                {
                    log?.Invoke("  " + line);
                    continue;
                }
                log?.Invoke("< " + line);
                return line;
            }
            catch (TimeoutException) { }
        }

        if (throwOnTimeout)
            throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
        return "";
    }

    private static UsbWifiRadioSettings ParseRadio(string response)
    {
        if (response == "BATMON1 ERR UNKNOWN_COMMAND")
            throw new InvalidOperationException("This monitor firmware does not support configurable Wi-Fi radio settings yet. Install the new firmware release first.");
        if (response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException("Battery Monitor rejected the radio setting: " + response.Substring("BATMON1 ERR ".Length));

        const string prefix = "BATMON1 OK RADIO ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected Wi-Fi radio response: " + response);

        var parts = response.Substring(prefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3 || (parts[0] != "0" && parts[0] != "1") ||
            !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var requested) ||
            !int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out var actual))
            throw new InvalidOperationException("Battery Monitor returned malformed Wi-Fi radio settings.");

        return new UsbWifiRadioSettings
        {
            SleepEnabled = parts[0] == "1",
            RequestedTxQuarterDbm = requested,
            ActualTxQuarterDbm = actual
        };
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Thread.Sleep(25);
        }
    }
}

internal sealed class UsbWifiRadioSettings
{
    public const int RadioInactive = -999;
    public bool SleepEnabled { get; set; }
    public int RequestedTxQuarterDbm { get; set; } = 80;
    public int ActualTxQuarterDbm { get; set; } = RadioInactive;
}
