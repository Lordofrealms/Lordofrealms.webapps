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

    public string? FactorySignaturePath => FactoryFirmwarePath is { } firmware
        ? FindFirstExisting(firmware + ".sig")
        : null;

    public string? UpdateSignaturePath => UpdateFirmwarePath is { } firmware
        ? FindFirstExisting(firmware + ".sig")
        : null;

    // Backward-compatible alias used by older UI code while the updater/factory
    // split is being completed.
    public string? FirmwarePath => FactoryFirmwarePath;

    public bool IsFactoryReady => EsptoolPath is not null && FactoryFirmwarePath is not null && FactorySignaturePath is not null;
    public bool IsUpdateReady => EsptoolPath is not null && UpdateFirmwarePath is not null && UpdateSignaturePath is not null;
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
        if (EsptoolPath is null) return (false, "Bundled esptool.exe was not found.");
        if (UpdateFirmwarePath is null) return (false, "Bundled Battery Monitor application firmware image was not found.");
        if (UpdateSignaturePath is null) return (false, "Bundled Battery Monitor application firmware signature was not found. Flashing was blocked.");
        if (!VerifyFirmware(UpdateFirmwarePath, UpdateSignaturePath, output, out var verificationError))
            return (false, verificationError);

        // Normal USB firmware update: update only the application partition at
        // the classic ESP32 Arduino default app offset. NVS, provisioning
        // identity, Wi-Fi credentials, calibration, and other settings remain
        // untouched. Signature verification above is mandatory and has no UI
        // bypass in the distributed client.
        return await RunEsptoolAsync(
            new[]
            {
                "--chip", "esp32",
                "--port", port,
                "--baud", "460800",
                "--before", "default-reset",
                "--after", "hard-reset",
                "write-flash",
                "0x10000", UpdateFirmwarePath
            },
            output,
            TimeSpan.FromMinutes(3),
            cancellationToken);
    }

    public async Task<(bool Success, string Output)> FactoryFlashAsync(
        string port,
        Action<string>? output,
        CancellationToken cancellationToken = default)
    {
        if (EsptoolPath is null) return (false, "Bundled esptool.exe was not found.");
        if (FactoryFirmwarePath is null) return (false, "Bundled Battery Monitor merged factory firmware image was not found.");
        if (FactorySignaturePath is null) return (false, "Bundled Battery Monitor factory firmware signature was not found. Flashing was blocked.");
        if (!VerifyFirmware(FactoryFirmwarePath, FactorySignaturePath, output, out var verificationError))
            return (false, verificationError);

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

    // Older callers are intentionally mapped to factory flash until removed.
    // Signature enforcement still applies because FactoryFlashAsync owns the
    // actual operation.
    public Task<(bool Success, string Output)> FlashAsync(string port, Action<string>? output, CancellationToken cancellationToken = default) =>
        FactoryFlashAsync(port, output, cancellationToken);

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
