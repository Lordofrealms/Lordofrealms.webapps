using System.Security.Cryptography;

namespace BatteryMonitor.Client;

internal sealed class FirmwareSignatureException : Exception
{
    public FirmwareSignatureException(string message) : base(message) { }
}

internal static class FirmwareSignatureVerifier
{
    public const string Algorithm = "RSA-3072-PSS-SHA256";
    public const string PublicKeySpkiSha256 = "69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e";
    private const int ExpectedSignatureLength = 384;

    // This public verification key is intentionally compiled into the client.
    // It is not secret. Do not replace it with a key loaded from beside the
    // firmware package: firmware and trust root must not be swappable together.
    private const string PublicKeyPem = """
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAkFyEmLUrfcb3Tv/gfErm
lwit36pmiPd8d1lohTlTtTGsma0b9HxCd/SVLghwy46DlqVIkxJtugxv5UCm57yT
fE3MpJ92AdT8e+I13DX6fef8p/qlw+LN+1QQYPgCWwyfyFdZb6rUeqLgfeVzsv7K
4Bg4JAetuaUmBAKaVBczF5gKNCj2NC3D/+xrLZmgY5lCl+/UyE5RUmQ7L1drZcnZ
n/udNm6628tPNYugFU1vLhgbnZs1HhlEns4TXM71531DmMIr3EDzgPZ7QmBpYD79
qtQOBSZfI/AHIpVVkTO3VqtfS4aFerzRK1TYNrs+u0mlCRwctVOIa3S66coSBIK7
QluYCcSXOKlYYt3rRF7EoVhbhMFQl0tp5L3zMj6z0tMnNx5/B/9NMdiugGJwYlYT
Gf0m0vCfiRRrgTSzRfsxPb+YT5y4deqfzT4Ehzw9kQvA9Ppj1ExArVA2W0ct4nih
JmnZvEvzUMCWlGTYOjYWIDjF+SBjo1wicB2VT21ihmRFAgMBAAE=
-----END PUBLIC KEY-----
""";

    static FirmwareSignatureVerifier()
    {
        using var rsa = CreateVerificationKey();
        var fingerprint = Convert.ToHexString(SHA256.HashData(rsa.ExportSubjectPublicKeyInfo())).ToLowerInvariant();
        if (!string.Equals(fingerprint, PublicKeySpkiSha256, StringComparison.Ordinal))
            throw new InvalidOperationException("Compiled Battery Monitor firmware verification key fingerprint is invalid.");
    }

    public static void VerifyOrThrow(string firmwarePath, string signaturePath)
    {
        if (!File.Exists(firmwarePath))
            throw new FirmwareSignatureException("Firmware image was not found.");
        if (!File.Exists(signaturePath))
            throw new FirmwareSignatureException("Required firmware signature is missing.");

        var signature = File.ReadAllBytes(signaturePath);
        try
        {
            if (signature.Length != ExpectedSignatureLength)
                throw new FirmwareSignatureException($"Firmware signature has invalid length ({signature.Length} bytes; expected {ExpectedSignatureLength}).");

            using var firmware = new FileStream(firmwarePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var rsa = CreateVerificationKey();
            if (!rsa.VerifyData(firmware, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                throw new FirmwareSignatureException("Firmware signature is invalid. Flashing was blocked.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(signature);
        }
    }

    // Release CI executes this against actual firmware/signature pairs before
    // packaging. It proves valid firmware passes while tampered firmware,
    // tampered signatures, and a different RSA key all fail.
    public static void RunSelfTest(string firmwarePath, string signaturePath)
    {
        VerifyOrThrow(firmwarePath, signaturePath);

        var firmware = File.ReadAllBytes(firmwarePath);
        var signature = File.ReadAllBytes(signaturePath);
        try
        {
            if (firmware.Length == 0 || signature.Length != ExpectedSignatureLength)
                throw new InvalidOperationException("Firmware signature self-test input is malformed.");

            firmware[firmware.Length / 2] ^= 0x01;
            using (var rsa = CreateVerificationKey())
            {
                if (rsa.VerifyData(firmware, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                    throw new InvalidOperationException("Firmware signature self-test failed: tampered firmware was accepted.");
            }
            firmware[firmware.Length / 2] ^= 0x01;

            signature[signature.Length / 2] ^= 0x01;
            using (var rsa = CreateVerificationKey())
            {
                if (rsa.VerifyData(firmware, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                    throw new InvalidOperationException("Firmware signature self-test failed: tampered signature was accepted.");
            }
            signature[signature.Length / 2] ^= 0x01;

            using var wrongKey = RSA.Create(3072);
            if (wrongKey.VerifyData(firmware, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                throw new InvalidOperationException("Firmware signature self-test failed: a different RSA key accepted the production signature.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(firmware);
            CryptographicOperations.ZeroMemory(signature);
        }
    }

    private static RSA CreateVerificationKey()
    {
        var rsa = RSA.Create();
        rsa.ImportFromPem(PublicKeyPem);
        if (rsa.KeySize != 3072)
        {
            rsa.Dispose();
            throw new InvalidOperationException("Battery Monitor firmware verification key is not RSA-3072.");
        }
        return rsa;
    }
}
