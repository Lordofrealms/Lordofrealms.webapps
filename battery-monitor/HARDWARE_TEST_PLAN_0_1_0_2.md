# Battery Monitor 0.1.0.2 — Encrypted Hardware Validation Plan

**Release under test:** `0.1.0.2`  
**Software release sequence:** `2`  
**Validated product-source SHA:** `d1d6c0ed782116d58f925543ae599939c0ec0191`  
**Normal CI authority:** Battery Monitor Toolchain #167 / run `34263129626` — SUCCESS  
**Signed release authority:** Battery Monitor Signed Firmware Release #2 / run `34267079480` — SUCCESS  
**Secure Boot:** OFF for this test gate  
**Production signed package:** VERIFIED and recorded in `HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md`

## 1. Purpose

This plan is the physical validation gate before Battery Monitor may enable Secure Boot or irreversible eFuse application anti-rollback.

The test validates Release Flash Encryption + NVS Encryption + signed USB OTA on real classic ESP32 / ESP32-WROOM-32 hardware without weakening recovery, monitoring, relay safety, or provisioning behavior.

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
- stable 12 V-class source or battery simulator for ADC/threshold tests;
- multimeter/reference voltage reading;
- second LAN device for hostile-network/spoof tests where required.

Do not write the plaintext Advanced Tools credential, Device Password, Wi-Fi password, Monitoring Identity Key, production private signing key, or other secrets into this document or test logs.

## 3. Package authority checks

Before touching hardware:

- [ ] Confirm live `battery-monitor-dev` state and read `PROJECT_HANDOFF_LATEST.md` and `PROJECT_STATE_LATEST.md`.
- [ ] Confirm product source is exactly `d1d6c0ed782116d58f925543ae599939c0ec0191`.
- [ ] Confirm `battery-monitor/firmware/idf/version.txt` is `0.1.0.2`.
- [ ] Confirm Toolchain #167 / run `34263129626` succeeded for firmware, Android, and Windows.
- [ ] Confirm signed-release #2 / run `34267079480` succeeded.
- [ ] Confirm signed firmware artifact ID is `10072544011` and ZIP SHA-256 is `b302b2be4e2097974aac122e92efbd2ba8489d943ad7b6885e28af97416cd13f`.
- [ ] Confirm signed Windows artifact ID is `10072631425` and ZIP SHA-256 is `42fba1869e933e9e4bd4fdaa3801333f5426f11639848a007e7003c8ae95ffd6`.
- [ ] Confirm application image SHA-256 is `9e3649ed58d1b3524ce8ed0fa85adc1abe46d32a2240503e836982f4815c690e`.
- [ ] Confirm application signature SHA-256 is `aa87e978fab2ab4a3b1ddc93a72d11a3eea1bfdde6e195b242c2f7d154e359ba`.
- [ ] Confirm production trust-root SPKI SHA-256 is `69d6d94b706c57e783c6e2e4ad17e781e84d1e4e32addbcfca68976483be5e6e`.
- [ ] Confirm `HARDWARE_TEST_ASSET_RECORD_0_1_0_2.md` reports independent application and merged-image RSA-PSS verification `Verified OK`.

**Pass condition:** no package/source/version/signature ambiguity exists before flashing.

## 4. Blank-device first-install path

Use this section only on a blank/un-encrypted ESP32.

- [ ] Use the signed Windows package.
- [ ] Select `Advanced First Install -> First Install (Blank ESP32)`.
- [ ] Confirm the tool validates the production signature before flashing.
- [ ] Flash the signed `BatteryMonitor.ino.merged.bin` first-install image.
- [ ] Do not use `--force` or any post-encryption bypass.
- [ ] Keep power stable through the complete first boot.
- [ ] Capture first-boot serial output.
- [ ] Confirm Release Flash Encryption initializes successfully.
- [ ] Confirm any expected encryption reboot completes.
- [ ] Confirm the device subsequently boots normally.
- [ ] Confirm encrypted NVS initializes successfully.
- [ ] Confirm application version over trusted USB is `0.1.0.2`.

**Pass condition:** blank device becomes an encrypted, bootable Battery Monitor without manual security bypasses.

## 5. Flash Encryption / direct-UART protection

After encrypted first boot:

- [ ] Reboot normally several times and verify reliable boot.
- [ ] Confirm Flash Encryption is active in Release mode.
- [ ] Attempt the normal plaintext direct-UART application-flash path without security-bypass flags.
- [ ] Verify that path is not accepted as the supported post-encryption update/recovery mechanism.
- [ ] Do not use `--force`.

**Pass condition:** post-encryption update authority remains application-mediated signed USB OTA.

## 6. First Device Password -> protected setup AP transition

Start with no saved home Wi-Fi and no Device Password identity.

- [ ] Boot the unit.
- [ ] Confirm no open setup AP exists before trusted USB initialization.
- [ ] Use Windows `USB Setup` to create an initial normal Device Password.
- [ ] Confirm USB reports success and verifies the same password.
- [ ] Without rebooting, scan Wi-Fi from a phone/PC.
- [ ] Confirm `BatteryMonitor-<suffix>` appears promptly.
- [ ] Confirm the setup AP is WPA2-protected.
- [ ] Confirm no open Battery Monitor AP exists.
- [ ] Complete Espressif Security-2 provisioning using the same Device Password.
- [ ] Confirm home Wi-Fi credentials are accepted.
- [ ] Confirm setup AP closes after successful provisioning.
- [ ] Confirm normal monitoring services appear on home Wi-Fi.

**Pass condition:** first Device Password creation immediately enables protected setup without reboot or open AP exposure.

## 7. Device Password / provisioning persistence

- [ ] Reboot after successful setup.
- [ ] Verify Device Password still authenticates management.
- [ ] Verify Wi-Fi credentials persist.
- [ ] Verify calibration factor/offset persist.
- [ ] Power-cycle during otherwise idle operation and re-check persistence.
- [ ] Use supported Wi-Fi reprovisioning and verify Device Password remains unchanged.
- [ ] Confirm Monitoring Identity pairing remains valid through ordinary reprovisioning.

**Pass condition:** encrypted NVS survives reboot/power cycle and supported recovery preserves the intended identities/settings.

## 8. Saved-Wi-Fi failure -> protected fallback

With valid saved Wi-Fi credentials:

- [ ] Make home Wi-Fi unavailable.
- [ ] Reboot or force infrastructure loss.
- [ ] Verify normal STA connection is attempted first.
- [ ] Verify protected `BatteryMonitor-<suffix>` setup AP appears after the connection window fails.
- [ ] Verify fallback remains WPA2 + Security-2 protected.
- [ ] Verify no open AP fallback exists.

**Pass condition:** normal STA is preferred, then protected fallback appears.

## 9. Scheduled fallback retry / active-client deferral

### 9.1 No setup client associated

- [ ] Leave saved home Wi-Fi unavailable and no client associated to setup AP.
- [ ] Observe the scheduled ~10-minute retry.
- [ ] Verify provisioning shuts down cleanly before STA retry.
- [ ] Verify a normal home-Wi-Fi connection window occurs.
- [ ] If home Wi-Fi is still unavailable, verify protected setup returns.
- [ ] Restore home Wi-Fi before a later retry.
- [ ] Verify a scheduled retry reconnects and normal services resume.

### 9.2 Setup client actively associated

- [ ] Enter protected fallback again.
- [ ] Associate a phone/PC before the scheduled retry.
- [ ] Keep it associated through the retry deadline.
- [ ] Verify the monitor does not tear down the setup AP at that deadline.
- [ ] Verify retry is deferred approximately 60 seconds while the setup client remains associated.
- [ ] Disconnect the setup client.
- [ ] Verify a subsequent retry proceeds normally.

**Pass condition:** infrastructure recovery does not race provisioning shutdown or interrupt an active setup client.

## 10. Normal monitoring / WebUI cadence

- [ ] Open embedded WebUI on home Wi-Fi.
- [ ] Verify firmware version `0.1.0.2`.
- [ ] Verify status refreshes at ~1-second intervals.
- [ ] Set ADC sample interval to a slower value such as 10 seconds.
- [ ] Verify page polling remains ~1 second while ADC measurement age/value follows configured sampling cadence.
- [ ] Verify read-only status remains available while management settings are locked.
- [ ] Authenticate with Device Password and verify privileged changes work.
- [ ] Lock the WebUI and verify privileged writes are again blocked.

**Pass condition:** UI responsiveness is independent of ADC sampling and management protection remains intact.

## 11. ADC calibration / persistence

At several stable voltages spanning the actual expected battery range, preferably including approximately 10–11 V and 14–15 V:

- [ ] Record reference multimeter voltage.
- [ ] Record raw ADC value/millivolts.
- [ ] Record Battery Monitor reported voltage before calibration.
- [ ] Calculate/apply calibration factor and offset.
- [ ] Read back settings and verify they were saved.
- [ ] Reboot and verify calibration persists.
- [ ] Power-cycle and verify calibration persists.
- [ ] After a normal signed application OTA, verify calibration persists.
- [ ] Verify measurement stability is adequate for configured thresholds.
- [ ] Verify 1-second WebUI polling does not materially disturb ADC stability.

Calibration is stored in NVS (`calf` / `calo`). Normal reboot, power loss, and application-mediated signed OTA should preserve it. Full-chip erase/NVS destruction is not expected to preserve it.

**Pass condition:** calibration is accurate enough over the real battery range and persists across supported lifecycle operations.

## 12. USB Setup battery-threshold behavior

- [ ] Read current settings in Windows USB Setup.
- [ ] Change battery chemistry selection only.
- [ ] Verify Low/Critical fields do not silently change.
- [ ] Press `Apply Chemistry Defaults`.
- [ ] Verify defaults then change explicitly.
- [ ] Save and read back settings.

**Pass condition:** chemistry selection alone never overwrites user thresholds.

## 13. Advanced Tools / factory credential gate

- [ ] Launch Advanced Tools.
- [ ] Verify it asks for the preconfigured Advanced Tools password rather than first-run password creation.
- [ ] Verify incorrect password rejection.
- [ ] Verify repeated failures trigger escalating temporary lockout.
- [ ] After lockout expires, verify the correct out-of-band credential succeeds.
- [ ] Verify plaintext Advanced Tools credential is not displayed or logged.
- [ ] In Factory Setup Code / QR, read a device.
- [ ] Generate a code and confirm no QR can be saved before verification.
- [ ] Write and verify the code; confirm QR becomes available only then.
- [ ] Edit the code and confirm QR authority clears.
- [ ] Change COM port and confirm loaded device/code/QR authority clears.
- [ ] Swap boards on the same port before Write/Verify and confirm Device ID re-check fails closed.

**Pass condition:** developer/factory controls are gated and printed QR authority is tied to a verified physical device/code pair.

## 14. Device Password compatibility matrix

Execute `DEVICE_PASSWORD_COMPATIBILITY_TEST_0_1_0_2.md`, including:

- [ ] normal arbitrary password;
- [ ] exact historical formatted factory-code shape;
- [ ] lowercase historical formatted input;
- [ ] near-match containing excluded legacy characters that must remain literal;
- [ ] Windows Security-2 provisioning;
- [ ] Android Security-2 provisioning;
- [ ] USB verification;
- [ ] LAN/WebUI management authentication.

**Pass condition:** firmware, Windows, Android, and WebUI agree on the narrow legacy compatibility boundary.

## 15. Signed USB OTA — application path

For an already-encrypted unit, use the signed Windows package and `Firmware Update -> Update Firmware`.

- [ ] Confirm Windows validates the production signature before transfer.
- [ ] Confirm `FWBEGIN` accepts only valid image/signature/release material.
- [ ] Confirm bounded chunk transfer completes.
- [ ] Confirm ESP32 independently verifies hash, identity, release sequence, and RSA-PSS signature.
- [ ] Confirm candidate is selected only after complete validation.
- [ ] Confirm device boots the new slot and reports `0.1.0.2`.
- [ ] Keep power stable through the 60-second probation.
- [ ] Confirm candidate is marked valid.
- [ ] Confirm Device Password, Wi-Fi, Monitoring Identity, calibration, thresholds, and other NVS settings remain intact.
- [ ] Confirm encrypted-NVS release floor advances to sequence 2.

**Pass condition:** signed application OTA succeeds without direct plaintext flashing and preserves expected NVS state.

## 16. OTA reverse-slot direction

Use a legitimately newer signed test release if/when needed; do not reduce sequence numbers just to force this test.

- [ ] Confirm update writes the opposite inactive OTA slot.
- [ ] Confirm signature/release checks remain identical.
- [ ] Confirm boot/probation succeeds.

**Pass condition:** both OTA directions function under Flash Encryption.

## 17. Tampered / wrong-signature rejection

### Windows-side

- [ ] Modify one byte of a copy of the signed application image while keeping original signature.
- [ ] Verify Windows refuses it before transfer.
- [ ] Pair correct image with a wrong signature and verify refusal.

### Device-side

Using a controlled test mechanism that still exercises firmware verification:

- [ ] Present a tampered image/signature combination.
- [ ] Verify ESP32 refuses boot selection.
- [ ] Present a wrong-key signature.
- [ ] Verify ESP32 refuses boot selection.
- [ ] Verify currently running valid application remains intact.

**Pass condition:** host and device independently reject invalid release material.

## 18. Interrupted / timeout OTA

At separate controlled points:

- [ ] interrupt early transfer;
- [ ] interrupt mid-image;
- [ ] allow firmware-update timeout;
- [ ] power-cycle before `FWEND` where safe;
- [ ] after each case verify old valid application remains bootable/current;
- [ ] verify partial inactive-slot data is never selected.

**Pass condition:** incomplete update cannot replace the valid application.

## 19. Rollback probation failure

Use a deliberately controlled validly signed test candidate that can fail health validation.

- [ ] Install candidate.
- [ ] Cause reset/watchdog/power loss before 60-second validation completes.
- [ ] Verify ESP-IDF rollback returns to previous valid slot.
- [ ] Verify previous application is functional afterward.
- [ ] Verify failed candidate was not silently marked valid.

**Pass condition:** post-boot probation provides real rollback protection.

## 20. Signed software downgrade rejection

Requires an older legitimately signed Battery Monitor image below the stored release floor.

- [ ] Establish release floor at sequence 2 or later.
- [ ] Attempt signed USB OTA using an older legitimate signed sequence.
- [ ] Verify firmware rejects it before boot selection.
- [ ] Verify current valid app remains active.
- [ ] Reboot and confirm release floor persists.

**Pass condition:** signed-but-old firmware is rejected.

## 21. Monitoring Identity / spoof resistance

- [ ] Pair legitimate monitor through supported trusted process.
- [ ] Confirm authenticated discovery/status succeeds.
- [ ] Introduce a device/service mimicking Battery Monitor discovery without Monitoring Identity Key.
- [ ] Verify client does not accept it as paired monitor.
- [ ] Replay stale authenticated data where feasible.
- [ ] Verify freshness/replay handling rejects stale material.
- [ ] Confirm legitimate monitor still works afterward.

**Pass condition:** unauthenticated LAN impersonation does not become trusted.

## 22. LAN-management hostile tests

Known residual limitation: HTTP management bearer values are not end-to-end protected from an active on-path LAN attacker. Do not mark that known limitation fixed by this test.

Validate protections that do exist:

- [ ] bad Device Password proof rejected;
- [ ] challenge replay rejected;
- [ ] expired challenge rejected;
- [ ] expired management session rejected;
- [ ] source-IP/session mismatch rejected;
- [ ] missing/incorrect CSRF rejected for privileged write;
- [ ] repeated failed authentication rate-limited/locked out;
- [ ] password rotation protected by current encrypted session-derived mechanism;
- [ ] Monitoring Identity Key export protected and not logged in plaintext.

Record active-on-path residual risk for future `BATMON-MGMT-WRITE-V2` work.

## 23. Relay / freshness / fail-safe regression

- [ ] Verify relay default/fail-safe state at boot.
- [ ] Verify normal battery-state behavior.
- [ ] Verify low-voltage behavior.
- [ ] Verify critical-voltage behavior.
- [ ] Verify stale/invalid sensor data forces intended safe behavior.
- [ ] Verify communication/network loss does not create unsafe relay state.
- [ ] Verify reboot/power interruption returns to safe behavior.
- [ ] Verify configuration persistence does not bypass freshness checks.

**Pass condition:** security/networking changes have not weakened battery/relay safety.

## 24. Power interruption matrix

Repeat controlled power interruption during:

- [ ] normal monitoring;
- [ ] immediately after settings save;
- [ ] after Wi-Fi provisioning;
- [ ] while protected fallback AP is active;
- [ ] during scheduled fallback transition where safe;
- [ ] during OTA transfer before completion;
- [ ] during OTA candidate probation.

For every case record whether the device returns to the correct safe/valid state.

## 25. Final acceptance record

Do not enable Secure Boot until every required item is PASS or has an explicitly accepted blocker.

Record:

- hardware unit(s) tested;
- signed-release run ID `34267079480`;
- exact source SHA `d1d6c0ed782116d58f925543ae599939c0ec0191`;
- application version `0.1.0.2`;
- signed first-install image SHA-256;
- signed application image SHA-256;
- signed Windows package SHA-256;
- test date;
- tester;
- each section PASS / FAIL / BLOCKED;
- links/references to retained logs/photos/serial captures;
- any deviations or accepted blockers.

Final decision:

- [ ] **PASS — eligible to proceed to Secure Boot/eFuse production-gate design and validation**
- [ ] **FAIL — do not enable Secure Boot; correct defects and repeat affected/full validation as appropriate**
- [ ] **BLOCKED — do not enable Secure Boot until blocker is resolved or explicitly dispositioned**

Any product-source fix after this signed release requires a new complete normal toolchain validation and a new signed release before hardware authority can move to that source.
