using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed class DiscoveryService : IDisposable
{
    private const int DiscoveryPort = 4210;
    private static readonly byte[] LegacyRequest = Encoding.ASCII.GetBytes("BATMON_DISCOVER_V1\n");
    private readonly UdpClient _udp = new(new IPEndPoint(IPAddress.Any, 0));
    private readonly CancellationTokenSource _cts = new();
    private readonly Func<string, byte[]?> _monitoringKeyResolver;
    private readonly object _nonceSync = new();
    private readonly Dictionary<string, DateTime> _recentNonces = new(StringComparer.OrdinalIgnoreCase);

    public event Action<DiscoveredDevice>? DeviceDiscovered;

    public DiscoveryService(Func<string, byte[]?>? monitoringKeyResolver = null)
    {
        _monitoringKeyResolver = monitoringKeyResolver ?? (_ => null);
        _udp.EnableBroadcast = true;
        _ = ReceiveLoopAsync(_cts.Token);
    }

    public async Task DiscoverAsync()
    {
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        lock (_nonceSync)
        {
            var now = DateTime.UtcNow;
            foreach (var expired in _recentNonces.Where(p => p.Value <= now).Select(p => p.Key).ToArray())
                _recentNonces.Remove(expired);
            _recentNonces[nonce] = now.AddSeconds(15);
        }
        var authenticatedRequest = Encoding.ASCII.GetBytes($"BATMON_DISCOVER_V2 {nonce}\n");

        var endpoints = new HashSet<IPAddress> { IPAddress.Broadcast };
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            foreach (var uni in nic.GetIPProperties().UnicastAddresses)
            {
                if (uni.Address.AddressFamily != AddressFamily.InterNetwork || uni.IPv4Mask is null) continue;
                var ip = uni.Address.GetAddressBytes();
                var mask = uni.IPv4Mask.GetAddressBytes();
                var broadcast = new byte[4];
                for (var i = 0; i < 4; i++) broadcast[i] = (byte)(ip[i] | ~mask[i]);
                endpoints.Add(new IPAddress(broadcast));
            }
        }

        foreach (var address in endpoints)
        {
            var endpoint = new IPEndPoint(address, DiscoveryPort);
            try
            {
                await _udp.SendAsync(authenticatedRequest, authenticatedRequest.Length, endpoint);
                // V1 remains discovery-only compatibility for pre-P0-3 firmware.
                // It is never accepted as authenticated identity.
                await _udp.SendAsync(LegacyRequest, LegacyRequest.Length, endpoint);
            }
            catch (SocketException) { }
        }
    }

    private bool IsRecentNonce(string nonce)
    {
        lock (_nonceSync)
        {
            if (!_recentNonces.TryGetValue(nonce, out var expires) || expires <= DateTime.UtcNow) return false;
            return true;
        }
    }

    private DiscoveredDevice? ParseAuthenticatedDiscovery(string json, IPEndPoint remote)
    {
        AuthenticatedMonitorEnvelope? envelope;
        try { envelope = JsonSerializer.Deserialize<AuthenticatedMonitorEnvelope>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }
        catch { return null; }
        if (envelope is null || envelope.Protocol != "BATMON_DISCOVERY_V2" || !IsRecentNonce(envelope.Nonce)) return null;

        byte[] payload;
        try { payload = Convert.FromBase64String(envelope.Payload); }
        catch { return null; }
        try
        {
            var device = JsonSerializer.Deserialize<DiscoveredDevice>(payload, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (device is null || string.IsNullOrWhiteSpace(device.DeviceId)) return null;
            device.Protocol = envelope.Protocol;
            if (remote.Address.AddressFamily != AddressFamily.InterNetwork || device.Port < 1 || device.Port > 65535) return null;
            device.Ip = remote.Address.ToString();

            var key = _monitoringKeyResolver(device.DeviceId);
            if (key is null)
            {
                device.Authenticated = false;
                return device;
            }
            try
            {
                byte[] suppliedMac;
                try { suppliedMac = Convert.FromHexString(envelope.Hmac); }
                catch
                {
                    device.IdentityFailure = true;
                    return device;
                }
                try
                {
                    device.Authenticated = MonitoringProtocol.VerifyHmac("BATMON-DISCOVERY-V2", envelope.Nonce.ToLowerInvariant(), payload, suppliedMac, key);
                    device.IdentityFailure = !device.Authenticated;
                    return device;
                }
                finally { CryptographicOperations.ZeroMemory(suppliedMac); }
            }
            finally { CryptographicOperations.ZeroMemory(key); }
        }
        finally { CryptographicOperations.ZeroMemory(payload); }
    }

    private DiscoveredDevice? ParseLegacyDiscovery(string json, IPEndPoint remote)
    {
        DiscoveredDevice? device;
        try { device = JsonSerializer.Deserialize<DiscoveredDevice>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }
        catch { return null; }
        if (device is null || device.Protocol != "BATMON_DISCOVERY_V1" || string.IsNullOrWhiteSpace(device.DeviceId)) return null;
        if (remote.Address.AddressFamily != AddressFamily.InterNetwork || device.Port < 1 || device.Port > 65535) return null;
        device.Ip = remote.Address.ToString();
        device.Authenticated = false;
        return device;
    }

    private async Task ReceiveLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var result = await _udp.ReceiveAsync(token);
                var json = Encoding.UTF8.GetString(result.Buffer);
                DiscoveredDevice? device = json.Contains("BATMON_DISCOVERY_V2", StringComparison.Ordinal)
                    ? ParseAuthenticatedDiscovery(json, result.RemoteEndPoint)
                    : ParseLegacyDiscovery(json, result.RemoteEndPoint);
                if (device is not null) DeviceDiscovered?.Invoke(device);
            }
            catch (OperationCanceledException) { break; }
            catch { }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _udp.Dispose();
        _cts.Dispose();
    }
}
