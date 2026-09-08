# Battery Monitor 0.1.0.2 — Encrypted Hardware Validation Plan

**Release under test:** `0.1.0.2`  
**Software release sequence:** `2`  
**Validated product-source SHA:** `9f833f8e6ebd596b6f8b7906b478858492d116cf`  
**Normal CI authority:** Battery Monitor Toolchain #156 / run `34257017954` — SUCCESS  
**Secure Boot:** OFF for this test gate  
**Production signed package:** must be produced by the existing manual signed-release workflow before signed-OTA tests

## 1. Purpose

This plan is the physical validation gate before Battery Monitor may enable Secure Boot or irreversible eFuse application anti-rollback.

The test must validate the current Release Flash Encryption + NVS Encryption + signed USB OTA architecture on real classic ESP32 / ESP32-WROOM-32 hardware without weakening the existing recovery, monitoring, relay safety, or provisioning behavior.

Do not enable Secure Boot while executing this plan.

## 2. Required test assets

Record the exact values used for each run:

- monitor board/unit identifier;
- ESP32 module/board revision;
- USB serial port;
- source SHA;
- firmware version;
- signed-release workflow run ID;
- signed firmware artifact SHA-256;
- Windows package artifact SHA-256;
- test router/AP SSID used for normal Wi-Fi;
- a deliberately unavailable/incorrect saved Wi-Fi condition for fallback testing;
- stable 12 V-class test source or battery simulator for ADC/threshold tests;
- multimeter/reference voltage reading;
- second LAN device for hostile-network/spoof tests where required.

Do not write the plaintext Advanced Tools credential, Device Password, Wi-Fi password, Monitoring Identity Key, production private signing key, or other secrets into this document or test logs.

## 3. Package authority checks

Before touching hardware:

- [ ] Confirm live `battery-monitor-dev` state and read `PROJECT_HANDOFF_LATEST.md` and `PROJECT_STATE_LATEST.md`.
- [ ] Confirm the product source being tested is exactly `9f833f8e6ebd596b6f8b7906b478858492d116cf`.
- [ ] Confirm `battery-monitor/firmware/idf/version.txt` is `0.1.0.2`.
- [ ] Confirm Toolchain #156 succeeded for firmware, Android, and Windows.
- [ ] Confirm production signed-release workflow was dispatched with `source_sha=9f833f8e6ebd596b6f8b7906b478858492d116cf` and `version=0.1.0.2`.
- [ ] Confirm signed-release workflow is fully green before using its output.
- [ ] Confirm the signed application payload and detached signature are paired from the same signed-release artifact.
- [ ] Confirm the production trust-root fingerprint is `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`.

**Pass condition:** no package/source/version ambiguity exists before flashing.

## 4. Blank-device first-install path

Use this section only on a blank/un-encrypted ESP32.

The 4 MiB merged image is a first-install image only.

- [ ] Connect blank unit by physical USB/UART.
- [ ] Flash the exact `BatteryMonitor.ino.merged.bin` generated from the validated source/release package using the supported first-install path.
- [ ] Do not use a post-encryption `--force` bypass.
- [ ] Power-cycle the unit.
- [ ] Capture first-boot serial output.
- [ ] Confirm Release Flash Encryption initializes successfully.
- [ ] Confirm the device reboots as expected during encryption activation.
- [ ] Confirm the device subsequently boots normally.
- [ ] Confirm NVS initialization succeeds.
- [ ] Confirm application version reported over trusted USB is `0.1.0.2`.

**Pass condition:** blank device becomes an encrypted, bootable Battery Monitor without manual security bypasses.

## 5. Flash Encryption / direct-UART protection

After the unit has completed encrypted first boot:

- [ ] Reboot normally several times and verify normal boot remains reliable.
- [ ] Confirm the device is operating with Flash Encryption active in Release mode.
- [ ] Attempt the normal plaintext direct-UART application-flash path without security-bypass flags.
- [ ] Verify that path is not accepted as the supported post-encryption recovery/update mechanism.
- [ ] Do not use `--force` or any action intended to defeat encrypted-device protections.

**Pass condition:** post-encryption update authority remains the running application's signed USB OTA path, not plaintext direct flashing.

## 6. First Device Password -> protected setup AP transition

Start with a unit that has no saved home Wi-Fi and no Device Password identity.

- [ ] Boot unit.
- [ ] Confirm no open setup AP is created before trusted USB initialization.
- [ ] Use the trusted USB setup path to create the initial Device Password.
- [ ] Confirm USB reports success.
- [ ] Without rebooting the monitor, scan Wi-Fi from a phone/PC.
- [ ] Confirm `BatteryMonitor-<suffix>` appears promptly.
- [ ] Confirm the setup AP is WPA2-protected; no open Battery Monitor AP should exist.
- [ ] Complete Espressif Security-2 provisioning using the same Device Password.
- [ ] Confirm the unit receives/uses home Wi-Fi credentials.
- [ ] Confirm setup AP closes after successful provisioning.
- [ ] Confirm normal monitoring services become available on home Wi-Fi.

**Pass condition:** initial Device Password creation immediately enables protected Security-2 setup without reboot and without exposing an open AP.

## 7. Device Password and provisioning-secret persistence

- [ ] Reboot unit after successful setup.
- [ ] Verify Device Password still authenticates management access.
- [ ] Verify Wi-Fi credentials persist.
- [ ] Power-cycle during otherwise idle operation and re-check persistence.
- [ ] Use the supported Wi-Fi reprovisioning path and verify the Device Password remains unchanged.
- [ ] Confirm Monitoring Identity pairing remains valid through ordinary Wi-Fi reprovisioning.

**Pass condition:** encrypted NVS survives reboot/power cycle and supported recovery paths preserve the correct security identities.

## 8. Saved-Wi-Fi failure -> protected fallback

With valid saved Wi-Fi credentials present:

- [ ] Make the saved home Wi-Fi unavailable.
- [ ] Reboot the monitor or otherwise force loss of infrastructure Wi-Fi.
- [ ] Verify the monitor attempts normal STA connection first.
- [ ] Verify that after the connection window fails, the protected `BatteryMonitor-<suffix>` setup AP appears.
- [ ] Verify fallback AP remains WPA2 + Security-2 protected.
- [ ] Verify there is no open AP fallback.

**Pass condition:** normal STA is preferred, then protected fallback appears when infrastructure Wi-Fi cannot be reached.

## 9. Scheduled fallback retry and active-client deferral

This specifically validates the 0.1.0.2 fallback-transition hardening.

### 9.1 No client associated

- [ ] Leave saved home Wi-Fi unavailable and leave no client associated to the setup AP.
- [ ] Observe the scheduled ~10-minute retry.
- [ ] Verify provisioning shuts down cleanly before the firmware switches to STA retry mode.
- [ ] Verify the monitor gets a normal connection attempt window.
- [ ] If home Wi-Fi is still unavailable, verify the protected setup AP returns.
- [ ] Restore home Wi-Fi before a later retry.
- [ ] Verify a scheduled retry reconnects to home Wi-Fi and normal services resume.

### 9.2 Setup client actively associated

- [ ] Again make home Wi-Fi unavailable and enter protected fallback.
- [ ] Associate a phone/PC with the protected setup AP before the scheduled retry time.
- [ ] Keep the client associated through the retry deadline.
- [ ] Verify the monitor does not tear down the setup AP at that deadline.
- [ ] Verify retry is deferred approximately 60 seconds while a setup client remains associated.
- [ ] Disconnect the setup client.
- [ ] Verify a subsequent retry can proceed normally.

**Pass condition:** scheduled retry recovers infrastructure Wi-Fi without racing provisioning shutdown and without interrupting an actively associated setup client.

## 10. Normal monitoring and WebUI cadence

With the monitor connected to home Wi-Fi:

- [ ] Open embedded WebUI.
- [ ] Verify displayed firmware version is `0.1.0.2`.
- [ ] Verify status refreshes at approximately 1-second intervals.
- [ ] Set ADC sample interval to a slower value, such as 10 seconds.
- [ ] Verify the page continues polling at ~1 second while measurement age/value changes according to ADC sampling cadence rather than forcing 1-second ADC sampling.
- [ ] Verify read-only battery status remains available while management settings are locked.
- [ ] Authenticate settings using the Device Password and verify privileged changes work.
- [ ] Lock the WebUI and confirm privileged changes are no longer permitted.

**Pass condition:** UI responsiveness is independent from ADC sample cadence and management protection remains intact.

## 11. USB Setup battery-threshold behavior

- [ ] Open Windows USB Setup and read current monitor settings.
- [ ] Change battery chemistry selection only.
- [ ] Verify Low/Critical voltage fields do not silently change.
- [ ] Press `Apply Chemistry Defaults`.
- [ ] Verify defaults now change explicitly to the selected chemistry's values.
- [ ] Save and read back settings.
- [ ] Verify values on the device match the explicitly chosen thresholds.

**Pass condition:** chemistry selection alone never overwrites user thresholds.

## 12. Advanced Tools gate

- [ ] Launch Advanced Tools.
- [ ] Verify the application asks for the preconfigured Advanced Tools password rather than offering first-run password creation.
- [ ] Verify an incorrect password is rejected.
- [ ] Verify repeated failures eventually trigger escalating temporary lockout.
- [ ] After lockout expires, verify the correct out-of-band credential succeeds.
- [ ] Search application UI/log output and confirm the plaintext Advanced Tools credential is not displayed or logged.

**Pass condition:** developer-controlled Advanced Tools authentication is enforced without plaintext credential storage/exposure.

## 13. Signed USB OTA — slot A -> slot B

Use an already encrypted unit running an earlier valid signed release where practical.

- [ ] Connect physical USB.
- [ ] Use the Windows signed firmware-update path with `BatteryMonitor.ino.bin` + matching `.sig` from the production signed `0.1.0.2` package.
- [ ] Confirm Windows validates the production signature before transfer.
- [ ] Confirm device accepts `FWBEGIN` only for a valid image/signature/release sequence.
- [ ] Confirm bounded chunk transfer completes.
- [ ] Confirm ESP32 independently verifies hash, application identity, release sequence, and RSA-PSS signature.
- [ ] Confirm candidate is selected for next boot.
- [ ] Confirm device boots the new slot.
- [ ] Confirm application version reports `0.1.0.2`.
- [ ] Leave unit healthy through the 60-second probation.
- [ ] Confirm candidate is marked valid.
- [ ] Confirm encrypted-NVS release floor advances to sequence 2.

**Pass condition:** signed application OTA succeeds without plaintext direct flashing and survives probation.

## 14. Signed USB OTA — reverse slot direction

Repeat a later valid signed update using the opposite inactive slot when an appropriate newer test-signed sequence exists.

- [ ] Confirm update writes the opposite OTA slot.
- [ ] Confirm signature/release checks are identical.
- [ ] Confirm boot/probation succeeds.

**Pass condition:** both OTA directions function under Flash Encryption.

Do not reduce the software release sequence merely to force this test; use a legitimately newer signed test release if needed.

## 15. Tampered/wrong-signature rejection

### Windows-side rejection

- [ ] Modify one byte of a copy of the signed application image and keep the original signature.
- [ ] Verify Windows refuses it before transfer.
- [ ] Pair the correct image with a signature from a different key/image.
- [ ] Verify Windows refuses it.

### Device-side rejection

Using a controlled test mechanism that still exercises the firmware verifier:

- [ ] Present a tampered image/signature combination.
- [ ] Verify ESP32 refuses boot selection.
- [ ] Present a wrong-key signature.
- [ ] Verify ESP32 refuses boot selection.
- [ ] Verify currently running application remains intact.

**Pass condition:** both host and device independently reject invalid release material.

## 16. Interrupted/timeout OTA

At separate controlled points:

- [ ] Interrupt transfer early.
- [ ] Interrupt transfer mid-image.
- [ ] Allow firmware-update timeout to expire.
- [ ] Power-cycle before `FWEND` on a test where doing so is safe.
- [ ] After each interruption, verify old valid application remains bootable/current.
- [ ] Verify partial inactive-slot contents are never selected as boot target.

**Pass condition:** incomplete update cannot replace the currently valid application.

## 17. Rollback probation failure

Use a deliberately controlled candidate that can fail the health gate without disabling security checks.

- [ ] Install a validly signed test candidate.
- [ ] Cause reset/watchdog/power loss before 60-second validation completes.
- [ ] Verify ESP-IDF rollback returns to the previous valid slot as expected.
- [ ] Verify old application is functional afterward.
- [ ] Verify failed candidate is not silently marked valid.

**Pass condition:** post-boot probation provides real rollback protection.

## 18. Signed software downgrade rejection

Requires an older legitimately signed Battery Monitor image with a release sequence below the stored floor.

- [ ] First establish encrypted-NVS release floor at sequence 2 or later.
- [ ] Attempt signed USB OTA using an older legitimately signed sequence.
- [ ] Verify firmware rejects it before boot selection.
- [ ] Verify current valid application remains active.
- [ ] Reboot and confirm release floor persists.

**Pass condition:** signed-but-old firmware is rejected even though its RSA signature is legitimate.

## 19. Monitoring Identity / spoof resistance

- [ ] Pair the legitimate monitor through the supported trusted process.
- [ ] Confirm authenticated discovery/status succeeds.
- [ ] Introduce a device/service that mimics Battery Monitor discovery fields but does not possess the Monitoring Identity Key.
- [ ] Verify Windows/authorized client does not accept it as the paired monitor.
- [ ] Replay stale authenticated data where feasible.
- [ ] Verify freshness/replay handling rejects stale material.
- [ ] Confirm legitimate monitor still works after hostile test traffic.

**Pass condition:** unauthenticated LAN impersonation does not become a trusted monitor.

## 20. LAN-management hostile tests

The current residual design limitation is known: HTTP management bearer values are not end-to-end protected from an active on-path attacker. Do not mark that known limitation as fixed by this test.

Validate all protections that do exist:

- [ ] bad Device Password proof is rejected;
- [ ] challenge replay is rejected;
- [ ] expired challenge is rejected;
- [ ] expired management session is rejected;
- [ ] source-IP/session mismatch is rejected;
- [ ] missing/incorrect CSRF token is rejected for privileged write;
- [ ] repeated failed authentication triggers rate limiting/lockout;
- [ ] password rotation remains protected by the current encrypted session-derived mechanism;
- [ ] Monitoring Identity Key export remains protected and is not logged in plaintext.

Record the active-on-path residual risk separately for future `BATMON-MGMT-WRITE-V2` work.

## 21. Relay/freshness/fail-safe regression

Do not let security testing obscure the primary device safety behavior.

- [ ] Verify relay default/fail-safe state at boot.
- [ ] Verify relay behavior for normal battery state.
- [ ] Verify low-voltage behavior.
- [ ] Verify critical-voltage behavior.
- [ ] Verify stale/invalid sensor data forces the intended safe behavior.
- [ ] Verify communication/network loss does not create an unsafe relay state.
- [ ] Verify reboot/power interruption returns to safe behavior.
- [ ] Verify configuration persistence does not bypass freshness checks.

**Pass condition:** security and networking changes have not weakened battery/relay safety behavior.

## 22. ADC calibration / measurement sanity

At several stable input voltages within the expected operating range:

- [ ] Record reference multimeter voltage.
- [ ] Record raw ADC value/millivolts.
- [ ] Record Battery Monitor reported voltage.
- [ ] Verify calibration factor/offset persistence.
- [ ] Verify measurement remains stable enough for configured thresholds.
- [ ] Verify the 1-second WebUI poll does not materially disturb ADC stability.

Record error in volts and percent for each point.

## 23. Power interruption matrix

Repeat controlled power interruption during:

- [ ] normal monitoring;
- [ ] immediately after settings save;
- [ ] after Wi-Fi provisioning;
- [ ] while protected fallback AP is active;
- [ ] during scheduled fallback transition where safe;
- [ ] during OTA transfer before completion;
- [ ] during OTA candidate probation.

For every case record whether the device returns to the correct safe/valid state.

## 24. Final acceptance record

Do not enable Secure Boot until every required item is either PASS or has an explicitly accepted blocker.

Record:

- hardware unit(s) tested;
- signed-release workflow run ID;
- exact source SHA;
- exact application version;
- first-install image SHA-256;
- application image SHA-256;
- Windows package SHA-256;
- test date;
- each section PASS / FAIL / BLOCKED;
- links to logs/photos/serial captures if retained;
- all defects discovered and their fixing commit SHAs;
- final re-validation CI run after any product-source fix.

### Secure Boot gate

Secure Boot/eFuse production policy may be considered only when:

- required hardware sections above pass;
- signed OTA and rollback are demonstrated on real encrypted hardware;
- downgrade protection is demonstrated;
- recovery behavior is understood and accepted;
- no unresolved defect could brick production units or weaken relay/battery safety;
- the exact post-test product source is re-run through the complete Battery Monitor Toolchain;
- a new authoritative state/handoff explicitly marks the hardware gate complete.
