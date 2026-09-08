using System.Text.Json.Serialization;

namespace BatteryMonitor.Client;

public sealed class AlertProfile
{
    public bool Enabled { get; set; } = true;
    public string SoundId { get; set; } = "builtin:warning";
    public string CustomSoundPath { get; set; } = "";
    public int VolumePercent { get; set; } = 75;
    public int RepeatMinutes { get; set; } = 30;

    public AlertProfile Clone() => new()
    {
        Enabled = Enabled,
        SoundId = SoundId,
        CustomSoundPath = CustomSoundPath,
        VolumePercent = VolumePercent,
        RepeatMinutes = RepeatMinutes
    };

    public void Normalize()
    {
        VolumePercent = Math.Clamp(VolumePercent, 0, 100);
        RepeatMinutes = Math.Clamp(RepeatMinutes, 0, 1440);
        if (string.IsNullOrWhiteSpace(SoundId)) SoundId = "builtin:warning";
        CustomSoundPath ??= "";
    }

    public static AlertProfile LowDefault() => new()
    {
        Enabled = true,
        SoundId = "builtin:warning",
        VolumePercent = 70,
        RepeatMinutes = 30
    };

    public static AlertProfile CriticalDefault() => new()
    {
        Enabled = true,
        SoundId = "builtin:critical",
        VolumePercent = 100,
        RepeatMinutes = 15
    };

    public static AlertProfile OfflineDefault() => new()
    {
        Enabled = true,
        SoundId = "builtin:urgent",
        VolumePercent = 85,
        RepeatMinutes = 30
    };

    public static AlertProfile RecoveryDefault() => new()
    {
        Enabled = true,
        SoundId = "builtin:recovery",
        VolumePercent = 65,
        RepeatMinutes = 0
    };
}

public sealed class MonitorEntry
{
    public string DeviceId { get; set; } = "";
    public string LocalName { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string Hostname { get; set; } = "";
    public string Address { get; set; } = "";
    public int Port { get; set; } = 80;
    public string FirmwareVersion { get; set; } = "";
    public string BatteryType { get; set; } = "lead_acid";
    public double LowVoltage { get; set; } = 12.20;
    public double CriticalVoltage { get; set; } = 11.90;
    public double CalibrationFactor { get; set; } = 1.0;
    public double CalibrationOffset { get; set; } = 0.0;
    public int SampleIntervalSec { get; set; } = 10;
    public int PollIntervalSec { get; set; } = 10;
    public int OfflineTimeoutSec { get; set; } = 300;
    public DateTime? AlertsSnoozedUntilUtc { get; set; }

    public AlertProfile LowAlert { get; set; } = AlertProfile.LowDefault();
    public AlertProfile CriticalAlert { get; set; } = AlertProfile.CriticalDefault();
    public AlertProfile OfflineAlert { get; set; } = AlertProfile.OfflineDefault();
    public AlertProfile RecoveryAlert { get; set; } = AlertProfile.RecoveryDefault();

    [JsonIgnore] public double? Voltage { get; set; }
    [JsonIgnore] public string State { get; set; } = "unknown";
    [JsonIgnore] public int Rssi { get; set; }
    [JsonIgnore] public DateTime? LastSeenUtc { get; set; }
    [JsonIgnore] public DateTime LastPollUtc { get; set; } = DateTime.MinValue;
    [JsonIgnore] public bool PollInProgress { get; set; }
    [JsonIgnore] public DateTime? FailureStartedUtc { get; set; }
    [JsonIgnore] public bool OfflineAlerted { get; set; }
    [JsonIgnore] public DateTime LastOfflineAlertUtc { get; set; } = DateTime.MinValue;
    [JsonIgnore] public string LastAlertState { get; set; } = "";
    [JsonIgnore] public DateTime LastAlertUtc { get; set; } = DateTime.MinValue;
    [JsonIgnore] public bool IsCandidate { get; set; }
    [JsonIgnore] public bool IdentityFailure { get; set; }
    [JsonIgnore] public string MonitoringTrustState { get; set; } = "Unpaired";

    [JsonIgnore]
    public string DisplayName => string.IsNullOrWhiteSpace(LocalName)
        ? (string.IsNullOrWhiteSpace(DeviceName) ? DeviceId : DeviceName)
        : LocalName;

    public bool AlertsAreSnoozed(DateTime utcNow) =>
        AlertsSnoozedUntilUtc.HasValue && AlertsSnoozedUntilUtc.Value > utcNow;

    public void NormalizeLocalSettings()
    {
        if (OfflineTimeoutSec <= 0) OfflineTimeoutSec = 300;
        if (PollIntervalSec < 2) PollIntervalSec = 10;
        if (AlertsSnoozedUntilUtc.HasValue && AlertsSnoozedUntilUtc.Value <= DateTime.UtcNow)
            AlertsSnoozedUntilUtc = null;
        LowAlert ??= AlertProfile.LowDefault();
        CriticalAlert ??= AlertProfile.CriticalDefault();
        OfflineAlert ??= AlertProfile.OfflineDefault();
        RecoveryAlert ??= AlertProfile.RecoveryDefault();
        LowAlert.Normalize();
        CriticalAlert.Normalize();
        OfflineAlert.Normalize();
        RecoveryAlert.Normalize();
    }
}

public sealed class DeviceStatus
{
    public int ApiVersion { get; set; }
    public string FirmwareVersion { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Hostname { get; set; } = "";
    public string Ip { get; set; } = "";
    public bool WifiConnected { get; set; }
    public bool SetupApActive { get; set; }
    public int Rssi { get; set; }
    public string BatteryType { get; set; } = "";
    public double Voltage { get; set; }
    public string State { get; set; } = "unknown";
    public int AdcRaw { get; set; }
    public int AdcMillivolts { get; set; }
    public double LowVoltage { get; set; }
    public double CriticalVoltage { get; set; }
    public double CalibrationFactor { get; set; }
    public double CalibrationOffset { get; set; }
    public int SampleIntervalSec { get; set; }
    public long UptimeSec { get; set; }
    public long LastSampleAgeMs { get; set; }
}

public sealed class DiscoveredDevice
{
    public string Protocol { get; set; } = "";
    public int ApiVersion { get; set; }
    public string DeviceId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Hostname { get; set; } = "";
    public string Ip { get; set; } = "";
    public int Port { get; set; } = 80;
    public string FirmwareVersion { get; set; } = "";
    [JsonIgnore] public bool Authenticated { get; set; }
    [JsonIgnore] public bool IdentityFailure { get; set; }
}

public static class BatteryPresets
{
    public static (double Low, double Critical) For(string batteryType)
    {
        var profile = BatteryProfileCatalog.Current.Find(batteryType);
        return profile is null ? (12.20, 11.90) : (profile.LowVoltage, profile.CriticalVoltage);
    }

    public static string FriendlyName(string batteryType)
    {
        var profile = BatteryProfileCatalog.Current.Find(batteryType);
        return profile?.Name ?? (string.IsNullOrWhiteSpace(batteryType)
            ? "Unknown / Custom"
            : $"Unknown / Custom ({batteryType})");
    }
}
