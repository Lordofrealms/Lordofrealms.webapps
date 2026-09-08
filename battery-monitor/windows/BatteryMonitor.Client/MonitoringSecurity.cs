using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

internal sealed class MonitoringIdentityException : Exception
{
    public MonitoringIdentityException(string message) : base(message) { }
}

internal sealed class MonitoringIdentityStore
{
    private readonly string _path;
    private readonly JsonSerializerOptions _json = new() { WriteIndented = true };
    private readonly object _sync = new();

    public MonitoringIdentityStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "monitoring-identities.dpapi.json");
    }

    public byte[]? Load(string deviceId)
    {
        lock (_sync)
        {
            try
            {
                var data = LoadRaw();
                if (!data.TryGetValue(deviceId, out var protectedText) || string.IsNullOrWhiteSpace(protectedText)) return null;
                var protectedBytes = Convert.FromBase64String(protectedText);
                var clear = ProtectedData.Unprotect(protectedBytes, Entropy(deviceId), DataProtectionScope.CurrentUser);
                if (clear.Length != 32)
                {
                    CryptographicOperations.ZeroMemory(clear);
                    return null;
                }
                return clear;
            }
            catch { return null; }
        }
    }

    public void Save(string deviceId, ReadOnlySpan<byte> key)
    {
        if (key.Length != 32) throw new ArgumentException("Monitoring Identity Key must be exactly 32 bytes.", nameof(key));
        lock (_sync)
        {
            var clear = key.ToArray();
            try
            {
                var protectedBytes = ProtectedData.Protect(clear, Entropy(deviceId), DataProtectionScope.CurrentUser);
                var data = LoadRaw();
                data[deviceId] = Convert.ToBase64String(protectedBytes);
                SaveRaw(data);
            }
            finally { CryptographicOperations.ZeroMemory(clear); }
        }
    }

    public bool Has(string deviceId)
    {
        var key = Load(deviceId);
        if (key is null) return false;
        CryptographicOperations.ZeroMemory(key);
        return true;
    }

    public void Forget(string deviceId)
    {
        lock (_sync)
        {
            var data = LoadRaw();
            if (!data.Remove(deviceId)) return;
            SaveRaw(data);
        }
    }

    private Dictionary<string, string> LoadRaw()
    {
        try
        {
            if (!File.Exists(_path)) return new(StringComparer.OrdinalIgnoreCase);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_path), _json)
                   ?? new(StringComparer.OrdinalIgnoreCase);
        }
        catch { return new(StringComparer.OrdinalIgnoreCase); }
    }

    private void SaveRaw(Dictionary<string, string> data)
    {
        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(data, _json));
        File.Move(temp, _path, true);
    }

    private static byte[] Entropy(string deviceId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-WINDOWS-MONITOR-KEY-V1|{deviceId}"));
}

internal static class MonitoringProtocol
{
    public static byte[] ComputeHmac(string domain, string nonce, ReadOnlySpan<byte> payload, ReadOnlySpan<byte> key)
    {
        if (key.Length != 32) throw new ArgumentException("Monitoring Identity Key must be 32 bytes.", nameof(key));
        var prefix = Encoding.UTF8.GetBytes($"{domain}|{nonce}|");
        var message = new byte[prefix.Length + payload.Length];
        Buffer.BlockCopy(prefix, 0, message, 0, prefix.Length);
        payload.CopyTo(message.AsSpan(prefix.Length));
        try { return HMACSHA256.HashData(key, message); }
        finally { CryptographicOperations.ZeroMemory(message); }
    }

    public static bool VerifyHmac(string domain, string nonce, ReadOnlySpan<byte> payload, ReadOnlySpan<byte> suppliedMac, ReadOnlySpan<byte> key)
    {
        if (suppliedMac.Length != 32) return false;
        var expected = ComputeHmac(domain, nonce, payload, key);
        try { return CryptographicOperations.FixedTimeEquals(expected, suppliedMac); }
        finally { CryptographicOperations.ZeroMemory(expected); }
    }
}

internal sealed class AuthenticatedMonitorEnvelope
{
    public string Protocol { get; set; } = "";
    public string Nonce { get; set; } = "";
    public string Payload { get; set; } = "";
    public string Hmac { get; set; } = "";
}

internal sealed class MonitoringKeyReply
{
    public bool Ok { get; set; }
    public int Version { get; set; }
    public string DeviceId { get; set; } = "";
    public string Iv { get; set; } = "";
    public string Ciphertext { get; set; } = "";
    public string Tag { get; set; } = "";
}
