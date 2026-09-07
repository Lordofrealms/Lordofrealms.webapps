using Microsoft.Win32;
using System.Diagnostics;

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

    // Backward-compatible alias used by older UI code while the updater/factory
    // split is being completed.
    public string? FirmwarePath => FactoryFirmwarePath;

    public bool IsFactoryReady => EsptoolPath is not null && FactoryFirmwarePath is not null;
    public bool IsUpdateReady => EsptoolPath is not null && UpdateFirmwarePath is not null;
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

        // Normal USB firmware update: update only the application partition at
        // the classic ESP32 Arduino default app offset. NVS, provisioning
        // identity, Wi-Fi credentials, calibration, and other settings remain
        // untouched. CI builds every release with the same pinned board/FQBN;
        // any future partition-layout migration must use factory/recovery flash.
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
    public Task<(bool Success, string Output)> FlashAsync(string port, Action<string>? output, CancellationToken cancellationToken = default) =>
        FactoryFlashAsync(port, output, cancellationToken);

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
