# Precision Location — Android prototype

A deliberately simple Android front-end for phone-internal high-accuracy GNSS.
The normal user should not configure PPP, RTK, constellations, frequencies,
ionosphere models, or ambiguity settings.

## Intended normal workflow

1. Open the app.
2. Complete the one-time Galileo HAS login setup if needed.
3. Tap **Start**.
4. Wait for the large status to become **READY**.
5. Use the corrected position in Pad Grade / future native tools.
6. Tap **Stop** when finished.

The app detects the measurements actually exposed by the handset at runtime.
A single-frequency handset can run SF PPP; phones exposing valid carrier phase
on a second/third frequency can automatically use DF/MF processing. The mode is
shown for diagnostics but is not a user setting.

## Correction source

Primary design target: Galileo High Accuracy Service (HAS) through the official
Internet Data Distribution (IDD) NTRIP service. HAS access is a one-time
account/credential setup. The normal app does not expose PPP tuning, frequency
selection, SSR settings, or NTRIP protocol controls.

IDD transport is kept separate from the Galileo E6-B SIS page decoder. The IDD
channel is an SSR stream over NTRIP; it is decoded through MRTKLIB's RTCM/SSR
path rather than pretending IDD bytes are 56-byte E6-B HAS pages.

## Engine

The native layer is structured around MRTKLIB (BSD-2-Clause), pinned to a known
commit for reproducible behavior. Android raw GNSS acquisition uses full-tracking
`GnssMeasurementRequest` and collects navigation messages at the same time.

## Current prototype milestone

Implemented in this branch:

- Android 12+ native project (Java, no UI framework dependencies).
- One-button Start/Stop user interface after one-time HAS setup.
- Raw GNSS full-tracking acquisition.
- Navigation-message acquisition.
- Automatic signal-band inventory.
- Automatic SF vs DF/MF capability selection from valid ADR observations.
- High-resolution GPS week/TOW conversion without passing ~1e18 ns values through `double`.
- GPS/Galileo pseudorange, ADR carrier phase, Doppler/range-rate, C/N0, code type,
  clock-discontinuity, cycle-slip, and half-cycle state conversion.
- Native construction of MRTKLIB `obsd_t` records with per-band signal mapping.
- System-GPS fallback while the PPP filter is not yet producing a solution.
- TLS/NTRIP v2 HAS client with automatic reconnect and credentials kept out of source control.
- Native RTCM3/SSR decoding for the HAS IDD byte stream; HAS is only marked active
  after a correction message is actually decoded.
- JNI/CMake bridge pinned to MRTKLIB.
- Stable interface between the eventual PPP engine and Pad Grade.
- Android CI using API 36 and NDK 28.2.

Still required before this produces a HAS-corrected PPP position:

- Decode or otherwise supply GPS/Galileo broadcast ephemerides into MRTKLIB `nav_t`.
- Copy decoded HAS SSR correction state into the navigation state used by PPP.
- Initialize the automatic SF/DF/MF PPP processing options and run `pppos()`.
- Return PPP position/covariance to Java and gate **READY** on the precision solution,
  never on the Android fallback location.
- Validate IDD message handling against the registered HAS IDD documentation/test vectors.
- Validate positioning against an outdoor A16 static dataset.

The architecture intentionally keeps those GNSS details out of the UI so they
can change without teaching the end user how PPP works.
