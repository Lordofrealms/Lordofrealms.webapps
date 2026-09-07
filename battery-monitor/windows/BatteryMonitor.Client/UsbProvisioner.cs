using System.Globalization;
using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class UsbProvisioner
{
    private const int BaudRate = 115200;

    public async Task<UsbMonitorStatus> ReadStatusAsync(string portName, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            var response = SendCommand(port, "BATMON1 STATUS", log, cancellationToken, TimeSpan.FromSeconds(3));
            return ParseStatus(response);
        }, cancellationToken);
    }

    public async Task ConfigureAsync(
        string portName,
        UsbProvisioningSettings settings,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);

            ExpectOk(port, $"BATMON1 SET NAME {Encode(settings.DeviceName)}", "NAME", log, cancellationToken);
            ExpectOk(
                port,
                $"BATMON1 SET BATTERY {settings.BatteryType} {settings.LowVoltage.ToString("0.000", CultureInfo.InvariantCulture)} {settings.CriticalVoltage.ToString("0.000", CultureInfo.InvariantCulture)}",
                "BATTERY",
                log,
                cancellationToken);
            ExpectOk(port, $"BATMON1 SET SAMPLE {settings.SampleIntervalSec}", "SAMPLE", log, cancellationToken);
            ExpectOk(
                port,
                $"BATMON1 SET CAL {settings.CalibrationFactor.ToString("0.000000", CultureInfo.InvariantCulture)} {settings.CalibrationOffset.ToString("0.0000", CultureInfo.InvariantCulture)}",
                "CAL",
                log,
                cancellationToken);

            // Wi-Fi credentials are never readable back from the ESP32. Only
            // touch Wi-Fi when the user explicitly requested a credentials
            // update, otherwise a blank password could accidentally replace a
            // working secured network with an empty password.
            if (settings.UpdateWifi)
            {
                if (string.IsNullOrWhiteSpace(settings.WifiSsid))
                    throw new InvalidOperationException("Wi-Fi SSID is required when Update Wi-Fi is enabled.");

                ExpectOk(
                    port,
                    $"BATMON1 SET WIFI {Encode(settings.WifiSsid)} {Encode(settings.WifiPassword)}",
                    "WIFI",
                    log,
                    cancellationToken);
            }

            if (settings.RebootAfterConfiguration)
            {
                var reply = SendCommand(port, "BATMON1 REBOOT", log, cancellationToken, TimeSpan.FromSeconds(2));
                if (!reply.StartsWith("BATMON1 OK REBOOTING", StringComparison.Ordinal))
                    throw new InvalidOperationException($"Unexpected reboot response: {reply}");
            }
        }, cancellationToken);
    }

    public async Task<bool> IsBatteryMonitorAsync(string portName, CancellationToken cancellationToken = default)
    {
        try
        {
            await ReadStatusAsync(portName, null, cancellationToken);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static SerialPort OpenPort(string portName)
    {
        var port = new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 250,
            WriteTimeout = 1000,
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
        throw new InvalidOperationException(
            string.IsNullOrWhiteSpace(last)
                ? "The selected COM port did not respond as a Battery Monitor."
                : $"The selected COM port returned an unexpected response: {last}");
    }

    private static void ExpectOk(
        SerialPort port,
        string command,
        string expectedOperation,
        Action<string>? log,
        CancellationToken cancellationToken)
    {
        var reply = SendCommand(port, command, log, cancellationToken, TimeSpan.FromSeconds(3));
        if (reply.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException(reply.Substring("BATMON1 ERR ".Length));
        if (!reply.StartsWith($"BATMON1 OK {expectedOperation}", StringComparison.Ordinal))
            throw new InvalidOperationException($"Unexpected ESP32 response: {reply}");
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
        log?.Invoke($"> {Redact(command)}");
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
                    log?.Invoke($"  {line}");
                    continue;
                }
                log?.Invoke($"< {line}");
                return line;
            }
            catch (TimeoutException)
            {
            }
        }

        if (throwOnTimeout)
            throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
        return "";
    }

    private static UsbMonitorStatus ParseStatus(string response)
    {
        const string prefix = "BATMON1 OK STATUS ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException($"Unexpected status response: {response}");

        var parts = response.Substring(prefix.Length).Split(' ', StringSplitOptions.None);
        if (parts.Length < 8) throw new InvalidOperationException("Battery Monitor returned an incomplete USB status response.");

        return new UsbMonitorStatus
        {
            DeviceId = parts[0],
            DeviceName = Decode(parts[1]),
            BatteryType = parts[2],
            LowVoltage = ParseDouble(parts[3]),
            CriticalVoltage = ParseDouble(parts[4]),
            SampleIntervalSec = int.TryParse(parts[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out var sample) ? sample : 10,
            WifiSsid = Decode(parts[6]),
            Voltage = ParseDouble(parts[7])
        };
    }

    private static double ParseDouble(string value) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ? result : 0;

    private static string Encode(string value) => Uri.EscapeDataString(value ?? string.Empty);
    private static string Decode(string value) => Uri.UnescapeDataString(value ?? string.Empty);

    private static string Redact(string command)
    {
        const string wifiPrefix = "BATMON1 SET WIFI ";
        if (!command.StartsWith(wifiPrefix, StringComparison.Ordinal)) return command;
        var tail = command.Substring(wifiPrefix.Length);
        var firstSpace = tail.IndexOf(' ');
        if (firstSpace < 0) return wifiPrefix + tail;
        return wifiPrefix + tail.Substring(0, firstSpace) + " <password-redacted>";
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

internal sealed class UsbMonitorStatus
{
    public string DeviceId { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string BatteryType { get; set; } = "lead_acid";
    public double LowVoltage { get; set; }
    public double CriticalVoltage { get; set; }
    public int SampleIntervalSec { get; set; }
    public string WifiSsid { get; set; } = "";
    public double Voltage { get; set; }
}

internal sealed class UsbProvisioningSettings
{
    public string DeviceName { get; set; } = "Battery Monitor";
    public bool UpdateWifi { get; set; }
    public string WifiSsid { get; set; } = "";
    public string WifiPassword { get; set; } = "";
    public string BatteryType { get; set; } = "lead_acid";
    public double LowVoltage { get; set; } = 12.20;
    public double CriticalVoltage { get; set; } = 11.90;
    public int SampleIntervalSec { get; set; } = 10;
    public double CalibrationFactor { get; set; } = 1.0;
    public double CalibrationOffset { get; set; } = 0.0;
    public bool RebootAfterConfiguration { get; set; } = true;
}
