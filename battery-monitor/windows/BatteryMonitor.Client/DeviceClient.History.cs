using System.Security.Cryptography;
using System.Net.Http;
using System.Text.Json;

namespace BatteryMonitor.Client;

// Each record: [sequence, ageSeconds, minimum, maximum, average, sampleCount].
// The complete envelope is HMAC-authenticated with the paired monitoring identity.
public sealed class DeviceHistoryBatch
{
    public string DeviceId { get; set; } = "";
    public string BootId { get; set; } = "";
    public List<double[]> Records { get; set; } = new();
}

public sealed partial class DeviceClient
{
    public async Task<DeviceHistoryBatch> GetAuthenticatedHistoryAsync(
        MonitorEntry device, byte[] monitoringIdentityKey, CancellationToken cancellationToken = default)
    {
        if (monitoringIdentityKey.Length != 32)
            throw new MonitoringIdentityException("History identity key has an invalid length.");
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var requestProof = MonitoringProtocol.ComputeHmac("BATMON-HISTORY-REQUEST-V1", nonce, Array.Empty<byte>(), monitoringIdentityKey);
        var requestMac = Convert.ToHexString(requestProof).ToLowerInvariant();
        CryptographicOperations.ZeroMemory(requestProof);
        using var response = await _http.GetAsync(new Uri(BaseUri(device), $"api/history-auth?nonce={nonce}&proof={requestMac}"),
            HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var envelope = JsonSerializer.Deserialize<AuthenticatedMonitorEnvelope>(body, JsonOptions)
            ?? throw new MonitoringIdentityException("Invalid authenticated history envelope.");
        if (envelope.Protocol != "BATMON_HISTORY_V1" ||
            !string.Equals(envelope.Nonce, nonce, StringComparison.OrdinalIgnoreCase))
            throw new MonitoringIdentityException("History nonce/protocol mismatch.");
        var payload = Convert.FromBase64String(envelope.Payload);
        var hmac = Convert.FromHexString(envelope.Hmac);
        try
        {
            if (!MonitoringProtocol.VerifyHmac("BATMON-HISTORY-V1", nonce, payload, hmac, monitoringIdentityKey))
                throw new MonitoringIdentityException("Unauthenticated history data rejected.");
            var history = JsonSerializer.Deserialize<DeviceHistoryBatch>(payload, JsonOptions)
                ?? throw new MonitoringIdentityException("History payload missing.");
            if (!string.Equals(history.DeviceId, device.DeviceId, StringComparison.OrdinalIgnoreCase))
                throw new MonitoringIdentityException("History belongs to a different device.");
            return history;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(payload);
            CryptographicOperations.ZeroMemory(hmac);
        }
    }
}
