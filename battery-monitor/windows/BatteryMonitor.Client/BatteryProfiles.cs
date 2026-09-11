using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed class BatteryProfile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public double LowVoltage { get; set; }
    public double CriticalVoltage { get; set; }
    public bool BuiltIn { get; set; }

    public BatteryProfile Clone() => new()
    {
        Id = Id,
        Name = Name,
        LowVoltage = LowVoltage,
        CriticalVoltage = CriticalVoltage,
        BuiltIn = BuiltIn
    };

    public override string ToString() => Name;
}

internal sealed class BatteryProfileFile
{
    public int Version { get; set; } = 1;
    public List<BatteryProfile> Profiles { get; set; } = new();
}

internal sealed class BatteryProfileCatalog
{
    private const int SchemaVersion = 1;
    private static readonly Lazy<BatteryProfileCatalog> _current = new(() => new BatteryProfileCatalog());
    private readonly JsonSerializerOptions _json = new() { WriteIndented = true, PropertyNameCaseInsensitive = true };
    private readonly string _userPath;
    private List<BatteryProfile> _builtIns = new();
    private List<BatteryProfile> _userProfiles = new();

    public static BatteryProfileCatalog Current => _current.Value;

    private BatteryProfileCatalog()
    {
        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
        Directory.CreateDirectory(appData);
        _userPath = Path.Combine(appData, "battery-profiles.user.json");
        Reload();
    }

    public IReadOnlyList<BatteryProfile> All
    {
        get
        {
            var merged = new List<BatteryProfile>();
            merged.AddRange(_builtIns.Select(p => p.Clone()));
            merged.AddRange(_userProfiles
                .Where(p => !_builtIns.Any(b => b.Id.Equals(p.Id, StringComparison.OrdinalIgnoreCase)))
                .OrderBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase)
                .Select(p => p.Clone()));
            return merged;
        }
    }

    public IReadOnlyList<BatteryProfile> UserProfiles => _userProfiles.Select(p => p.Clone()).ToArray();

    public BatteryProfile? Find(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        return All.FirstOrDefault(p => p.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
    }

    public void Reload()
    {
        _builtIns = LoadPackagedDefaults();
        _userProfiles = LoadUserProfiles();
    }

    public string CreateUniqueProfileId(string displayName)
    {
        var chars = new List<char>(31);
        var underscorePending = false;
        foreach (var c in displayName.Trim())
        {
            if (char.IsAsciiLetterOrDigit(c))
            {
                if (underscorePending && chars.Count > 0 && chars[^1] != '_') chars.Add('_');
                underscorePending = false;
                if (chars.Count < 24) chars.Add(char.ToLowerInvariant(c));
            }
            else if (char.IsWhiteSpace(c) || c is '-' or '_' or '.')
            {
                underscorePending = chars.Count > 0;
            }
        }

        var root = new string(chars.ToArray()).Trim('_');
        if (string.IsNullOrWhiteSpace(root)) root = "custom";
        if (root.Length > 24) root = root[..24].TrimEnd('_');

        var existing = new HashSet<string>(All.Select(p => p.Id), StringComparer.OrdinalIgnoreCase);
        if (!existing.Contains(root) && IsValidProfileId(root)) return root;

        for (var i = 2; i < 10_000; i++)
        {
            var suffix = "_" + i;
            var prefix = root.Length + suffix.Length <= 31 ? root : root[..(31 - suffix.Length)].TrimEnd('_');
            var candidate = prefix + suffix;
            if (!existing.Contains(candidate)) return candidate;
        }

        return "custom_" + Guid.NewGuid().ToString("N")[..12];
    }

    public void SaveUserProfile(BatteryProfile profile)
    {
        ValidateProfile(profile);
        if (_builtIns.Any(p => p.Id.Equals(profile.Id, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Built-in battery profiles cannot be overwritten. Duplicate the profile to create a custom version.");

        var existing = _userProfiles.FindIndex(p => p.Id.Equals(profile.Id, StringComparison.OrdinalIgnoreCase));
        var copy = profile.Clone();
        copy.BuiltIn = false;
        if (existing >= 0) _userProfiles[existing] = copy;
        else _userProfiles.Add(copy);
        SaveUserFile();
    }

    public void DeleteUserProfile(string id)
    {
        _userProfiles.RemoveAll(p => p.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        SaveUserFile();
    }

    public static bool IsValidProfileId(string? id)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 31) return false;
        foreach (var c in id)
        {
            if (!(char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.')) return false;
        }
        return true;
    }

    public static void ValidateProfile(BatteryProfile profile)
    {
        if (!IsValidProfileId(profile.Id))
            throw new InvalidOperationException("The internal battery profile identifier is invalid.");
        if (string.IsNullOrWhiteSpace(profile.Name) || profile.Name.Trim().Length > 128)
            throw new InvalidOperationException("Profile name must be 1-128 characters.");
        if (profile.Name.Any(char.IsControl))
            throw new InvalidOperationException("Profile name cannot contain control characters.");
        if (profile.CriticalVoltage < 6.0 || profile.CriticalVoltage > 20.0 ||
            profile.LowVoltage <= profile.CriticalVoltage || profile.LowVoltage > 20.0)
            throw new InvalidOperationException("Profile voltage thresholds are invalid. Low must be above Critical and both must be within 6-20 V.");
    }

    private List<BatteryProfile> LoadPackagedDefaults()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "battery-profiles.json");
        try
        {
            if (File.Exists(path))
            {
                var file = JsonSerializer.Deserialize<BatteryProfileFile>(File.ReadAllText(path), _json);
                if (file?.Version == SchemaVersion && file.Profiles.Count > 0)
                {
                    var result = new List<BatteryProfile>();
                    foreach (var profile in file.Profiles)
                    {
                        try
                        {
                            ValidateProfile(profile);
                            profile.BuiltIn = true;
                            if (!result.Any(p => p.Id.Equals(profile.Id, StringComparison.OrdinalIgnoreCase)))
                                result.Add(profile);
                        }
                        catch { }
                    }
                    if (result.Count > 0) return result;
                }
            }
        }
        catch { }

        return new List<BatteryProfile>
        {
            new() { Id = "lead_acid", Name = "12 V Lead Acid", LowVoltage = 12.20, CriticalVoltage = 11.90, BuiltIn = true },
            new() { Id = "lifepo4_4s", Name = "4S LiFePO4", LowVoltage = 12.80, CriticalVoltage = 12.50, BuiltIn = true }
        };
    }

    private List<BatteryProfile> LoadUserProfiles()
    {
        try
        {
            if (!File.Exists(_userPath)) return new List<BatteryProfile>();
            var file = JsonSerializer.Deserialize<BatteryProfileFile>(File.ReadAllText(_userPath), _json);
            if (file?.Version != SchemaVersion) return new List<BatteryProfile>();
            var result = new List<BatteryProfile>();
            foreach (var profile in file.Profiles)
            {
                try
                {
                    ValidateProfile(profile);
                    profile.BuiltIn = false;
                    if (!result.Any(p => p.Id.Equals(profile.Id, StringComparison.OrdinalIgnoreCase)))
                        result.Add(profile);
                }
                catch { }
            }
            return result;
        }
        catch
        {
            return new List<BatteryProfile>();
        }
    }

    private void SaveUserFile()
    {
        var file = new BatteryProfileFile
        {
            Version = SchemaVersion,
            Profiles = _userProfiles.OrderBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase).Select(p => p.Clone()).ToList()
        };
        foreach (var p in file.Profiles) p.BuiltIn = false;
        var temp = _userPath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(file, _json));
        File.Move(temp, _userPath, true);
    }
}
