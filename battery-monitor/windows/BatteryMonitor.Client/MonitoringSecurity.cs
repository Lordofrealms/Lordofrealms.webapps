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
    // Deterministic vectors make accidental changes to byte framing, domain
    // separation, wrap-key derivation, or AES-GCM AAD fail when CI executes
    // --protocol-self-test. These constants are independent test-vector data.
    static MonitoringProtocol()
    {
        RunHmacVector();
        RunMonitorKeyWrapVector();
    }

    public static void RunSelfTest() { }

    private static void RunHmacVector()
    {
        var key = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();
        var payload = Encoding.UTF8.GetBytes("{\"apiVersion\":1,\"deviceId\":\"BM-A1B2C3\",\"port\":80}");
        var expected = Convert.FromHexString("d58e947ba6d9192a3276b385e7f87805d20048d1d24980c0806fbb6be47894c7");
        var actual = ComputeHmac("BATMON-DISCOVERY-V2", "00112233445566778899aabbccddeeff", payload, key);
        try
        {
            if (!CryptographicOperations.FixedTimeEquals(expected, actual))
                throw new InvalidOperationException("Battery Monitor P0-3 HMAC protocol self-test failed.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(key);
            CryptographicOperations.ZeroMemory(payload);
            CryptographicOperations.ZeroMemory(expected);
            CryptographicOperations.ZeroMemory(actual);
        }
    }

    private static void RunMonitorKeyWrapVector()
    {
        const string deviceId = "BM-A1B2C3";
        const string session = "0123456789abcdef0123456789abcdef0123456789abcdef";
        const string csrf = "00112233445566778899aabbccddeeff";
        var managementKey = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();
        var expectedWrapKey = Convert.FromHexString("249576993dbd9bf49c647491f47f193eda8c09d5f57b0240bb380262078d3f36");
        var wrapKey = DeriveMonitorKeyWrapKey(managementKey, session, csrf);
        var iv = Convert.FromHexString("000102030405060708090a0b");
        var ciphertext = Convert.FromHexString("2acc241bb6257611833f87a09e0c73767889280f4934ab590d9f6c961a9fa971");
        var tag = Convert.FromHexString("cde1c72073723fd4439f2ffe813c59e9");
        var expectedPlaintext = Convert.FromHexString("a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf");
        var plaintext = new byte[32];
        var aad = BuildMonitorKeyAad(deviceId, session);
        try
        {
            if (!CryptographicOperations.FixedTimeEquals(expectedWrapKey, wrapKey))
                throw new InvalidOperationException("Battery Monitor P0-3 monitoring-key wrap derivation self-test failed.");
            using var aes = new AesGcm(wrapKey, tag.Length);
            aes.Decrypt(iv, ciphertext, tag, plaintext, aad);
            if (!CryptographicOperations.FixedTimeEquals(expectedPlaintext, plaintext))
                throw new InvalidOperationException("Battery Monitor P0-3 monitoring-key AES-GCM self-test failed.");
        }
        catch (CryptographicException ex)
        {
            throw new InvalidOperationException("Battery Monitor P0-3 monitoring-key AES-GCM self-test failed.", ex);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(managementKey);
            CryptographicOperations.ZeroMemory(expectedWrapKey);
            CryptographicOperations.ZeroMemory(wrapKey);
            CryptographicOperations.ZeroMemory(iv);
            CryptographicOperations.ZeroMemory(ciphertext);
            CryptographicOperations.ZeroMemory(tag);
            CryptographicOperations.ZeroMemory(expectedPlaintext);
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(aad);
        }
    }

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

    public static byte[] DeriveMonitorKeyWrapKey(ReadOnlySpan<byte> managementKey, string sessionToken, string csrfToken)
    {
        if (managementKey.Length != 32) throw new ArgumentException("Management key must be 32 bytes.", nameof(managementKey));
        var message = Encoding.UTF8.GetBytes($"BATMON-MONITOR-KEY-WRAP-V1|{sessionToken}|{csrfToken}");
        try { return HMACSHA256.HashData(managementKey, message); }
        finally { CryptographicOperations.ZeroMemory(message); }
    }

    public static byte[] BuildMonitorKeyAad(string deviceId, string sessionToken) =>
        Encoding.UTF8.GetBytes($"BATMON-MONITOR-KEY-AAD-V1|{deviceId}|{sessionToken}");
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
