using System.Drawing;

namespace BatteryMonitor.Client;

internal static class AppIcon
{
    private static readonly Icon _current = Load();

    public static Icon Current => _current;

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
}
