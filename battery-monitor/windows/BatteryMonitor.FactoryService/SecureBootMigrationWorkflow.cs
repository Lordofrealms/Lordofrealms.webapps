using System.Globalization;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

internal sealed class SecureBootMigrationWorkflow
{
    private readonly UsbProvisioner _usb = new();
    private readonly UsbSecurityInfoReader _security = new();
    private readonly UsbSecureBootMigrationProvisioner _migration = new();

    public async Task<PreparedSecureBootMigration> PrepareAsync(
        string portName,
        SecureBootMigrationPackage package,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        package.Verify();
        log?.Invoke("Running pre-migration hardware/security checks...");
        var hardware = await UsbHardwareIdentityProvisioner.ReadAsync(portName, log, cancellationToken);
        var security = await _security.ReadAsync(portName, log, cancellationToken);
        ValidateHardwareAndSecurity(hardware, security, allowAlreadyMigrated: false);

        if (security.ReleaseSequence < package.ReleaseSequence)
        {
            log?.Invoke($"Installing Secure Boot migration application {package.Version} before touching the bootloader...");
            var installedVersion = await _usb.UpdateFirmwareAsync(
                portName,
                package.ApplicationPath,
                package.ApplicationSignaturePath,
                log,
                cancellationToken);
            if (!string.Equals(installedVersion, package.Version, StringComparison.Ordinal))
                throw new InvalidOperationException($"Migration OTA selected unexpected firmware '{installedVersion}' instead of '{package.Version}'.");
            log?.Invoke("Migration application selected for boot. Waiting for reboot, local health probation, and encrypted release-floor commit.");
        }
        else if (security.ReleaseSequence == package.ReleaseSequence &&
                 string.Equals(security.FirmwareVersion, package.Version, StringComparison.Ordinal))
        {
            log?.Invoke("This unit is already running the migration application. Resuming without reinstalling the same release sequence.");
        }
        else
        {
            throw new InvalidOperationException(
                $"Installed firmware {security.FirmwareVersion} (sequence {security.ReleaseSequence}) cannot be migrated with bundle {package.Version} (sequence {package.ReleaseSequence}).");
        }

        var caps = await WaitForMigrationReadinessAsync(portName, package, log, cancellationToken);
        if (!caps.Ready) throw new InvalidOperationException("Secure Boot migration application never became ready: " + caps.Status);

        var postAppSecurity = await _security.ReadAsync(portName, log, cancellationToken);
        if (!postAppSecurity.ProductionFlashEncryptionReady || postAppSecurity.SecureBootEnabled ||
            postAppSecurity.ReleaseSequence != package.ReleaseSequence ||
            !string.Equals(postAppSecurity.FirmwareVersion, package.Version, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Migration application security state is not safe to stage the bootloader: FW={postAppSecurity.FirmwareVersion}, seq={postAppSecurity.ReleaseSequence}, " +
                $"Flash Encryption={postAppSecurity.FlashEncryptionEnabled}/{postAppSecurity.FlashEncryptionMode}, Secure Boot={postAppSecurity.SecureBootEnabled}.");
        }

        log?.Invoke("Migration application passed probation. Staging the signed Secure Boot v2 bootloader; primary bootloader remains untouched during this phase.");
        await _migration.StageBootloaderAsync(
            portName,
            package.BootloaderPath,
            package.BootloaderSignaturePath,
            log,
            cancellationToken);

        return new PreparedSecureBootMigration
        {
            PortName = portName,
            Package = package,
            BootloaderSha256 = package.BootloaderSha256,
            Hardware = hardware,
            PreCommitSecurity = postAppSecurity
        };
    }

    public async Task<UsbSecurityInfo> CommitAndVerifyAsync(
        PreparedSecureBootMigration prepared,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        prepared.Package.Verify();
        log?.Invoke("Rechecking migration capability immediately before irreversible commit...");
        var caps = await _migration.ReadCapabilitiesAsync(prepared.PortName, log, cancellationToken);
        if (!caps.Ready)
            throw new InvalidOperationException("Device is no longer ready to commit Secure Boot migration: " + caps.Status);

        await _migration.CommitAsync(prepared.PortName, prepared.BootloaderSha256, log, cancellationToken);
        log?.Invoke("Waiting for the migrated unit to reboot and report hardware Secure Boot state...");

        var verified = await WaitForPostMigrationSecurityAsync(prepared, log, cancellationToken);
        if (!verified.ProductionFlashEncryptionReady)
            throw new InvalidOperationException("Post-migration verification failed: Flash Encryption is no longer in release mode.");
        if (!verified.SecureBootEnabled)
            throw new InvalidOperationException("Post-migration verification failed: hardware Secure Boot did not report enabled.");
        if (verified.ReleaseSequence != prepared.Package.ReleaseSequence ||
            !string.Equals(verified.FirmwareVersion, prepared.Package.Version, StringComparison.Ordinal))
            throw new InvalidOperationException($"Post-migration firmware mismatch: {verified.FirmwareVersion} sequence {verified.ReleaseSequence}.");

        var hardware = await UsbHardwareIdentityProvisioner.ReadAsync(prepared.PortName, log, cancellationToken);
        if (hardware.Revision < 300)
            throw new InvalidOperationException("Post-migration hardware identity unexpectedly reports pre-ECO3 silicon.");

        log?.Invoke($"SECURE BOOT MIGRATION VERIFIED: {verified.FirmwareVersion}; sequence {verified.ReleaseSequence}; Flash Encryption release mode; Secure Boot enabled.");
        return verified;
    }

    public Task AbortStagedAsync(PreparedSecureBootMigration prepared, Action<string>? log = null, CancellationToken cancellationToken = default) =>
        _migration.AbortAsync(prepared.PortName, log, cancellationToken);

    private async Task<SecureBootMigrationCapabilities> WaitForMigrationReadinessAsync(
        string portName,
        SecureBootMigrationPackage package,
        Action<string>? log,
        CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddMinutes(2);
        string lastStatus = "waiting for migration application";
        var nextLog = DateTime.MinValue;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var security = await _security.ReadAsync(portName, null, cancellationToken);
                if (security.SecureBootEnabled)
                    throw new InvalidOperationException("Secure Boot unexpectedly became enabled before the bootloader migration commit.");
                if (security.ReleaseSequence > package.ReleaseSequence)
                    throw new InvalidOperationException("Device release sequence advanced beyond the selected migration bundle.");

                var caps = await _migration.ReadCapabilitiesAsync(portName, null, cancellationToken);
                if (caps.Ready)
                {
                    log?.Invoke("Migration application reports bootloader staging ready; OTA probation and release-floor commit are complete.");
                    return caps;
                }
                lastStatus = caps.Status;
            }
            catch (OperationCanceledException) { throw; }
            catch (InvalidOperationException ex) when (!ex.Message.Contains("unexpectedly became enabled", StringComparison.OrdinalIgnoreCase) &&
                                                       !ex.Message.Contains("advanced beyond", StringComparison.OrdinalIgnoreCase))
            {
                lastStatus = ex.Message;
            }
            catch (TimeoutException ex)
            {
                lastStatus = ex.Message;
            }

            if (DateTime.UtcNow >= nextLog)
            {
                log?.Invoke("Waiting for migration app readiness: " + lastStatus);
                nextLog = DateTime.UtcNow.AddSeconds(10);
            }
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }
        return new SecureBootMigrationCapabilities { Ready = false, Status = lastStatus };
    }

    private async Task<UsbSecurityInfo> WaitForPostMigrationSecurityAsync(
        PreparedSecureBootMigration prepared,
        Action<string>? log,
        CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddMinutes(1);
        Exception? last = null;
        var nextLog = DateTime.MinValue;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var security = await _security.ReadAsync(prepared.PortName, null, cancellationToken);
                if (security.SecureBootEnabled) return security;
                last = new InvalidOperationException("Device responded after reboot but Secure Boot is still disabled.");
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or UnauthorizedAccessException or TimeoutException)
            {
                last = ex;
            }

            if (DateTime.UtcNow >= nextLog)
            {
                log?.Invoke("Waiting for post-migration Secure Boot verification" + (last is null ? "..." : ": " + last.Message));
                nextLog = DateTime.UtcNow.AddSeconds(10);
            }
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }
        throw new TimeoutException("The unit did not return with verified Secure Boot state after migration.", last);
    }

    private static void ValidateHardwareAndSecurity(HardwareIdentity hardware, UsbSecurityInfo security, bool allowAlreadyMigrated)
    {
        if (hardware.Revision < 300)
            throw new InvalidOperationException($"ESP32 silicon revision {FormatRevision(hardware.Revision)} is not eligible. Secure Boot v2 migration requires ECO3/revision 3.0 or newer.");
        if (!security.ProductionFlashEncryptionReady)
            throw new InvalidOperationException("Secure Boot migration requires existing release-mode Flash Encryption.");
        if (security.SecureBootEnabled && !allowAlreadyMigrated)
            throw new InvalidOperationException("Secure Boot is already enabled on this unit; no migration is required.");
    }

    private static string FormatRevision(int raw) => $"{raw / 100}.{raw % 100:00}";
}

internal sealed class PreparedSecureBootMigration
{
    public string PortName { get; init; } = "";
    public SecureBootMigrationPackage Package { get; init; } = null!;
    public string BootloaderSha256 { get; init; } = "";
    public HardwareIdentity Hardware { get; init; } = null!;
    public UsbSecurityInfo PreCommitSecurity { get; init; } = null!;
}

internal sealed class SecureBootMigrationPackage
{
    public string DirectoryPath { get; private set; } = "";
    public string ApplicationPath { get; private set; } = "";
    public string ApplicationSignaturePath { get; private set; } = "";
    public string BootloaderPath { get; private set; } = "";
    public string BootloaderSignaturePath { get; private set; } = "";
    public string MetadataPath { get; private set; } = "";
    public string Version { get; private set; } = "";
    public uint ReleaseSequence { get; private set; }
    public string ApplicationSha256 { get; private set; } = "";
    public string BootloaderSha256 { get; private set; } = "";
    public string SecureBootKeyFingerprint { get; private set; } = "";

    public static SecureBootMigrationPackage LoadInstalled()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "secure-boot-migration");
        var package = new SecureBootMigrationPackage
        {
            DirectoryPath = dir,
            ApplicationPath = Path.Combine(dir, "BatteryMonitor.secureboot.app.bin"),
            BootloaderPath = Path.Combine(dir, "BatteryMonitor.secureboot.bootloader.bin"),
            MetadataPath = Path.Combine(dir, "MIGRATION_RELEASE.txt")
        };
        package.ApplicationSignaturePath = package.ApplicationPath + ".sig";
        package.BootloaderSignaturePath = package.BootloaderPath + ".sig";
        package.LoadMetadataAndVerify();
        return package;
    }

    public void Verify() => LoadMetadataAndVerify();

    private void LoadMetadataAndVerify()
    {
        foreach (var path in new[] { ApplicationPath, ApplicationSignaturePath, BootloaderPath, BootloaderSignaturePath, MetadataPath })
            if (!File.Exists(path)) throw new FileNotFoundException("Secure Boot migration bundle is incomplete.", path);

        FirmwareSignatureVerifier.VerifyOrThrow(ApplicationPath, ApplicationSignaturePath);
        FirmwareSignatureVerifier.VerifyOrThrow(BootloaderPath, BootloaderSignaturePath);

        var values = File.ReadAllLines(MetadataPath)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#'))
            .Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2)
            .ToDictionary(parts => parts[0].Trim(), parts => parts[1].Trim(), StringComparer.OrdinalIgnoreCase);

        Require(values, "schema", "BATMON_SECURE_BOOT_MIGRATION_RELEASE_V1");
        Require(values, "migration_scope", "existing-release-encrypted-ECO3-plus-units-only");
        Require(values, "minimum_esp32_revision", "3.0-ECO3");
        Require(values, "flash_encryption_required", "enabled-release-mode");
        Require(values, "normal_provisioning_default_secure_boot", "unchanged-disabled");

        if (!values.TryGetValue("version", out var version) || string.IsNullOrWhiteSpace(version))
            throw new InvalidOperationException("Migration bundle metadata is missing version.");
        if (!values.TryGetValue("release_sequence", out var seqText) || !uint.TryParse(seqText, NumberStyles.None, CultureInfo.InvariantCulture, out var sequence) || sequence == 0)
            throw new InvalidOperationException("Migration bundle metadata has invalid release_sequence.");
        if (!TryParseReleaseSequence(version, out var versionSequence) || versionSequence != sequence)
            throw new InvalidOperationException("Migration bundle version and release sequence do not agree.");

        if (!values.TryGetValue("signed_application_sha256", out var expectedApp) || !IsSha256(expectedApp) ||
            !values.TryGetValue("signed_bootloader_sha256", out var expectedBoot) || !IsSha256(expectedBoot))
            throw new InvalidOperationException("Migration bundle metadata is missing valid signed image hashes.");

        var actualApp = HashFile(ApplicationPath);
        var actualBoot = HashFile(BootloaderPath);
        if (!actualApp.Equals(expectedApp, StringComparison.OrdinalIgnoreCase))
            throw new CryptographicException("Migration application hash does not match signed release metadata.");
        if (!actualBoot.Equals(expectedBoot, StringComparison.OrdinalIgnoreCase))
            throw new CryptographicException("Migration bootloader hash does not match signed release metadata.");

        var appSize = new FileInfo(ApplicationPath).Length;
        var bootSize = new FileInfo(BootloaderPath).Length;
        if (appSize > 0x140000) throw new InvalidOperationException("Migration application exceeds deployed OTA slot size.");
        if (bootSize > 0xE000) throw new InvalidOperationException("Migration bootloader exceeds deployed primary bootloader region.");

        Version = version;
        ReleaseSequence = sequence;
        ApplicationSha256 = actualApp;
        BootloaderSha256 = actualBoot;
        SecureBootKeyFingerprint = values.TryGetValue("secure_boot_public_key_spki_sha256", out var fingerprint) ? fingerprint : "";
    }

    private static bool TryParseReleaseSequence(string version, out uint sequence)
    {
        sequence = 0;
        var cleaned = version.Trim();
        var dash = cleaned.IndexOf('-');
        var plus = cleaned.IndexOf('+');
        var separator = dash < 0 ? plus : plus < 0 ? dash : Math.Min(dash, plus);
        if (separator >= 0) cleaned = cleaned[..separator];
        var parts = cleaned.Split('.');
        return parts.Length == 4 && uint.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out sequence) && sequence > 0;
    }

    private static void Require(IReadOnlyDictionary<string, string> values, string key, string expected)
    {
        if (!values.TryGetValue(key, out var actual) || !actual.Equals(expected, StringComparison.Ordinal))
            throw new InvalidOperationException($"Migration bundle metadata {key} must be '{expected}'.");
    }

    private static bool IsSha256(string value) => value.Length == 64 && value.All(Uri.IsHexDigit);

    private static string HashFile(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }
}
