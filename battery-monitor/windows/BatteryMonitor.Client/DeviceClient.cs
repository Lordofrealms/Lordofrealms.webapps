using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed class DeviceClient
{
    private readonly HttpClient _http = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(5)
    };
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private static Uri BaseUri(MonitorEntry d) => new($"http://{d.Address}:{d.Port}/");

    public async Task<DeviceStatus> GetStatusAsync(MonitorEntry device, CancellationToken cancellationToken = default)
    {
        var uri = new Uri(BaseUri(device), "api/status");
        using var response = await _http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Device status request failed with HTTP {(int)response.StatusCode}.");

        var mediaType = response.Content.Headers.ContentType?.MediaType;
        if (!string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Device status response was not JSON.");

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var status = await JsonSerializer.DeserializeAsync<DeviceStatus>(stream, JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Device returned an empty status response.");
        if (!string.Equals(status.DeviceId, device.DeviceId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Status response came from a different Battery Monitor identity.");
        return status;
    }

    public async Task<DeviceStatus> GetAuthenticatedStatusAsync(MonitorEntry device, byte[] monitoringIdentityKey, CancellationToken cancellationToken = default)
    {
        if (monitoringIdentityKey.Length != 32)
            throw new MonitoringIdentityException("Stored Monitoring Identity Key has an invalid length.");

        var nonceBytes = RandomNumberGenerator.GetBytes(16);
        var nonce = Convert.ToHexString(nonceBytes).ToLowerInvariant();
        using var response = await _http.GetAsync(new Uri(BaseUri(device), $"api/status-auth?nonce={nonce}"), HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Authenticated status request failed with HTTP {(int)response.StatusCode}.");
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        var envelope = JsonSerializer.Deserialize<AuthenticatedMonitorEnvelope>(text, JsonOptions)
            ?? throw new MonitoringIdentityException("Device returned an invalid authenticated status envelope.");
        if (!string.Equals(envelope.Protocol, "BATMON_STATUS_V1", StringComparison.Ordinal) ||
            !string.Equals(envelope.Nonce, nonce, StringComparison.OrdinalIgnoreCase))
            throw new MonitoringIdentityException("Authenticated status nonce/protocol did not match the request.");

        byte[] payload;
        byte[] suppliedMac;
        try
        {
            payload = Convert.FromBase64String(envelope.Payload);
            suppliedMac = Convert.FromHexString(envelope.Hmac);
        }
        catch (FormatException ex)
        {
            throw new MonitoringIdentityException("Authenticated status contained malformed cryptographic data: " + ex.Message);
        }

        try
        {
            if (!MonitoringProtocol.VerifyHmac("BATMON-STATUS-V1", nonce, payload, suppliedMac, monitoringIdentityKey))
                throw new MonitoringIdentityException("Battery Monitor status authentication failed. Do not trust the reported voltage/state.");
            var status = JsonSerializer.Deserialize<DeviceStatus>(payload, JsonOptions)
                ?? throw new MonitoringIdentityException("Authenticated status payload was invalid.");
            if (!string.Equals(status.DeviceId, device.DeviceId, StringComparison.OrdinalIgnoreCase))
                throw new MonitoringIdentityException("Authenticated status payload belongs to a different Battery Monitor.");
            return status;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(payload);
            CryptographicOperations.ZeroMemory(suppliedMac);
            CryptographicOperations.ZeroMemory(nonceBytes);
        }
    }

    private async Task<ManagementSession> AuthenticateAsync(MonitorEntry device, string devicePassword, CancellationToken cancellationToken)
    {
        if (!DevicePasswordRules.TryValidate(devicePassword, out var error))
            throw new ArgumentException(error, nameof(devicePassword));

        var challengeText = await _http.GetStringAsync(new Uri(BaseUri(device), "api/auth/challenge"), cancellationToken);
        var challenge = JsonSerializer.Deserialize<ManagementChallenge>(challengeText, JsonOptions)
            ?? throw new InvalidOperationException("Device returned an invalid authentication challenge.");
        if (!string.Equals(challenge.DeviceId, device.DeviceId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Authentication challenge came from a different Battery Monitor.");
        if (string.IsNullOrWhiteSpace(challenge.ChallengeId) || string.IsNullOrWhiteSpace(challenge.Nonce))
            throw new InvalidOperationException("Device returned an incomplete authentication challenge.");

        var managementKey = DevicePasswordRules.DeriveManagementKey(challenge.DeviceId, devicePassword);
        var proofMessage = $"BATMON-AUTH-V1|{challenge.DeviceId}|{challenge.ChallengeId}|{challenge.Nonce}";
        var proof = HMACSHA256.HashData(managementKey, Encoding.UTF8.GetBytes(proofMessage));
        var values = new Dictionary<string, string>
        {
            ["challengeId"] = challenge.ChallengeId,
            ["proof"] = Convert.ToHexString(proof).ToLowerInvariant()
        };
        using var body = new FormUrlEncodedContent(values);
        using var response = await _http.PostAsync(new Uri(BaseUri(device), "api/auth/session"), body, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            CryptographicOperations.ZeroMemory(managementKey);
            throw new InvalidOperationException($"Device Password authentication failed: {responseText}");
        }
        var session = JsonSerializer.Deserialize<ManagementSessionReply>(responseText, JsonOptions)
            ?? throw new InvalidOperationException("Device returned an invalid authenticated session.");
        if (!session.Ok || string.IsNullOrWhiteSpace(session.Session) || string.IsNullOrWhiteSpace(session.Csrf))
        {
            CryptographicOperations.ZeroMemory(managementKey);
            throw new InvalidOperationException("Device did not create an authenticated management session.");
        }
        return new ManagementSession(session.Session, session.Csrf, managementKey);
    }

    private async Task<HttpResponseMessage> PostAuthorizedAsync(
        MonitorEntry device,
        string relativePath,
        HttpContent content,
        ManagementSession session,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(BaseUri(device), relativePath)) { Content = content };
        request.Headers.Add("X-Batmon-Session", session.SessionToken);
        request.Headers.Add("X-Batmon-CSRF", session.CsrfToken);
        return await _http.SendAsync(request, cancellationToken);
    }

    public async Task<byte[]> PairMonitoringIdentityAsync(MonitorEntry device, string devicePassword, CancellationToken cancellationToken = default)
    {
        var session = await AuthenticateAsync(device, devicePassword, cancellationToken);
        try
        {
            using var content = new StringContent(string.Empty);
            using var response = await PostAuthorizedAsync(device, "api/monitor-key", content, session, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"Monitor pairing failed: {text}");
            var reply = JsonSerializer.Deserialize<MonitoringKeyReply>(text, JsonOptions)
                ?? throw new MonitoringIdentityException("Device returned an invalid monitoring-key envelope.");
            if (!reply.Ok || reply.Version != 1 || !string.Equals(reply.DeviceId, device.DeviceId, StringComparison.OrdinalIgnoreCase))
                throw new MonitoringIdentityException("Monitoring-key envelope belongs to a different or unsupported device identity.");

            byte[] iv;
            byte[] cipher;
            byte[] tag;
            try
            {
                iv = Convert.FromHexString(reply.Iv);
                cipher = Convert.FromHexString(reply.Ciphertext);
                tag = Convert.FromHexString(reply.Tag);
            }
            catch (FormatException ex)
            {
                throw new MonitoringIdentityException("Monitoring-key envelope is malformed: " + ex.Message);
            }
            if (iv.Length != 12 || cipher.Length != 32 || tag.Length != 16)
                throw new MonitoringIdentityException("Monitoring-key envelope has invalid cryptographic lengths.");

            var wrapMessage = Encoding.UTF8.GetBytes($"BATMON-MONITOR-KEY-WRAP-V1|{session.SessionToken}|{session.CsrfToken}");
            var wrapKey = HMACSHA256.HashData(session.ManagementKey, wrapMessage);
            var aad = Encoding.UTF8.GetBytes($"BATMON-MONITOR-KEY-AAD-V1|{device.DeviceId}|{session.SessionToken}");
            var key = new byte[32];
            try
            {
                using var aes = new AesGcm(wrapKey, tag.Length);
                aes.Decrypt(iv, cipher, tag, key, aad);
                return key;
            }
            catch (CryptographicException ex)
            {
                CryptographicOperations.ZeroMemory(key);
                throw new MonitoringIdentityException("Monitoring Identity Key authentication/decryption failed: " + ex.Message);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(wrapKey);
                CryptographicOperations.ZeroMemory(wrapMessage);
                CryptographicOperations.ZeroMemory(aad);
                CryptographicOperations.ZeroMemory(iv);
                CryptographicOperations.ZeroMemory(cipher);
                CryptographicOperations.ZeroMemory(tag);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(session.ManagementKey);
        }
    }

    public async Task<DeviceStatus> ApplyConfigAsync(MonitorEntry device, string devicePassword, CancellationToken cancellationToken = default)
    {
        var session = await AuthenticateAsync(device, devicePassword, cancellationToken);
        try
        {
            var values = new Dictionary<string, string>
            {
                ["name"] = device.DeviceName,
                ["batteryType"] = device.BatteryType,
                ["lowVoltage"] = device.LowVoltage.ToString("0.000", CultureInfo.InvariantCulture),
                ["criticalVoltage"] = device.CriticalVoltage.ToString("0.000", CultureInfo.InvariantCulture),
                ["sampleIntervalSec"] = device.SampleIntervalSec.ToString(CultureInfo.InvariantCulture),
                ["calibrationFactor"] = device.CalibrationFactor.ToString("0.000000", CultureInfo.InvariantCulture),
                ["calibrationOffset"] = device.CalibrationOffset.ToString("0.0000", CultureInfo.InvariantCulture)
            };
            using var content = new FormUrlEncodedContent(values);
            using var response = await PostAuthorizedAsync(device, "api/config", content, session, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Device rejected settings: {text}");
            return await GetStatusAsync(device, cancellationToken);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(session.ManagementKey);
        }
    }

    public async Task EnterSecureProvisioningAsync(MonitorEntry device, string devicePassword, CancellationToken cancellationToken = default)
    {
        var session = await AuthenticateAsync(device, devicePassword, cancellationToken);
        try
        {
            using var content = new StringContent(string.Empty);
            using var response = await PostAuthorizedAsync(device, "api/wifi/provisioning", content, session, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Device could not enter secure Wi-Fi setup: {text}");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(session.ManagementKey);
        }
    }

    public async Task RotateDevicePasswordAsync(MonitorEntry device, string currentPassword, string newPassword, CancellationToken cancellationToken = default)
    {
        if (!DevicePasswordRules.TryValidate(newPassword, out var error))
            throw new ArgumentException(error, nameof(newPassword));

        var session = await AuthenticateAsync(device, currentPassword, cancellationToken);
        try
        {
            var wrapMessage = Encoding.UTF8.GetBytes($"BATMON-PASSWORD-WRAP-V1|{session.SessionToken}|{session.CsrfToken}");
            var wrapKey = HMACSHA256.HashData(session.ManagementKey, wrapMessage);
            var iv = RandomNumberGenerator.GetBytes(12);
            var plaintext = Encoding.UTF8.GetBytes(newPassword);
            var ciphertext = new byte[plaintext.Length];
            var tag = new byte[16];
            var aad = Encoding.UTF8.GetBytes($"BATMON-PASSWORD-ROTATE-V1|{device.DeviceId}|{session.SessionToken}");
            try
            {
                using var aes = new AesGcm(wrapKey, tag.Length);
                aes.Encrypt(iv, plaintext, ciphertext, tag, aad);
                var values = new Dictionary<string, string>
                {
                    ["iv"] = Convert.ToHexString(iv).ToLowerInvariant(),
                    ["ciphertext"] = Convert.ToHexString(ciphertext).ToLowerInvariant(),
                    ["tag"] = Convert.ToHexString(tag).ToLowerInvariant()
                };
                using var content = new FormUrlEncodedContent(values);
                using var response = await PostAuthorizedAsync(device, "api/password", content, session, cancellationToken);
                var text = await response.Content.ReadAsStringAsync(cancellationToken);
                if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Device Password change failed: {text}");
            }
            finally
            {
                CryptographicOperations.ZeroMemory(wrapKey);
                CryptographicOperations.ZeroMemory(plaintext);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(session.ManagementKey);
        }
    }

    public Task ResetWifiAsync(MonitorEntry device, string devicePassword, CancellationToken cancellationToken = default) =>
        EnterSecureProvisioningAsync(device, devicePassword, cancellationToken);
}
