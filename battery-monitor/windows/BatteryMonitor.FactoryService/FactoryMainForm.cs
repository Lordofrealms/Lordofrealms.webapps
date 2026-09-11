using System.Runtime.InteropServices;

namespace BatteryMonitor.Client;

internal sealed class FactoryMainForm : Form, IMessageFilter
{
    private const int WM_WTSSESSION_CHANGE = 0x02B1;
    private const int WTS_SESSION_LOCK = 0x7;
    private const int NOTIFY_FOR_THIS_SESSION = 0;
    private const int WM_KEYFIRST = 0x0100;
    private const int WM_KEYLAST = 0x0109;
    private const int WM_MOUSEFIRST = 0x0200;
    private const int WM_MOUSELAST = 0x020E;
    private readonly Label _session = new() { AutoSize = true };
    private readonly System.Windows.Forms.Timer _sessionTimer = new() { Interval = 30_000 };

    public FactoryMainForm()
    {
        Text = "Battery Monitor Factory & Service";
        Icon = AppIcon.Current;
        Width = 780;
        Height = 640;
        MinimumSize = new Size(700, 560);
        StartPosition = FormStartPosition.CenterScreen;

        BuildUi();
        Application.AddMessageFilter(this);
        _sessionTimer.Tick += (_, _) => RefreshSessionLabel();
        _sessionTimer.Start();
        Shown += (_, _) => WTSRegisterSessionNotification(Handle, NOTIFY_FOR_THIS_SESSION);
        FormClosed += (_, _) =>
        {
            _sessionTimer.Stop();
            Application.RemoveMessageFilter(this);
            try { WTSUnRegisterSessionNotification(Handle); } catch { }
            AdminSecurity.LockSession();
        };
        RefreshSessionLabel();
    }

    public bool PreFilterMessage(ref Message m)
    {
        if ((m.Msg >= WM_KEYFIRST && m.Msg <= WM_KEYLAST) ||
            (m.Msg >= WM_MOUSEFIRST && m.Msg <= WM_MOUSELAST))
            AdminSecurity.TouchSession();
        return false;
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 1,
            AutoScroll = true
        };
        Controls.Add(root);

        root.Controls.Add(new Label
        {
            Text = "Factory & Service",
            AutoSize = true,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 0, 0, 4)
        });
        root.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(720, 0),
            Text = "Management-only manufacturing, calibration, service, and engineering functions. Device cryptographic protections remain authoritative even when this application is unlocked."
        });

        AddSection(root, "Provisioning & labels",
            ToolButton("Provision New Battery Monitor", "Flash a blank unit, initialize and verify its factory credential, and produce its QR/label record.", () => new FactoryProvisioningForm()),
            ToolButton("Factory Credential / QR", "Lower-level credential rotation/verification and individual QR generation.", () => new ProvisioningAdminForm()),
            ToolButton("Blank ESP32 First Install", "Lower-level signed first-install tool for a genuinely blank, unencrypted ESP32.", () => new FirmwareFlashForm()),
            ToolButton("QR / Label Manager", "Review provisioned-device label records and batch-print QR labels.", () => new FactoryLabelManagerForm()));

        AddSection(root, "Calibration",
            ToolButton("Calibration Calculator", "Read current calibration, calculate from one or two trusted reference measurements, and explicitly apply the result.", () => new CalibrationForm()));

        AddSection(root, "Service",
            ToolButton("Wi-Fi Radio Settings", "Service-level Wi-Fi sleep and transmit-power settings.", () => new WifiRadioSettingsForm()),
            ToolButton("HTTP Transport Settings", "Native HTTP transport/session tuning.", () => new HttpRuntimeSettingsForm()),
            ToolButton("Hardware Identity", "Read actual ESP32 hardware and runtime identity.", () => new HardwareIdentityForm()));

        AddSection(root, "Engineering diagnostics",
            ToolButton("Serial Console", "Trusted-USB BATMON1 engineering console.", () => new SerialConsoleForm()),
            ToolButton("HTTP Diagnostics", "Source timing and live HTTP trace tools.", () => new HttpDiagnosticsForm()),
            ToolButton("Factory & Service Help", "Manufacturing, calibration, diagnostics, and label workflow reference.", () => new FactoryHelpForm()));

        var footer = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Margin = new Padding(0, 18, 0, 0)
        };
        var close = new Button { Text = "Close", AutoSize = true };
        close.Click += (_, _) => Close();
        var lockNow = new Button { Text = "Lock Factory Tools Now", AutoSize = true };
        lockNow.Click += (_, _) =>
        {
            AdminSecurity.LockSession();
            Close();
        };
        footer.Controls.Add(close);
        footer.Controls.Add(lockNow);
        _session.Margin = new Padding(3, 8, 16, 3);
        footer.Controls.Add(_session);
        root.Controls.Add(footer);
    }

    private static void AddSection(TableLayoutPanel root, string title, params Control[] controls)
    {
        root.Controls.Add(new Label
        {
            Text = title,
            AutoSize = true,
            Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold),
            Margin = new Padding(0, 18, 0, 5)
        });
        var panel = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            WrapContents = true,
            Margin = new Padding(0)
        };
        panel.Controls.AddRange(controls);
        root.Controls.Add(panel);
    }

    private Button ToolButton(string title, string description, Func<Form> create)
    {
        var button = new Button
        {
            Text = title,
            Width = 220,
            Height = 42,
            TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(0, 0, 10, 8)
        };
        var tip = new ToolTip();
        tip.SetToolTip(button, description);
        button.Click += (_, _) => OpenProtected(create);
        return button;
    }

    private void OpenProtected(Func<Form> create)
    {
        if (!AdminSecurity.Authenticate(this))
        {
            RefreshSessionLabel();
            return;
        }
        AdminSecurity.TouchSession();
        using var form = create();
        form.ShowDialog(this);
        AdminSecurity.TouchSession();
        RefreshSessionLabel();
    }

    private void RefreshSessionLabel()
    {
        if (!AdminSecurity.SessionUnlocked)
        {
            _session.Text = "Locked — the next Factory/Service action will require the password";
            return;
        }
        var remaining = AdminSecurity.SessionRemaining;
        _session.Text = $"Unlocked • idle timeout in {Math.Max(1, (int)Math.Ceiling(remaining.TotalMinutes))} min";
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_WTSSESSION_CHANGE && m.WParam.ToInt32() == WTS_SESSION_LOCK)
        {
            AdminSecurity.LockSession();
            BeginInvoke(new Action(Close));
        }
        base.WndProc(ref m);
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSRegisterSessionNotification(IntPtr hWnd, int dwFlags);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSUnRegisterSessionNotification(IntPtr hWnd);
}
