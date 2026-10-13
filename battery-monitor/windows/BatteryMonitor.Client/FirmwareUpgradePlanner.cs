namespace BatteryMonitor.Client;

// Fail-closed upgrade path. The current device, not the new app image, decides
// whether a version descriptor can be installed. Four-part legacy 0.1.0.N
// cannot directly accept three-part version X.Y.Z.
internal enum UpgradeStageKind { LegacyBridge, Normal }

internal sealed record UpgradeStage(UpgradeStageKind Kind, string Version, string ImagePath, string SignaturePath);

internal static class FirmwareUpgradePlanner
{
    internal const string BridgeVersion = "0.1.0.11";
    internal const int BridgeSequence = 11;

    internal static IReadOnlyList<UpgradeStageKind> PlanKinds(string installed, string target)
    {
        if (!TryModernSequence(target, out var targetSequence))
            throw new InvalidOperationException("Unsupported target firmware version. The package must use X.Y.Z.");
        if (TryLegacySequence(installed, out var installedLegacy))
        {
            if (installedLegacy >= BridgeSequence)
                throw new InvalidOperationException(
                    $"Installed legacy {installed} is at sequence {installedLegacy}; the packaged sequence-11 bridge is not newer. " +
                    "A separate higher-sequence compatibility path must be qualified. No firmware was transferred.");
            if (targetSequence <= BridgeSequence)
                throw new InvalidOperationException("Target firmware must be newer than the bridge.");
            return [UpgradeStageKind.LegacyBridge, UpgradeStageKind.Normal];
        }
        if (!TryModernSequence(installed, out var current))
            throw new InvalidOperationException($"Unsupported installed firmware version '{installed}'. " +
                                                    "No signed upgrade route is known; do not attempt a blind OTA.");
        if (current >= targetSequence)
            throw new InvalidOperationException($"Installed firmware {installed} is not older than package {target}. " +
                                                "Firmware replay/downgrade is not supported.");
        return [UpgradeStageKind.Normal];
    }

    internal static IReadOnlyList<UpgradeStage> Resolve(string installed, EspFlasher flasher)
    {
        var target = flasher.UpdateVersion ?? throw new InvalidOperationException("The packaged firmware version is unavailable.");
        var kinds = PlanKinds(installed, target);
        var normal = flasher.UpdateFirmwarePath;
        var normalSignature = flasher.UpdateSignaturePath;
        if (normal is null || normalSignature is null)
            throw new InvalidOperationException("The signed normal firmware pair is incomplete.");
        FirmwareSignatureVerifier.VerifyOrThrow(normal, normalSignature);

        var stages = new List<UpgradeStage>();
        if (kinds.Contains(UpgradeStageKind.LegacyBridge))
        {
            var image = flasher.LegacyBridgeFirmwarePath;
            var signature = flasher.LegacyBridgeSignaturePath;
            if (image is null || signature is null || flasher.LegacyBridgeVersion != BridgeVersion)
                throw new InvalidOperationException("The verified signed legacy bridge is missing. " +
                    "A device using four-component firmware must not be sent the three-component image. " +
                    "Install a complete signed customer package with the legacy bridge included.");
            FirmwareSignatureVerifier.VerifyOrThrow(image, signature);
            stages.Add(new UpgradeStage(UpgradeStageKind.LegacyBridge, BridgeVersion, image, signature));
        }
        stages.Add(new UpgradeStage(UpgradeStageKind.Normal, target, normal, normalSignature));
        return stages;
    }

    private static bool TryModernSequence(string? value, out int sequence)
    {
        sequence = 0;
        if (value?.Length != 5 || value[1] != '.' || value[3] != '.' ||
            !char.IsAsciiDigit(value[0]) || !char.IsAsciiDigit(value[2]) || !char.IsAsciiDigit(value[4]))
            return false;
        sequence = (value[0] - '0') * 100 + (value[2] - '0') * 10 + value[4] - '0';
        return sequence > 0;
    }

    private static bool TryLegacySequence(string? value, out int sequence)
    {
        sequence = 0;
        if (value is null || !value.StartsWith("0.1.0.", StringComparison.Ordinal)) return false;
        var suffix = value.AsSpan(6);
        if (suffix.IsEmpty || suffix.Length > 2 || suffix[0] == '0') return false;
        foreach (var ch in suffix)
        {
            if (!char.IsAsciiDigit(ch)) return false;
            sequence = sequence * 10 + ch - '0';
        }
        return sequence is >= 1 and <= 11;
    }

    internal static void SelfTest()
    {
        foreach (var version in new[] { "0.1.0.1", "0.1.0.7", "0.1.0.9", "0.1.0.10" })
        {
            var route = PlanKinds(version, "0.1.4");
            if (route.Count != 2 || route[0] != UpgradeStageKind.LegacyBridge || route[1] != UpgradeStageKind.Normal)
                throw new InvalidOperationException("Legacy bridge route self-test failed: " + version);
        }
        foreach (var version in new[] { "0.1.0", "0.1.1", "0.1.2", "0.1.3" })
        {
            var route = PlanKinds(version, "0.1.4");
            if (route.Count != 1 || route[0] != UpgradeStageKind.Normal)
                throw new InvalidOperationException("Direct OTA route self-test failed: " + version);
        }
        foreach (var version in new[] { "0.1.0.11", "0.1.0.99", "0.1.4", "0.1.5", "garbage" })
        {
            try { PlanKinds(version, "0.1.4"); }
            catch (InvalidOperationException) { continue; }
            throw new InvalidOperationException("Unsupported OTA route was incorrectly accepted: " + version);
        }
    }
}
