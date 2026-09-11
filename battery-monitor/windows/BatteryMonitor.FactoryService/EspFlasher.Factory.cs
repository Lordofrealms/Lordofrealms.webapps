using System.Diagnostics;

namespace BatteryMonitor.Client;

// Factory-only partial implementation. This source is compiled into
// BatteryMonitor.FactoryService.exe and is not part of the customer project.
internal sealed partial class EspFlasher
{
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

    public string? FactorySignaturePath => FactoryFirmwarePath is { } firmware
        ? FindFirstExisting(firmware + ".sig")
        : null;

    public bool IsFactoryReady => EsptoolPath is not null && FactoryFirmwarePath is not null && FactorySignaturePath is not null;

    public async Task<(bool Success, string Output)> ProbeEsp32Async(string port, CancellationToken cancellationToken = default)
    {
        if (EsptoolPath is null) return (false, "Bundled esptool.exe was not found.");
        return await RunEsptoolAsync(new[] { "--chip", "esp32", "--port", port, "chip-id" }, null, TimeSpan.FromSeconds(10), cancellationToken);
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

        // This plaintext merged image is exclusively for genuinely blank,
        // unencrypted devices. Never pass --force; after release-mode Flash
        // Encryption activates, ROM-download protection must remain authoritative.
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
}
