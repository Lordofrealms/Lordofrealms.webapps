using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class SecureBootMigrationForm : Form
{
    private readonly UsbSecurityInfoReader _security = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly Label _hardware = ValueLabel();
    private readonly Label _flashEncryption = ValueLabel();
    private readonly Label _secureBoot = ValueLabel();
    private readonly Label _installed = ValueLabel();
    private readonly Label _bundle = ValueLabel();
    private readonly Label _eligibility = new() { AutoSize = true, MaximumSize = new Size(650, 0), Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold) };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
    private readonly Button _readiness = new() { Text = "Run Migration Readiness Check", AutoSize = true };
    private readonly Button _migrate = new() { Text = "Migrate This Unit to Secure Boot", AutoSize = true, Enabled = false };
    private CancellationTokenSource? _cts;
    private MigrationBundleInfo _bundleInfo = MigrationBundleInfo.Load();
    private bool _deviceEligible;

    public SecureBootMigrationForm()
    {
        Text = "Battery Monitor Factory - Secure Boot Migration";
        Icon = AppIcon.Current;
        Width = 850;
        Height = 690;
        MinimumSize = new Size(760, 610);
        StartPosition = FormStartPosition.CenterParent;
        BuildUi();
        RefreshPorts();
        RenderBundle();
        FormClosing += (_, _) => _cts?.Cancel();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 11 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 0; i < 9; i++) root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var intro = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(800, 0),
            Text = "Factory-only retrofit workflow for already-provisioned Battery Monitors. This does NOT change normal new-unit provisioning. The migration will eventually stage a Secure-Boot-v2-signed application first, then replace the encrypted second-stage bootloader from a local staging partition, reboot, and verify that hardware Secure Boot actually activated. The final bootloader-copy step is irreversible and power-loss-sensitive, so migration remains blocked until every preflight and signed-bundle check passes."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        ports.Controls.Add(_port);
        var refresh = new Button { Text = "Refresh Ports", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        ports.Controls.Add(refresh);
        AddRow(root, 1, "USB serial port", ports);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        _readiness.Click += async (_, _) => await CheckReadinessAsync();
        _migrate.Click += (_, _) => MessageBox.Show(this,
            "The Factory migration UI and preflight are ready, but the irreversible bootloader-staging protocol is not armed in this build yet. This button will only be enabled after the device-side migration protocol and a fully signed migration bundle are both validated in CI.",
            "Secure Boot Migration Not Armed", MessageBoxButtons.OK, MessageBoxIcon.Information);
        actions.Controls.Add(_readiness);
        actions.Controls.Add(_migrate);
        root.Controls.Add(actions, 1, 2);

        AddRow(root, 3, "Hardware", _hardware);
        AddRow(root, 4, "Flash Encryption", _flashEncryption);
        AddRow(root, 5, "Secure Boot", _secureBoot);
        AddRow(root, 6, "Installed firmware", _installed);
        AddRow(root, 7, "Migration bundle", _bundle);
        root.Controls.Add(_eligibility, 0, 8); root.SetColumnSpan(_eligibility, 2);

        _log.Font = new Font(FontFamily.GenericMonospace, 9f);
        root.Controls.Add(_log, 0, 9); root.SetColumnSpan(_log, 2);

        var footer = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        footer.Controls.Add(close);
        root.Controls.Add(footer, 0, 10); root.SetColumnSpan(footer, 2);
    }

    private async Task CheckReadinessAsync()
    {
        var port = _port.SelectedItem?.ToString();
        if (string.IsNullOrWhiteSpace(port))
        {
            MessageBox.Show(this, "Select a COM port first.", "Secure Boot Migration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SetBusy(true);
        _cts = new CancellationTokenSource();
        _deviceEligible = false;
        _migrate.Enabled = false;
        try
        {
            var token = _cts.Token;
            Append("Reading hardware identity...");
            var hardware = await UsbHardwareIdentityProvisioner.ReadAsync(port, Append, token);
            Append("Reading production security state...");
            var security = await _security.ReadAsync(port, Append, token);
            _bundleInfo = MigrationBundleInfo.Load();

            var eco3 = hardware.Revision >= 300;
            _hardware.Text = $"{hardware.Model}; silicon revision {FormatRevision(hardware.Revision)} — {(eco3 ? "Secure Boot v2 capable" : "NOT eligible for Secure Boot v2")}";
            _flashEncryption.Text = $"{(security.FlashEncryptionEnabled ? "Enabled" : "Disabled")} ({security.FlashEncryptionMode})";
            _secureBoot.Text = security.SecureBootEnabled ? "Already enabled" : "Disabled — migration candidate";
            _installed.Text = $"{security.FirmwareVersion} (release sequence {security.ReleaseSequence})";
            RenderBundle();

            var newerBundle = _bundleInfo.ReleaseSequence.HasValue && _bundleInfo.ReleaseSequence.Value > security.ReleaseSequence;
            _deviceEligible = eco3 && security.ProductionFlashEncryptionReady && !security.SecureBootEnabled && _bundleInfo.Ready && newerBundle;

            if (!eco3)
                _eligibility.Text = "BLOCKED — ESP32 Secure Boot v2 requires silicon revision 3.0/ECO3 or newer.";
            else if (!security.ProductionFlashEncryptionReady)
                _eligibility.Text = "BLOCKED — migration requires Flash Encryption already enabled in release mode.";
            else if (security.SecureBootEnabled)
                _eligibility.Text = "NO MIGRATION NEEDED — Secure Boot is already enabled on this unit.";
            else if (!_bundleInfo.Ready)
                _eligibility.Text = "BLOCKED — a complete, independently signed Secure Boot migration bundle is not installed with Factory & Service.";
            else if (!newerBundle)
                _eligibility.Text = "BLOCKED — the migration release sequence must be strictly newer than the installed firmware release sequence.";
            else
                _eligibility.Text = "READY FOR MIGRATION — device preflight and bundle checks passed. Irreversible action remains disabled until the device-side bootloader staging protocol is validated.";

            Append(_eligibility.Text);
            // Intentionally remain false until the device-side staging protocol is implemented and CI validated.
            _migrate.Enabled = false;
        }
        catch (OperationCanceledException) { Append("Readiness check cancelled."); }
        catch (Exception ex)
        {
            Append("ERROR: " + ex.Message);
            _eligibility.Text = "BLOCKED — readiness check failed.";
            MessageBox.Show(this, ex.Message, "Secure Boot Readiness Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _cts.Dispose(); _cts = null; SetBusy(false);
        }
    }

    private void RenderBundle()
    {
        _bundle.Text = _bundleInfo.Ready
            ? $"{_bundleInfo.Version} (release sequence {_bundleInfo.ReleaseSequence}); application + bootloader + detached signatures present"
            : _bundleInfo.Status;
    }

    private void RefreshPorts()
    {
        var old = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear(); _port.Items.AddRange(ports);
        if (old is not null && _port.Items.Contains(old)) _port.SelectedItem = old;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
    }

    private void SetBusy(bool busy)
    {
        _readiness.Enabled = !busy;
        _port.Enabled = !busy;
        if (busy) _migrate.Enabled = false;
    }

    private void Append(string text)
    {
        if (InvokeRequired) { BeginInvoke(new Action<string>(Append), text); return; }
        _log.AppendText($"[{DateTime.Now:T}] {text}{Environment.NewLine}");
    }

    private static Label ValueLabel() => new() { AutoSize = true, MaximumSize = new Size(620, 0) };
    private static void AddRow(TableLayoutPanel root, int row, string label, Control control)
    {
        root.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(3, 8, 3, 3) }, 0, row);
        control.Dock = DockStyle.Fill;
        root.Controls.Add(control, 1, row);
    }
    private static string FormatRevision(int raw) => $"{raw / 100}.{raw % 100:00} (raw {raw})";
    private static int PortNumber(string p) => p.StartsWith("COM", StringComparison.OrdinalIgnoreCase) && int.TryParse(p.AsSpan(3), out var n) ? n : int.MaxValue;

    private sealed class MigrationBundleInfo
    {
        public bool Ready { get; private init; }
        public string Status { get; private init; } = "Migration bundle not installed.";
        public string Version { get; private init; } = "unknown";
        public uint? ReleaseSequence { get; private init; }

        public static MigrationBundleInfo Load()
        {
            try
            {
                var dir = Path.Combine(AppContext.BaseDirectory, "secure-boot-migration");
                var app = Path.Combine(dir, "BatteryMonitor.secureboot.app.bin");
                var appSig = app + ".sig";
                var boot = Path.Combine(dir, "BatteryMonitor.secureboot.bootloader.bin");
                var bootSig = boot + ".sig";
                var metadata = Path.Combine(dir, "MIGRATION_RELEASE.txt");
                if (!File.Exists(app) || !File.Exists(appSig) || !File.Exists(boot) || !File.Exists(bootSig) || !File.Exists(metadata))
                    return new MigrationBundleInfo { Status = "Migration bundle incomplete or not installed." };

                FirmwareSignatureVerifier.VerifyOrThrow(app, appSig);
                FirmwareSignatureVerifier.VerifyOrThrow(boot, bootSig);

                var values = File.ReadAllLines(metadata)
                    .Select(line => line.Trim())
                    .Where(line => line.Length > 0 && !line.StartsWith('#'))
                    .Select(line => line.Split('=', 2))
                    .Where(parts => parts.Length == 2)
                    .ToDictionary(parts => parts[0].Trim(), parts => parts[1].Trim(), StringComparer.OrdinalIgnoreCase);
                if (!values.TryGetValue("version", out var version) || string.IsNullOrWhiteSpace(version) ||
                    !values.TryGetValue("release_sequence", out var seqText) || !uint.TryParse(seqText, out var sequence) || sequence == 0)
                    return new MigrationBundleInfo { Status = "Migration bundle metadata is invalid." };

                return new MigrationBundleInfo
                {
                    Ready = true,
                    Status = "Ready",
                    Version = version,
                    ReleaseSequence = sequence
                };
            }
            catch (Exception ex)
            {
                return new MigrationBundleInfo { Status = "Migration bundle validation failed: " + ex.Message };
            }
        }
    }
}
