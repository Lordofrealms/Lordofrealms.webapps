# Windows package firmware-version display fix for signed 0.1.0.4

Observed on the signed 0.1.0.4 Windows package: the firmware updater correctly showed the device-installed firmware version but displayed the package/update version as `unknown`.

Root cause:
- the signed package contains `firmware/SIGNED_RELEASE.txt` with authoritative `version=0.1.0.4` and `source_sha=...`;
- `EspFlasher.ReleaseMetadataPath` only searched for `firmware/RELEASE.txt`;
- therefore `_flasher.UpdateVersion` was null even though the authoritative signed metadata was present.

Fix commit:
- `4556281013896c7e5ad7d48ac2affcf32d0a5d16`

Fix behavior:
- prefer `firmware/SIGNED_RELEASE.txt` / `Firmware/SIGNED_RELEASE.txt`;
- retain legacy `RELEASE.txt` fallback;
- fall back to bundled `firmware/version.txt` for the update version if release metadata is unavailable.

The signed 0.1.0.4 firmware image/signatures do not change. This is a Windows-client/package metadata-discovery fix only.

Expected updater display after rebuilding the Windows client around the existing signed 0.1.0.4 firmware:
- device-installed version is read from the monitor;
- package/update version resolves to `0.1.0.4`;
- semantic comparison can display `Up to date`, `Update available`, or `Device newer than package` correctly.
