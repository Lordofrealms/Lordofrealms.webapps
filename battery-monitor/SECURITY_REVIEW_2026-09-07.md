# Battery Monitor Security Review — 2026-09-07

Reviewed branch: `battery-monitor-dev`
Reviewed live source head at start: `f2b74a21e778093d1f7a320427fe3d24b24125e8`

This review is focused on risks that could expose the user's home Wi-Fi credentials, allow unauthorized control or falsification of battery state, cause loss of monitoring, or allow hostile firmware/device takeover.

## Release-blocking findings

### P0-1 — Open setup AP + plaintext HTTP exposes home Wi-Fi password

**Severity: Critical for a distributable product / High for a private prototype.**

`startFallbackAp()` currently calls `WiFi.softAP(apSsid.c_str())` with no password. The Android setup app connects to any network matching the `BatteryMonitor-` prefix and sends the home SSID/password by HTTP POST to `http://192.168.4.1/api/wifi`.

Consequences:

- Setup traffic is not encrypted at the Wi-Fi link layer because the setup AP is open.
- A nearby passive observer can potentially capture the provisioning HTTP request and recover the home Wi-Fi password.
- A rogue access point can advertise a `BatteryMonitor-*` SSID, answer at `192.168.4.1`, and impersonate the ESP32. The Android app has no proof that it connected to the intended physical device before sending the home Wi-Fi password.
- The fallback AP opens automatically after an already-configured monitor loses its infrastructure Wi-Fi for 30 seconds, so an RF/network outage can create the unauthenticated management interface without physical user action.

**Required direction:** Do not ship this provisioning design. Use secure provisioning with device authentication/proof-of-possession. Suitable directions include Espressif unified provisioning Security 1/2 with a per-device PoP, or a WPA2/WPA3 setup AP with a unique per-device secret plus authenticated application-layer provisioning. Prefer requiring physical setup-mode activation rather than automatically exposing provisioning whenever normal Wi-Fi is unavailable.

Until secure Android provisioning exists, USB provisioning is the safer default V0.1 path.

### P0-2 — LAN management API has no authentication or authorization

**Severity: High.**

The following state-changing endpoints are reachable on normal infrastructure Wi-Fi with no credentials or device authorization:

- `POST /api/config`
- `POST /api/wifi`
- `POST /api/reset-wifi`

An arbitrary LAN client can:

- change low/critical alarm thresholds;
- change ADC calibration factor/offset and therefore falsify the reported voltage;
- alter sampling interval;
- rename the device;
- replace Wi-Fi credentials and remove the unit from the user's network;
- clear Wi-Fi and force the unit back into setup mode.

This directly affects the integrity of the safety function: an attacker could configure thresholds/calibration so a genuinely low battery appears healthy and no low-battery alert is generated.

**Required direction:** Make the normal LAN web page/status API read-only until authenticated management is implemented. Gate Wi-Fi provisioning/reset behind secure provisioning/physical-presence mode. If LAN configuration is retained, use per-device authenticated requests rather than relying on the LAN being trusted.

### P0-3 — Windows LAN discovery/device identity can be spoofed

**Severity: High.**

UDP discovery is unauthenticated. The Windows client currently:

- accepts any JSON reply identifying itself as `BATMON_DISCOVERY_V1`;
- trusts a non-empty `ip` field supplied by the sender instead of always binding discovery to the UDP source address;
- automatically adds previously unseen device IDs to persistent configuration;
- allows a discovery reply for an existing device ID to replace its stored address;
- polls that address and accepts `/api/status` without verifying that `status.deviceId` equals the expected device ID or cryptographically authenticating the response.

A hostile LAN device can therefore create fake monitors, redirect a known monitor identity to another IP, and potentially feed the tray client false battery state.

**Required direction:**

1. Never trust a discovery payload's claimed IP; use the UDP source IP.
2. Do not automatically trust/persist an unpaired discovery result.
3. At minimum verify the HTTP status device ID matches the expected device ID and disable automatic HTTP redirects.
4. For real identity protection, provision a unique per-device secret/key through USB or secure onboarding and authenticate discovery/status responses (for example HMAC over a client nonce and response fields), or pin a device TLS identity.

Device ID/MAC-derived names alone are identifiers, not authentication secrets.

## Important findings

### P1-1 — Wi-Fi credentials are readable from flash with physical access

**Severity: High if the installed device is physically accessible; lower for a private locked vehicle prototype.**

The firmware explicitly stores `wifiPassword` in ESP32 Preferences/NVS. No NVS encryption, Flash Encryption, or Secure Boot is enabled in the current Arduino build.

A person with physical access to an unprotected ESP32/flash can read or alter NVS data. Since the device is intended to live in a vehicle and expose USB, this matters if theft/physical access is in scope.

**Required product direction:** use NVS encryption together with Flash Encryption; evaluate Secure Boot and disabling/restricting UART ROM download mode after manufacturing. This conflicts with unrestricted end-user factory flashing, so the production and development/factory security modes should be deliberately separated.

### P1-2 — Arduino-ESP32 3.3.11 WebServer has a known post-release slow-header DoS issue

**Severity: Medium/High availability issue.**

The project is pinned to Arduino-ESP32 3.3.11. Upstream issue #12788 documents that `WebServer::handleClient()` in 3.3.11 can be held inside request parsing by a slow/incomplete HTTP header stream, stopping the Arduino main loop. Upstream fix #12794 landed after the 3.3.11 release.

Because this project performs sampling, UDP discovery, Wi-Fi servicing, reset-button servicing, and WebServer handling in the same Arduino loop, a hostile LAN client may be able to stop normal monitoring until watchdog/reset/recovery.

The older publicly disclosed WebServer multipart overflow and digest-auth issues were fixed in 3.3.8, so 3.3.11 includes those patches. The newer slow-header fix is the concern here.

**Required direction:** move to the first released Arduino-ESP32 version containing #12794, or vendor/otherwise incorporate the upstream fix before treating the HTTP server as hostile-LAN robust.

### P1-3 — Browser state-changing endpoints are CSRF-friendly

**Severity: Medium/High depending on browser/network controls.**

The web UI/API uses unauthenticated `application/x-www-form-urlencoded` POST requests. These are "simple" browser requests and should not be treated as protected merely because the server has no CORS headers. A malicious web origin may be able to cause state-changing requests to a LAN device in browser contexts where local-network policy permits the request.

**Required direction:** authentication first. In addition, require an unpredictable anti-CSRF/session token or a custom authenticated request header for browser-driven state changes; validate Origin/Fetch Metadata where practical. Wi-Fi/reset actions should require stronger physical/setup-mode authorization.

### P1-4 — Firmware authenticity / unrestricted physical reflashing

**Severity: Medium for prototype; High for a product exposed to physical attackers.**

Current ESP32 hardware security does not prevent an attacker with physical access from replacing firmware through ROM download mode. The advanced Windows flasher is also intentionally capable of writing a complete merged image at `0x0`.

For a consumer/product mode, Secure Boot and Flash Encryption should be evaluated so only authorized firmware runs and stored secrets cannot be extracted. This should be a separate product-security mode from development boards where unrestricted recovery flashing is desired.

## Medium/low findings and hardening opportunities

### Windows discovery can be used as a small SSRF-like primitive

Because a discovery sender can currently supply an arbitrary `ip`, the Windows app can be induced to poll `http://<claimed-ip>:<port>/api/status`. Even without device impersonation, this allows a malicious LAN sender to make the PC issue HTTP requests to arbitrary addresses/ports. Binding the address to the UDP source and validating allowed port/address shapes removes most of this issue.

### Windows HTTP client follows redirects by default

`HttpClient` uses automatic redirect behavior by default. A malicious/fake device could redirect polling to another host. Set `AllowAutoRedirect=false` for Battery Monitor device traffic and reject unexpected HTTP status codes/content types.

### Android globally enables cleartext traffic

`android:usesCleartextTraffic="true"` enables cleartext HTTP app-wide. The app currently only uses the local provisioning address, so the practical exposure is limited, but the permission should be narrowed or eliminated when secure provisioning is implemented.

### Android app backup is enabled

`android:allowBackup="true"` is not currently exposing a stored Wi-Fi password because the app does not persist the password, but a provisioning/security app should generally avoid backup of future sensitive state unless deliberately needed.

### CI/release supply-chain hardening

Positive: the Windows CI download of Espressif esptool 5.3.1 is SHA-256 pinned before packaging.

Remaining hardening:

- Pin GitHub Actions to immutable commit SHAs rather than floating major tags.
- Hash-pin direct binary downloads such as Arduino CLI.
- Use a release-signed Android APK rather than a debug APK for distribution.
- Code-sign the Windows executable/installer for distributed builds.
- Consider signed firmware/release manifests.
- Use protected release branches/tags and required CI for production releases.

### Device metadata exposure

mDNS and UDP discovery expose device ID, human-readable name, IP/hostname, and firmware version to the local LAN. This is usually acceptable for local discovery but should be treated as non-secret information and should not be used for authentication.

## Positive findings

- Wi-Fi password is not returned by `/api/config` or USB `STATUS`.
- Windows USB provisioning log redacts the Wi-Fi password.
- Device values inserted into the browser page are generally applied through `textContent`, and JSON/HTML escaping exists for generated data, reducing obvious stored-XSS risk.
- State-changing HTTP operations use POST rather than GET.
- The project uses Arduino-ESP32 3.3.11, which includes fixes for the previously disclosed WebServer multipart boundary overflow and digest-auth URI mismatch vulnerabilities fixed in 3.3.8.
- Espressif esptool is checksum-verified by CI before being bundled.

## Recommended secure V0.1 posture

The lowest-complexity secure prototype architecture is:

1. **USB is the normal configuration path.** Wi-Fi credentials and device settings can be set over physical USB.
2. **LAN web/API is read-only** for battery/status information until authenticated control is implemented.
3. **Do not automatically expose an open setup AP** after a normal Wi-Fi failure. Continue retrying infrastructure Wi-Fi; require a physical button action to enter provisioning/recovery mode.
4. **Do not send a home Wi-Fi password through the current Android/open-AP workflow.** Either temporarily treat the Android provisioner as development-only, or replace it with secure PoP-based provisioning.
5. **Pair the Windows client to each device over USB** and give each unit a random device secret. Use that identity to authenticate discovery/status before the tray app trusts battery readings.
6. Move to an Arduino-ESP32 build containing the post-3.3.11 WebServer hardening before product deployment.
7. For product/physical-theft resistance, add NVS/Flash Encryption and Secure Boot as a separate production-security mode.

This preserves the desired user experience while removing the highest-risk paths: the user can configure by USB, then unplug the cable and have the monitor automatically appear on the LAN and provide authenticated battery status.
