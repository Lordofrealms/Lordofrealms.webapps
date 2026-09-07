using System.Security.Cryptography;
using System.Text.Json;

namespace BatteryMonitor.Client;

internal static class AdminSecurity
{
    private const int Iterations = 250_000;
    private static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatteryMonitor");
    private static readonly string CredentialPath = Path.Combine(DirectoryPath, "admin-auth.json");

    public static bool Authenticate(IWin32Window owner)
    {
        Directory.CreateDirectory(DirectoryPath);
        if (!File.Exists(CredentialPath)) return CreatePassword(owner);

        AdminCredential? credential;
        try { credential = JsonSerializer.Deserialize<AdminCredential>(File.ReadAllText(CredentialPath)); }
        catch { credential = null; }
        if (credential is null || credential.Version != 1) {
            MessageBox.Show(owner, "The local advanced-tools password record is invalid. Remove admin-auth.json from the BatteryMonitor local-data folder to initialize it again.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }

        using var prompt = new PasswordPromptForm("Advanced Tools", "Enter the local administrator password.", confirmPassword: false);
        if (prompt.ShowDialog(owner) != DialogResult.OK) return false;
        return Verify(prompt.Password, credential, owner);
    }

    private static bool CreatePassword(IWin32Window owner)
    {
        using var prompt = new PasswordPromptForm("Initialize Advanced Tools", "Create a local password that protects provisioning-code generation/rotation and firmware flashing on this Windows account.", confirmPassword: true);
        if (prompt.ShowDialog(owner) != DialogResult.OK) return false;
        if (prompt.Password.Length < 8) {
            MessageBox.Show(owner, "Use at least 8 characters for the advanced-tools password.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return CreatePassword(owner);
        }
        if (!string.Equals(prompt.Password, prompt.Confirmation, StringComparison.Ordinal)) {
            MessageBox.Show(owner, "The two passwords did not match.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return CreatePassword(owner);
        }

        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(prompt.Password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        var credential = new AdminCredential
        {
            Version = 1,
            Iterations = Iterations,
            Salt = Convert.ToBase64String(salt),
            Hash = Convert.ToBase64String(hash)
        };
        File.WriteAllText(CredentialPath, JsonSerializer.Serialize(credential, new JsonSerializerOptions { WriteIndented = true }));
        return true;
    }

    private static bool Verify(string password, AdminCredential credential, IWin32Window owner)
    {
        try
        {
            var salt = Convert.FromBase64String(credential.Salt);
            var expected = Convert.FromBase64String(credential.Hash);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, credential.Iterations, HashAlgorithmName.SHA256, expected.Length);
            if (CryptographicOperations.FixedTimeEquals(actual, expected)) return true;
        }
        catch { }
        MessageBox.Show(owner, "Incorrect advanced-tools password.", "Battery Monitor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    private sealed class AdminCredential
    {
        public int Version { get; set; }
        public int Iterations { get; set; }
        public string Salt { get; set; } = "";
        public string Hash { get; set; } = "";
    }

    private sealed class PasswordPromptForm : Form
    {
        private readonly TextBox _password = new() { UseSystemPasswordChar = true, Width = 280 };
        private readonly TextBox _confirmation = new() { UseSystemPasswordChar = true, Width = 280 };
        public string Password => _password.Text;
        public string Confirmation => _confirmation.Text;

        public PasswordPromptForm(string title, string message, bool confirmPassword)
        {
            Text = title;
            Width = 430;
            Height = confirmPassword ? 245 : 205;
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 1, AutoSize = true };
            root.Controls.Add(new Label { Text = message, AutoSize = true, MaximumSize = new Size(380, 0) });
            root.Controls.Add(new Label { Text = "Password", AutoSize = true, Margin = new Padding(3, 10, 3, 0) });
            root.Controls.Add(_password);
            if (confirmPassword) {
                root.Controls.Add(new Label { Text = "Confirm password", AutoSize = true, Margin = new Padding(3, 8, 3, 0) });
                root.Controls.Add(_confirmation);
            }
            var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
            var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
            var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, AutoSize = true };
            buttons.Controls.Add(cancel); buttons.Controls.Add(ok); root.Controls.Add(buttons);
            Controls.Add(root);
            AcceptButton = ok; CancelButton = cancel;
        }
    }
}
