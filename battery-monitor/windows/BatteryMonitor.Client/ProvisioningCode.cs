using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

internal static class ProvisioningCode
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    public static string GenerateFormatted()
    {
        var bytes = RandomNumberGenerator.GetBytes(10); // 80 random bits -> 16 Base32 characters.
        var chars = new char[16];
        ulong buffer = 0;
        var bits = 0;
        var index = 0;
        foreach (var b in bytes)
        {
            buffer = (buffer << 8) | b;
            bits += 8;
            while (bits >= 5)
            {
                bits -= 5;
                chars[index++] = Alphabet[(int)((buffer >> bits) & 31)];
            }
        }
        return Format(new string(chars));
    }

    public static string Normalize(string input)
    {
        var sb = new StringBuilder(16);
        foreach (var raw in input ?? "")
        {
            if (raw is '-' or ' ' or '\t' or '\r' or '\n') continue;
            var c = char.ToUpperInvariant(raw);
            if (c == 'O') c = '0';
            if (c is 'I' or 'L') c = '1';
            if (!Alphabet.Contains(c)) return "";
            sb.Append(c);
        }
        return sb.Length == 16 ? sb.ToString() : "";
    }

    public static string Format(string input)
    {
        var code = Normalize(input);
        if (code.Length != 16) return input;
        return $"{code[..4]}-{code[4..8]}-{code[8..12]}-{code[12..16]}";
    }

    public static string DeriveSoftApPassword(string deviceId, string setupCode)
    {
        var canonical = Normalize(setupCode);
        if (canonical.Length != 16) throw new ArgumentException("Setup code must contain 16 valid Base32 characters.", nameof(setupCode));
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"BATMON-SOFTAP-V1|{deviceId}|{canonical}"));
        return Convert.ToHexString(bytes.AsSpan(0, 16));
    }

    public static string BuildQrPayload(string deviceId, string setupSsid, string username, string setupCode)
    {
        var canonical = Normalize(setupCode);
        if (canonical.Length != 16) throw new ArgumentException("Invalid setup code.", nameof(setupCode));
        var payload = new Dictionary<string, object>
        {
            ["ver"] = "v1",
            ["name"] = setupSsid,
            ["pop"] = canonical,
            ["transport"] = "softap",
            ["security"] = 2,
            ["username"] = username,
            ["password"] = DeriveSoftApPassword(deviceId, canonical),
            ["id"] = deviceId
        };
        return JsonSerializer.Serialize(payload);
    }
}
