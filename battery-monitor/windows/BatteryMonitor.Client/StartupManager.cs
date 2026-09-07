using Microsoft.Win32;

namespace BatteryMonitor.Client;

internal static class StartupManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "BatteryMonitorClient";

    public static bool IsEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false);
            var value = key?.GetValue(ValueName) as string;
            if (string.IsNullOrWhiteSpace(value)) return false;

            var expected = BuildCommand();
            return string.Equals(value, expected, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    public static void SetEnabled(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, true)
            ?? throw new InvalidOperationException("Windows startup registry key could not be opened.");

        if (enabled)
            key.SetValue(ValueName, BuildCommand(), RegistryValueKind.String);
        else
            key.DeleteValue(ValueName, false);
    }

    private static string BuildCommand()
    {
        var exe = Application.ExecutablePath;
        return $"\"{exe}\" --startup";
    }
}
