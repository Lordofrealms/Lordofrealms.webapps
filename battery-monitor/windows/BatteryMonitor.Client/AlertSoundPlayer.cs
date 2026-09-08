using System.Media;
using System.Runtime.InteropServices;
using System.Text;

namespace BatteryMonitor.Client;

internal sealed record AlertSoundChoice(string Text, string Id)
{
    public override string ToString() => Text;
}

internal static class AlertSoundCatalog
{
    public static readonly AlertSoundChoice[] Choices =
    [
        new("Subtle tone", "builtin:subtle"),
        new("Warning", "builtin:warning"),
        new("Urgent", "builtin:urgent"),
        new("Critical alarm", "builtin:critical"),
        new("Recovery chime", "builtin:recovery"),
        new("Custom MP3 / WAV", "custom")
    ];

    public static string FriendlyName(string id) =>
        Choices.FirstOrDefault(c => string.Equals(c.Id, id, StringComparison.OrdinalIgnoreCase))?.Text
        ?? id;
}

internal static class AlertSoundPlayer
{
    private static readonly object Gate = new();
    private static SoundPlayer? _player;
    private static MemoryStream? _stream;
    private const string MciAlias = "batmon_alert";

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    private static extern int mciSendString(string command, StringBuilder? returnValue, int returnLength, IntPtr callback);

    public static void Play(AlertProfile profile)
    {
        if (!profile.Enabled || profile.VolumePercent <= 0) return;
        profile.Normalize();

        lock (Gate)
        {
            StopLocked();

            if (string.Equals(profile.SoundId, "custom", StringComparison.OrdinalIgnoreCase))
            {
                if (TryPlayCustom(profile.CustomSoundPath, profile.VolumePercent)) return;
                PlayBuiltInLocked("builtin:warning", profile.VolumePercent);
                return;
            }

            PlayBuiltInLocked(profile.SoundId, profile.VolumePercent);
        }
    }

    public static void Stop()
    {
        lock (Gate) StopLocked();
    }

    private static void StopLocked()
    {
        try { _player?.Stop(); } catch { }
        _player?.Dispose();
        _player = null;
        _stream?.Dispose();
        _stream = null;
        try { mciSendString($"close {MciAlias}", null, 0, IntPtr.Zero); } catch { }
    }

    private static bool TryPlayCustom(string path, int volumePercent)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path) || path.Contains('"')) return false;
        var ext = Path.GetExtension(path);
        if (!string.Equals(ext, ".mp3", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(ext, ".wav", StringComparison.OrdinalIgnoreCase))
            return false;

        var open = mciSendString($"open \"{path}\" alias {MciAlias}", null, 0, IntPtr.Zero);
        if (open != 0) return false;

        mciSendString($"setaudio {MciAlias} volume to {Math.Clamp(volumePercent, 0, 100) * 10}", null, 0, IntPtr.Zero);
        var play = mciSendString($"play {MciAlias}", null, 0, IntPtr.Zero);
        if (play == 0) return true;

        mciSendString($"close {MciAlias}", null, 0, IntPtr.Zero);
        return false;
    }

    private static void PlayBuiltInLocked(string soundId, int volumePercent)
    {
        var pattern = soundId.ToLowerInvariant() switch
        {
            "builtin:subtle" => new[] { (660.0, 120), (0.0, 60) },
            "builtin:urgent" => new[] { (900.0, 180), (0.0, 90), (900.0, 180), (0.0, 90), (900.0, 220) },
            "builtin:critical" => new[] { (1080.0, 180), (760.0, 180), (1080.0, 180), (760.0, 180), (1080.0, 260) },
            "builtin:recovery" => new[] { (520.0, 140), (660.0, 140), (820.0, 220) },
            _ => new[] { (760.0, 160), (0.0, 80), (760.0, 220) }
        };

        var wav = BuildPcmWave(pattern, volumePercent);
        _stream = new MemoryStream(wav, writable: false);
        _player = new SoundPlayer(_stream);
        _player.Load();
        _player.Play();
    }

    private static byte[] BuildPcmWave((double Frequency, int Milliseconds)[] pattern, int volumePercent)
    {
        const int sampleRate = 22050;
        const short channels = 1;
        const short bitsPerSample = 16;
        var amplitude = short.MaxValue * 0.28 * (Math.Clamp(volumePercent, 0, 100) / 100.0);

        using var pcm = new MemoryStream();
        using (var bw = new BinaryWriter(pcm, Encoding.ASCII, leaveOpen: true))
        {
            foreach (var (frequency, milliseconds) in pattern)
            {
                var count = Math.Max(1, sampleRate * milliseconds / 1000);
                for (var i = 0; i < count; i++)
                {
                    short sample = 0;
                    if (frequency > 0)
                    {
                        var envelope = Math.Min(1.0, i / (sampleRate * 0.01));
                        var tail = Math.Min(1.0, (count - i) / (sampleRate * 0.015));
                        var value = Math.Sin(2.0 * Math.PI * frequency * i / sampleRate) * amplitude * envelope * tail;
                        sample = (short)Math.Clamp((int)value, short.MinValue, short.MaxValue);
                    }
                    bw.Write(sample);
                }
            }
        }

        var data = pcm.ToArray();
        using var output = new MemoryStream();
        using (var bw = new BinaryWriter(output, Encoding.ASCII, leaveOpen: true))
        {
            var byteRate = sampleRate * channels * bitsPerSample / 8;
            var blockAlign = (short)(channels * bitsPerSample / 8);
            bw.Write(Encoding.ASCII.GetBytes("RIFF"));
            bw.Write(36 + data.Length);
            bw.Write(Encoding.ASCII.GetBytes("WAVE"));
            bw.Write(Encoding.ASCII.GetBytes("fmt "));
            bw.Write(16);
            bw.Write((short)1);
            bw.Write(channels);
            bw.Write(sampleRate);
            bw.Write(byteRate);
            bw.Write(blockAlign);
            bw.Write(bitsPerSample);
            bw.Write(Encoding.ASCII.GetBytes("data"));
            bw.Write(data.Length);
            bw.Write(data);
        }
        return output.ToArray();
    }
}
