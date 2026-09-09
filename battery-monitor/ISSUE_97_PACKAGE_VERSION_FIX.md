Issue #97 follow-up, 2026-09-08/09:

Observed on signed Windows 0.1.0.4: device-installed firmware version displayed correctly, but package/update version displayed as `unknown`.

Root cause: signed Windows packages carry authoritative `firmware/SIGNED_RELEASE.txt`; `EspFlasher.ReleaseMetadataPath` searched only for legacy `firmware/RELEASE.txt`.

Fix: commit `4556281013896c7e5ad7d48ac2affcf32d0a5d16` now prefers `SIGNED_RELEASE.txt`, retains legacy `RELEASE.txt`, and falls back to `firmware/version.txt` for the update version.

No firmware bytes/signatures changed. Rebuild the Windows client around the existing signed 0.1.0.4 firmware.
