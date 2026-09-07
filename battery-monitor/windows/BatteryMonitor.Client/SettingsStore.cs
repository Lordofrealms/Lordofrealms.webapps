using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed class SettingsStore
{
    private readonly string _path;
    private readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

    public SettingsStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "devices.json");
    }

    public List<MonitorEntry> Load()
    {
        try
        {
            if (!File.Exists(_path)) return new List<MonitorEntry>();
            return JsonSerializer.Deserialize<List<MonitorEntry>>(File.ReadAllText(_path), _jsonOptions) ?? new List<MonitorEntry>();
        }
        catch
        {
            return new List<MonitorEntry>();
        }
    }

    public void Save(IEnumerable<MonitorEntry> devices)
    {
        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(devices, _jsonOptions));
        File.Move(temp, _path, true);
    }
}
