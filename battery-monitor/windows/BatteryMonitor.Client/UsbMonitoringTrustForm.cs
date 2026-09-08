using System.Drawing;
using System.IO.Ports;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

// Trusted physical-USB transfer of the stable P0-3 Monitoring Identity Key.
// The clear key exists only in process memory long enough to DPAPI-protect it;
// it is never written to the log, console, command line, or devices.json.
internal sealed class UsbMonitoringTrustForm : Form
{
    private readonly MonitoringIdentityStore _store = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly Button _trust = new() { Text = "Trust This Monitor", AutoSize = true };
    private CancellationTokenSource? _cts;

    public UsbMonitoringTrustForm()
    {
        Text = "Battery Monitor - USB Pair / Trust";
        Width = 620;
        Height = 380;
        MinimumSize = new Size(540, 330);
        StartPosition = FormStartPosition.CenterParent;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 1, RowCount = 4 };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(570, 0),
            Text = "Use a physical USB connection to pair this Windows account with a Battery Monitor. The ESP32's separate 256-bit Monitoring Identity Key is transferred over USB and immediately protected with Windows DPAPI. No Device Password is required for this trusted physical-admin path."
        });

        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false, Margin = new Padding(0, 12, 0, 8) };
        controls.Controls.Add(_port);
        var refresh = new Button { Text = "Refresh Ports", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        _trust.Click += async (_, _) => await TrustAsync();
        controls.Controls.Add(refresh);
        controls.Controls.Add(_trust);
        root.Controls.Add(controls);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log);
        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close);

        RefreshPorts();
        FormClosing += (_, _) => _cts?.Cancel();
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

    private async Task TrustAsync()
    {
        var portName = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(portName))
        {
            MessageBox.Show(this, "Select a COM port first.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _trust.Enabled = false;
        _port.Enabled = false;
        _cts = new CancellationTokenSource();
        try
        {
            var result = await Task.Run(() => ReadIdentity(portName, _cts.Token), _cts.Token);
            try
            {
                _store.Save(result.DeviceId, result.Key);
                AppendLog($"Trusted {result.DeviceId}. Monitoring key stored with Windows DPAPI (key redacted). ");
                MessageBox.Show(this,
                    $"This Windows account now trusts {result.DeviceId}. Future Battery Monitor discovery and voltage/status readings for this unit must pass cryptographic authentication.",
                    "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            finally { CryptographicOperations.ZeroMemory(result.Key); }
        }
        catch (OperationCanceledException) { AppendLog("Operation cancelled."); }
        catch (Exception ex)
        {
            AppendLog("ERROR: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _cts.Dispose();
            _cts = null;
            _trust.Enabled = true;
            _port.Enabled = true;
        }
    }

    private (string DeviceId, byte[] Key) ReadIdentity(string portName, CancellationToken token)
    {
        using var port = new SerialPort(portName, 115200, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 250,
            WriteTimeout = 1000,
            DtrEnable = false,
            RtsEnable = false,
            Handshake = Handshake.None
        };
        port.Open();
        AppendLog($"Opened {portName}; waiting for ESP32 firmware...");
        SleepWithCancellation(TimeSpan.FromMilliseconds(1800), token);
        try { port.DiscardInBuffer(); } catch { }
        try { port.DiscardOutBuffer(); } catch { }

        var ping = SendCommand(port, "BATMON1 PING", token, secretResponse: false);
        const string pingPrefix = "BATMON1 OK PONG ";
        if (!ping.StartsWith(pingPrefix, StringComparison.Ordinal))
            throw new InvalidOperationException("The selected COM port did not identify itself as Battery Monitor firmware.");
        var pingParts = ping.Substring(pingPrefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (pingParts.Length < 1 || !pingParts[0].StartsWith("BM-", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Battery Monitor returned an invalid Device ID.");
        var deviceId = pingParts[0];

        var response = SendCommand(port, "BATMON1 MONITORKEY", token, secretResponse: true);
        const string keyPrefix = "BATMON1 OK MONITORKEY ";
        if (!response.StartsWith(keyPrefix, StringComparison.Ordinal))
            throw new InvalidOperationException(response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal)
                ? response.Substring("BATMON1 ERR ".Length)
                : "Battery Monitor did not return a Monitoring Identity Key.");

        byte[] key;
        try { key = Convert.FromHexString(response.Substring(keyPrefix.Length).Trim()); }
        catch (FormatException) { throw new InvalidOperationException("Battery Monitor returned malformed Monitoring Identity Key data."); }
        if (key.Length != 32)
        {
            CryptographicOperations.ZeroMemory(key);
            throw new InvalidOperationException("Battery Monitor returned a Monitoring Identity Key with an invalid length.");
        }
        return (deviceId, key);
    }

    private string SendCommand(SerialPort port, string command, CancellationToken token, bool secretResponse)
    {
        token.ThrowIfCancellationRequested();
        AppendLog($"> {command}");
        port.Write(command + "\n");
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        while (DateTime.UtcNow < deadline)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                var line = port.ReadLine().Trim();
                if (line.Length == 0) continue;
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal)) { AppendLog("  " + line); continue; }
                AppendLog(secretResponse && line.StartsWith("BATMON1 OK MONITORKEY ", StringComparison.Ordinal)
                    ? "< BATMON1 OK MONITORKEY <redacted>"
                    : "< " + line);
                return line;
            }
            catch (TimeoutException) { }
        }
        throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(AppendLog), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken token)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline) { token.ThrowIfCancellationRequested(); Thread.Sleep(25); }
    }

    private static int PortNumber(string p) => p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n) ? n : int.MaxValue;
}
