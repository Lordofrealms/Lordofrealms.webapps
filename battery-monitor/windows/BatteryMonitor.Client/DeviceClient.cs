using System.Globalization;
using System.Net.Http.Json;

namespace BatteryMonitor.Client;

public sealed class DeviceClient
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(4) };

    private static Uri BaseUri(MonitorEntry d) => new($"http://{d.Address}:{d.Port}/");

    public async Task<DeviceStatus> GetStatusAsync(MonitorEntry device, CancellationToken cancellationToken = default)
    {
        var uri = new Uri(BaseUri(device), "api/status");
        var status = await _http.GetFromJsonAsync<DeviceStatus>(uri, cancellationToken)
            ?? throw new InvalidOperationException("Device returned an empty status response.");
        return status;
    }

    public async Task<DeviceStatus> ApplyConfigAsync(MonitorEntry device, CancellationToken cancellationToken = default)
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
        using var response = await _http.PostAsync(new Uri(BaseUri(device), "api/config"), content, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Device rejected settings: {text}");
        return await GetStatusAsync(device, cancellationToken);
    }

    public async Task ResetWifiAsync(MonitorEntry device, CancellationToken cancellationToken = default)
    {
        using var response = await _http.PostAsync(new Uri(BaseUri(device), "api/reset-wifi"), new StringContent(""), cancellationToken);
        response.EnsureSuccessStatusCode();
    }
}
