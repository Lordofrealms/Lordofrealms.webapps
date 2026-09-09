using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class SerialConsoleForm : Form
{
    private const int BaudRate = 115200;
    private const int MaxCommandLength = 767;

    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly Button _connect = new() { Text = "Connect", AutoSize = true };
    private readonly TextBox _command = new();
    private readonly Button _send = new() { Text = "Send", AutoSize = true, Enabled = false };
    private readonly Label _status = new() { Text = "Disconnected", AutoSize = true };
    private readonly TextBox _log = new()
    {
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        WordWrap = false,
        Dock = DockStyle.Fill
    };
    private readonly List<string> _history = new();
    private readonly SemaphoreSlim _writeGate = new(1, 1);

    private SerialPort? _serial;
    private CancellationTokenSource? _readerCts;
    private CancellationTokenSource? _connectionCts;
    private Task? _readerTask;
    private int _historyIndex;
    private bool _connecting;

    public SerialConsoleForm()
    {
        Text = "Battery Monitor - Serial Console";
        Icon = AppIcon.Current;
        Width = 820;
        Height = 620;
        MinimumSize = new Size(700, 500);
        StartPosition = FormStartPosition.CenterParent;

        BuildUi();
        RefreshPorts();
        FormClosing += (_, _) =>
        {
            _connectionCts?.Cancel();
            DisconnectPort();
        };
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 1,
            RowCount = 6
        };
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
            MaximumSize = new Size(760, 0),
            Text = "Trusted-USB engineering console for line-oriented BATMON1 commands and live serial output. The console owns the selected COM port while connected, so other Battery Monitor USB tools cannot use that port at the same time. Firmware-transfer commands are intentionally blocked here; use the signed firmware updater for OTA/raw-binary transfers. Console text is not redacted, so avoid credential/key commands in logs you plan to copy or save."
        }, 0, 0);

        var connection = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        var refresh = new Button { Text = "Refresh Ports", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        _connect.Click += async (_, _) =>
        {
            if (_serial is null) await ConnectAsync();
            else DisconnectPort();
        };
        connection.Controls.AddRange([new Label { Text = "USB serial port", AutoSize = true, Margin = new Padding(0, 8, 8, 0) }, _port, refresh, _connect, _status]);
        root.Controls.Add(connection, 0, 1);

        var quick = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        var ping = QuickButton("Ping", "BATMON1 PING");
        var wifi = QuickButton("Wi-Fi Diagnostics", "BATMON1 WIFIINFO");
        var hardware = QuickButton("Hardware Info", "BATMON1 HWINFO");
        quick.Controls.AddRange([ping, wifi, hardware]);
        root.Controls.Add(quick, 0, 2);

        var commandPanel = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        commandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        commandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        _command.Dock = DockStyle.Fill;
        _command.PlaceholderText = "BATMON1 ...";
        _command.Enabled = false;
        _command.KeyDown += CommandKeyDown;
        _send.Click += async (_, _) => await SendCurrentAsync();
        commandPanel.Controls.Add(_command, 0, 0);
        commandPanel.Controls.Add(_send, 1, 0);
        root.Controls.Add(commandPanel, 0, 3);

        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 4);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        var clear = new Button { Text = "Clear", AutoSize = true };
        clear.Click += (_, _) => _log.Clear();
        var copy = new Button { Text = "Copy All", AutoSize = true };
        copy.Click += (_, _) =>
        {
            if (_log.TextLength > 0) Clipboard.SetText(_log.Text);
        };
        var save = new Button { Text = "Save Log...", AutoSize = true };
        save.Click += (_, _) => SaveLog();
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        actions.Controls.AddRange([clear, copy, save, close]);
        root.Controls.Add(actions, 0, 5);
    }

    private Button QuickButton(string text, string command)
    {
        var button = new Button { Text = text, AutoSize = true, Enabled = false, Tag = "quick" };
        button.Click += async (_, _) => await SendCommandAsync(command);
        return button;
    }

    private async Task ConnectAsync()
    {
        if (_connecting || _serial is not null) return;
        var portName = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(portName))
        {
            MessageBox.Show(this, "Select a COM port first.", "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _connecting = true;
        SetConnectionUi(false, $"Opening {portName}...");
        _connectionCts = new CancellationTokenSource();
        var token = _connectionCts.Token;
        SerialPort? port = null;
        try
        {
            port = CreatePort(portName);
            await Task.Run(() =>
            {
                port.Open();
                AppendLog($"Opened {port.PortName}; waiting for ESP32 firmware...");
                SleepWithCancellation(TimeSpan.FromMilliseconds(1800), token);
                try { port.DiscardInBuffer(); } catch { }
                try { port.DiscardOutBuffer(); } catch { }

                AppendLog("> BATMON1 PING");
                port.Write("BATMON1 PING\n");
                var response = ReadHandshakeResponse(port, token, TimeSpan.FromSeconds(3));
                if (!response.StartsWith("BATMON1 OK PONG ", StringComparison.Ordinal))
                    throw new InvalidOperationException("The selected COM port did not identify as a Battery Monitor.");
            }, token);

            _serial = port;
            port = null;
            StartReader();
            SetConnectionUi(true, $"Connected: {_serial.PortName} @ {BaudRate:N0}");
            _command.Focus();
        }
        catch (OperationCanceledException)
        {
            AppendLog("Connection cancelled.");
            port?.Dispose();
            SetConnectionUi(false, "Disconnected");
        }
        catch (Exception ex)
        {
            port?.Dispose();
            AppendLog("ERROR: " + ex.Message);
            SetConnectionUi(false, "Disconnected");
            MessageBox.Show(this, ex.Message, "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _connectionCts.Dispose();
            _connectionCts = null;
            _connecting = false;
            if (_serial is null) _connect.Enabled = true;
        }
    }

    private void StartReader()
    {
        var port = _serial ?? throw new InvalidOperationException("Serial port is not open.");
        _readerCts = new CancellationTokenSource();
        var token = _readerCts.Token;
        _readerTask = Task.Run(() => ReaderLoop(port, token), token);
    }

    private void ReaderLoop(SerialPort port, CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested && port.IsOpen)
            {
                try
                {
                    var line = port.ReadLine().TrimEnd('\r', '\n');
                    if (line.Length == 0) continue;
                    AppendLog(line.StartsWith("BATMON1 ", StringComparison.Ordinal) ? "< " + line : "  " + line);
                }
                catch (TimeoutException) { }
            }
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or UnauthorizedAccessException)
        {
            if (!token.IsCancellationRequested) AppendLog("Serial reader stopped: " + ex.Message);
        }
        finally
        {
            if (!IsDisposed && IsHandleCreated)
            {
                try
                {
                    BeginInvoke(new Action(() =>
                    {
                        if (ReferenceEquals(_serial, port))
                        {
                            try { port.Dispose(); } catch { }
                            _serial = null;
                            SetConnectionUi(false, "Disconnected");
                        }
                    }));
                }
                catch { }
            }
        }
    }

    private void DisconnectPort()
    {
        _connectionCts?.Cancel();
        _readerCts?.Cancel();
        var port = _serial;
        _serial = null;
        if (port is not null)
        {
            AppendLog($"Closing {port.PortName}.");
            try { port.Close(); } catch { }
            try { port.Dispose(); } catch { }
        }
        _readerCts?.Dispose();
        _readerCts = null;
        _readerTask = null;
        SetConnectionUi(false, "Disconnected");
    }

    private async Task SendCurrentAsync()
    {
        var command = _command.Text.Trim();
        if (command.Length == 0) return;
        await SendCommandAsync(command);
        if (_history.Count == 0 || !string.Equals(_history[^1], command, StringComparison.Ordinal))
            _history.Add(command);
        _historyIndex = _history.Count;
        _command.Clear();
    }

    private async Task SendCommandAsync(string command)
    {
        var port = _serial;
        if (port is null || !port.IsOpen)
        {
            AppendLog("Not connected.");
            return;
        }

        command = command.Trim();
        if (command.Length == 0) return;
        if (command.Contains('\r') || command.Contains('\n'))
        {
            MessageBox.Show(this, "Send one line at a time.", "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (command.Length > MaxCommandLength)
        {
            MessageBox.Show(this, $"Commands are limited to {MaxCommandLength} characters.", "Battery Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (IsFirmwareTransferCommand(command))
        {
            AppendLog("BLOCKED: firmware-transfer commands are disabled in Serial Console; use the signed firmware updater.");
            MessageBox.Show(this,
                "Firmware-transfer commands are intentionally blocked in Serial Console because they switch the device into a raw-binary receive mode. Close this console and use the signed firmware updater instead.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        await _writeGate.WaitAsync();
        try
        {
            if (!ReferenceEquals(port, _serial) || !port.IsOpen) return;
            AppendLog("> " + command);
            await Task.Run(() => port.Write(command + "\n"));
        }
        catch (Exception ex)
        {
            AppendLog("ERROR writing command: " + ex.Message);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    private static bool IsFirmwareTransferCommand(string command)
    {
        var normalized = command.TrimStart().ToUpperInvariant();
        return normalized.StartsWith("BATMON1 FWBEGIN", StringComparison.Ordinal) ||
               normalized.StartsWith("BATMON1 FWCHUNK", StringComparison.Ordinal) ||
               normalized.StartsWith("BATMON1 FWEND", StringComparison.Ordinal) ||
               normalized.StartsWith("BATMON1 FWABORT", StringComparison.Ordinal);
    }

    private void CommandKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.SuppressKeyPress = true;
            _ = SendCurrentAsync();
            return;
        }
        if (e.KeyCode == Keys.Up)
        {
            e.SuppressKeyPress = true;
            if (_history.Count == 0) return;
            _historyIndex = Math.Max(0, _historyIndex - 1);
            _command.Text = _history[_historyIndex];
            _command.SelectionStart = _command.TextLength;
            return;
        }
        if (e.KeyCode == Keys.Down)
        {
            e.SuppressKeyPress = true;
            if (_history.Count == 0) return;
            _historyIndex = Math.Min(_history.Count, _historyIndex + 1);
            _command.Text = _historyIndex < _history.Count ? _history[_historyIndex] : "";
            _command.SelectionStart = _command.TextLength;
        }
    }

    private string ReadHandshakeResponse(SerialPort port, CancellationToken token, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                var line = port.ReadLine().Trim();
                if (line.Length == 0) continue;
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal))
                {
                    AppendLog("  " + line);
                    continue;
                }
                AppendLog("< " + line);
                return line;
            }
            catch (TimeoutException) { }
        }
        throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
    }

    private static SerialPort CreatePort(string portName)
    {
        return new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 250,
            WriteTimeout = 5000,
            DtrEnable = false,
            RtsEnable = false,
            Handshake = Handshake.None
        };
    }

    private void RefreshPorts()
    {
        if (_serial is not null) return;
        var previous = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear();
        _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
    }

    private void SetConnectionUi(bool connected, string status)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action<bool, string>(SetConnectionUi), connected, status);
            return;
        }
        _status.Text = status;
        _connect.Text = connected ? "Disconnect" : "Connect";
        _connect.Enabled = !_connecting || connected;
        _port.Enabled = !connected && !_connecting;
        _command.Enabled = connected;
        _send.Enabled = connected;
        foreach (Control control in ((TableLayoutPanel)Controls[0]).Controls)
        {
            if (control is FlowLayoutPanel panel)
            {
                foreach (Control child in panel.Controls)
                    if (child is Button button && Equals(button.Tag, "quick")) button.Enabled = connected;
            }
        }
    }

    private void SaveLog()
    {
        using var dialog = new SaveFileDialog
        {
            Title = "Save Battery Monitor Serial Log",
            Filter = "Text files (*.txt)|*.txt|All files (*.*)|*.*",
            FileName = $"Battery-Monitor-Serial-{DateTime.Now:yyyyMMdd-HHmmss}.txt"
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
            File.WriteAllText(dialog.FileName, _log.Text);
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired)
        {
            try { BeginInvoke(new Action<string>(AppendLog), text); } catch { }
            return;
        }
        _log.AppendText($"[{DateTime.Now:HH:mm:ss.fff}] {text}{Environment.NewLine}");
        _log.SelectionStart = _log.TextLength;
        _log.ScrollToCaret();
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken token)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline)
        {
            token.ThrowIfCancellationRequested();
            Thread.Sleep(50);
        }
    }

    private static int PortNumber(string p) =>
        p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n)
            ? n : int.MaxValue;
}
