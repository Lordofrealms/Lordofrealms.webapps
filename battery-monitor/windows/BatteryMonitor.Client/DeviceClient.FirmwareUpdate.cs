using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace BatteryMonitor.Client;

public sealed partial class DeviceClient
{
    private const int HostLanFirmwareChunkLimit = 4096;

    public async Task<string> UpdateFirmwareOverLanAsync(
        MonitorEntry device,
        string devicePassword,
        string firmwarePath,
        string signaturePath,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        FirmwareSignatureVerifier.VerifyOrThrow(firmwarePath, signaturePath);

        var firmwareInfo = new FileInfo(firmwarePath);
        if (!firmwareInfo.Exists || firmwareInfo.Length < 1024)
            throw new InvalidOperationException("Firmware application image is missing or too small.");

        byte[] signature = File.ReadAllBytes(signaturePath);
        byte[] digest;
        using (var firmwareForHash = new FileStream(firmwarePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            digest = await SHA256.HashDataAsync(firmwareForHash, cancellationToken);

        ManagementSession? session = null;
        bool updateStarted = false;
        using var firmwareHttp = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        try
        {
            var caps = await GetLanFirmwareCapsAsync(firmwareHttp, device, cancellationToken);
            if (!string.Equals(caps.Protocol, "SIGNED_LAN_OTA_V1", StringComparison.Ordinal))
                throw new InvalidOperationException($"Battery Monitor returned unsupported LAN firmware protocol '{caps.Protocol}'.");
            if (!string.Equals(caps.SignatureAlgorithm, FirmwareSignatureVerifier.Algorithm, StringComparison.Ordinal))
                throw new InvalidOperationException($"Battery Monitor requires unsupported firmware signature algorithm '{caps.SignatureAlgorithm}'.");
            if (caps.MaxChunk < 256)
                throw new InvalidOperationException("Battery Monitor returned an invalid LAN firmware chunk limit.");

            log?.Invoke($"Authenticating to {device.DisplayName} ({device.Address}) for signed Wi-Fi OTA...");
            session = await AuthenticateAsync(device, devicePassword, cancellationToken);

            var digestHex = Convert.ToHexString(digest).ToLowerInvariant();
            var signatureBase64 = Convert.ToBase64String(signature);
            var beginValues = new Dictionary<string, string>
            {
                ["size"] = firmwareInfo.Length.ToString(CultureInfo.InvariantCulture),
                ["sha256"] = digestHex,
                ["signature"] = signatureBase64
            };
            using (var beginContent = new FormUrlEncodedContent(beginValues))
            using (var beginResponse = await SendLanFirmwareAuthorizedAsync(
                       firmwareHttp, device, "api/firmware/begin", beginContent, session, cancellationToken))
            {
                var beginText = await beginResponse.Content.ReadAsStringAsync(cancellationToken);
                if (!beginResponse.IsSuccessStatusCode)
                    throw FirmwareLanError("start", beginText, beginResponse.StatusCode);
                var begin = JsonSerializer.Deserialize<LanFirmwareBeginReply>(beginText, JsonOptions)
                            ?? throw new InvalidOperationException("Battery Monitor returned an invalid LAN firmware-start response.");
                if (!begin.Ok || !string.Equals(begin.Protocol, "SIGNED_LAN_OTA_V1", StringComparison.Ordinal))
                    throw new InvalidOperationException("Battery Monitor did not accept the signed LAN firmware transfer.");
                if (begin.MaxChunk > 0) caps.MaxChunk = Math.Min(caps.MaxChunk, begin.MaxChunk);
            }
            updateStarted = true;

            var chunkSize = Math.Min(HostLanFirmwareChunkLimit, caps.MaxChunk);
            log?.Invoke($"Starting signed Wi-Fi OTA: {firmwareInfo.Length:N0} bytes, SHA-256 {digestHex}, chunk {chunkSize:N0} bytes.");

            using var firmware = new FileStream(firmwarePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            var buffer = new byte[chunkSize];
            long sent = 0;
            var nextProgress = 5;
            try
            {
                while (sent < firmwareInfo.Length)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var wanted = (int)Math.Min(buffer.Length, firmwareInfo.Length - sent);
                    var count = 0;
                    while (count < wanted)
                    {
                        var read = await firmware.ReadAsync(buffer.AsMemory(count, wanted - count), cancellationToken);
                        if (read <= 0) throw new EndOfStreamException("Firmware image ended before its declared size.");
                        count += read;
                    }

                    var encoded = Convert.ToBase64String(buffer, 0, count);
                    var chunkValues = new Dictionary<string, string>
                    {
                        ["offset"] = sent.ToString(CultureInfo.InvariantCulture),
                        ["data"] = encoded
                    };
                    using var chunkContent = new FormUrlEncodedContent(chunkValues);
                    using var chunkResponse = await SendLanFirmwareAuthorizedAsync(
                        firmwareHttp, device, "api/firmware/chunk", chunkContent, session, cancellationToken);
                    var chunkText = await chunkResponse.Content.ReadAsStringAsync(cancellationToken);
                    if (!chunkResponse.IsSuccessStatusCode)
                        throw FirmwareLanError("chunk write", chunkText, chunkResponse.StatusCode);

                    var reply = JsonSerializer.Deserialize<LanFirmwareChunkReply>(chunkText, JsonOptions)
                                ?? throw new InvalidOperationException("Battery Monitor returned an invalid LAN firmware-chunk response.");
                    var expectedWritten = sent + count;
                    if (!reply.Ok || reply.Written != expectedWritten)
                        throw new InvalidOperationException($"Battery Monitor LAN OTA acknowledgement mismatch: expected {expectedWritten}, got {reply.Written}.");
                    sent = reply.Written;

                    var percent = (int)(sent * 100L / firmwareInfo.Length);
                    if (percent >= nextProgress || sent == firmwareInfo.Length)
                    {
                        log?.Invoke($"Wi-Fi firmware transfer {percent}% ({sent:N0}/{firmwareInfo.Length:N0} bytes).");
                        while (nextProgress <= percent) nextProgress += 5;
                    }
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(buffer);
            }

            using var endContent = new StringContent(string.Empty);
            using var endResponse = await SendLanFirmwareAuthorizedAsync(
                firmwareHttp, device, "api/firmware/end", endContent, session, cancellationToken);
            var endText = await endResponse.Content.ReadAsStringAsync(cancellationToken);
            if (!endResponse.IsSuccessStatusCode)
                throw FirmwareLanError("verification/finalization", endText, endResponse.StatusCode);

            var end = JsonSerializer.Deserialize<LanFirmwareEndReply>(endText, JsonOptions)
                      ?? throw new InvalidOperationException("Battery Monitor returned an invalid LAN firmware-finalization response.");
            if (!end.Ok || !end.Verified || string.IsNullOrWhiteSpace(end.Version))
                throw new InvalidOperationException("Battery Monitor did not confirm signed LAN firmware verification.");

            updateStarted = false;
            log?.Invoke($"Device independently verified the production signature and selected encrypted OTA firmware {end.Version}; reboot is scheduled.");
            return end.Version;
        }
        catch
        {
            if (updateStarted && session is not null)
            {
                try
                {
                    using var abortContent = new StringContent(string.Empty);
                    using var abortResponse = await SendLanFirmwareAuthorizedAsync(
                        firmwareHttp, device, "api/firmware/abort", abortContent, session, CancellationToken.None);
                    log?.Invoke(abortResponse.IsSuccessStatusCode
                        ? "Interrupted Wi-Fi OTA was aborted; current firmware remains selected."
                        : "Wi-Fi OTA abort was not acknowledged; incomplete transfer still cannot select the new OTA slot.");
                }
                catch
                {
                    log?.Invoke("Wi-Fi OTA connection was lost before abort acknowledgement; incomplete transfer cannot select the new OTA slot.");
                }
            }
            throw;
        }
        finally
        {
            if (session is not null) CryptographicOperations.ZeroMemory(session.ManagementKey);
            CryptographicOperations.ZeroMemory(signature);
            CryptographicOperations.ZeroMemory(digest);
        }
    }

    private static async Task<LanFirmwareCapsReply> GetLanFirmwareCapsAsync(
        HttpClient http,
        MonitorEntry device,
        CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(new Uri(BaseUri(device), "api/firmware/caps"), cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw FirmwareLanError("capability query", text, response.StatusCode);
        return JsonSerializer.Deserialize<LanFirmwareCapsReply>(text, JsonOptions)
               ?? throw new InvalidOperationException("Battery Monitor returned invalid LAN firmware capabilities.");
    }

    private static async Task<HttpResponseMessage> SendLanFirmwareAuthorizedAsync(
        HttpClient http,
        MonitorEntry device,
        string relativePath,
        HttpContent content,
        ManagementSession session,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(BaseUri(device), relativePath))
        {
            Content = content
        };
        request.Headers.Add("X-Batmon-Session", session.SessionToken);
        request.Headers.Add("X-Batmon-CSRF", session.CsrfToken);
        request.Headers.CacheControl = new CacheControlHeaderValue { NoCache = true, NoStore = true };
        return await http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
    }

    private static Exception FirmwareLanError(string operation, string responseText, System.Net.HttpStatusCode statusCode)
    {
        try
        {
            var error = JsonSerializer.Deserialize<LanFirmwareErrorReply>(responseText, JsonOptions);
            if (!string.IsNullOrWhiteSpace(error?.Error))
                return new InvalidOperationException($"Battery Monitor rejected LAN firmware {operation}: {error.Error}");
        }
        catch (JsonException) { }
        return new InvalidOperationException($"Battery Monitor LAN firmware {operation} failed with HTTP {(int)statusCode}: {responseText}");
    }

    private sealed class LanFirmwareCapsReply
    {
        public string Protocol { get; set; } = "";
        public int MaxChunk { get; set; }
        public string SignatureAlgorithm { get; set; } = "";
        public string FirmwareVersion { get; set; } = "";
    }

    private sealed class LanFirmwareBeginReply
    {
        public bool Ok { get; set; }
        public string Protocol { get; set; } = "";
        public int MaxChunk { get; set; }
    }

    private sealed class LanFirmwareChunkReply
    {
        public bool Ok { get; set; }
        public long Written { get; set; }
    }

    private sealed class LanFirmwareEndReply
    {
        public bool Ok { get; set; }
        public bool Verified { get; set; }
        public string Version { get; set; } = "";
        public bool Rebooting { get; set; }
    }

    private sealed class LanFirmwareErrorReply
    {
        public bool Ok { get; set; }
        public string Error { get; set; } = "";
    }
}
