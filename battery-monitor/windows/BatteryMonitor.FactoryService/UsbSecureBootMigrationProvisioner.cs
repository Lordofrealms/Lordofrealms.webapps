using System.Globalization;
using System.IO.Ports;
using System.Security.Cryptography;

namespace BatteryMonitor.Client;

internal sealed class UsbSecureBootMigrationProvisioner
{
    private const int BaudRate = 115200;
    private const int HostChunkLimit = 4096;

    public async Task<SecureBootMigrationCapabilities> ReadCapabilitiesAsync(
        string portName,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmware(port, log, cancellationToken);
            EnsureBatteryMonitor(port, log, cancellationToken);
            var response = SendCommand(port, "BATMON1 SBMIGCAPS", log, cancellationToken, TimeSpan.FromSeconds(4));
            return ParseCapabilities(response);
        }, cancellationToken);
    }

    public async Task StageBootloaderAsync(
        string portName,
        string expectedDeviceId,
        string bootloaderPath,
        string signaturePath,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            FirmwareSignatureVerifier.VerifyOrThrow(bootloaderPath, signaturePath);
            var image = new FileInfo(bootloaderPath);
            if (!image.Exists || image.Length < 1024 || image.Length > 0xE000)
                throw new InvalidOperationException("Secure Boot migration bootloader is missing or does not fit the deployed primary bootloader region.");

            var signature = File.ReadAllBytes(signaturePath);
            byte[] digest;
            using (var source = new FileStream(bootloaderPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                digest = SHA256.HashData(source);

            SerialPort? port = null;
            bool migrationStarted = false;
            bool rawChunkInFlight = false;
            try
            {
                port = OpenPort(portName);
                WaitForFirmware(port, log, cancellationToken);
                var actualDeviceId = EnsureBatteryMonitor(port, log, cancellationToken);
                RequireDeviceIdentity(expectedDeviceId, actualDeviceId, "bootloader staging");
                var capsResponse = SendCommand(port, "BATMON1 SBMIGCAPS", log, cancellationToken, TimeSpan.FromSeconds(4));
                var caps = ParseCapabilities(capsResponse);
                if (!caps.Ready)
                    throw new InvalidOperationException("Secure Boot migration is not ready: " + caps.Status);

                var chunkSize = Math.Min(HostChunkLimit, caps.MaxChunkBytes);
                var digestHex = Convert.ToHexString(digest).ToLowerInvariant();
                var signatureBase64 = Convert.ToBase64String(signature);
                log?.Invoke($"Staging signed Secure Boot bootloader on {actualDeviceId}: {image.Length:N0} bytes, SHA-256 {digestHex}.");

                var begin = SendCommand(
                    port,
                    $"BATMON1 SBMIGBEGIN {image.Length.ToString(CultureInfo.InvariantCulture)} {digestHex} {signatureBase64}",
                    log,
                    cancellationToken,
                    TimeSpan.FromSeconds(30),
                    redactSignature: true);
                var expectedBegin = $"BATMON1 OK SBMIGBEGIN READY {caps.MaxChunkBytes.ToString(CultureInfo.InvariantCulture)}";
                if (!string.Equals(begin, expectedBegin, StringComparison.Ordinal))
                    ThrowProtocolError("Secure Boot migration start", begin);
                migrationStarted = true;

                using var stream = new FileStream(bootloaderPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                var buffer = new byte[chunkSize];
                long sent = 0;
                var nextProgress = 10;
                try
                {
                    while (sent < image.Length)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        var wanted = (int)Math.Min(buffer.Length, image.Length - sent);
                        var count = 0;
                        while (count < wanted)
                        {
                            var read = stream.Read(buffer, count, wanted - count);
                            if (read <= 0) throw new EndOfStreamException("Secure Boot bootloader ended before its declared size.");
                            count += read;
                        }

                        var ready = SendCommand(port, $"BATMON1 SBMIGCHUNK {count}", null, cancellationToken, TimeSpan.FromSeconds(5));
                        if (ready != $"BATMON1 OK SBMIGCHUNK READY {count}")
                            ThrowProtocolError("Secure Boot bootloader chunk preparation", ready);

                        rawChunkInFlight = true;
                        port.Write(buffer, 0, count);
                        var expectedTotal = sent + count;
                        var committed = ReadProtocolResponse(port, null, cancellationToken, TimeSpan.FromSeconds(10));
                        rawChunkInFlight = false;
                        if (committed != $"BATMON1 OK SBMIGCHUNK {expectedTotal.ToString(CultureInfo.InvariantCulture)}")
                            ThrowProtocolError("Secure Boot bootloader chunk write", committed);

                        sent = expectedTotal;
                        var percent = (int)(sent * 100L / image.Length);
                        if (percent >= nextProgress || sent == image.Length)
                        {
                            log?.Invoke($"Bootloader staging {percent}% ({sent:N0}/{image.Length:N0} bytes).");
                            while (nextProgress <= percent) nextProgress += 10;
                        }
                    }
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(buffer);
                }

                var finish = SendCommand(port, "BATMON1 SBMIGEND", log, cancellationToken, TimeSpan.FromSeconds(30));
                const string prefix = "BATMON1 OK SBMIGEND STAGED VERIFIED ";
                if (!finish.StartsWith(prefix, StringComparison.Ordinal))
                    ThrowProtocolError("Secure Boot bootloader stage verification", finish);
                if (!long.TryParse(finish.Substring(prefix.Length), NumberStyles.Integer, CultureInfo.InvariantCulture, out var stagedBytes) || stagedBytes != image.Length)
                    throw new InvalidOperationException("Battery Monitor reported an unexpected staged bootloader byte count.");

                migrationStarted = false; // verified staging intentionally remains armed on-device
                log?.Invoke($"Bootloader staged on {actualDeviceId}, detached-signature verified, and flash readback hash verified. Primary bootloader has NOT been modified yet.");
            }
            catch
            {
                if (migrationStarted && !rawChunkInFlight && port is { IsOpen: true })
                {
                    try { SendCommand(port, "BATMON1 SBMIGABORT", null, CancellationToken.None, TimeSpan.FromSeconds(3), throwOnTimeout: false); }
                    catch { }
                }
                throw;
            }
            finally
            {
                port?.Dispose();
                CryptographicOperations.ZeroMemory(signature);
                CryptographicOperations.ZeroMemory(digest);
            }
        }, cancellationToken);
    }

    public async Task CommitAsync(
        string portName,
        string expectedDeviceId,
        string expectedBootloaderSha256Hex,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        await Task.Run(() =>
        {
            using var port = OpenPort(portName);
            WaitForFirmware(port, log, cancellationToken);

            // This identity check deliberately happens in the same open serial
            // session as SBMIGCOMMIT. A COM-port reassignment/device swap cannot
            // pass an earlier host-side check and then receive the irreversible
            // command in a newly opened session.
            var actualDeviceId = EnsureBatteryMonitor(port, log, cancellationToken);
            RequireDeviceIdentity(expectedDeviceId, actualDeviceId, "irreversible Secure Boot commit");

            var capsResponse = SendCommand(port, "BATMON1 SBMIGCAPS", log, cancellationToken, TimeSpan.FromSeconds(4));
            var caps = ParseCapabilities(capsResponse);
            if (!caps.Ready)
                throw new InvalidOperationException("Secure Boot migration is no longer ready in the final commit session: " + caps.Status);

            log?.Invoke($"Issuing irreversible Secure Boot bootloader commit to {actualDeviceId}. DO NOT remove power during the primary bootloader copy.");
            var response = SendCommand(
                port,
                $"BATMON1 SBMIGCOMMIT {expectedBootloaderSha256Hex}",
                log,
                cancellationToken,
                TimeSpan.FromSeconds(45));
            if (!response.StartsWith("BATMON1 OK SBMIGCOMMIT COMMITTED REBOOT_REQUIRED", StringComparison.Ordinal))
                ThrowProtocolError("irreversible Secure Boot bootloader commit", response);
            log?.Invoke($"Primary bootloader copy completed successfully on {actualDeviceId}; device is rebooting into Secure Boot activation.");
        }, cancellationToken);
    }

    public async Task AbortAsync(
        string portName,
        string expectedDeviceId,
        Action<string>? log = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await Task.Run(() =>
            {
                using var port = OpenPort(portName);
                WaitForFirmware(port, log, cancellationToken);
                var actualDeviceId = EnsureBatteryMonitor(port, log, cancellationToken);
                RequireDeviceIdentity(expectedDeviceId, actualDeviceId, "migration abort");
                var response = SendCommand(port, "BATMON1 SBMIGABORT", log, cancellationToken, TimeSpan.FromSeconds(4), throwOnTimeout: false);
                if (!string.IsNullOrWhiteSpace(response)) log?.Invoke("Migration staging abort response: " + response);
            }, cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) { log?.Invoke("Could not explicitly abort staged migration: " + ex.Message); }
    }

    private static SecureBootMigrationCapabilities ParseCapabilities(string response)
    {
        const string prefix = "BATMON1 OK SBMIGCAPS ";
        if (!response.StartsWith(prefix, StringComparison.Ordinal))
        {
            if (response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
                return new SecureBootMigrationCapabilities { Ready = false, Status = response.Substring("BATMON1 ERR ".Length) };
            return new SecureBootMigrationCapabilities { Ready = false, Status = response.Length == 0 ? "No migration capability response." : response };
        }

        var value = response.Substring(prefix.Length).Trim();
        const string readyPrefix = "SECURE_BOOT_V2_MIGRATION_V1 ";
        if (!value.StartsWith(readyPrefix, StringComparison.Ordinal))
            return new SecureBootMigrationCapabilities { Ready = false, Status = value };

        var parts = value.Substring(readyPrefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 1 || !int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var maxChunk) || maxChunk < 256 || maxChunk > 16384)
            return new SecureBootMigrationCapabilities { Ready = false, Status = "Device returned invalid Secure Boot migration chunk capabilities." };
        return new SecureBootMigrationCapabilities { Ready = true, MaxChunkBytes = maxChunk, Status = value };
    }

    private static SerialPort OpenPort(string portName)
    {
        var port = new SerialPort(portName, BaudRate, Parity.None, 8, StopBits.One)
        {
            NewLine = "\n",
            ReadTimeout = 250,
            WriteTimeout = 5000,
            DtrEnable = false,
            RtsEnable = false,
            Handshake = Handshake.None
        };
        port.Open();
        return port;
    }

    private static void WaitForFirmware(SerialPort port, Action<string>? log, CancellationToken cancellationToken)
    {
        log?.Invoke($"Opened {port.PortName}; waiting for Battery Monitor firmware...");
        SleepWithCancellation(TimeSpan.FromMilliseconds(1800), cancellationToken);
        try { port.DiscardInBuffer(); } catch { }
        try { port.DiscardOutBuffer(); } catch { }
    }

    private static string EnsureBatteryMonitor(SerialPort port, Action<string>? log, CancellationToken cancellationToken)
    {
        string? last = null;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            last = SendCommand(port, "BATMON1 PING", log, cancellationToken, TimeSpan.FromSeconds(2), throwOnTimeout: false);
            const string prefix = "BATMON1 OK PONG ";
            if (last.StartsWith(prefix, StringComparison.Ordinal))
            {
                var parts = last.Substring(prefix.Length).Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2 && !string.IsNullOrWhiteSpace(parts[0])) return parts[0];
                throw new InvalidOperationException("Battery Monitor returned an invalid PING identity response.");
            }
            SleepWithCancellation(TimeSpan.FromMilliseconds(300), cancellationToken);
        }
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(last)
            ? "The selected COM port did not respond as a Battery Monitor."
            : "Unexpected Battery Monitor ping response: " + last);
    }

    private static void RequireDeviceIdentity(string expectedDeviceId, string actualDeviceId, string operation)
    {
        if (string.Equals(expectedDeviceId, actualDeviceId, StringComparison.Ordinal)) return;
        throw new InvalidOperationException(
            $"A different Battery Monitor is on the selected COM port during {operation}. Expected {expectedDeviceId}, found {actualDeviceId}. Operation blocked.");
    }

    private static string SendCommand(
        SerialPort port,
        string command,
        Action<string>? log,
        CancellationToken cancellationToken,
        TimeSpan timeout,
        bool throwOnTimeout = true,
        bool redactSignature = false)
    {
        cancellationToken.ThrowIfCancellationRequested();
        log?.Invoke("> " + (redactSignature ? RedactSignature(command) : command));
        port.Write(command + "\n");
        return ReadProtocolResponse(port, log, cancellationToken, timeout, throwOnTimeout);
    }

    private static string ReadProtocolResponse(SerialPort port, Action<string>? log, CancellationToken cancellationToken, TimeSpan timeout, bool throwOnTimeout = true)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var line = port.ReadLine().Trim();
                if (line.Length == 0) continue;
                if (!line.StartsWith("BATMON1 ", StringComparison.Ordinal)) { log?.Invoke("  " + line); continue; }
                log?.Invoke("< " + line);
                return line;
            }
            catch (TimeoutException) { }
        }
        if (throwOnTimeout) throw new TimeoutException($"Timed out waiting for Secure Boot migration response on {port.PortName}.");
        return "";
    }

    private static void ThrowProtocolError(string operation, string response)
    {
        if (response.StartsWith("BATMON1 ERR ", StringComparison.Ordinal))
            throw new InvalidOperationException($"Battery Monitor rejected {operation}: {response.Substring("BATMON1 ERR ".Length)}");
        throw new InvalidOperationException($"Unexpected Battery Monitor response during {operation}: {response}");
    }

    private static string RedactSignature(string command)
    {
        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length >= 5 ? $"{parts[0]} {parts[1]} {parts[2]} {parts[3]} <signature>" : "BATMON1 SBMIGBEGIN <metadata>";
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

internal sealed class SecureBootMigrationCapabilities
{
    public bool Ready { get; init; }
    public int MaxChunkBytes { get; init; }
    public string Status { get; init; } = "";
}
