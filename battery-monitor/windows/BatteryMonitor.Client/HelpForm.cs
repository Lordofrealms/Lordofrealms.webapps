using System.Drawing;

namespace BatteryMonitor.Client;

public sealed class HelpForm : Form
{
    private readonly ListBox _topics = new();
    private readonly RichTextBox _content = new();

    private static readonly (string Title, string Body)[] Topics =
    [
        ("Getting Started",
@"Battery Monitor first-unit setup

1. Connect the ESP32 by USB.
2. For this tested ESP32 board, enter download mode by holding EN, plugging in USB while EN remains held, waiting about 5 seconds, then releasing EN.
3. Use Tools > Advanced Tools > Blank ESP32 First Install only on a blank, unencrypted device.
4. After first boot, initialize the Device Password/setup credential over trusted USB.
5. Configure the monitor and home Wi-Fi.
6. Pair/Trust the monitor on this Windows account.
7. Connect the battery divider to GPIO34 and calibrate against a multimeter.

After Flash Encryption activates, do not use the blank-device first-install path on that unit again. Normal firmware updates use the signed application-mediated USB OTA path."),

        ("Device Password",
@"The Device Password is the per-monitor administrator credential.

The initial provisioning/setup code becomes the first Device Password. It is separate from:
• the Windows Advanced Tools password;
• the monitor's 256-bit Monitoring Identity Key;
• the home Wi-Fi password.

The Device Password authenticates management operations and secure Wi-Fi recovery. A remembered Device Password is protected for the current Windows account with DPAPI."),

        ("Wi-Fi and Recovery",
@"Normal operation prefers the configured home Wi-Fi.

If home Wi-Fi is unavailable, current firmware can expose the protected BatteryMonitor-XXXXXX setup network after the connection attempt fails. The setup network remains WPA2 protected and uses Espressif Security 2 provisioning; it is not an open fallback network.

While in protected fallback, the monitor periodically retries the saved home Wi-Fi. You can also deliberately start secure setup from Change Wi-Fi or the documented physical recovery gesture."),

        ("Voltage Wiring and Calibration",
@"Voltage input authority

Battery +  -> 100 kΩ -> GPIO34 / P34
GPIO34    -> 22 kΩ  -> ESP32 GND
Battery - -> ESP32 GND

Do not connect battery positive directly to GPIO34.

For calibration, compare the Battery Monitor reading with a trusted multimeter. Correct proportional error with Calibration Factor first. Use Calibration Offset only when multi-point measurements show a genuine additive error."),

        ("Alerts",
@"Alert settings are local to this Windows PC and are configurable separately for every monitor.

Open Devices > Configure, then Configure Alerts.

Low battery, Critical battery, Device offline, and Device back online can each have:
• enable/disable;
• a built-in sound or custom MP3/WAV;
• independent volume;
• repeat interval where applicable;
• Preview before saving.

If a custom audio file is later missing, Battery Monitor falls back to a built-in warning sound."),

        ("Firmware Updates",
@"Production firmware updates are signed.

The Windows client verifies the production RSA-PSS signature before transfer. The ESP32 independently verifies the received application image before selecting it for boot. Release-mode Flash Encryption encrypts OTA writes on-device.

A new image has a local health probation before it is permanently accepted. Older or equal signed release sequences are rejected by the software release floor."),

        ("Troubleshooting",
@"ESP32 not detected:
• Confirm Windows shows the expected COM port.
• Close other serial monitors.
• Try a known data-capable USB cable.
• Use the tested download-mode sequence: hold EN, plug USB in, keep holding about 5 seconds, release EN.

Setup network not visible:
• The Device Password must already be initialized.
• If home Wi-Fi is configured and reachable, the fallback setup network is normally not needed.
• Use Change Wi-Fi or the physical recovery flow to deliberately enter secure setup.

Web page slow:
• Firmware 0.1.0.2 moves ordinary WebUI servicing onto a dedicated Core-0 FreeRTOS task so HTTP handling is isolated from the main monitoring loop."),

        ("About",
@"Battery Monitor

Windows monitoring and administration client for the Battery Monitor ESP32 firmware.

Production firmware architecture:
ESP-IDF 5.5.5
Classic ESP32 / ESP32-WROOM-32
Release-mode Flash Encryption
NVS Encryption
Signed USB OTA
Authenticated monitoring identity

Use Help topics for first setup, recovery, calibration, and alert configuration.")
    ];

    public HelpForm(string? initialTopic = null)
    {
        Text = "Battery Monitor Help";
        Icon = AppIcon.Current;
        Width = 860;
        Height = 650;
        MinimumSize = new Size(700, 500);
        StartPosition = FormStartPosition.CenterParent;

        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            FixedPanel = FixedPanel.Panel1,
            SplitterDistance = 190
        };

        _topics.Dock = DockStyle.Fill;
        foreach (var topic in Topics) _topics.Items.Add(topic.Title);
        _topics.SelectedIndexChanged += (_, _) => RenderTopic();
        split.Panel1.Controls.Add(_topics);

        _content.Dock = DockStyle.Fill;
        _content.ReadOnly = true;
        _content.BorderStyle = BorderStyle.None;
        _content.BackColor = SystemColors.Window;
        _content.Font = new Font("Segoe UI", 10);
        _content.DetectUrls = true;
        split.Panel2.Padding = new Padding(14);
        split.Panel2.Controls.Add(_content);
        Controls.Add(split);

        var index = 0;
        if (!string.IsNullOrWhiteSpace(initialTopic))
        {
            var match = Array.FindIndex(Topics, t => t.Title.Contains(initialTopic, StringComparison.OrdinalIgnoreCase));
            if (match >= 0) index = match;
        }
        _topics.SelectedIndex = index;
    }

    private void RenderTopic()
    {
        if (_topics.SelectedIndex < 0 || _topics.SelectedIndex >= Topics.Length) return;
        var topic = Topics[_topics.SelectedIndex];
        _content.Text = topic.Title + Environment.NewLine + Environment.NewLine + topic.Body;
        _content.SelectionStart = 0;
        _content.SelectionLength = topic.Title.Length;
        _content.SelectionFont = new Font(_content.Font, FontStyle.Bold);
        _content.SelectionStart = 0;
        _content.SelectionLength = 0;
    }
}
