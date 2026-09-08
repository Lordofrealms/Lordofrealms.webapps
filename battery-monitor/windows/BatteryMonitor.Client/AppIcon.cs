using System.Drawing;
using System.Runtime.InteropServices;

namespace BatteryMonitor.Client;

internal enum AppIconState
{
    Green,
    Yellow,
    Red,
    Gray
}

internal static class AppIcon
{
    private static readonly Icon _base = Load();
    private static readonly IReadOnlyDictionary<AppIconState, Icon> _statusIcons =
        new Dictionary<AppIconState, Icon>
        {
            [AppIconState.Green] = CreateTinted(Color.FromArgb(36, 166, 84)),
            [AppIconState.Yellow] = CreateTinted(Color.FromArgb(230, 169, 0)),
            [AppIconState.Red] = CreateTinted(Color.FromArgb(211, 47, 47)),
            [AppIconState.Gray] = CreateTinted(Color.FromArgb(117, 117, 117))
        };

    public static Icon Current => ForState(AppIconState.Green);

    public static Icon ForState(AppIconState state) =>
        _statusIcons.TryGetValue(state, out var icon) ? icon : _base;

    private static Icon Load()
    {
        try
        {
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            return SystemIcons.Application;
        }
    }

    private static Icon CreateTinted(Color tint)
    {
        try
        {
            using var source = _base.ToBitmap();
            using var output = new Bitmap(source.Width, source.Height);

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var pixel = source.GetPixel(x, y);
                    if (pixel.A == 0)
                    {
                        output.SetPixel(x, y, Color.Transparent);
                        continue;
                    }

                    var luminance = (0.2126 * pixel.R + 0.7152 * pixel.G + 0.0722 * pixel.B) / 255.0;
                    var factor = 0.38 + (0.62 * luminance);
                    output.SetPixel(x, y, Color.FromArgb(
                        pixel.A,
                        Math.Clamp((int)Math.Round(tint.R * factor), 0, 255),
                        Math.Clamp((int)Math.Round(tint.G * factor), 0, 255),
                        Math.Clamp((int)Math.Round(tint.B * factor), 0, 255)));
                }
            }

            var handle = output.GetHicon();
            try
            {
                using var temporary = Icon.FromHandle(handle);
                return (Icon)temporary.Clone();
            }
            finally
            {
                DestroyIcon(handle);
            }
        }
        catch
        {
            return _base;
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);
}
