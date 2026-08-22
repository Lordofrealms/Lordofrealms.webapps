# Precision Location — Android prototype

A deliberately simple Android front-end for phone-internal high-accuracy GNSS.
The normal user should not configure PPP, RTK, constellations, frequencies,
ionosphere models, or ambiguity settings.

## Intended normal workflow

With Galileo HAS IDD access configured:

1. Open the app.
2. Tap **Start**.
3. Wait for the large status to become **READY**.
4. Use the corrected position in Pad Grade / future native tools.
5. Tap **Stop** when finished.

If HAS access has not been issued yet, the same app can run **GNSS preflight**.
It exercises the handset's raw measurements, carrier phase, navigation messages,
broadcast ephemerides and an independent MRTKLIB single-point solution. Preflight
never labels ordinary GNSS as high accuracy and leaves the precision-accuracy
field blank.

The app detects the measurements actually exposed by the handset at runtime.
A single-frequency handset can run uncombined SF PPP; phones exposing valid
carrier phase on additional frequencies automatically move to DF/MF processing.
The selected mode is a diagnostic, not a user setting.

## Correction source

Primary design target: Galileo High Accuracy Service (HAS) through the official
Internet Data Distribution (IDD) NTRIP service. HAS credentials are a one-time
setup and are stored per installation, not in source control. The normal app does
not expose PPP tuning, frequency selection, SSR settings or NTRIP controls.

IDD transport is kept separate from Galileo E6-B SIS page decoding. The IDD byte
stream is decoded through MRTKLIB's RTCM3/SSR path. RTCM broadcast ephemerides in
the same stream are also accepted, so Android navigation messages are not the
only possible ephemeris source.

## Engine

The native layer embeds MRTKLIB (BSD-2-Clause), pinned to commit
`d0f56fe6a67612efcb1fa448ec2923d1eae23c1a` for reproducible behavior. Android
raw GNSS acquisition uses a full-tracking `GnssMeasurementRequest` and collects
navigation messages concurrently.

The pinned MRTKLIB version contains several dual-frequency assumptions in its
uncombined PPP path. This branch applies a small, reviewable patch so a genuine
L1/E1-only phone can initialize and estimate the slant-ionosphere and float
carrier-ambiguity states instead of being rejected for lacking a second band.
Dual/multi-frequency operation continues to use the upstream multi-band states.

## Current prototype milestone

Implemented in this branch:

- Android 12+ native project (Java, no UI-framework dependency).
- Simple Start/Stop UI; engineering diagnostics are hidden behind a long-press.
- No-HAS GNSS preflight mode instead of blocking startup on missing credentials.
- Raw GNSS full-tracking acquisition and navigation-message acquisition.
- Automatic signal-band inventory and SF vs DF/MF capability selection from valid ADR.
- High-resolution GPS week/TOW conversion without first converting ~1e18 ns to `double`.
- GPS/Galileo pseudorange, ADR carrier phase, Doppler/range-rate, C/N0, code type,
  clock-discontinuity, cycle-slip and half-cycle-state conversion.
- Native MRTKLIB `obsd_t` construction with per-band signal mapping.
- GPS L1 C/A Android navigation reconstruction, parity validation and ephemeris decode.
- Galileo I/NAV Android page reconstruction, CRC validation and ephemeris decode.
- Rolling broadcast-ephemeris history for GPS/Galileo.
- MRTKLIB broadcast SPP preflight, compared with Android's system location only in diagnostics.
- TLS/NTRIP v2 HAS client with automatic reconnect.
- Native RTCM3 decoder for IDD data.
- IDD broadcast ephemeris ingestion when RTCM returns an ephemeris message.
- HAS SSR state copied into the `nav_t` used by PPP.
- Automatic PPP filter configuration with Galileo HAS corrections and SSR-applied broadcast ephemerides.
- Android-specific single-frequency uncombined PPP state initialization.
- PPP position/covariance returned to Java.
- **READY** gated only on a native PPP solution and precision covariance; Android's normal
  location is used only as an initialization/reference seed and its accuracy is never shown
  as precision accuracy.
- Deliberately quiet Android CI using API 36 and NDK 28.2; ordinary commits do not build.

## Validation still required

The architecture and data paths are implemented, but the branch remains a prototype
until these validations are complete:

- Produce a clean Android/NDK APK from the current native integration.
- Run GNSS preflight outdoors on the target handset and verify that MRTKLIB broadcast
  SPP agrees reasonably with Android's system location while raw carrier phase remains stable.
- Exercise the RTCM/HAS path with a public historical Galileo HAS IDD dataset and then,
  when available, the official registered IDD test vectors.
- Validate real-time IDD transport after credentials are issued.
- Validate convergence and achieved accuracy against a known outdoor reference point/static dataset.
- Tune phone-specific stochastic weighting only if field residuals show it is necessary.

The architecture intentionally keeps GNSS implementation details out of the normal UI
so those internals can evolve without teaching the end user how PPP works.
