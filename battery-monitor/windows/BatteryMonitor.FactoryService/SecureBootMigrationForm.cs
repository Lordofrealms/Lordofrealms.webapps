using System.IO.Ports;

namespace BatteryMonitor.Client;

internal sealed class SecureBootMigrationForm : Form
{
    private readonly UsbSecurityInfoReader _security = new();
    private readonly SecureBootMigrationWorkflow _workflow = new();
    private readonly ComboBox _port = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly Label _hardware = ValueLabel();
    private readonly Label _flashEncryption = ValueLabel();
    private readonly Label _secureBoot = ValueLabel();
    private readonly Label _installed = ValueLabel();
    private readonly Label _bundle = ValueLabel();
    private readonly Label _eligibility = new() { AutoSize = true, MaximumSize = new Size(650, 0), Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold) };
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
    private readonly Button _readiness = new() { Text = "Run Migration Readiness Check", AutoSize = true };
    private readonly Button _migrate = new() { Text = "Prepare & Migrate This Unit", AutoSize = true, Enabled = false };
    private CancellationTokenSource? _cts;
    private MigrationBundleInfo _bundleInfo = MigrationBundleInfo.Load();
    private bool _deviceEligible;

    public SecureBootMigrationForm()
    {
        Text = "Battery Monitor Factory - Secure Boot Migration";
        Icon = AppIcon.Current;
        Width = 850;
        Height = 720;
        MinimumSize = new Size(760, 630);
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
            Text = "Factory-only retrofit workflow for already-provisioned Battery Monitors. This does NOT change normal new-unit provisioning. The tool first installs/resumes the signed migration application and lets it pass normal OTA probation, then stages and fully verifies the Secure-Boot-v2 bootloader without touching the primary bootloader. A separate typed confirmation is required before the final encrypted primary-bootloader copy. Loss of power during that final copy can permanently brick the unit."
        };
        root.Controls.Add(intro, 0, 0); root.SetColumnSpan(intro, 2);

        var ports = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        ports.Controls.Add(_port);
        _port.SelectedIndexChanged += (_, _) => InvalidateReadiness();
        var refresh = new Button { Text = "Refresh Ports", AutoSize = true };
        refresh.Click += (_, _) => RefreshPorts();
        ports.Controls.Add(refresh);
        AddRow(root, 1, "USB serial port", ports);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        _readiness.Click += async (_, _) => await CheckReadinessAsync();
        _migrate.Click += async (_, _) => await MigrateAsync();
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
        var port = SelectedPort();
        if (port is null) return;

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
            _installed.Text = $"{security.FirmwareVersion} (release sequence {security.ReleaseSequence}; {security.DeviceId})";
            RenderBundle();

            var newerBundle = _bundleInfo.ReleaseSequence.HasValue && _bundleInfo.ReleaseSequence.Value > security.ReleaseSequence;
            var resumeBundle = _bundleInfo.ReleaseSequence.HasValue &&
                               _bundleInfo.ReleaseSequence.Value == security.ReleaseSequence &&
                               string.Equals(_bundleInfo.Version, security.FirmwareVersion, StringComparison.Ordinal);
            var bundleCompatible = newerBundle || resumeBundle;
            _deviceEligible = eco3 && security.ProductionFlashEncryptionReady && !security.SecureBootEnabled && _bundleInfo.Ready && bundleCompatible;

            if (!eco3)
                _eligibility.Text = "BLOCKED — ESP32 Secure Boot v2 requires silicon revision 3.0/ECO3 or newer.";
            else if (!security.ProductionFlashEncryptionReady)
                _eligibility.Text = "BLOCKED — migration requires Flash Encryption already enabled in release mode.";
            else if (security.SecureBootEnabled)
                _eligibility.Text = "NO MIGRATION NEEDED — Secure Boot is already enabled on this unit.";
            else if (!_bundleInfo.Ready)
                _eligibility.Text = "BLOCKED — a complete protected-signer Secure Boot migration bundle is not installed with Factory & Service.";
            else if (!bundleCompatible)
                _eligibility.Text = "BLOCKED — bundle release must be newer than the unit, or exactly match the already-installed migration application for resume.";
            else if (resumeBundle)
                _eligibility.Text = $"READY TO RESUME — {security.DeviceId} is already on migration release {_bundleInfo.Version}; Factory will resume at readiness/staging without replaying the same release.";
            else
                _eligibility.Text = $"READY FOR MIGRATION — {security.DeviceId} preflight and full signed-bundle verification passed.";

            Append(_eligibility.Text);
            _migrate.Enabled = _deviceEligible;
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

    private async Task MigrateAsync()
    {
        var port = SelectedPort();
        if (port is null) return;
        if (!_deviceEligible || !_bundleInfo.Ready || _bundleInfo.Package is null)
        {
            MessageBox.Show(this, "Run a successful migration readiness check first.", "Secure Boot Migration",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SetBusy(true);
        _cts = new CancellationTokenSource();
        PreparedSecureBootMigration? prepared = null;
        try
        {
            Append("Beginning Factory Secure Boot migration preparation. The primary bootloader is not modified during preparation/staging.");
            prepared = await _workflow.PrepareAsync(port, _bundleInfo.Package, Append, _cts.Token);
            _eligibility.Text = $"STAGED & VERIFIED — {prepared.DeviceId}. Primary bootloader is still unchanged. Final irreversible confirmation required.";
            Append(_eligibility.Text);

            if (!ConfirmIrreversibleCommit(prepared))
            {
                Append("Operator cancelled before the irreversible primary-bootloader copy. Aborting staged migration state.");
                await _workflow.AbortStagedAsync(prepared, Append, CancellationToken.None);
                _eligibility.Text = "CANCELLED SAFELY — staged migration was aborted before the primary bootloader was modified. Run readiness again to retry.";
                _deviceEligible = false;
                return;
            }

            Append("Operator supplied the exact device identity confirmation. Entering the irreversible commit gate.");
            var verified = await _workflow.CommitAndVerifyAsync(prepared, Append, _cts.Token);
            _flashEncryption.Text = $"Enabled ({verified.FlashEncryptionMode})";
            _secureBoot.Text = "ENABLED — hardware verified";
            _installed.Text = $"{verified.FirmwareVersion} (release sequence {verified.ReleaseSequence}; {verified.DeviceId})";
            _eligibility.Text = $"MIGRATION VERIFIED — {verified.DeviceId} reports release-mode Flash Encryption and hardware Secure Boot enabled.";
            Append(_eligibility.Text);
            _deviceEligible = false;

            MessageBox.Show(this,
                $"Secure Boot migration completed and was verified on {verified.DeviceId}.\n\n" +
                $"Firmware: {verified.FirmwareVersion}\nRelease sequence: {verified.ReleaseSequence}\n" +
                "Flash Encryption: release mode\nSecure Boot: enabled\n\n" +
                "The next validation gate is a normal newer signed application OTA while Secure Boot remains enabled.",
                "Secure Boot Migration Verified", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (OperationCanceledException)
        {
            Append("Migration operation cancelled.");
            if (prepared is not null)
                await _workflow.AbortStagedAsync(prepared, Append, CancellationToken.None);
            _deviceEligible = false;
        }
        catch (Exception ex)
        {
            Append("ERROR: " + ex.Message);
            var copyFailure = ex.Message.Contains("DO_NOT_REBOOT_OR_REMOVE_POWER", StringComparison.OrdinalIgnoreCase);
            if (!copyFailure && prepared is not null)
                await _workflow.AbortStagedAsync(prepared, Append, CancellationToken.None);

            _eligibility.Text = copyFailure
                ? "CRITICAL — primary bootloader copy reported failure. DO NOT REBOOT OR REMOVE POWER. Restage the known-good bootloader from this running session."
                : "BLOCKED — migration stopped before verified completion. Run readiness again before retrying.";
            _deviceEligible = false;
            MessageBox.Show(this,
                copyFailure
                    ? ex.Message + "\n\nDO NOT reboot, unplug USB, or remove power from this unit."
                    : ex.Message,
                copyFailure ? "Secure Boot Migration Critical" : "Secure Boot Migration Failed",
                MessageBoxButtons.OK,
                copyFailure ? MessageBoxIcon.Stop : MessageBoxIcon.Error);
        }
        finally
        {
            _cts.Dispose(); _cts = null; SetBusy(false);
            _migrate.Enabled = _deviceEligible;
        }
    }

    private bool ConfirmIrreversibleCommit(PreparedSecureBootMigration prepared)
    {
        using var dialog = new Form
        {
            Text = "FINAL Secure Boot Commit Confirmation",
            Icon = AppIcon.Current,
            Width = 640,
            Height = 390,
            MinimumSize = new Size(600, 350),
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false
        };

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 5 };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        dialog.Controls.Add(root);

        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(590, 0),
            Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold),
            Text = "IRREVERSIBLE POWER-LOSS-SENSITIVE STEP"
        });
        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(590, 0),
            Margin = new Padding(0, 10, 0, 10),
            Text = $"The signed Secure Boot bootloader for {prepared.DeviceId} is staged and readback-verified. Continuing will erase/copy the encrypted primary bootloader at 0x1000. Loss of power during this copy can permanently brick the unit. Keep stable power connected until Factory reports that the copy completed and the unit rebooted with Secure Boot enabled.\n\nBootloader SHA-256:\n{prepared.BootloaderSha256}"
        });
        root.Controls.Add(new Label
        {
            AutoSize = true,
            Text = $"Type the exact device identity {prepared.DeviceId} to enable Commit:"
        });
        var typed = new TextBox { Dock = DockStyle.Top, Margin = new Padding(0, 6, 0, 6) };
        root.Controls.Add(typed);

        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var commit = new Button { Text = "Commit Secure Boot", AutoSize = true, Enabled = false, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Cancel Before Commit", AutoSize = true, DialogResult = DialogResult.Cancel };
        typed.TextChanged += (_, _) => commit.Enabled = string.Equals(typed.Text.Trim(), prepared.DeviceId, StringComparison.Ordinal);
        buttons.Controls.Add(commit);
        buttons.Controls.Add(cancel);
        root.Controls.Add(buttons);
        dialog.AcceptButton = commit;
        dialog.CancelButton = cancel;

        return dialog.ShowDialog(this) == DialogResult.OK;
    }

    private void RenderBundle()
    {
        _bundle.Text = _bundleInfo.Ready
            ? $"{_bundleInfo.Version} (release sequence {_bundleInfo.ReleaseSequence}); application + bootloader + detached signatures + metadata hashes verified"
            : _bundleInfo.Status;
    }

    private void RefreshPorts()
    {
        var old = _port.SelectedItem?.ToString();
        var ports = SerialPort.GetPortNames().OrderBy(PortNumber).ThenBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        _port.Items.Clear(); _port.Items.AddRange(ports);
        if (old is not null && _port.Items.Contains(old)) _port.SelectedItem = old;
        else if (_port.Items.Count > 0) _port.SelectedIndex = 0;
        InvalidateReadiness();
    }

    private void InvalidateReadiness()
    {
        if (_cts is not null) return;
        _deviceEligible = false;
        _migrate.Enabled = false;
    }

    private string? SelectedPort()
    {
        var port = _port.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(port)) return port;
        MessageBox.Show(this, "Select a COM port first.", "Secure Boot Migration", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return null;
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
        public SecureBootMigrationPackage? Package { get; private init; }

        public static MigrationBundleInfo Load()
        {
            try
            {
                var package = SecureBootMigrationPackage.LoadInstalled();
                return new MigrationBundleInfo
                {
                    Ready = true,
                    Status = "Ready",
                    Version = package.Version,
                    ReleaseSequence = package.ReleaseSequence,
                    Package = package
                };
            }
            catch (FileNotFoundException)
            {
                return new MigrationBundleInfo { Status = "Protected signed migration bundle is incomplete or not installed." };
            }
            catch (Exception ex)
            {
                return new MigrationBundleInfo { Status = "Migration bundle validation failed: " + ex.Message };
            }
        }
    }
}
