using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BatteryMonitor.Client;

internal static class DevicePasswordRules
{
    public const int MaxUtf8Bytes = 128;
    private const string CodeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static readonly Regex FormattedInitialCode = new(
        "^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static bool TryValidate(string? password, out string error)
    {
        password ??= string.Empty;
        var byteCount = Encoding.UTF8.GetByteCount(password);
        if (byteCount < 1 || byteCount > MaxUtf8Bytes)
        {
            error = $"Device Password must contain 1 to {MaxUtf8Bytes} UTF-8 bytes.";
            return false;
        }
        if (password.Any(char.IsControl))
        {
            error = "Device Password cannot contain control characters.";
            return false;
        }
        error = string.Empty;
        return true;
    }

    // Strength is intentionally advisory. The user may confirm and use a weak
    // password; firmware does not impose a complexity floor.
    public static bool IsWeak(string password, out string reason)
    {
        if (password.Length < 10)
        {
            reason = "It is short and may be easy to guess.";
            return true;
        }
        var lower = password.ToLowerInvariant();
        if (lower is "password" or "password1" or "12345678" or "123456789" or "qwerty123" or "letmein")
        {
            reason = "It is a commonly guessed password.";
            return true;
        }
        var classes = 0;
        if (password.Any(char.IsLower)) classes++;
        if (password.Any(char.IsUpper)) classes++;
        if (password.Any(char.IsDigit)) classes++;
        if (password.Any(c => !char.IsLetterOrDigit(c))) classes++;
        if (classes < 2)
        {
            reason = "It uses only one character type and may be easier to guess.";
            return true;
        }
        reason = string.Empty;
        return false;
    }

    // Existing printed initial codes are displayed XXXX-XXXX-XXXX-XXXX while
    // legacy firmware stored the canonical 16-character value. Preserve that
    // convenience without changing arbitrary custom passwords.
    public static string InitialCodeCompatibility(string password)
    {
        if (!FormattedInitialCode.IsMatch(password ?? string.Empty)) return password ?? string.Empty;
        var sb = new StringBuilder(16);
        foreach (var raw in password)
        {
            if (raw == '-') continue;
            var c = char.ToUpperInvariant(raw);
            if (c == 'O') c = '0';
            if (c is 'I' or 'L') c = '1';
            if (!CodeAlphabet.Contains(c)) return password;
            sb.Append(c);
        }
        return sb.ToString();
    }

    public static byte[] DeriveManagementKey(string deviceId, string password)
    {
        password = InitialCodeCompatibility(password);
        var root = SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-CODECHECK-V1|{deviceId}|{password}"));
        var rootHex = Convert.ToHexString(root).ToLowerInvariant();
        return SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-LAN-MGMT-V1|{deviceId}|{rootHex}"));
    }

    public static string DeriveSoftApPassword(string deviceId, string password)
    {
        password = InitialCodeCompatibility(password);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-SOFTAP-V1|{deviceId}|{password}"));
        return Convert.ToHexString(hash.AsSpan(0, 16));
    }
}

internal sealed class DeviceCredentialStore
{
    private readonly string _path;
    private readonly JsonSerializerOptions _json = new() { WriteIndented = true };
    private readonly object _sync = new();

    public DeviceCredentialStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "device-credentials.dpapi.json");
    }

    public string? Load(string deviceId)
    {
        lock (_sync)
        {
            try
            {
                var data = LoadRaw();
                if (!data.TryGetValue(deviceId, out var protectedText) || string.IsNullOrWhiteSpace(protectedText)) return null;
                var protectedBytes = Convert.FromBase64String(protectedText);
                var clear = ProtectedData.Unprotect(protectedBytes, Entropy(deviceId), DataProtectionScope.CurrentUser);
                try { return Encoding.UTF8.GetString(clear); }
                finally { CryptographicOperations.ZeroMemory(clear); }
            }
            catch { return null; }
        }
    }

    public void Save(string deviceId, string password)
    {
        if (!DevicePasswordRules.TryValidate(password, out var error)) throw new ArgumentException(error, nameof(password));
        lock (_sync)
        {
            var clear = Encoding.UTF8.GetBytes(password);
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

    public void Forget(string deviceId)
    {
        lock (_sync)
        {
            var data = LoadRaw();
            if (!data.Remove(deviceId)) return;
            SaveRaw(data);
        }
    }

    public bool Has(string deviceId) => Load(deviceId) is not null;

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
        SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-WINDOWS-CRED-V1|{deviceId}"));
}

internal sealed class ManagementChallenge
{
    public int Version { get; set; }
    public string DeviceId { get; set; } = "";
    public string ChallengeId { get; set; } = "";
    public string Nonce { get; set; } = "";
    public int ExpiresInSec { get; set; }
}

internal sealed class ManagementSessionReply
{
    public bool Ok { get; set; }
    public string Session { get; set; } = "";
    public string Csrf { get; set; } = "";
    public int ExpiresInSec { get; set; }
}

internal sealed record ManagementSession(string SessionToken, string CsrfToken, byte[] ManagementKey);
