using System.Diagnostics;
using System.Net.Sockets;
using System.Security;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

internal sealed class WirelessProvisioningService
{
    private const string Protocol = "BATMONPROV1";
    private readonly string _baseDirectory = AppContext.BaseDirectory;

    public string? HelperPath
    {
        get
        {
            var exact = Path.Combine(_baseDirectory, "tools", "esp-provisioner", "BatteryMonitorEspProv.exe");
            if (File.Exists(exact)) return exact;
            var dir = Path.Combine(_baseDirectory, "tools", "esp-provisioner");
            return Directory.Exists(dir)
                ? Directory.EnumerateFiles(dir, "BatteryMonitorEspProv.exe", SearchOption.AllDirectories).FirstOrDefault()
                : null;
        }
    }

    public bool IsReady => HelperPath is not null;

    public async Task ProvisionAsync(
        string deviceId,
        string setupCode,
        string homeSsid,
        string homePassword,
        Action<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        deviceId = NormalizeDeviceId(deviceId);
        var canonicalCode = ProvisioningCode.Normalize(setupCode);
        if (canonicalCode.Length != 16) throw new ArgumentException("Enter a valid 16-character setup code.", nameof(setupCode));
        if (string.IsNullOrWhiteSpace(homeSsid) || Encoding.UTF8.GetByteCount(homeSsid) > 32)
            throw new ArgumentException("Home Wi-Fi SSID is required and must fit the Wi-Fi SSID limit.", nameof(homeSsid));
        if ((homePassword ?? string.Empty).Length > 63)
            throw new ArgumentException("Home Wi-Fi password is too long.", nameof(homePassword));
        if (HelperPath is null)
            throw new InvalidOperationException("The installed Battery Monitor package is missing the secure provisioning helper.");

        var setupSsid = "BatteryMonitor-" + deviceId[3..];
        var setupKey = ProvisioningCode.DeriveSoftApPassword(deviceId, canonicalCode);

        progress?.Invoke($"Connecting Windows to {setupSsid}...");
        await InstallAndConnectTemporaryProfileAsync(setupSsid, setupKey, cancellationToken);

        try
        {
            progress?.Invoke("Waiting for the Battery Monitor provisioning service...");
            await WaitForProvisioningServiceAsync(cancellationToken);

            await RunHelperAsync(
                new HelperRequest
                {
                    Protocol = Protocol,
                    Username = "batmon",
                    SetupCode = canonicalCode,
                    HomeSsid = homeSsid,
                    HomePassword = homePassword ?? string.Empty,
                    ServiceName = "192.168.4.1:80"
                },
                progress,
                cancellationToken);
        }
        finally
        {
            // The temporary setup AP credential is derived from the printed
            // setup code. Remove the Windows WLAN profile as soon as the secure
            // provisioning attempt finishes so it is not retained unnecessarily.
            try { await DeleteProfileAsync(setupSsid, CancellationToken.None); } catch { }
        }
    }

    private async Task RunHelperAsync(HelperRequest request, Action<string>? progress, CancellationToken cancellationToken)
    {
        var helper = HelperPath ?? throw new InvalidOperationException("Secure provisioning helper was not found.");
        var psi = new ProcessStartInfo
        {
            FileName = helper,
            WorkingDirectory = Path.GetDirectoryName(helper) ?? _baseDirectory,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        // There are deliberately NO secret command-line arguments. The setup
        // code and home Wi-Fi credentials travel only through redirected stdin.
        using var process = new Process { StartInfo = psi };
        if (!process.Start()) throw new InvalidOperationException("Could not start the secure provisioning helper.");

        var requestJson = JsonSerializer.Serialize(request, HelperJsonContext.Default.HelperRequest);
        await process.StandardInput.WriteLineAsync(requestJson.AsMemory(), cancellationToken);
        process.StandardInput.Close();

        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        HelperMessage? final = null;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await process.StandardOutput.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line)) continue;

            HelperMessage? message = null;
            try { message = JsonSerializer.Deserialize(line, HelperJsonContext.Default.HelperMessage); }
            catch { }
            if (message?.Protocol != Protocol) continue;

            if (message.Kind == "stage" && !string.IsNullOrWhiteSpace(message.Message))
                progress?.Invoke(message.Message);
            else if (message.Kind == "result")
                final = message;
        }

        try { await process.WaitForExitAsync(cancellationToken); }
        catch (OperationCanceledException)
        {
            try { if (!process.HasExited) process.Kill(true); } catch { }
            throw;
        }

        var stderr = await stderrTask;
        if (final?.Ok == true && process.ExitCode == 0) return;

        // Do not surface arbitrary helper stderr because third-party runtime
        // diagnostics are outside our redaction contract. The structured helper
        // result is specifically designed not to contain supplied credentials.
        if (final is not null && !string.IsNullOrWhiteSpace(final.Message))
            throw new InvalidOperationException(final.Message);
        if (!string.IsNullOrWhiteSpace(stderr))
            throw new InvalidOperationException("The secure provisioning helper failed before it could return a structured result.");
        throw new InvalidOperationException("Secure wireless provisioning failed.");
    }

    private static async Task InstallAndConnectTemporaryProfileAsync(string ssid, string passphrase, CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"BatteryMonitor-{Guid.NewGuid():N}.xml");
        try
        {
            var escapedSsid = SecurityElement.Escape(ssid) ?? ssid;
            var escapedKey = SecurityElement.Escape(passphrase) ?? passphrase;
            var xml = $"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>{escapedSsid}</name>
  <SSIDConfig><SSID><name>{escapedSsid}</name></SSID><nonBroadcast>false</nonBroadcast></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{escapedKey}</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>
""";
            await File.WriteAllTextAsync(tempPath, xml, new UTF8Encoding(false), cancellationToken);
            await RunNetshAsync(new[] { "wlan", "add", "profile", $"filename={tempPath}", "user=current" }, cancellationToken);
        }
        finally
        {
            try { File.Delete(tempPath); } catch { }
        }

        await RunNetshAsync(new[] { "wlan", "connect", $"name={ssid}", $"ssid={ssid}" }, cancellationToken);
    }

    private static async Task DeleteProfileAsync(string ssid, CancellationToken cancellationToken)
    {
        try { await RunNetshAsync(new[] { "wlan", "delete", "profile", $"name={ssid}" }, cancellationToken, throwOnFailure: false); }
        catch { }
    }

    private static async Task RunNetshAsync(IReadOnlyList<string> arguments, CancellationToken cancellationToken, bool throwOnFailure = true)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "netsh.exe",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var argument in arguments) psi.ArgumentList.Add(argument);
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start Windows Wi-Fi configuration utility.");
        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var output = await outputTask;
        var error = await errorTask;
        if (throwOnFailure && process.ExitCode != 0)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? (string.IsNullOrWhiteSpace(output) ? "Windows could not configure the temporary setup Wi-Fi network." : output.Trim()) : error.Trim());
    }

    private static async Task WaitForProvisioningServiceAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(25);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                using var tcp = new TcpClient();
                await tcp.ConnectAsync("192.168.4.1", 80, cancellationToken);
                return;
            }
            catch when (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(500, cancellationToken);
            }
        }
        throw new TimeoutException("Windows connected to the setup network command, but the ESP32 provisioning service did not become reachable at 192.168.4.1.");
    }

    public static string NormalizeDeviceId(string input)
    {
        var value = (input ?? string.Empty).Trim().ToUpperInvariant();
        if (!value.StartsWith("BM-", StringComparison.Ordinal) || value.Length != 9 ||
            value.AsSpan(3).IndexOfAnyExcept("0123456789ABCDEF") >= 0)
            throw new ArgumentException("Device ID must look like BM-A1B2C3.", nameof(input));
        return value;
    }

    internal sealed class HelperRequest
    {
        public string Protocol { get; set; } = Protocol;
        public string Username { get; set; } = "batmon";
        public string SetupCode { get; set; } = "";
        public string HomeSsid { get; set; } = "";
        public string HomePassword { get; set; } = "";
        public string ServiceName { get; set; } = "192.168.4.1:80";
    }

    internal sealed class HelperMessage
    {
        public string Protocol { get; set; } = "";
        public string Kind { get; set; } = "";
        public bool? Ok { get; set; }
        public string Message { get; set; } = "";
    }
}

[System.Text.Json.Serialization.JsonSerializable(typeof(WirelessProvisioningService.HelperRequest))]
[System.Text.Json.Serialization.JsonSerializable(typeof(WirelessProvisioningService.HelperMessage))]
internal partial class HelperJsonContext : System.Text.Json.Serialization.JsonSerializerContext
{
}
