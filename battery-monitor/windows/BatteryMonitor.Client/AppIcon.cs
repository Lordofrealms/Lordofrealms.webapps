using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace BatteryMonitor.Client;

internal enum AppIconState
{
    Green,
    Yellow,
    Red,
    Gray,
    Security
}

internal static class AppIcon
{
    // The shipped icon deliberately uses three flat colors: dark background,
    // white outline/lightning, and this green battery fill. Status rendering
    // changes only the fill pixels so the icon itself remains recognizable.
    private static readonly Color OriginalFill = Color.FromArgb(58, 190, 112);
    private static readonly Color Background = Color.FromArgb(30, 44, 63);
    private static readonly Icon _base = Load();
    private static readonly IReadOnlyDictionary<AppIconState, Icon> _statusIcons =
        new Dictionary<AppIconState, Icon>
        {
            [AppIconState.Green] = CreateBatteryStatus(Color.FromArgb(36, 166, 84), 1.00),
            [AppIconState.Yellow] = CreateBatteryStatus(Color.FromArgb(230, 169, 0), 0.58),
            [AppIconState.Red] = CreateBatteryStatus(Color.FromArgb(211, 47, 47), 0.25),
            [AppIconState.Gray] = CreateBatteryStatus(Color.FromArgb(117, 117, 117), 0.00),
            [AppIconState.Security] = CreateBatteryStatus(Color.FromArgb(117, 117, 117), 0.00, securityOverlay: true)
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

    private static Icon CreateBatteryStatus(Color fill, double fillFraction, bool securityOverlay = false)
    {
        try
        {
            using var source = _base.ToBitmap();
            using var output = new Bitmap(source.Width, source.Height);
            using (var graphics = Graphics.FromImage(output))
                graphics.DrawImageUnscaled(source, 0, 0);

            var fillPixels = new List<Point>();
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var pixel = source.GetPixel(x, y);
                    if (pixel.A == 255 && pixel.R == OriginalFill.R && pixel.G == OriginalFill.G && pixel.B == OriginalFill.B)
                        fillPixels.Add(new Point(x, y));
                }
            }

            if (fillPixels.Count > 0)
            {
                var minX = fillPixels.Min(p => p.X);
                var maxX = fillPixels.Max(p => p.X);
                fillFraction = Math.Clamp(fillFraction, 0.0, 1.0);
                var width = maxX - minX + 1;
                var filledColumns = (int)Math.Ceiling(width * fillFraction);
                var fillThroughX = minX + filledColumns - 1;

                foreach (var point in fillPixels)
                    output.SetPixel(point.X, point.Y, point.X <= fillThroughX && filledColumns > 0 ? fill : Background);
            }

            if (securityOverlay)
            {
                using var graphics = Graphics.FromImage(output);
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using var red = new SolidBrush(Color.FromArgb(211, 47, 47));
                using var white = new SolidBrush(Color.White);
                graphics.FillEllipse(red, output.Width - 12, 1, 11, 11);
                using var font = new Font(FontFamily.GenericSansSerif, 7f, FontStyle.Bold, GraphicsUnit.Pixel);
                graphics.DrawString("!", font, white, output.Width - 9.5f, 1.1f);
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
