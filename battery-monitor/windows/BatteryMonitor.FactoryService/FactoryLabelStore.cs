using System.Security.Cryptography;
using System.Text.Json;

namespace BatteryMonitor.Client;

internal sealed class FactoryLabelRecord
{
    public string DeviceId { get; set; } = "";
    public string SetupSsid { get; set; } = "";
    public string Username { get; set; } = "batmon";
    public string InitialPassword { get; set; } = "";
    public string QrPayload { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public int PrintedCount { get; set; }
}

internal sealed class FactoryLabelStore
{
    private readonly string _path;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    public FactoryLabelStore()
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "BatteryMonitorFactory");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "label-queue.dat");
    }

    public List<FactoryLabelRecord> Load()
    {
        try
        {
            if (!File.Exists(_path)) return new List<FactoryLabelRecord>();
            var protectedBytes = File.ReadAllBytes(_path);
            var plain = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            try
            {
                return JsonSerializer.Deserialize<List<FactoryLabelRecord>>(plain, JsonOptions)
                       ?? new List<FactoryLabelRecord>();
            }
            finally
            {
                CryptographicOperations.ZeroMemory(plain);
                CryptographicOperations.ZeroMemory(protectedBytes);
            }
        }
        catch
        {
            return new List<FactoryLabelRecord>();
        }
    }

    public void Save(IReadOnlyCollection<FactoryLabelRecord> records)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(records, JsonOptions);
        byte[]? protectedBytes = null;
        try
        {
            protectedBytes = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
            var temp = _path + ".tmp";
            File.WriteAllBytes(temp, protectedBytes);
            File.Move(temp, _path, true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
            if (protectedBytes is not null) CryptographicOperations.ZeroMemory(protectedBytes);
        }
    }

    public void AddOrReplace(FactoryLabelRecord record)
    {
        var records = Load();
        var index = records.FindIndex(r => r.DeviceId.Equals(record.DeviceId, StringComparison.OrdinalIgnoreCase));
        if (index >= 0) records[index] = record;
        else records.Add(record);
        Save(records);
    }
}
