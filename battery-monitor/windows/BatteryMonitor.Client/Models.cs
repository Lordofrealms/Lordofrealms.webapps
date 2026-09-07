using System.Text.Json.Serialization;

namespace BatteryMonitor.Client;

public sealed class MonitorEntry
{
    public string DeviceId { get; set; } = "";
    public string LocalName { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string Hostname { get; set; } = "";
    public string Address { get; set; } = "";
    public int Port { get; set; } = 80;
    public string BatteryType { get; set; } = "lead_acid";
    public double LowVoltage { get; set; } = 12.20;
    public double CriticalVoltage { get; set; } = 11.90;
    public double CalibrationFactor { get; set; } = 1.0;
    public double CalibrationOffset { get; set; } = 0.0;
    public int SampleIntervalSec { get; set; } = 10;
    public int PollIntervalSec { get; set; } = 10;

    [JsonIgnore] public double? Voltage { get; set; }
    [JsonIgnore] public string State { get; set; } = "unknown";
    [JsonIgnore] public int Rssi { get; set; }
    [JsonIgnore] public DateTime? LastSeenUtc { get; set; }
    [JsonIgnore] public DateTime LastPollUtc { get; set; } = DateTime.MinValue;
    [JsonIgnore] public bool PollInProgress { get; set; }
    [JsonIgnore] public int ConsecutiveFailures { get; set; }
    [JsonIgnore] public string LastAlertState { get; set; } = "";
    [JsonIgnore] public DateTime LastAlertUtc { get; set; } = DateTime.MinValue;

    [JsonIgnore]
    public string DisplayName => string.IsNullOrWhiteSpace(LocalName)
        ? (string.IsNullOrWhiteSpace(DeviceName) ? DeviceId : DeviceName)
        : LocalName;
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
}

public static class BatteryPresets
{
    public static (double Low, double Critical) For(string batteryType) =>
        batteryType == "lifepo4_4s" ? (12.80, 12.00) : (12.20, 11.90);

    public static string FriendlyName(string batteryType) =>
        batteryType == "lifepo4_4s" ? "4S LiFePO4" : "12 V Lead Acid";
}
