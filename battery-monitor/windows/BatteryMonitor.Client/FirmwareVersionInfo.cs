namespace BatteryMonitor.Client;

internal static class FirmwareVersionInfo
{
    public static string ComparisonLabel(string? installed, string? available)
    {
        installed = installed?.Trim();
        available = available?.Trim();
        if (string.IsNullOrWhiteSpace(installed)) return "Installed version unknown";
        if (string.IsNullOrWhiteSpace(available)) return "Package version unknown";

        var comparison = Compare(installed, available);
        if (!comparison.HasValue) return "Version comparison unavailable";
        if (comparison.Value < 0) return "Update available";
        if (comparison.Value > 0) return "Device newer than package";
        return "Up to date";
    }

    public static int? Compare(string? left, string? right)
    {
        if (!TryParse(left, out var leftVersion) || !TryParse(right, out var rightVersion)) return null;
        return leftVersion.CompareTo(rightVersion);
    }

    private static bool TryParse(string? value, out Version version)
    {
        version = new Version();
        if (string.IsNullOrWhiteSpace(value)) return false;
        var cleaned = value.Trim();
        var separator = cleaned.IndexOfAny(['-', '+']);
        if (separator >= 0) cleaned = cleaned[..separator];
        return Version.TryParse(cleaned, out version!);
    }
}
