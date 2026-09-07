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
            return ParseStatus(SendCommand(port, "BATMON1 STATUS", log, cancellationToken, TimeSpan.FromSeconds(3)));
        }, cancellationToken);
    }

    public async Task<UsbProvisioningIdentity> ReadProvisioningIdentityAsync(string portName, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            return ParseProvisioningIdentity(SendCommand(port, "BATMON1 PROVSTATUS", log, cancellationToken, TimeSpan.FromSeconds(3)));
        }, cancellationToken);
    }

    public async Task SetProvisioningCredentialAsync(string portName, string username, string setupCode, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            ExpectOk(port, $"BATMON1 SET PROVCRED {Encode(username)} {Encode(setupCode)}", "PROVCRED", log, cancellationToken);
        }, cancellationToken);
    }

    public async Task<bool> VerifyProvisioningCredentialAsync(string portName, string setupCode, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            var reply = SendCommand(port, $"BATMON1 VERIFYPROVCRED {Encode(setupCode)}", log, cancellationToken, TimeSpan.FromSeconds(3));
            if (reply == "BATMON1 OK PROVCRED MATCH") return true;
            if (reply == "BATMON1 OK PROVCRED NO_MATCH") return false;
            if (reply.StartsWith("BATMON1 ERR PROVCRED_VERIFY_COOLDOWN ", StringComparison.Ordinal))
            {
                var seconds = reply.Substring("BATMON1 ERR PROVCRED_VERIFY_COOLDOWN ".Length);
                throw new InvalidOperationException($"Setup-code verification is temporarily rate limited. Try again in about {seconds} second(s).");
            }
            if (reply == "BATMON1 ERR PROVCRED_UNSET")
                throw new InvalidOperationException("This device does not have a provisioning setup code yet.");
            throw new InvalidOperationException($"Unexpected verification response: {reply}");
        }, cancellationToken);
    }

    public async Task ClearProvisioningCredentialAsync(string portName, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            ExpectOk(port, "BATMON1 CLEARPROVCRED", "CLEARPROVCRED", log, cancellationToken);
        }, cancellationToken);
    }

    public async Task ConfigureAsync(string portName, UsbProvisioningSettings settings, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmwareAfterOpen(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);

            ExpectOk(port, $"BATMON1 SET NAME {Encode(settings.DeviceName)}", "NAME", log, cancellationToken);
            ExpectOk(port,
                $"BATMON1 SET BATTERY {settings.BatteryType} {settings.LowVoltage.ToString("0.000", CultureInfo.InvariantCulture)} {settings.CriticalVoltage.ToString("0.000", CultureInfo.InvariantCulture)}",
                "BATTERY", log, cancellationToken);
            ExpectOk(port, $"BATMON1 SET SAMPLE {settings.SampleIntervalSec}", "SAMPLE", log, cancellationToken);
            ExpectOk(port,
                $"BATMON1 SET CAL {settings.CalibrationFactor.ToString("0.000000", CultureInfo.InvariantCulture)} {settings.CalibrationOffset.ToString("0.0000", CultureInfo.InvariantCulture)}",
                "CAL", log, cancellationToken);

            // Wi-Fi credentials are intentionally write-only. Do not replace a
            // working password unless the user explicitly selected Update Wi-Fi.
            if (settings.UpdateWifi)
            {
                if (string.IsNullOrWhiteSpace(settings.WifiSsid))
                    throw new InvalidOperationException("Wi-Fi SSID is required when Update Wi-Fi is enabled.");
                ExpectOk(port, $"BATMON1 SET WIFI {Encode(settings.WifiSsid)} {Encode(settings.WifiPassword)}", "WIFI", log, cancellationToken);
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
        try { await ReadStatusAsync(portName, null, cancellationToken); return true; }
        catch { return false; }
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
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(last)
            ? "The selected COM port did not respond as a Battery Monitor."
            : $"The selected COM port returned an unexpected response: {last}");
    }

    private static void ExpectOk(SerialPort port, string command, string expectedOperation, Action<string>? log, CancellationToken cancellationToken)
    {
        var reply = SendCommand(port, command, log, cancellationToken, TimeSpan.FromSeconds(3));
        if (reply.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException(reply.Substring("BATMON1 ERR ".Length));
        if (!reply.StartsWith($"BATMON1 OK {expectedOperation}", StringComparison.Ordinal))
            throw new InvalidOperationException($"Unexpected ESP32 response: {reply}");
    }

    private static string SendCommand(SerialPort port, string command, Action<string>? log, CancellationToken cancellationToken, TimeSpan timeout, bool throwOnTimeout = true)
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
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal)) { log?.Invoke($"  {line}"); continue; }
                log?.Invoke($"< {line}");
                return line;
            }
            catch (TimeoutException) { }
        }

        if (throwOnTimeout) throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
        return "";
    }

    private static UsbMonitorStatus ParseStatus(string response)
    {
        const string prefix = "BATMON1 OK STATUS ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidOperationException($"Unexpected status response: {response}");
        var parts = response.Substring(prefix.Length).Split(' ', StringSplitOptions.None);
        if (parts.Length < 8) throw new InvalidOperationException("Battery Monitor returned an incomplete USB status response.");
        return new UsbMonitorStatus
        {
            DeviceId = parts[0], DeviceName = Decode(parts[1]), BatteryType = parts[2],
            LowVoltage = ParseDouble(parts[3]), CriticalVoltage = ParseDouble(parts[4]),
            SampleIntervalSec = int.TryParse(parts[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out var sample) ? sample : 10,
            WifiSsid = Decode(parts[6]), Voltage = ParseDouble(parts[7]),
            CalibrationFactor = parts.Length >= 9 ? ParseDouble(parts[8]) : 1.0,
            CalibrationOffset = parts.Length >= 10 ? ParseDouble(parts[9]) : 0.0
        };
    }

    private static UsbProvisioningIdentity ParseProvisioningIdentity(string response)
    {
        const string prefix = "BATMON1 OK PROVSTATUS ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidOperationException($"Unexpected provisioning-status response: {response}");
        var value = response.Substring(prefix.Length);
        if (value == "UNSET") return new UsbProvisioningIdentity { IsConfigured = false };
        var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 3 || parts[0] != "READY") throw new InvalidOperationException("Battery Monitor returned an invalid provisioning identity response.");
        return new UsbProvisioningIdentity
        {
            IsConfigured = true,
            Username = Decode(parts[1]),
            SetupSsid = parts[2],
            Security = parts.Length >= 4 ? parts[3] : "SEC2"
        };
    }

    private static double ParseDouble(string value) => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ? result : 0;
    private static string Encode(string value) => Uri.EscapeDataString(value ?? string.Empty);
    private static string Decode(string value) => Uri.UnescapeDataString(value ?? string.Empty);

    private static string Redact(string command)
    {
        const string wifiPrefix = "BATMON1 SET WIFI ";
        if (command.StartsWith(wifiPrefix, StringComparison.Ordinal))
        {
            var tail = command.Substring(wifiPrefix.Length);
            var firstSpace = tail.IndexOf(' ');
            return firstSpace < 0 ? wifiPrefix + tail : wifiPrefix + tail.Substring(0, firstSpace) + " <password-redacted>";
        }
        const string provPrefix = "BATMON1 SET PROVCRED ";
        if (command.StartsWith(provPrefix, StringComparison.Ordinal))
        {
            var tail = command.Substring(provPrefix.Length);
            var firstSpace = tail.IndexOf(' ');
            return firstSpace < 0 ? provPrefix + "<redacted>" : provPrefix + tail.Substring(0, firstSpace) + " <setup-code-redacted>";
        }
        if (command.StartsWith("BATMON1 VERIFYPROVCRED ", StringComparison.Ordinal)) return "BATMON1 VERIFYPROVCRED <setup-code-redacted>";
        return command;
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline) { cancellationToken.ThrowIfCancellationRequested(); Thread.Sleep(25); }
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
    public double CalibrationFactor { get; set; } = 1.0;
    public double CalibrationOffset { get; set; }
}

internal sealed class UsbProvisioningIdentity
{
    public bool IsConfigured { get; set; }
    public string Username { get; set; } = "";
    public string SetupSsid { get; set; } = "";
    public string Security { get; set; } = "";
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
