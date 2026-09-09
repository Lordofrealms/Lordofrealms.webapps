using System.Globalization;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class HardwareIdentityForm : Form
{
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _model = Field();
    private readonly TextBox _modelId = Field();
    private readonly TextBox _revision = Field();
    private readonly TextBox _cores = Field();
    private readonly TextBox _cpu = Field();
    private readonly TextBox _flash = Field();
    private readonly TextBox _psram = Field();
    private readonly TextBox _features = Field();
    private readonly TextBox _idf = Field();
    private readonly TextBox _arduino = Field();
    private readonly Label _assessment = new() { AutoSize = true, MaximumSize = new Size(500, 0) };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly List<Button> _operationButtons = new();
    private CancellationTokenSource? _operationCts;

    public HardwareIdentityForm()
    {
        Text = "Battery Monitor - Hardware Identity";
        Icon = AppIcon.Current;
        Width = 650;
        Height = 660;
        MinimumSize = new Size(610, 600);
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
            RowCount = 15
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(585, 0),
            Text = "Reads hardware identity directly from the connected monitor over trusted USB. These values come from the running ESP32 silicon/runtime APIs, not from the Amazon board listing or a configured board name."
        };
        root.Controls.Add(intro, 0, 0);
        root.SetColumnSpan(intro, 2);

        var portPanel = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        _port.Width = 120;
        portPanel.Controls.AddRange([
            _port,
            MakeButton("Refresh Ports", (_, _) => RefreshPorts()),
            MakeButton("Read Hardware", async (_, _) => await ReadHardwareAsync())
        ]);
        AddRow(root, 1, "USB serial port", portPanel);
        AddRow(root, 2, "Chip package / model", _model);
        AddRow(root, 3, "ESP-IDF model ID", _modelId);
        AddRow(root, 4, "Silicon revision", _revision);
        AddRow(root, 5, "CPU cores", _cores);
        AddRow(root, 6, "CPU clock", _cpu);
        AddRow(root, 7, "Detected flash", _flash);
        AddRow(root, 8, "Detected PSRAM", _psram);
        AddRow(root, 9, "Chip feature flags", _features);
        AddRow(root, 10, "ESP-IDF runtime", _idf);
        AddRow(root, 11, "Arduino-ESP32 core", _arduino);

        root.Controls.Add(_assessment, 1, 12);

        var close = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        root.Controls.Add(close, 0, 13);
        root.SetColumnSpan(close, 2);

        _log.Dock = DockStyle.Fill;
        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 14);
        root.SetColumnSpan(_log, 2);

        for (var i = 0; i < 14; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
    }

    private static TextBox Field() => new()
    {
        ReadOnly = true,
        BorderStyle = BorderStyle.FixedSingle,
        Dock = DockStyle.Fill
    };

    private Button MakeButton(string text, EventHandler handler)
    {
        var button = new Button { Text = text, AutoSize = true };
        button.Click += handler;
        _operationButtons.Add(button);
        return button;
    }

    private async Task ReadHardwareAsync()
    {
        var port = SelectedPort();
        if (port is null) return;

        await RunOperationAsync(async token =>
        {
            var info = await UsbHardwareIdentityProvisioner.ReadAsync(port, AppendLog, token);
            BeginInvoke(new Action(() => Apply(info)));
        });
    }

    private void Apply(HardwareIdentity info)
    {
        _model.Text = info.Model;
        _modelId.Text = info.ModelId.ToString(CultureInfo.InvariantCulture);
        _revision.Text = FormatRevision(info.Revision);
        _cores.Text = info.Cores == 2 ? "2 (dual-core)" : info.Cores.ToString(CultureInfo.InvariantCulture);
        _cpu.Text = $"{info.CpuMHz:N0} MHz";
        _flash.Text = FormatBytes(info.FlashBytes);
        _psram.Text = info.PsramBytes == 0 ? "None detected" : FormatBytes(info.PsramBytes);
        _features.Text = info.Features;
        _idf.Text = info.IdfVersion;
        _arduino.Text = info.ArduinoVersion;

        if (info.Cores == 2)
        {
            _assessment.Text = "Core-count check: PASS — this unit reports two physical CPU cores.";
        }
        else
        {
            _assessment.Text = $"Core-count check: WARNING — this unit reports {info.Cores} core(s), not the two-core ESP32 hardware expected by this Battery Monitor build.";
        }
    }

    private static string FormatRevision(int raw)
    {
        var major = raw / 100;
        var minor = raw % 100;
        return $"{major}.{minor:00} (raw {raw})";
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) == 0)
            return $"{bytes / (1024 * 1024):N0} MiB ({bytes:N0} bytes)";
        if (bytes >= 1024 && bytes % 1024 == 0)
            return $"{bytes / 1024:N0} KiB ({bytes:N0} bytes)";
        return $"{bytes:N0} bytes";
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
        foreach (var button in _operationButtons) button.Enabled = false;
        _port.Enabled = false;
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
            foreach (var button in _operationButtons) button.Enabled = true;
            _port.Enabled = true;
        }
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
            Margin = new Padding(3, 7, 3, 3)
        }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }

    private static int PortNumber(string p) =>
        p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n)
            ? n : int.MaxValue;
}

internal static class UsbHardwareIdentityProvisioner
{
    private const int BaudRate = 115200;

    public static async Task<HardwareIdentity> ReadAsync(
        string portName,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
            {
                NewLine = "\n",
                ReadTimeout = 250,
                WriteTimeout = 5000,
                DtrEnable = false,
                RtsEnable = false,
                Handshake = Handshake.None
            };
            port.Open();
            log?.Invoke($"Opened {port.PortName}; waiting for ESP32 firmware...");
            SleepWithCancellation(TimeSpan.FromMilliseconds(1800), cancellationToken);
            try { port.DiscardInBuffer(); } catch { }
            try { port.DiscardOutBuffer(); } catch { }

            var ping = SendCommand(port, "BATMON1 PING", log, cancellationToken, TimeSpan.FromSeconds(3));
            if (!ping.StartsWith("BATMON1 OK PONG ", StringComparison.Ordinal))
                throw new InvalidOperationException("The selected COM port did not identify as a Battery Monitor.");

            var response = SendCommand(port, "BATMON1 HWINFO", log, cancellationToken, TimeSpan.FromSeconds(3));
            return Parse(response);
        }, cancellationToken);
    }

    private static HardwareIdentity Parse(string response)
    {
        if (response == "BATMON1 ERR UNKNOWN_COMMAND")
            throw new InvalidOperationException("This monitor firmware does not support Hardware Identity yet. Install the new firmware release first.");
        if (response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException("Battery Monitor rejected the hardware identity request: " + response.Substring("BATMON1 ERR ".Length));

        const string prefix = "BATMON1 OK HWINFO ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected hardware identity response: " + response);

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var token in response.Substring(prefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var split = token.IndexOf('=');
            if (split <= 0 || split == token.Length - 1) continue;
            values[token[..split]] = token[(split + 1)..];
        }

        string Required(string key) => values.TryGetValue(key, out var value)
            ? value : throw new InvalidOperationException($"Hardware identity response is missing '{key}'.");
        int IntValue(string key) => int.TryParse(Required(key), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value : throw new InvalidOperationException($"Hardware identity value '{key}' is malformed.");
        long LongValue(string key) => long.TryParse(Required(key), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value : throw new InvalidOperationException($"Hardware identity value '{key}' is malformed.");

        return new HardwareIdentity(
            Required("model"),
            IntValue("modelId"),
            IntValue("revision"),
            IntValue("cores"),
            LongValue("flashBytes"),
            LongValue("psramBytes"),
            IntValue("cpuMHz"),
            Required("features"),
            Required("idf"),
            Required("arduino"));
    }

    private static string SendCommand(
        SerialPort port,
        string command,
        Action<string>? log,
        CancellationToken cancellationToken,
        TimeSpan timeout)
    {
        cancellationToken.ThrowIfCancellationRequested();
        log?.Invoke($"> {command}");
        port.Write(command + "\n");

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
        throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
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

internal sealed record HardwareIdentity(
    string Model,
    int ModelId,
    int Revision,
    int Cores,
    long FlashBytes,
    long PsramBytes,
    int CpuMHz,
    string Features,
    string IdfVersion,
    string ArduinoVersion);
