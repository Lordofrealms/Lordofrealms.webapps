using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed class DiscoveryService : IDisposable
{
    private const int DiscoveryPort = 4210;
    private static readonly byte[] Request = Encoding.ASCII.GetBytes("BATMON_DISCOVER_V1\n");
    private readonly UdpClient _udp = new(new IPEndPoint(IPAddress.Any, 0));
    private readonly CancellationTokenSource _cts = new();

    public event Action<DiscoveredDevice>? DeviceDiscovered;

    public DiscoveryService()
    {
        _udp.EnableBroadcast = true;
        _ = ReceiveLoopAsync(_cts.Token);
    }

    public async Task DiscoverAsync()
    {
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
            try { await _udp.SendAsync(Request, Request.Length, new IPEndPoint(address, DiscoveryPort)); }
            catch (SocketException) { }
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var result = await _udp.ReceiveAsync(token);
                var json = Encoding.UTF8.GetString(result.Buffer);
                var device = JsonSerializer.Deserialize<DiscoveredDevice>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (device is null || device.Protocol != "BATMON_DISCOVERY_V1" || string.IsNullOrWhiteSpace(device.DeviceId)) continue;
                if (string.IsNullOrWhiteSpace(device.Ip)) device.Ip = result.RemoteEndPoint.Address.ToString();
                DeviceDiscovered?.Invoke(device);
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
