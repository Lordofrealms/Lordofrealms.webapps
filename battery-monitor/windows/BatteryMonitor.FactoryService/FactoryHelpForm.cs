namespace BatteryMonitor.Client;

internal sealed class FactoryHelpForm : Form
{
    private readonly ListBox _topics = new() { Dock = DockStyle.Fill };
    private readonly RichTextBox _content = new() { Dock = DockStyle.Fill, ReadOnly = true, BorderStyle = BorderStyle.None };

    private static readonly (string Title, string Body)[] Topics =
    [
        ("Provision New Battery Monitor",
@"Use this workflow only for a genuinely blank, unencrypted ESP32.

The integrated process:
1. Verifies the bundled production signature.
2. Flashes the complete first-install image without bypassing esptool protection.
3. Waits for first boot while release-mode Flash Encryption and encrypted NVS initialize.
4. Reads the new Battery Monitor identity and the actual trusted-USB security state.
5. Requires Flash Encryption to report enabled in release mode before the unit can proceed.
6. Generates, writes, and verifies the factory Device Password.
7. Creates the QR payload and stores a DPAPI-protected label record.

Secure Boot is reported by the same security-state check but is not currently required; its irreversible production/eFuse activation remains a separate hardware-validation gate.

Do not use the blank-device path as recovery after Flash Encryption has activated. Use signed application-mediated firmware update/recovery paths instead."),

        ("Factory Credentials and Labels",
@"The factory Device Password and QR are initial setup credentials. A credential is never read back from the ESP32; the factory workflow proves the generated credential after writing it.

Completed provisioning automatically creates a protected label record only after the required production Flash Encryption state and Device Password have both verified. QR / Label Manager can preview, reprint, or batch-print provisioned units. Label records contain credentials and are DPAPI-protected for the current Windows account.

Treat printed QR labels and initial passwords as credentials."),

        ("Calibration",
@"Calibration is a factory/service function rather than a normal customer setting.

Use a trusted reference meter. Capture at least one monitor/reference point. One-point calculation adjusts proportional factor while preserving the current offset. Two sufficiently separated points solve factor and offset together.

Review the proposed corrected reading before applying. Opening the calculator never changes the device. Apply Calibration is always explicit."),

        ("Service Tools",
@"Wi-Fi Radio Settings controls service-level radio policy such as sleep and requested transmit power.

HTTP Transport Settings controls native HTTP runtime session capacity. Hardware Identity reads actual chip/runtime information.

These are management/service settings and are intentionally not present in the customer Battery Monitor application."),

        ("Engineering Diagnostics",
@"Serial Console exposes trusted-USB BATMON1 engineering commands while deliberately blocking raw firmware-transfer commands.

HTTP Diagnostics provides source timing and live HTTP trace controls for engineering investigation. Diagnostic output can contain device/network metadata; review logs before sharing them."),

        ("Security Model",
@"The Factory & Service password is an operator-access deterrent and workflow separation layer. It is not the device's cryptographic trust boundary and should not be relied upon against a determined attacker who can modify the management executable.

Production device protections remain authoritative: signed firmware verification, release-mode Flash Encryption, encrypted NVS, signed OTA policy, release-floor checks, and rollback behavior. Factory provisioning reads the running device's actual Flash Encryption state over trusted USB and will not produce a label if release-mode encryption is not active.

The Factory & Service session expires after one hour of inactivity, clears when the application exits, and locks when the Windows session is locked.")
    ];

    public FactoryHelpForm()
    {
        Text = "Battery Monitor Factory & Service Help";
        Icon = AppIcon.Current;
        Width = 860;
        Height = 650;
        StartPosition = FormStartPosition.CenterParent;
        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 230 };
        foreach (var topic in Topics) _topics.Items.Add(topic.Title);
        _topics.SelectedIndexChanged += (_, _) => RenderTopic();
        split.Panel1.Controls.Add(_topics);
        _content.Font = new Font("Segoe UI", 10);
        _content.BackColor = SystemColors.Window;
        split.Panel2.Padding = new Padding(14);
        split.Panel2.Controls.Add(_content);
        Controls.Add(split);
        _topics.SelectedIndex = 0;
    }

    private void RenderTopic()
    {
        if (_topics.SelectedIndex < 0) return;
        var topic = Topics[_topics.SelectedIndex];
        _content.Text = topic.Title + Environment.NewLine + Environment.NewLine + topic.Body;
        _content.SelectionStart = 0;
        _content.SelectionLength = topic.Title.Length;
        _content.SelectionFont = new Font(_content.Font, FontStyle.Bold);
        _content.SelectionStart = 0;
        _content.SelectionLength = 0;
    }
}
