using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class HttpDiagnosticsForm : Form
{
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false };
    private readonly Button _sourceOnce = new() { Text = "Run Source Timing Once", AutoSize = true };
    private readonly Button _startTrace = new() { Text = "Start Live HTTP Trace", AutoSize = true };
    private readonly Button _stopTrace = new() { Text = "Stop Trace", AutoSize = true, Enabled = false };
    private readonly Button _refreshPorts = new() { Text = "Refresh Ports", AutoSize = true };
    private HttpDiagnosticsSession? _session;
    private CancellationTokenSource? _operationCts;

    public HttpDiagnosticsForm()
    {
        Text = "Battery Monitor - HTTP Diagnostics";
        Icon = AppIcon.Current;
        Width = 920;
        Height = 650;
        MinimumSize = new Size(760, 520);
        StartPosition = FormStartPosition.CenterParent;

        BuildUi();
        RefreshPorts();
        FormClosing += OnClosing;
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 1,
            RowCount = 5
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(860, 0),
            Text = "Engineering diagnostics for Battery Monitor HTTP responsiveness. Source Timing deliberately bypasses RAM caches once and times the underlying NVS, Wi-Fi and ADC reads. Live HTTP Trace keeps USB open while you reproduce a slow/partial website load and records source refresh, cache-copy, JSON-build and socket-send timings. Trace is volatile and turns off on reboot."
        });

        var portRow = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        portRow.Controls.Add(new Label { Text = "USB serial port", AutoSize = true, Margin = new Padding(0, 9, 8, 0) });
        _port.Width = 120;
        portRow.Controls.Add(_port);
        portRow.Controls.Add(_refreshPorts);
        root.Controls.Add(portRow);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        actions.Controls.AddRange([_sourceOnce, _startTrace, _stopTrace]);
        var clear = new Button { Text = "Clear Log", AutoSize = true };
        clear.Click += (_, _) => _log.Clear();
        var copy = new Button { Text = "Copy Log", AutoSize = true };
        copy.Click += (_, _) => { if (_log.TextLength > 0) Clipboard.SetText(_log.Text); };
        actions.Controls.Add(clear);
        actions.Controls.Add(copy);
        root.Controls.Add(actions);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log);

        var footer = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        footer.Controls.Add(close);
        root.Controls.Add(footer);

        _refreshPorts.Click += (_, _) => RefreshPorts();
        _sourceOnce.Click += async (_, _) => await RunSourceTimingOnceAsync();
        _startTrace.Click += async (_, _) => await StartTraceAsync();
        _stopTrace.Click += async (_, _) => await StopTraceAsync();
    }

    private void RefreshPorts()
    {
        if (_session is not null) return;
        var previous = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear();
        _port.Items.AddRange(ports);
        if (previous is not null && _port.Items.Contains(previous)) _port.SelectedItem = previous;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        AppendLog(ports.Length == 0 ? "No COM ports found." : $"Found {ports.Length} COM port(s).");
    }

    private async Task RunSourceTimingOnceAsync()
    {
        var port = SelectedPort();
        if (port is null) return;

        try
        {
            SetOperationBusy(true);
            if (_session is not null)
            {
                AppendLog("> BATMON1 HTTPTRACE SOURCES");
                _session.Send("BATMON1 HTTPTRACE SOURCES");
                return;
            }

            _operationCts = new CancellationTokenSource();
            var response = await HttpDiagnosticsSession.RunOneShotAsync(port, "BATMON1 HTTPTRACE SOURCES", AppendLog, _operationCts.Token);
            AppendLog("SOURCE RESULT: " + response);
        }
        catch (OperationCanceledException) { AppendLog("Source timing cancelled."); }
        catch (Exception ex)
        {
            AppendLog("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _operationCts?.Dispose();
            _operationCts = null;
            SetOperationBusy(false);
        }
    }

    private async Task StartTraceAsync()
    {
        if (_session is not null) return;
        var port = SelectedPort();
        if (port is null) return;

        try
        {
            SetOperationBusy(true);
            _session = await HttpDiagnosticsSession.OpenAsync(port, AppendLog, CancellationToken.None);
            _session.StartReader(AppendLog);
            _session.Send("BATMON1 HTTPTRACE ON");
            AppendLog("Live HTTP trace requested. Reproduce the website problem now in your browser.");
            SetTraceState(true);
        }
        catch (Exception ex)
        {
            _session?.Dispose();
            _session = null;
            AppendLog("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetTraceState(false);
        }
        finally { SetOperationBusy(false); }
    }

    private async Task StopTraceAsync()
    {
        var session = _session;
        if (session is null) return;
        try
        {
            _stopTrace.Enabled = false;
            session.Send("BATMON1 HTTPTRACE OFF");
            await Task.Delay(250);
        }
        catch (Exception ex) { AppendLog("Trace stop warning: " + ex.Message); }
        finally
        {
            session.Dispose();
            _session = null;
            SetTraceState(false);
            AppendLog("Live HTTP trace stopped.");
        }
    }

    private void SetOperationBusy(bool busy)
    {
        if (_session is null)
        {
            _sourceOnce.Enabled = !busy;
            _startTrace.Enabled = !busy;
            _port.Enabled = !busy;
            _refreshPorts.Enabled = !busy;
        }
    }

    private void SetTraceState(bool active)
    {
        _port.Enabled = !active;
        _refreshPorts.Enabled = !active;
        _startTrace.Enabled = !active;
        _stopTrace.Enabled = active;
        _sourceOnce.Enabled = true;
    }

    private string? SelectedPort()
    {
        var port = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(port)) return port;
        MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
    }

    private async void OnClosing(object? sender, FormClosingEventArgs e)
    {
        _operationCts?.Cancel();
        if (_session is null) return;
        e.Cancel = true;
        await StopTraceAsync();
        FormClosing -= OnClosing;
        Close();
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; }
        _log.AppendText($"[{DateTime.Now:HH:mm:ss.fff}] {text}{Environment.NewLine}");
    }

    private static int PortNumber(string p) =>
        p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n)
            ? n : int.MaxValue;
}

internal sealed class HttpDiagnosticsSession : IDisposable
{
    private readonly SerialPort _port;
    private CancellationTokenSource? _readerCts;
    private Task? _readerTask;

    private HttpDiagnosticsSession(SerialPort port) => _port = port;

    public static async Task<HttpDiagnosticsSession> OpenAsync(string portName, Action<string>? log, CancellationToken cancellationToken)
    {
        var port = OpenPort(portName);
        try
        {
            log?.Invoke($"Opened {portName}; waiting for ESP32 firmware...");
            await Task.Delay(1800, cancellationToken);
            try { port.DiscardInBuffer(); } catch { }
            try { port.DiscardOutBuffer(); } catch { }
            var session = new HttpDiagnosticsSession(port);
            var pong = await session.SendAndReadProtocolAsync("BATMON1 PING", log, cancellationToken, TimeSpan.FromSeconds(3));
            if (!pong.StartsWith("BATMON1 OK PONG ", StringComparison.Ordinal))
                throw new InvalidOperationException("The selected COM port is not a Battery Monitor.");
            return session;
        }
        catch
        {
            port.Dispose();
            throw;
        }
    }

    public static async Task<string> RunOneShotAsync(string portName, string command, Action<string>? log, CancellationToken cancellationToken)
    {
        using var session = await OpenAsync(portName, log, cancellationToken);
        return await session.SendAndReadProtocolAsync(command, log, cancellationToken, TimeSpan.FromSeconds(10));
    }

    public void StartReader(Action<string> log)
    {
        if (_readerTask is not null) return;
        _readerCts = new CancellationTokenSource();
        var token = _readerCts.Token;
        _readerTask = Task.Run(() =>
        {
            while (!token.IsCancellationRequested && _port.IsOpen)
            {
                try
                {
                    var line = _port.ReadLine().TrimEnd('\r', '\n');
                    if (line.Length > 0) log(line);
                }
                catch (TimeoutException) { }
                catch (Exception ex) when (token.IsCancellationRequested || !_port.IsOpen)
                {
                    _ = ex;
                    break;
                }
            }
        }, token);
    }

    public void Send(string command)
    {
        if (!_port.IsOpen) throw new InvalidOperationException("Diagnostic serial port is closed.");
        _port.Write(command + "\n");
    }

    private async Task<string> SendAndReadProtocolAsync(string command, Action<string>? log, CancellationToken cancellationToken, TimeSpan timeout)
    {
        log?.Invoke("> " + command);
        _port.Write(command + "\n");
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var line = _port.ReadLine().Trim();
                if (line.Length == 0) continue;
                log?.Invoke("< " + line);
                if (line.StartsWith("BATMON1 ", StringComparison.Ordinal)) return line;
            }
            catch (TimeoutException) { await Task.Delay(10, cancellationToken); }
        }
        throw new TimeoutException($"Timed out waiting for Battery Monitor response on {_port.PortName}.");
    }

    private static SerialPort OpenPort(string portName)
    {
        var port = new SerialPort(portName, 115200, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 200,
            WriteTimeout = 3000,
            DtrEnable = false,
            RtsEnable = false,
            Handshake = Handshake.None
        };
        port.Open();
        return port;
    }

    public void Dispose()
    {
        try { _readerCts?.Cancel(); } catch { }
        try { _port.Close(); } catch { }
        try { _port.Dispose(); } catch { }
        _readerCts?.Dispose();
    }
}
