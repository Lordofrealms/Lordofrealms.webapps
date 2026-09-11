using Microsoft.Win32;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

// Customer-side signed firmware package/update helper. Blank-device ROM
// flashing and esptool process control are deliberately implemented only by the
// Factory & Service partial class so those manufacturing capabilities are not
// present in BatteryMonitor.Client.exe.
internal sealed partial class EspFlasher
{
    private readonly string _baseDirectory = AppContext.BaseDirectory;

    public string? UpdateFirmwarePath => FindFirstExisting(
        Path.Combine(_baseDirectory, "firmware", "BatteryMonitor.ino.bin"),
        Directory.Exists(Path.Combine(_baseDirectory, "firmware"))
            ? Directory.EnumerateFiles(Path.Combine(_baseDirectory, "firmware"), "*.ino.bin", SearchOption.AllDirectories).FirstOrDefault(path => !path.EndsWith(".merged.bin", StringComparison.OrdinalIgnoreCase))
            : null);

    public string? ReleaseMetadataPath => FindFirstExisting(
        Path.Combine(_baseDirectory, "firmware", "SIGNED_RELEASE.txt"),
        Path.Combine(_baseDirectory, "Firmware", "SIGNED_RELEASE.txt"),
        Path.Combine(_baseDirectory, "firmware", "RELEASE.txt"),
        Path.Combine(_baseDirectory, "Firmware", "RELEASE.txt"));

    public string? UpdateVersion => ReadReleaseValue("version") ?? ReadVersionFile();
    public string? UpdateSourceSha => ReadReleaseValue("source_sha");

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

    public bool IsUpdateReady => UpdateFirmwarePath is not null && UpdateSignaturePath is not null;

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

    private string? ReadVersionFile()
    {
        try
        {
            var path = FindFirstExisting(
                Path.Combine(_baseDirectory, "firmware", "version.txt"),
                Path.Combine(_baseDirectory, "Firmware", "version.txt"));
            if (path is null) return null;
            var value = File.ReadAllText(path).Trim();
            return value.Length == 0 ? null : value;
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

    private static string? FindFirstExisting(params string?[] candidates) =>
        candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path));

    private static int ParsePortNumber(string port) =>
        port.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(port.AsSpan(3), out var n) ? n : int.MaxValue;
}
