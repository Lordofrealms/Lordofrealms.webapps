using System.Drawing;

namespace BatteryMonitor.Client;

public sealed class HelpForm : Form
{
    private readonly ListBox _topics = new();
    private readonly RichTextBox _content = new();

    private static readonly (string Title, string Body)[] Topics =
    [
        ("Getting Started",
@"Battery Monitor setup

1. Power the finished Battery Monitor and connect it by USB if it has not yet been configured.
2. Open Setup > Set Up / Recover Device by USB to initialize or change the Device Password, choose a device name, select the battery profile and thresholds, and configure home Wi-Fi if needed.
3. If configuring Wi-Fi wirelessly, use Setup > Set Up Wi-Fi on a New Device and the Device ID/initial Device Password supplied with the monitor.
4. Use Devices > Discover Now, then Pair / Trust the monitor on this Windows account before relying on its readings.
5. Configure per-device alert sounds, repeat intervals, polling, and offline timeout as desired.

The customer application intentionally contains only normal monitoring, setup, recovery, and firmware-update functions. Manufacturing, calibration, and engineering diagnostics are performed separately by authorized service personnel."),

        ("Device Password and Trust",
@"The Device Password is the per-monitor administrator credential used for management operations and secure Wi-Fi setup.

A remembered Device Password is protected for the current Windows account with DPAPI and is never read back from the ESP32. Trusted USB can initialize or rotate the password without knowing the previous password.

Pair / Trust is separate. Pairing stores a device-specific Monitoring Identity Key protected for the current Windows account. Once paired, discovery and battery status must authenticate with that identity before the app trusts the reported voltage/state.

Changing the Device Password does not change the separate monitoring identity."),

        ("Wi-Fi and Recovery",
@"Normal operation uses the configured home Wi-Fi.

If home Wi-Fi is unavailable, the monitor can expose its protected BatteryMonitor-XXXXXX setup network. The setup network is WPA2 protected and uses Espressif Security 2 provisioning; it is not an open recovery network.

While in protected fallback, the monitor periodically retries saved home Wi-Fi. Use Devices > Change Wi-Fi or Setup > Set Up Wi-Fi on a New Device when you intentionally need to change the network.

Trusted USB remains the recovery path for Device Password and ordinary configuration."),

        ("Battery Profiles",
@"Battery profiles provide a friendly battery type plus default Low and Critical voltage thresholds.

Use the gear button beside Battery Profile to manage profiles. Built-in profiles are protected defaults. Duplicate a built-in profile when you want a slightly different version, or create a new custom profile from scratch.

Selecting a profile does not silently overwrite your active thresholds. Choose Apply Profile Defaults when you actually want that profile's default Low/Critical values.

Custom profile names may use normal words and punctuation. Internal identifiers are managed automatically and are intentionally not shown."),

        ("Alerts and Snooze",
@"Alert settings are local to this Windows PC and are configurable separately for every monitor.

Low battery, Critical battery, Device offline, and Device back online can each have independent enable/disable, sound, volume, and repeat behavior.

Snooze Alerts temporarily suppresses battery/offline/recovery notifications for the selected monitor while monitoring continues. Preset durations and a custom resume date/time are available. The device's actual state still appears in the grid while snoozed.

Identity/security failures are never snoozed."),

        ("Firmware Updates",
@"Production firmware updates are signed.

Use Setup > Update Firmware. The Windows client verifies the production signature before transfer and the ESP32 independently verifies the received image before selecting it for boot.

A new image has a health probation before permanent acceptance. Invalid, tampered, wrong-application, equal, or older releases are rejected by the applicable firmware policy. Device configuration and stored credentials are preserved across normal updates."),

        ("Troubleshooting",
@"Device not discovered:
• Confirm the monitor is powered and connected to the expected 2.4 GHz network.
• Use Discover Now.
• Check Signal Strength in the main grid. Weak/Very Weak links may be unreliable.
• If necessary, use USB setup/recovery.

ESP32 not detected over USB:
• Confirm Windows shows the expected COM port.
• Close other serial applications that may own the port.
• Try a known data-capable USB cable.

Device Password not initialized or forgotten:
• Connect by trusted USB.
• Open Setup > Set Up / Recover Device by USB.
• Read the monitor and initialize/rotate its Device Password.

Setup network not visible:
• The Device Password must already be initialized.
• If home Wi-Fi is reachable, the fallback setup network normally is not needed.
• Use Change Wi-Fi to deliberately enter secure setup.

Identity failure:
• Do not trust the displayed monitor identity or battery state until the trust problem is resolved. Re-pair only after confirming you are communicating with the intended physical device."),

        ("About",
@"Battery Monitor

Windows monitoring and setup client for Battery Monitor devices.

The app provides authenticated monitoring, alerts, battery-profile configuration, secure Wi-Fi setup/recovery, and signed firmware updates.

Factory provisioning, calibration, radio/HTTP service tuning, serial engineering access, diagnostics, and QR/label production are intentionally kept out of the customer application.")
    ];

    public HelpForm(string? initialTopic = null)
    {
        Text = "Battery Monitor Help";
        Icon = AppIcon.Current;
        Width = 860;
        Height = 650;
        MinimumSize = new Size(700, 500);
        StartPosition = FormStartPosition.CenterParent;

        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 210 };
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
