using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class UsbSecurityInfoReader
{
    private const int BaudRate = 115200;

    public async Task<UsbSecurityInfo> ReadAsync(string portName, Action<string>? log = null, CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
            {
                NewLine = "\n",
                ReadTimeout = 250,
                WriteTimeout = 3000,
                DtrEnable = false,
                RtsEnable = false,
                Handshake = Handshake.None
            };
            port.Open();
            log?.Invoke($"Opened {port.PortName}; waiting for security-state query...");
            SleepWithCancellation(TimeSpan.FromMilliseconds(1800), cancellationToken);
            try { port.DiscardInBuffer(); } catch { }
            try { port.DiscardOutBuffer(); } catch { }

            var pong = Send(port, "BATMON1 PING", log, cancellationToken, TimeSpan.FromSeconds(2));
            const string pongPrefix = "BATMON1 OK PONG ";
            if (!pong.StartsWith(pongPrefix, StringComparison.Ordinal))
                throw new InvalidOperationException("The selected COM port did not respond as a Battery Monitor.");
            var pongParts = pong.Substring(pongPrefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (pongParts.Length < 2 || string.IsNullOrWhiteSpace(pongParts[0]))
                throw new InvalidOperationException("Battery Monitor returned an invalid PING identity response.");
            var deviceId = pongParts[0];

            return Parse(
                Send(port, "BATMON1 SECURITYINFO", log, cancellationToken, TimeSpan.FromSeconds(3)),
                deviceId);
        }, cancellationToken);
    }

    private static string Send(SerialPort port, string command, Action<string>? log, CancellationToken cancellationToken, TimeSpan timeout)
    {
        cancellationToken.ThrowIfCancellationRequested();
        log?.Invoke($"> {command}");
        port.Write(command + "\n");
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var line = port.ReadLine().Trim();
                if (line.Length == 0) continue;
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal)) { log?.Invoke($"  {line}"); continue; }
                log?.Invoke($"< {line}");
                return line;
            }
            catch (TimeoutException) { }
        }
        throw new TimeoutException($"Timed out waiting for Battery Monitor response on {port.PortName}.");
    }

    private static UsbSecurityInfo Parse(string response, string deviceId)
    {
        const string prefix = "BATMON1 OK SECURITYINFO ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
            throw new InvalidOperationException($"Unexpected security-state response: {response}");

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var token in response.Substring(prefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var equals = token.IndexOf('=');
            if (equals <= 0 || equals == token.Length - 1) continue;
            values[token[..equals]] = token[(equals + 1)..];
        }

        if (!values.TryGetValue("flash_encryption", out var encryption) || (encryption != "0" && encryption != "1"))
            throw new InvalidOperationException("Battery Monitor returned an invalid Flash Encryption state.");
        if (!values.TryGetValue("flash_mode", out var mode) || string.IsNullOrWhiteSpace(mode))
            throw new InvalidOperationException("Battery Monitor did not report its Flash Encryption mode.");
        if (!values.TryGetValue("secure_boot", out var secureBoot) || (secureBoot != "0" && secureBoot != "1"))
            throw new InvalidOperationException("Battery Monitor returned an invalid Secure Boot state.");
        if (!values.TryGetValue("firmware", out var firmware) || string.IsNullOrWhiteSpace(firmware))
            throw new InvalidOperationException("Battery Monitor did not report its firmware version.");
        if (!values.TryGetValue("release_sequence", out var sequenceText) || !uint.TryParse(sequenceText, out var releaseSequence) || releaseSequence == 0)
            throw new InvalidOperationException("Battery Monitor returned an invalid firmware release sequence.");

        bool sbv2EligibilityReported = values.ContainsKey("sbv2_coding_scheme") ||
                                       values.ContainsKey("sbv2_key_block_unused") ||
                                       values.ContainsKey("sbv2_efuse_eligible");
        int sbv2CodingScheme = -1;
        bool sbv2KeyBlockUnused = false;
        bool sbv2EfuseEligible = false;
        if (sbv2EligibilityReported)
        {
            if (!values.TryGetValue("sbv2_coding_scheme", out var codingText) || !int.TryParse(codingText, out sbv2CodingScheme) || sbv2CodingScheme < 0)
                throw new InvalidOperationException("Battery Monitor returned an invalid Secure Boot v2 eFuse coding scheme.");
            if (!values.TryGetValue("sbv2_key_block_unused", out var unusedText) || (unusedText != "0" && unusedText != "1"))
                throw new InvalidOperationException("Battery Monitor returned an invalid Secure Boot v2 key-block state.");
            if (!values.TryGetValue("sbv2_efuse_eligible", out var eligibleText) || (eligibleText != "0" && eligibleText != "1"))
                throw new InvalidOperationException("Battery Monitor returned an invalid Secure Boot v2 eFuse eligibility state.");
            sbv2KeyBlockUnused = unusedText == "1";
            sbv2EfuseEligible = eligibleText == "1";
        }

        return new UsbSecurityInfo
        {
            DeviceId = deviceId,
            FlashEncryptionEnabled = encryption == "1",
            FlashEncryptionMode = mode,
            SecureBootEnabled = secureBoot == "1",
            FirmwareVersion = firmware,
            ReleaseSequence = releaseSequence,
            SecureBootV2EligibilityReported = sbv2EligibilityReported,
            SecureBootV2CodingScheme = sbv2CodingScheme,
            SecureBootV2KeyBlockUnused = sbv2KeyBlockUnused,
            SecureBootV2EfuseEligible = sbv2EfuseEligible
        };
    }

    private static void SleepWithCancellation(TimeSpan duration, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Thread.Sleep(25);
        }
    }
}

internal sealed class UsbSecurityInfo
{
    public string DeviceId { get; init; } = "";
    public bool FlashEncryptionEnabled { get; init; }
    public string FlashEncryptionMode { get; init; } = "";
    public bool SecureBootEnabled { get; init; }
    public string FirmwareVersion { get; init; } = "";
    public uint ReleaseSequence { get; init; }
    public bool SecureBootV2EligibilityReported { get; init; }
    public int SecureBootV2CodingScheme { get; init; } = -1;
    public bool SecureBootV2KeyBlockUnused { get; init; }
    public bool SecureBootV2EfuseEligible { get; init; }

    public bool ProductionFlashEncryptionReady =>
        FlashEncryptionEnabled && FlashEncryptionMode.Equals("release", StringComparison.OrdinalIgnoreCase);
}
