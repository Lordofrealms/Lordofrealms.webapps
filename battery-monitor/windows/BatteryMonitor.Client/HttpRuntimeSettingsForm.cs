using System.Globalization;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class HttpRuntimeSettingsForm : Form
{
    private readonly UsbHttpRuntimeSettingsProvisioner _provisioner = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _clients = Number(4, 20, 15, 1);
    private readonly Label _tcpSendBuffer = new() { AutoSize = true, Text = "12,288 B (firmware build setting)" };
    private readonly Label _globalSockets = new() { AutoSize = true, Text = "30 (firmware build ceiling)" };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;

    public HttpRuntimeSettingsForm()
    {
        Text = "Battery Monitor - HTTP Transport Settings";
        Icon = AppIcon.Current;
        Width = 650;
        Height = 480;
        MinimumSize = new Size(610, 440);
        StartPosition = FormStartPosition.CenterParent;

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
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(585, 0),
            Text = "Engineering HTTP transport controls. The maximum HTTP client-session limit is stored on the monitor in encrypted NVS and can be changed live. The pinned ESP-IDF/lwIP stack does not support per-socket TCP send-buffer resizing, so TCP send buffer and global socket ceiling are read-only firmware build settings."
        };
        root.Controls.Add(intro, 0, 0);
        root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = MakeButton("Refresh Ports", (_, _) => RefreshPorts());
        var read = MakeButton("Read Current", async (_, _) => await ReadCurrentAsync());
        portPanel.Controls.AddRange([_port, refresh, read]);
        AddRow(root, 1, "USB serial port", portPanel);

        AddRow(root, 2, "Max HTTP client sessions", _clients);
        AddRow(root, 3, "Global TCP send buffer", _tcpSendBuffer);
        AddRow(root, 4, "Global lwIP max sockets", _globalSockets);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(390, 0),
            Text = "Defaults: 15 HTTP clients, 12,288-byte TCP send buffer, and 30 lwIP sockets. Changing the client-session limit briefly restarts only esp_http_server; the ESP32 does not reboot. TCP buffer/socket-ceiling changes require a firmware rebuild."
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

    private static NumericUpDown Number(decimal min, decimal max, decimal value, decimal increment) => new()
    {
        Minimum = min,
        Maximum = max,
        Value = value,
        Increment = increment,
        ThousandsSeparator = true,
        Width = 135
    };

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

        var clients = decimal.ToInt32(_clients.Value);
        await RunOperationAsync(async token =>
        {
            var settings = await _provisioner.SetAsync(port, clients, AppendLog, token);
            BeginInvoke(new Action(() =>
            {
                ApplyReadback(settings);
                MessageBox.Show(this,
                    "The HTTP client-session limit was saved to encrypted NVS. If the value changed, the native HTTP service was restarted without rebooting the monitor.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
        });
    }

    private void ApplyReadback(UsbHttpRuntimeSettings settings)
    {
        _clients.Value = Math.Clamp(settings.MaxClients, (int)_clients.Minimum, (int)_clients.Maximum);
        _tcpSendBuffer.Text = $"{settings.TcpSendBuffer:N0} B (firmware build setting)";
        _globalSockets.Text = $"{settings.LwipMaxSockets:N0} (firmware build ceiling)";
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
        _clients.Enabled = !busy;
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
}

internal sealed class UsbHttpRuntimeSettingsProvisioner
{
    private const int BaudRate = 115200;

    public async Task<UsbHttpRuntimeSettings> ReadAsync(
        string portName,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            return ParseHttpSettings(SendCommand(port, "BATMON1 HTTPSTATUS", log,
                cancellationToken, TimeSpan.FromSeconds(3)));
        }, cancellationToken);
    }

    public async Task<UsbHttpRuntimeSettings> SetAsync(
        string portName,
        int maxClients,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            var command = "BATMON1 SET HTTP " + maxClients.ToString(CultureInfo.InvariantCulture);
            return ParseHttpSettings(SendCommand(port, command, log,
                cancellationToken, TimeSpan.FromSeconds(4)));
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
            last = SendCommand(port, "BATMON1 PING", log, cancellationToken,
                TimeSpan.FromSeconds(2), throwOnTimeout: false);
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

    private static UsbHttpRuntimeSettings ParseHttpSettings(string response)
    {
        if (response == "BATMON1 ERR UNKNOWN_COMMAND")
            throw new InvalidOperationException("This monitor firmware does not support runtime HTTP transport settings yet. Install the new firmware release first.");
        if (response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException("Battery Monitor rejected the HTTP setting: " + response.Substring("BATMON1 ERR ".Length));

        const string prefix = "BATMON1 OK HTTP ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected HTTP settings response: " + response);

        var parts = response.Substring(prefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3 ||
            !int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var clients) ||
            !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var tcpSendBuffer) ||
            !int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out var globalSockets))
            throw new InvalidOperationException("Battery Monitor returned malformed HTTP transport settings.");

        return new UsbHttpRuntimeSettings(clients, tcpSendBuffer, globalSockets);
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Thread.Sleep(50);
        }
    }
}

internal sealed record UsbHttpRuntimeSettings(
    int MaxClients,
    int TcpSendBuffer,
    int LwipMaxSockets);
