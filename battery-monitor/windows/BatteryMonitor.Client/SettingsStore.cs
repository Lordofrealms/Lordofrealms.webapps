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
        // P0-3: unauthenticated discovery candidates are intentionally transient.
        // Only explicitly paired/previously saved monitors belong in devices.json.
        var persistent = devices.Where(d => !d.IsCandidate).ToList();
        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(persistent, _jsonOptions));
        File.Move(temp, _path, true);
    }
}
