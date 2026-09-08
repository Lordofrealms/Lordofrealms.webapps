using Microsoft.Win32;
using System.Diagnostics;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

internal sealed class EspFlasher
{
    private readonly string _baseDirectory = AppContext.BaseDirectory;

    public string? EsptoolPath => FindFirstExisting(
        Path.Combine(_baseDirectory, "tools", "esptool", "esptool.exe"),
        Directory.Exists(Path.Combine(_baseDirectory, "tools", "esptool"))
            ? Directory.EnumerateFiles(Path.Combine(_baseDirectory, "tools", "esptool"), "esptool.exe", SearchOption.AllDirectories).FirstOrDefault()
            : null);

    public string? FactoryFirmwarePath => FindFirstExisting(
        Path.Combine(_baseDirectory, "firmware", "BatteryMonitor.ino.merged.bin"),
        Directory.Exists(Path.Combine(_baseDirectory, "firmware"))
            ? Directory.EnumerateFiles(Path.Combine(_baseDirectory, "firmware"), "*.merged.bin", SearchOption.AllDirectories).FirstOrDefault()
            : null);

    public string? UpdateFirmwarePath => FindFirstExisting(
        Path.Combine(_baseDirectory, "firmware", "BatteryMonitor.ino.bin"),
        Directory.Exists(Path.Combine(_baseDirectory, "firmware"))
            ? Directory.EnumerateFiles(Path.Combine(_baseDirectory, "firmware"), "*.ino.bin", SearchOption.AllDirectories).FirstOrDefault(path => !path.EndsWith(".merged.bin", StringComparison.OrdinalIgnoreCase))
            : null);

    public string? ReleaseMetadataPath => FindFirstExisting(
        Path.Combine(_baseDirectory, "firmware", "RELEASE.txt"),
        Path.Combine(_baseDirectory, "Firmware", "RELEASE.txt"));

    public string? UpdateVersion => ReadReleaseValue("version");
    public string? UpdateSourceSha => ReadReleaseValue("source_sha");

    public string? FactorySignaturePath => FactoryFirmwarePath is { } firmware
        ? FindFirstExisting(firmware + ".sig")
        : null;

    public string? UpdateSignaturePath => UpdateFirmwarePath is { } firmware
        ? FindFirstExisting(firmware + ".sig")
        : null;

    // Release-mode Flash Encryption disables ROM-download encryption operations
    // after first boot. Plaintext application updates therefore go through the
    // running Battery Monitor's signed USB OTA writer, not esptool @ 0x10000.
    public bool DirectApplicationUpdateSupported => false;
    public bool ApplicationMediatedUpdateSupported => true;
    public string DirectApplicationUpdateDisabledReason =>
        "Direct USB/ROM firmware update is disabled because Battery Monitor uses release-mode Flash Encryption. Normal updates are transferred over USB to the running application, which verifies the production signature and writes the inactive encrypted OTA partition.";

    // Backward-compatible alias used by older UI code while the updater/factory
    // split is being completed.
    public string? FirmwarePath => FactoryFirmwarePath;

    public bool IsFactoryReady => EsptoolPath is not null && FactoryFirmwarePath is not null && FactorySignaturePath is not null;
    public bool IsUpdateReady => UpdateFirmwarePath is not null && UpdateSignaturePath is not null;
    public bool IsReady => IsFactoryReady;

    public IReadOnlyList<string> GetSerialPorts()
    {
        var ports = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM", false);
            if (key is not null)
            {
                foreach (var name in key.GetValueNames())
                {
                    if (key.GetValue(name) is string port && port.StartsWith("COM", StringComparison.OrdinalIgnoreCase))
                        ports.Add(port);
                }
            }
        }
        catch { }

        return ports.OrderBy(ParsePortNumber).ThenBy(p => p, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public async Task<(bool Success, string Output)> ProbeEsp32Async(string port, CancellationToken cancellationToken = default)
    {
        if (EsptoolPath is null) return (false, "Bundled esptool.exe was not found.");
        return await RunEsptoolAsync(new[] { "--chip", "esp32", "--port", port, "chip-id" }, null, TimeSpan.FromSeconds(10), cancellationToken);
    }

    public async Task<(bool Success, string Output)> UpdateFirmwareAsync(
        string port,
        Action<string>? output,
        CancellationToken cancellationToken = default)
    {
        if (UpdateFirmwarePath is null) return (false, "Bundled Battery Monitor application firmware image was not found.");
        if (UpdateSignaturePath is null) return (false, "Bundled Battery Monitor application firmware signature was not found. Updating was blocked.");
        if (!VerifyFirmware(UpdateFirmwarePath, UpdateSignaturePath, output, out var verificationError))
            return (false, verificationError);

        try
        {
            output?.Invoke("Production signature passed Windows verification; handing the same signed image to the running Battery Monitor for on-device verification and encrypted OTA write...");
            var updater = new UsbProvisioner();
            var imageVersion = await updater.UpdateFirmwareAsync(port, UpdateFirmwarePath, UpdateSignaturePath, output, cancellationToken);
            return (true, imageVersion);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) when (ex is FirmwareSignatureException or CryptographicException or IOException or UnauthorizedAccessException or InvalidOperationException or TimeoutException)
        {
            var message = "Firmware update failed: " + ex.Message;
            output?.Invoke(message);
            return (false, message);
        }
    }

    public async Task<(bool Success, string Output)> FactoryFlashAsync(
        string port,
        Action<string>? output,
        CancellationToken cancellationToken = default)
    {
        if (EsptoolPath is null) return (false, "Bundled esptool.exe was not found.");
        if (FactoryFirmwarePath is null) return (false, "Bundled Battery Monitor merged first-install firmware image was not found.");
        if (FactorySignaturePath is null) return (false, "Bundled Battery Monitor first-install firmware signature was not found. Flashing was blocked.");
        if (!VerifyFirmware(FactoryFirmwarePath, FactorySignaturePath, output, out var verificationError))
            return (false, verificationError);

        // This plaintext merged image is for blank/un-encrypted ESP32 devices.
        // After first boot enables release-mode Flash Encryption, esptool's own
        // encrypted-flash protection will reject a plaintext overwrite. We do
        // not pass --force and must never bypass that safety check.
        return await RunEsptoolAsync(
            new[]
            {
                "--chip", "esp32",
                "--port", port,
                "--baud", "460800",
                "--before", "default-reset",
                "--after", "hard-reset",
                "write-flash",
                "0x0", FactoryFirmwarePath
            },
            output,
            TimeSpan.FromMinutes(3),
            cancellationToken);
    }

    // Older callers are intentionally mapped to first-install factory flash.
    // Signature enforcement still applies because FactoryFlashAsync owns the
    // actual operation.
    public Task<(bool Success, string Output)> FlashAsync(string port, Action<string>? output, CancellationToken cancellationToken = default) =>
        FactoryFlashAsync(port, output, cancellationToken);

    private string? ReadReleaseValue(string key)
    {
        try
        {
            var path = ReleaseMetadataPath;
            if (path is null) return null;
            foreach (var rawLine in File.ReadLines(path))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith('#')) continue;
                var separator = line.IndexOf('=');
                if (separator <= 0) continue;
                if (!line[..separator].Trim().Equals(key, StringComparison.OrdinalIgnoreCase)) continue;
                var value = line[(separator + 1)..].Trim();
                return value.Length == 0 ? null : value;
            }
        }
        catch { }
        return null;
    }

    private static bool VerifyFirmware(string firmwarePath, string signaturePath, Action<string>? output, out string error)
    {
        try
        {
            output?.Invoke($"Verifying firmware signature ({FirmwareSignatureVerifier.Algorithm})...");
            FirmwareSignatureVerifier.VerifyOrThrow(firmwarePath, signaturePath);
            output?.Invoke($"Firmware signature verified. Trust key: {FirmwareSignatureVerifier.PublicKeySpkiSha256}");
            error = string.Empty;
            return true;
        }
        catch (Exception ex) when (ex is FirmwareSignatureException or CryptographicException or IOException or UnauthorizedAccessException)
        {
            error = "Firmware signature verification failed: " + ex.Message;
            output?.Invoke(error);
            return false;
        }
    }

    private async Task<(bool Success, string Output)> RunEsptoolAsync(
        IReadOnlyList<string> arguments,
        Action<string>? output,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        var tool = EsptoolPath ?? throw new InvalidOperationException("esptool.exe was not found.");
        var psi = new ProcessStartInfo
        {
            FileName = tool,
            WorkingDirectory = Path.GetDirectoryName(tool) ?? _baseDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var argument in arguments) psi.ArgumentList.Add(argument);

        using var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var lines = new List<string>();
        void Record(string? line)
        {
            if (string.IsNullOrWhiteSpace(line)) return;
            lock (lines) lines.Add(line);
            output?.Invoke(line);
        }

        process.OutputDataReceived += (_, e) => Record(e.Data);
        process.ErrorDataReceived += (_, e) => Record(e.Data);

        try
        {
            if (!process.Start()) return (false, "Could not start esptool.exe.");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(timeout);
            try { await process.WaitForExitAsync(timeoutCts.Token); }
            catch (OperationCanceledException)
            {
                try { if (!process.HasExited) process.Kill(true); } catch { }
                var timedOut = !cancellationToken.IsCancellationRequested;
                Record(timedOut ? "Timed out waiting for esptool." : "Operation cancelled.");
                return (false, string.Join(Environment.NewLine, lines));
            }

            process.WaitForExit();
            return (process.ExitCode == 0, string.Join(Environment.NewLine, lines));
        }
        catch (Exception ex)
        {
            Record(ex.Message);
            return (false, string.Join(Environment.NewLine, lines));
        }
    }

    private static string? FindFirstExisting(params string?[] candidates) =>
        candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path));

    private static int ParsePortNumber(string port) =>
        port.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(port.AsSpan(3), out var n) ? n : int.MaxValue;
}
