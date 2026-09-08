using System.Security.Cryptography;

namespace BatteryMonitor.Client;

internal static class AdminSecurity
{
    // The Advanced Tools credential is developer-controlled and preconfigured.
    // Only the PBKDF2 verifier and random salt are compiled into the client;
    // the plaintext credential is never stored in source, resources, or the EXE.
    private const int Iterations = 600_000;
    private const string BuiltInSaltBase64 = "tYZnc9jXSxrJcLFXjxEmpA==";
    private const string BuiltInHashBase64 = "ZMqltiROh8GBiI3UIKoNkRCAzY9kG6G6XP3zqquiwV0=";

    private static int _failedAttempts;
    private static DateTime _blockedUntilUtc = DateTime.MinValue;

    public static bool Authenticate(IWin32Window owner)
    {
        var now = DateTime.UtcNow;
        if (_blockedUntilUtc > now)
        {
            var remaining = (int)Math.Ceiling((_blockedUntilUtc - now).TotalSeconds);
            MessageBox.Show(owner,
                $"Advanced Tools authentication is temporarily locked after repeated failures. Try again in about {remaining} seconds.",
                "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        using var prompt = new PasswordPromptForm(
            "Advanced Tools",
            "Enter the preconfigured Advanced Tools password.");
        if (prompt.ShowDialog(owner) != DialogResult.OK) return false;

        if (Verify(prompt.Password))
        {
            _failedAttempts = 0;
            _blockedUntilUtc = DateTime.MinValue;
            return true;
        }

        RecordFailure();
        MessageBox.Show(owner, "Incorrect Advanced Tools password.",
            "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    private static bool Verify(string password)
    {
        byte[]? expected = null;
        byte[]? actual = null;
        try
        {
            var salt = Convert.FromBase64String(BuiltInSaltBase64);
            expected = Convert.FromBase64String(BuiltInHashBase64);
            actual = Rfc2898DeriveBytes.Pbkdf2(
                password,
                salt,
                Iterations,
                HashAlgorithmName.SHA256,
                expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
        finally
        {
            if (expected is not null) CryptographicOperations.ZeroMemory(expected);
            if (actual is not null) CryptographicOperations.ZeroMemory(actual);
        }
    }

    private static void RecordFailure()
    {
        if (_failedAttempts < 250) _failedAttempts++;
        if (_failedAttempts < 5) return;

        var step = Math.Min(_failedAttempts - 5, 4);
        var seconds = 30 * (1 << step); // 30, 60, 120, 240, 480 seconds.
        _blockedUntilUtc = DateTime.UtcNow.AddSeconds(seconds);
    }

    private sealed class PasswordPromptForm : Form
    {
        private readonly TextBox _password = new() { UseSystemPasswordChar = true, Width = 280 };
        public string Password => _password.Text;

        public PasswordPromptForm(string title, string message)
        {
            Text = title;
            Icon = AppIcon.Current;
            Width = 430;
            Height = 205;
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(14),
                ColumnCount = 1,
                AutoSize = true
            };
            root.Controls.Add(new Label { Text = message, AutoSize = true, MaximumSize = new Size(380, 0) });
            root.Controls.Add(new Label { Text = "Password", AutoSize = true, Margin = new Padding(3, 10, 3, 0) });
            root.Controls.Add(_password);

            var buttons = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.RightToLeft,
                Dock = DockStyle.Fill
            };
            var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
            var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, AutoSize = true };
            buttons.Controls.Add(cancel);
            buttons.Controls.Add(ok);
            root.Controls.Add(buttons);

            Controls.Add(root);
            AcceptButton = ok;
            CancelButton = cancel;
        }
    }
}
